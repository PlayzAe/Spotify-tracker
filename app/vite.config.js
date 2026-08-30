import { defineConfig } from 'vite';

// GitHub Pages serves a project site from /<repo-name>/, not from the domain
// root, so every asset URL in the build needs that prefix — without it the
// page loads and then 404s on its own CSS and JS. The deploy workflow passes
// the repo name in; locally VITE_BASE is unset and everything stays at /.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  server: { port: 5173, strictPort: true },
  // The engine runs in a Web Worker. Vite's `?worker` import handles bundling;
  // ES module workers keep the import graph identical to the main bundle.
  worker: { format: 'es' },
  build: { target: 'es2020' },
});
