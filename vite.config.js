import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/movie-night/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        movies: resolve(process.cwd(), 'movies.html'),
        details: resolve(process.cwd(), 'details.html'),
        tv: resolve(process.cwd(), 'tv.html'),
        search: resolve(process.cwd(), 'search.html'),
        myList: resolve(process.cwd(), 'my-list.html')
      }
    }
  },
  server: {
    open: true
  }
});