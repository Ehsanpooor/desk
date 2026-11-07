/**
 * A minimal ELVA Desk app. Copy this config to start a real one.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

// Only the desk may fetch this app's module. Production hosting must send the
// same allowlist as Access-Control-Allow-Origin; this covers the dev server.
const DESK_ORIGINS = [
  'https://desk.elva.ai',
  'https://dev-desk.elva.ai',
  'https://sand-desk.elva.ai',
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

export default defineConfig(({ mode }) => ({
  // Chunks must load from this app's own origin, never relative to the desk.
  base: mode === 'production' ? 'https://hello.elva.ai/' : 'http://localhost:5181/',
  plugins: [
    react(),
    federation({
      name: 'elva_hello',
      filename: 'remoteEntry.js',
      manifest: true,
      // Resolve this app's files from the manifest's own URL. Vite drops the
      // origin from `base` in dev, so without this the desk would look for
      // remoteEntry.js on its own origin.
      publicPath: 'auto',
      exposes: { './desk': './src/desk/entry.tsx' },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        '@elva/desk-sdk': { singleton: true, requiredVersion: '^1.0.0' },
      },
    }),
  ],
  server: { port: 5181, strictPort: true, cors: { origin: DESK_ORIGINS } },
  preview: { port: 5181, strictPort: true, cors: { origin: DESK_ORIGINS } },
  build: { target: 'esnext' },
}));
