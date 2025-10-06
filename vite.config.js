import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        movies: resolve(process.cwd(), 'movies.html'),
        tv: resolve(process.cwd(), 'tv.html')
      }
    }
  },
  server: {
    open: true
  }
});