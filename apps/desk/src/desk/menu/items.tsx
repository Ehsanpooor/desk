/**
 * Menu rows for the desk's menus. Every row has a 15 px leading slot (an icon,
 * a check mark, or blank) so labels line up, and an optional trailing shortcut.
 */
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { MENU_SURFACE } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const ROW =
  'group/mi relative flex h-[26px] cursor-default select-none items-center gap-2 rounded-[6px] px-2 font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-ink-on-accent';

const LEAD =
  'grid size-[15px] flex-none place-items-center text-ink-3 group-data-[highlighted]/mi:text-ink-on-accent group-data-[state=open]/mi:text-ink-on-accent [&_svg]:size-[15px]';

function Lead({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn(LEAD, className)}>
      {children}
    </span>
  );
}

export function MenuShortcut({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto pl-6 text-[12px] font-normal tracking-normal whitespace-nowrap text-ink-3 tabular-nums group-data-[highlighted]/mi:text-ink-on-accent">
      {children}
    </span>
  );
}

type ItemProps = Omit<ComponentProps<typeof Menu.Item>, 'children'> & {
  icon?: ReactNode;
  shortcut?: ReactNode;
  variant?: 'default' | 'destructive';
  children: ReactNode;
};

export function MenuItem({ icon, shortcut, variant = 'default', className, children, ...props }: ItemProps) {
  const danger = variant === 'destructive';
  return (
    <Menu.Item
      className={cn(ROW, danger && 'text-danger-ink data-[highlighted]:bg-danger data-[highlighted]:text-ink-on-accent', className)}
      {...props}
    >
      <Lead className={cn(danger && 'text-danger-ink')}>{icon}</Lead>
      <span className="truncate">{children}</span>
      {shortcut && <MenuShortcut>{shortcut}</MenuShortcut>}
    </Menu.Item>
  );
}

type CheckProps = Omit<ComponentProps<typeof Menu.CheckboxItem>, 'children' | 'onCheckedChange' | 'checked'> & {
  checked: boolean;
  shortcut?: ReactNode;
  children: ReactNode;
  onCheckedChange(checked: boolean): void;
};

export function MenuCheckItem({ shortcut, className, children, checked, ...props }: CheckProps) {
  return (
    <Menu.CheckboxItem className={cn(ROW, className)} checked={checked} {...props}>
      <Lead>{checked && <Check strokeWidth={2.4} />}</Lead>
      <span className="truncate">{children}</span>
      {shortcut && <MenuShortcut>{shortcut}</MenuShortcut>}
    </Menu.CheckboxItem>
  );
}

export function MenuRadioGroup<T extends string>({
  value,
  onChange,
  children,
}: {
  value: T;
  onChange(value: T): void;
  children: ReactNode;
}) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
      {children}
    </Menu.RadioGroup>
  );
}

type RadioProps = Omit<ComponentProps<typeof Menu.RadioItem>, 'children'> & {
  /** Shown at the end of the row, dimmed (a date range, a size). */
  hint?: ReactNode;
  children: ReactNode;
};

export function MenuRadioItem({ hint, className, children, ...props }: RadioProps) {
  return (
    <Menu.RadioItem className={cn(ROW, className)} {...props}>
      <Lead>
        <Menu.ItemIndicator className="grid place-items-center">
          <Check strokeWidth={2.4} />
        </Menu.ItemIndicator>
      </Lead>
      <span className="truncate">{children}</span>
      {hint && <MenuShortcut>{hint}</MenuShortcut>}
    </Menu.RadioItem>
  );
}

export function MenuSub({
  icon,
  label,
  disabled,
  children,
  className,
}: {
  icon?: ReactNode;
  label: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger
        disabled={disabled}
        className={cn(ROW, 'data-[state=open]:bg-accent data-[state=open]:text-ink-on-accent')}
      >
        <Lead>{icon}</Lead>
        <span className="truncate">{label}</span>
        <span className="ml-auto pl-6 text-ink-3 group-data-[highlighted]/mi:text-ink-on-accent group-data-[state=open]/mi:text-ink-on-accent">
          <ChevronRight className="size-3.5" strokeWidth={2.2} />
        </span>
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent
          sideOffset={4}
          alignOffset={-5}
          collisionPadding={8}
          className={cn(MENU_SURFACE, 'min-w-[200px]', className)}
        >
          {children}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Menu.Label className={cn('truncate px-2 pt-1 pb-1 text-[11.5px] font-semibold text-ink-3', className)}>
      {children}
    </Menu.Label>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className="mx-2 my-[5px] h-px bg-(--desk-ctx-sep)" />;
}

/** A row of round colour swatches (the note colours), each one a menu item. */
export function MenuSwatches<T extends string>({
  options,
  value,
  onPick,
  label,
}: {
  options: { id: T; name: string; style: CSSProperties }[];
  value: T;
  onPick(id: T): void;
  label: string;
}) {
  return (
    <Menu.Group aria-label={label} className="flex items-center gap-[7px] px-2 pt-1.5 pb-1">
      {options.map((o) => (
        <Menu.Item
          key={o.id}
          aria-label={o.name}
          title={o.name}
          onSelect={() => onPick(o.id)}
          data-on={o.id === value ? '' : undefined}
          style={o.style}
          className="size-[18px] flex-none cursor-default rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] outline-none transition-transform duration-150 data-[highlighted]:scale-[1.18] data-[on]:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14),0_0_0_2px_var(--desk-ctx-bg),0_0_0_3.5px_var(--accent)]"
        />
      ))}
    </Menu.Group>
  );
}
