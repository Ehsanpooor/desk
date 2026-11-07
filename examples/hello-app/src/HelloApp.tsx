import { useEffect, useState } from 'react';
import type { DeskIntent } from '@elva/desk-sdk';
import {
  TitlebarPortal,
  WindowPortal,
  useDesk,
  useDeskSession,
  useDeskTheme,
  useWindowStatus,
  useWindowTitle,
} from '@elva/desk-sdk/react';

export function HelloApp({ onIntent }: { onIntent: (fn: (i: DeskIntent) => void) => () => void }) {
  const ctx = useDesk();
  const session = useDeskSession();
  const theme = useDeskTheme();
  const status = useWindowStatus();
  const [greeting, setGreeting] = useState<string | null>(
    ctx.intent?.name === 'greet' ? String(ctx.intent.params?.name ?? 'there') : null,
  );
  const [tokenInfo, setTokenInfo] = useState<string>('not requested');
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState('');
  const [badge, setBadge] = useState(0);
  const [locationChanges, setLocationChanges] = useState(0);

  useWindowTitle(greeting ? `Hello, ${greeting}` : 'Hello');

  useEffect(() => onIntent((i) => i.name === 'greet' && setGreeting(String(i.params?.name ?? 'there'))), [onIntent]);

  useEffect(
    () =>
      ctx.events.on('location:changed', () => {
        setLocationChanges((n) => n + 1);
      }),
    [ctx],
  );

  useEffect(() => {
    ctx.window.setDirty(draft.trim().length > 0);
  }, [ctx, draft]);

  const askToken = async () => {
    try {
      const t = await ctx.auth.getAccessToken();
      const payload = JSON.parse(atob(t.split('.')[1] ?? '')) as { exp?: number; client_id?: string };
      setTokenInfo(
        `${t.length} chars · client_id=${payload.client_id ?? '?'} · expires ${
          payload.exp ? new Date(payload.exp * 1000).toLocaleTimeString() : '?'
        }`,
      );
    } catch (e) {
      setTokenInfo(`failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="hello">
      <TitlebarPortal>
        <span className="tb">
          <button type="button" onClick={() => ctx.desk.toast({ kind: 'info', title: 'From the title bar' })}>
            Toolbar
          </button>
        </span>
      </TitlebarPortal>

      <h1>{greeting ? `Hello, ${greeting}.` : `Hello, ${session.user.name}.`}</h1>

      <div className="grid">
        <section className="card">
          <h2>Session (from the desk)</h2>
          <dl>
            <dt>User</dt>
            <dd>{session.user.email}</dd>
            <dt>Organization</dt>
            <dd>{session.organization.name}</dd>
            <dt>Location</dt>
            <dd>
              {session.location.name} <span className="pill">{session.access.role}</span>
            </dd>
            <dt>Timezone</dt>
            <dd>{session.location.timezone}</dd>
            <dt>Permissions</dt>
            <dd>{session.access.permissions.join(', ') || 'none'}</dd>
            <dt>MFA</dt>
            <dd>{session.access.mfa ? 'yes' : 'no'}</dd>
            <dt>Location changes</dt>
            <dd>{locationChanges}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Window and theme</h2>
          <dl>
            <dt>Instance</dt>
            <dd>{ctx.app.instanceId}</dd>
            <dt>Size</dt>
            <dd>
              {status.size.w} × {status.size.h}
              {status.resizing ? ' (resizing)' : ''}
            </dd>
            <dt>Active</dt>
            <dd>{status.active ? 'yes' : 'no'}</dd>
            <dt>Minimized</dt>
            <dd>{status.minimized ? 'yes' : 'no'}</dd>
            <dt>Theme</dt>
            <dd>
              {theme.id} / {theme.mode}
              {theme.reducedMotion ? ' · reduced motion' : ''}
            </dd>
            <dt>Desk env</dt>
            <dd>{ctx.env}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Auth</h2>
          <div className="row">
            <button type="button" onClick={() => void askToken()}>
              getAccessToken()
            </button>
            <button type="button" className="secondary" onClick={() => void ctx.auth.reauthenticate({ maxAgeSeconds: 60 })}>
              reauthenticate()
            </button>
          </div>
          <p>{tokenInfo}</p>
        </section>

        <section className="card">
          <h2>Desk services</h2>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                const n = badge + 1;
                setBadge(n);
                ctx.window.setBadge(n);
              }}
            >
              Badge +1
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setBadge(0);
                ctx.window.setBadge(null);
              }}
            >
              Clear badge
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => ctx.desk.toast({ kind: 'success', title: 'Saved', body: 'A toast from the hello app.' })}
            >
              Toast
            </button>
            <button type="button" className="secondary" onClick={() => setModal(true)}>
              Window modal
            </button>
            <button type="button" className="secondary" onClick={() => ctx.desk.openApp('hello', { name: 'greet', params: { name: 'again' } })}>
              Intent to self
            </button>
            <button type="button" className="secondary" onClick={() => ctx.window.state.set({ draft })}>
              Save state
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Saved state: {JSON.stringify(ctx.window.state.get() ?? null)}</p>
        </section>

        <section className="card">
          <h2>Unsaved changes (setDirty)</h2>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type here, then try to close the window." />
        </section>
      </div>

      {modal && (
        <WindowPortal>
          <div className="modal-backdrop" onClick={() => setModal(false)}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h1 style={{ fontSize: 16 }}>A window-scoped modal</h1>
              <p>It covers only this window. Other windows stay usable.</p>
              <button type="button" onClick={() => setModal(false)}>
                Close
              </button>
            </div>
          </div>
        </WindowPortal>
      )}
    </div>
  );
}
