import '@/styles/globals.css';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { useSession } from '@/auth/session';
import { logger } from '@/lib/logger';
import { config } from '@/config';
import { useTheme } from '@/theme/store';

logger.info(`ELVA Desk ${config.version} (${config.env})`);
useTheme.getState().init();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// No StrictMode: it double-mounts effects in development, which would mount
// and unmount every federated app twice.
createRoot(root).render(<App />);

void useSession.getState().boot();
