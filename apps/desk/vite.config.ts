import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8')) as { version: string };
const sdk = JSON.parse(
  readFileSync(path.join(here, '../../packages/desk-sdk/package.json'), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'elva_desk',
      // Remotes are registered at runtime from the registry and the user's
      // permissions. Nothing is wired statically.
      remotes: {},
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        '@elva/desk-sdk': { singleton: true, requiredVersion: '^1.0.0', version: sdk.version },
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': path.resolve(here, 'src') },
  },
  server: { port: 5190, strictPort: true },
  preview: { port: 5190, strictPort: true },
  build: {
    target: 'esnext',
    sourcemap: false,
  },
});
