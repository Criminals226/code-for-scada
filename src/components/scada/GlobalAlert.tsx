import { cn } from '@/lib/utils';
import { AlertTriangle, Siren } from 'lucide-react';
import { useScada } from '@/contexts/ScadaContext';

/**
 * Global SCADA threat banner. Mounted once in MainLayout so it shows
 * on every authenticated page. Driven entirely by the shared
 * ScadaContext threat summary — never holds local state.
 */
export function GlobalAlert({ className }: { className?: string }) {
  const { threat } = useScada();
  if (!threat) return null;

  const isCritical = threat.level === 'CRITICAL';
  const Icon = isCritical ? Siren : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 font-mono animate-fade-in shadow-sm',
        className,
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 flex-shrink-0',
          isCritical ? 'text-scada-critical' : 'text-scada-warning',
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-widest text-foreground">
          ⚠ ATTACK DETECTED:{' '}
          <span className={isCritical ? 'text-scada-critical' : 'text-scada-warning'}>{threat.type}</span>
        </div>
        {threat.raw.explanation && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {threat.raw.explanation}
          </div>
        )}
      </div>
      <span
        className={cn(
          'px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-transparent',
          isCritical
            ? 'border-scada-critical text-scada-critical'
            : 'border-scada-warning text-scada-warning',
        )}
      >
        {threat.level}
      </span>
    </div>
  );
}
