import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        movies: resolve(process.cwd(), 'movies.html')
      }
    }
  },
  server: {
    open: true
  }
});