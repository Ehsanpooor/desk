import { useEffect, useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { APPS, canOpen } from '@/registry/apps';
import { useWm } from './wm/store';

export function Launcher({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const permissions = useWm((s) => s.permissions);
  const openApp = useWm((s) => s.open);
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...APPS]
      .filter((a) => a.mode === 'federated')
      .filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.id.includes(needle))
      .sort((a, b) => a.order - b.order);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [q]);

  const pick = (i: number) => {
    const def = items[i];
    if (!def) return;
    openApp(def.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="top-[18%] translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Open an app</DialogTitle>
        <label className="flex items-center gap-2 border-b border-line px-4 py-3 text-ink-3">
          <Search className="size-4" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(index);
              }
            }}
            placeholder="Open an app…"
            aria-label="Search apps"
            className="flex-1 bg-transparent text-base text-ink-0 outline-none placeholder:text-ink-3"
          />
        </label>
        <ul role="listbox" className="max-h-80 overflow-auto p-1.5">
          {items.map((def, i) => {
            const locked = !canOpen(def, permissions);
            return (
              <li key={def.id} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => pick(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] outline-none',
                    i === index ? 'bg-accent text-ink-on-accent' : 'text-ink-0',
                  )}
                >
                  <img src={def.icon} alt="" className={cn('size-7 rounded-md', locked && 'opacity-50 saturate-50')} />
                  <span className="flex-1 truncate font-medium">{def.name}</span>
                  {locked && <Lock className="size-3.5 opacity-70" />}
                </button>
              </li>
            );
          })}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">No app matches.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
