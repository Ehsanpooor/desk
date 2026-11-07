import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/theme/store';

/** The one toast stack for the desk and every app in it. */
function Toaster(props: ToasterProps) {
  const resolved = useTheme((s) => s.resolved);
  return (
    <Sonner
      theme={resolved}
      position="top-right"
      offset={{ top: 44, right: 16 }}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'bg-surface-raised! text-ink-0! border-line! shadow-2! rounded-lg!',
          description: 'text-ink-2!',
          actionButton: 'bg-accent! text-ink-on-accent!',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
