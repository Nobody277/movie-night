document.addEventListener('DOMContentLoaded', () => {
  const SOCKET_SERVER_URL = 'https://movie-night-backend-dvp8.onrender.com';
  const socket = io(SOCKET_SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });
  const isMobile = /Mobi|Android|iPhone/.test(navigator.userAgent);

  const savedUsername = localStorage.getItem('movieNightUsername');
  let username = savedUsername || `Guest #${Math.floor(Math.random() * 1000) + 1}`;
  let clockOffset = 0;
  const usernameDisplay = document.getElementById('usernameDisplay');
  const usernameModal = document.getElementById('usernameModal');
  const usernameInput = document.getElementById('usernameInput');
  const saveUsernameBtn = document.getElementById('saveUsername');
  
  socket.on('disconnect', (reason) => {
      console.warn(`[Socket disconnected] Reason: ${reason}. Attempting to reconnect...`);
    });
    socket.on('reconnect', (attemptNumber) => {
      console.log(`[Socket reconnected] after ${attemptNumber} attempts.`);
      if (roomId) {
        socket.emit('joinRoom', { roomId, username });
      }
    });
    socket.on('connect_error', (err) => {
      console.error(`[Socket connect_error] ${err.message}`);
    });

  usernameDisplay.textContent = username;

  function showUsernamePrompt() {
    usernameModal.style.display = 'block';
    usernameInput.value = username;
    usernameInput.focus();
  }

  function updateUsername(newUsername) {
    if (newUsername && newUsername.trim() && newUsername !== username) {
      const oldUsername = username;
      username = newUsername.trim();
      localStorage.setItem('movieNightUsername', username);
      usernameDisplay.textContent = username;
      socket.emit('chat', {
        roomId,
        username: 'System',
        msg: `${oldUsername} changed their name to ${username}`
      });
      socket.emit('changeUsername', { newUsername: username });
    }
    usernameModal.style.display = 'none';
  }

  saveUsernameBtn.addEventListener('click', () => {
    updateUsername(usernameInput.value);
  });

  usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      updateUsername(usernameInput.value);
    }
  });

  let hasPromptedForUsername = false;

  const SYNC_INTERVAL = 1000,
    HARD_THRESHOLD = 1.0,
    NUDGE = 0.1,
    MIN_RATE = 0.95,
    MAX_RATE = 1.05;

  let hls, currentSrc = '', latency = 0, initState = null;
  let supSeek = false, supPlay = false, supPause = false;

  const player = document.getElementById('videoPlayer');
  player.addEventListener('error', (e) => {
    console.error('[Video element error]', player.error);
    console.warn('Video error detected. Attempting to recover and re-sync...');
    if (hls && hls.media) {
      hls.recoverMediaError();
      return;
    }
    const paused = player.paused;
    const currentTime = player.currentTime;
    player.load();
    player.addEventListener('canplay', () => {
      player.currentTime = currentTime;
      if (!paused) {
        player.play();
      }
    }, { once: true });
    if (socket.connected) {
      socket.emit('getState', { roomId });
    }
  });
  const statsList = document.getElementById('statsList');
  const chatMsgs = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');

  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (!roomId) {
    chatMsgs.innerHTML = '<em>No room specified.</em>';
    return;
  }

  socket.emit('joinRoom', { roomId, username });

  function ping() {
    const t0 = Date.now();
    socket.emit('pingCheck', { clientTime: t0 });
  }
  socket.on('pongCheck', ({ clientSent, serverTime }) => {
    const t2 = Date.now();
    const RTT = t2 - clientSent;
    latency = RTT / 2;
    const serverTrueAtClientReceive = serverTime + latency;
    clockOffset = serverTrueAtClientReceive - t2;
  });
  
  setInterval(ping, 1000);
  
  function appendMsg(user, text) {
    const d = document.createElement('div');
    d.className = 'chatMessage';
    d.innerHTML = `<span class="user">${user}:</span> ${text}`;
    chatMsgs.append(d);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }
  function fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    const min = m.toString().padStart(2, '0');
    return `${h}:${min}:${sec}`;
  }

  sendBtn.addEventListener('click', () => {
    const t = chatInput.value.trim();
    if (!t) return;
    
    if (!hasPromptedForUsername && username.startsWith('Guest #')) {
      hasPromptedForUsername = true;
      showUsernamePrompt();
      return;
    }
    
    appendMsg(username, t);
    socket.emit('chat', { roomId, msg: t, username });
    chatInput.value = '';
  });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendBtn.click();
  });
  socket.on('chat', data => appendMsg(data.username, data.msg));

  socket.on('stats', arr => {
    statsList.innerHTML = '';
    arr.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.username} | ${p.platform} | ${Math.round(p.latency)} ms | ${fmtTime(p.time)}`;
      statsList.append(li);
    });
  });

  socket.on('init', state => {
    if (state.title) {
      const full = `Movie Night - ${state.title}`;
      document.title = full;
      const og = document.querySelector('meta[property="og:title"]');
      if (og) og.setAttribute('content', full);
    }

    initState = state;
    if (state.videoUrl !== currentSrc) {
      currentSrc = state.videoUrl;
      if (hls) { hls.destroy(); hls = null; }
      if (currentSrc.includes('.m3u8') && Hls.isSupported() && !isMobile) {
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[HLS error]', data);
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          console.warn('fatal network error encountered, attempting to restart load');
          hls.startLoad(/*startPosition=*/ undefined);
        }
        else if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.warn('fatal media error encountered, attempting to recover');
          hls.recoverMediaError();
        }
        else if (data.fatal) {
          console.error('Unrecoverable HLS error, destroying hls instance', data);
          hls.destroy();
        }
        });
        hls.loadSource(currentSrc);
        hls.attachMedia(player);
      } else {
        player.src = currentSrc;
      }
    }
    ping();
    player.pause();
    player.addEventListener('canplay', () => {
      new Plyr(player, {
        fullscreen: {
          iosNative: true
        }
      });
      window.addEventListener('keydown', e => {
        if (document.activeElement.tagName === 'INPUT') return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          player.currentTime += 5;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          player.currentTime -= 5;
        }
      });
      const now = Date.now() + clockOffset;
      const elapsed = (now - initState.lastUpdate - latency) / 1000;
      const target = initState.currentTime + (initState.paused ? 0 : elapsed);

      supSeek = true;
      player.currentTime = target;
      if (initState.paused) {
        supPause = true;
        player.pause();
      } else {
        supPlay = true;
        player.play();
      }

      setupSync();
      startSync();

      setInterval(() => {
        socket.emit('statsUpdate', {
          username,
          latency,
          time: player.currentTime,
          platform: isMobile ? 'mobile' : 'desktop'
        });
      }, 1000);
    }, { once: true });
  });

  function setupSync() {
    player.addEventListener('seeked', () => {
      if (supSeek) { supSeek = false; return; }
      initState.currentTime = player.currentTime;
      initState.lastUpdate = Date.now() + clockOffset;
      socket.emit('seek', { roomId, time: player.currentTime });
    });
    player.addEventListener('play', () => {
      if (supPlay) { supPlay = false; return; }
      initState.currentTime = player.currentTime;
      initState.lastUpdate = Date.now() + clockOffset;
      initState.paused = false;
      socket.emit('play', { roomId, time: player.currentTime });
    });
    player.addEventListener('pause', () => {
      if (supPause) { supPause = false; return; }
      initState.currentTime = player.currentTime;
      initState.lastUpdate = Date.now() + clockOffset;
      initState.paused = true;
      socket.emit('pause', { roomId, time: player.currentTime });
    });

    socket.on('play', d => {
      initState.currentTime = d.time;
      initState.paused = false;
      initState.lastUpdate = Date.now() + clockOffset;
      supPlay = true;
      player.play();
    });
    socket.on('pause', d => {
      initState.currentTime = d.time;
      initState.paused = true;
      initState.lastUpdate = Date.now() + clockOffset;
      supPause = true;
      player.pause();
    });
    socket.on('seek', d => {
      initState.currentTime = d.time;
      initState.lastUpdate = Date.now() + clockOffset;
      supSeek = true;
      player.currentTime = d.time;
    });
  }

  function startSync() {
    if (isMobile) return;
    setInterval(() => {
      const now = Date.now() + clockOffset;
      const elapsed = (now - initState.lastUpdate - latency) / 1000;
      const serverTime = initState.currentTime + (initState.paused ? 0 : elapsed);
      const diff = serverTime - player.currentTime;
      if (Math.abs(diff) > HARD_THRESHOLD) {
        supSeek = true;
        player.currentTime = serverTime;
      } else {
        player.playbackRate = Math.min(MAX_RATE, Math.max(MIN_RATE, 1 + diff * NUDGE));
      }
    }, SYNC_INTERVAL);

    setInterval(() => { socket.emit('getState', { roomId }); }, SYNC_INTERVAL * 5);
    socket.on('syncState', s => {
      initState.currentTime = s.currentTime;
      initState.paused = s.paused;
      initState.lastUpdate = s.lastUpdate;
      if (s.paused !== player.paused) {
        if (s.paused) {
          supPause = true;
          player.pause();
        } else {
          supPlay = true;
          player.play();
        }
      }
    });
  }
});