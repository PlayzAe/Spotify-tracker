import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  // The engine runs in a Web Worker. Vite's `?worker` import handles bundling;
  // ES module workers keep the import graph identical to the main bundle.
  worker: { format: 'es' },
  build: { target: 'es2020' },
});
