/**
 * The standalone page of a desk-only app. It deliberately tries to mount the
 * desk module with a fake context, to show that the SDK refuses: an app built
 * for the desk cannot be opened anywhere else.
 */
import { DeskRefusedError } from '@elva/desk-sdk';
import app from './desk/entry';

const root = document.getElementById('root')!;
root.style.cssText = 'font-family: system-ui, sans-serif; padding: 2rem; max-width: 40rem; line-height: 1.5';

try {
  // Not a desk context. This must throw.
  await app.mount(root, {} as never);
  root.innerHTML = '<h1>Mounted?</h1><p>This should not happen.</p>';
} catch (e) {
  const refused = e instanceof DeskRefusedError;
  root.innerHTML = `
    <h1>${app.manifest.id} opens only inside the ELVA Desk</h1>
    <p>${refused ? (e as Error).message : String(e)}</p>
    <p><code>reason: ${refused ? (e as DeskRefusedError).reason : 'unknown'}</code></p>
    <p>Open <a href="http://localhost:5190">the desk</a> and launch it from the dock.</p>`;
}
