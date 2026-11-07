/**
 * Window menus: one window's actions (title bar and dock right-click, the menu
 * bar's Window menu) and the actions on all windows (desktop right-click).
 */
import { AppWindow, ArrowDownToLine, CopyX, EyeOff, LayoutGrid, Minus, MonitorUp, RotateCw, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { alt, MenuCheckItem, MenuItem, MenuSeparator, MenuSub, ZoneIcon } from '../menu';
import { closeAllWindows, closeOtherWindows, closeWindow } from './actions';
import { useWm } from './store';

/** Everything you can do to one window. */
export function WindowMenuItems({ id, compact = false }: { id: string; compact?: boolean }) {
  const win = useWm((s) => s.windows[id]);
  const others = useWm(
    useShallow((s) => {
      const list = Object.values(s.windows).filter((w) => w.id !== id);
      return { any: list.length > 0, visible: list.some((w) => !w.minimized) };
    }),
  );
  if (!win) return null;
  const wm = useWm.getState();
  const sized = win.maximized || win.snap !== null;

  return (
    <>
      {win.minimized ? (
        <MenuItem icon={<MonitorUp />} onSelect={() => wm.restore(id)}>
          Restore
        </MenuItem>
      ) : (
        <MenuItem icon={<Minus />} shortcut={alt('M')} onSelect={() => wm.minimize(id)}>
          Minimize
        </MenuItem>
      )}
      <MenuItem
        icon={<ZoneIcon zone="max" />}
        shortcut={win.maximized ? alt('↓') : alt('↑')}
        onSelect={() => (win.maximized ? wm.restoreSize(id) : wm.toggleMaximize(id))}
      >
        {win.maximized ? 'Exit full screen' : 'Fill screen'}
      </MenuItem>
      <MenuItem icon={<ZoneIcon zone="center" />} shortcut={alt('C')} onSelect={() => wm.center(id)}>
        Center
      </MenuItem>
      <MenuSub icon={<ZoneIcon zone="left" />} label="Move & resize">
        <MenuItem icon={<ZoneIcon zone="left" />} shortcut={alt('←')} onSelect={() => wm.snapTo(id, 'left')}>
          Left half
        </MenuItem>
        <MenuItem icon={<ZoneIcon zone="right" />} shortcut={alt('→')} onSelect={() => wm.snapTo(id, 'right')}>
          Right half
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<ZoneIcon zone="tl" />} onSelect={() => wm.snapTo(id, 'tl')}>
          Top left
        </MenuItem>
        <MenuItem icon={<ZoneIcon zone="tr" />} onSelect={() => wm.snapTo(id, 'tr')}>
          Top right
        </MenuItem>
        <MenuItem icon={<ZoneIcon zone="bl" />} onSelect={() => wm.snapTo(id, 'bl')}>
          Bottom left
        </MenuItem>
        <MenuItem icon={<ZoneIcon zone="br" />} onSelect={() => wm.snapTo(id, 'br')}>
          Bottom right
        </MenuItem>
        <MenuSeparator />
        {sized && (
          <MenuItem icon={<ArrowDownToLine />} onSelect={() => wm.restoreSize(id)}>
            Previous size
          </MenuItem>
        )}
        <MenuItem icon={<AppWindow />} onSelect={() => wm.resetSize(id)}>
          Default size
        </MenuItem>
      </MenuSub>
      <MenuCheckItem checked={win.onTop} onCheckedChange={() => wm.toggleOnTop(id)}>
        Keep on top
      </MenuCheckItem>
      <MenuSeparator />
      <MenuItem icon={<RotateCw />} disabled={win.status === 'locked'} onSelect={() => wm.retry(id)}>
        Reload app
      </MenuItem>
      {!compact && (
        <>
          <MenuSeparator />
          <MenuItem icon={<EyeOff />} disabled={!others.visible} onSelect={() => wm.minimizeOthers(id)}>
            Minimize others
          </MenuItem>
          <MenuItem icon={<CopyX />} disabled={!others.any} onSelect={() => closeOtherWindows(id)}>
            Close others
          </MenuItem>
        </>
      )}
      <MenuSeparator />
      <MenuItem variant="destructive" icon={<X />} shortcut={alt('W')} onSelect={() => closeWindow(id)}>
        Close
      </MenuItem>
    </>
  );
}

/** Actions on every window: overview, show desktop, arrange. */
export function AllWindowsItems() {
  const stats = useWm(
    useShallow((s) => {
      const list = Object.values(s.windows);
      return {
        total: list.length,
        visible: list.filter((w) => !w.minimized).length,
        minimized: list.filter((w) => w.minimized).length,
        desktopShown: s.desktopShown,
      };
    }),
  );
  const wm = useWm.getState();
  return (
    <>
      <MenuItem icon={<LayoutGrid />} shortcut={alt('A')} disabled={!stats.visible} onSelect={() => wm.setOverview(true)}>
        Show all windows
      </MenuItem>
      <MenuItem
        icon={<MonitorUp />}
        shortcut={alt('D')}
        disabled={!stats.visible}
        onSelect={() => wm.toggleDesktop()}
      >
        {stats.desktopShown ? 'Bring windows back' : 'Show desktop'}
      </MenuItem>
      <MenuSub icon={<ZoneIcon zone="grid" />} label="Arrange windows" disabled={!stats.total}>
        <MenuItem icon={<ZoneIcon zone="cascade" />} disabled={!stats.visible} onSelect={() => wm.arrange('cascade')}>
          Cascade
        </MenuItem>
        <MenuItem icon={<ZoneIcon zone="grid" />} disabled={stats.visible < 2} onSelect={() => wm.arrange('grid')}>
          Tile
        </MenuItem>
        <MenuItem icon={<ZoneIcon zone="columns" />} disabled={stats.visible < 2} onSelect={() => wm.arrange('columns')}>
          Side by side
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Minus />} disabled={!stats.visible} onSelect={() => wm.minimizeAll()}>
          Minimize all
        </MenuItem>
        <MenuItem icon={<MonitorUp />} disabled={!stats.minimized} onSelect={() => wm.restoreAll()}>
          Restore all
        </MenuItem>
        <MenuSeparator />
        <MenuItem variant="destructive" icon={<X />} onSelect={closeAllWindows}>
          Close all
        </MenuItem>
      </MenuSub>
    </>
  );
}
