/**
 * The `./desk` module: the only thing the desk loads from this app.
 */
import { createRoot } from 'react-dom/client';
import { defineDeskApp, type DeskIntent } from '@elva/desk-sdk';
import { DeskProvider } from '@elva/desk-sdk/react';
import { HelloApp } from '../HelloApp';
import './desk.css';

export default defineDeskApp({
  manifest: {
    id: 'hello',
    contract: 1,
    minSize: { w: 480, h: 360 },
    defaultSize: { w: 760, h: 560 },
    intents: ['greet'],
  },

  mount(container, ctx) {
    // Everything this instance owns is created here, never at module level.
    const intentListeners = new Set<(i: DeskIntent) => void>();
    const root = createRoot(container);
    root.render(
      <DeskProvider ctx={ctx}>
        <HelloApp onIntent={(fn) => (intentListeners.add(fn), () => intentListeners.delete(fn))} />
      </DeskProvider>,
    );
    return {
      unmount() {
        root.unmount();
        intentListeners.clear();
      },
      handleIntent(intent) {
        for (const fn of intentListeners) fn(intent);
      },
    };
  },
});
