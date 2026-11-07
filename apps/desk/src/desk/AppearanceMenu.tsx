/**
 * Choosing the look: mode (light, dark, follow the system) and theme. The menu
 * bar shows a panel with theme previews; the desktop's right-click menu shows
 * the same choices as a list. Picking keeps the menu open so the next theme
 * is one click away.
 */
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEMES, useTheme, type ThemeMode } from '@/theme/store';
import { MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator } from './menu';

const MODES: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'Auto', Icon: Monitor },
];

/** A theme drawn by its own tokens: wallpaper, a small window, the accent. */
export function ThemeSwatch({ id, className }: { id: string; className?: string }) {
  const resolved = useTheme((s) => s.resolved);
  return (
    <span aria-hidden="true" data-theme={id} data-mode={resolved} className={cn('desk-theme-swatch', className)}>
      <i />
    </span>
  );
}

const keepOpen = (e: Event) => e.preventDefault();

/** The menu bar's Appearance panel. */
export function AppearancePanel() {
  const theme = useTheme((s) => s.theme);
  const mode = useTheme((s) => s.mode);
  const { setTheme, setMode } = useTheme.getState();
  return (
    <>
      <MenuLabel>Appearance</MenuLabel>
      <Menu.RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as ThemeMode)}
        className="grid grid-cols-3 gap-1.5 px-1.5 pt-0.5 pb-2"
      >
        {MODES.map(({ id, label, Icon }) => (
          <Menu.RadioItem
            key={id}
            value={id}
            onSelect={keepOpen}
            className="flex h-[52px] cursor-default flex-col items-center justify-center gap-1 rounded-[8px] bg-(--desk-mb-hover) text-[12px] font-medium outline-none data-[highlighted]:bg-(--desk-mb-active) data-[state=checked]:bg-accent data-[state=checked]:text-ink-on-accent"
          >
            <Icon className="size-[17px]" strokeWidth={1.9} />
            {label}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      <Menu.RadioGroup
        value={theme}
        onValueChange={setTheme}
        className="grid grid-cols-4 gap-x-2 gap-y-2.5 px-2 pt-1 pb-2"
      >
        {THEMES.map((t) => (
          <Menu.RadioItem
            key={t.id}
            value={t.id}
            onSelect={keepOpen}
            className="group/t flex cursor-default flex-col items-center gap-1.5 rounded-[10px] text-[11.5px] font-medium text-ink-2 outline-none data-[state=checked]:text-ink-0"
          >
            <ThemeSwatch id={t.id} className="aspect-[4/3] w-full" />
            {t.name}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </>
  );
}

/** The desktop right-click menu's Appearance submenu. */
export function AppearanceMenuItems() {
  const theme = useTheme((s) => s.theme);
  const mode = useTheme((s) => s.mode);
  const { setTheme, setMode } = useTheme.getState();
  return (
    <>
      <MenuRadioGroup<ThemeMode> value={mode} onChange={setMode}>
        {MODES.map(({ id, label }) => (
          <MenuRadioItem key={id} value={id} onSelect={keepOpen}>
            {id === 'system' ? 'Match system' : label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      <MenuRadioGroup<string> value={theme} onChange={setTheme}>
        {THEMES.map((t) => (
          <MenuRadioItem
            key={t.id}
            value={t.id}
            onSelect={keepOpen}
            hint={<ThemeSwatch id={t.id} className="h-3.5 w-5 rounded-[4px]" />}
          >
            {t.name}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}
