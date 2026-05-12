import { cn } from '@/lib/utils';
import { AlertTriangle, ShieldX, Siren } from 'lucide-react';
import type { ThreatLog } from '@/lib/api';

interface ThreatAlertBannerProps {
  threat: ThreatLog | null;
  posture: 'NORMAL' | 'WARNING' | 'CRITICAL' | string;
  className?: string;
}

/**
 * SCADA-style alert banner. Renders only when posture is WARNING/CRITICAL
 * and a threat is present. Uses semantic SCADA tokens + glow utilities.
 */
export function ThreatAlertBanner({ threat, posture, className }: ThreatAlertBannerProps) {
  if (!threat || posture === 'NORMAL') return null;

  const isCritical = posture === 'CRITICAL';

  const config = isCritical
    ? {
        Icon: Siren,
        color: 'text-scada-critical',
        badgeBorder: 'border-scada-critical text-scada-critical',
        label: '⚠ CRITICAL THREAT DETECTED',
      }
    : {
        Icon: AlertTriangle,
        color: 'text-scada-warning',
        badgeBorder: 'border-scada-warning text-scada-warning',
        label: '⚠ SECURITY WARNING',
      };

  const { Icon } = config;
  const t = threat.threat_classification;

  return (
    <div
      role="alert"
      className={cn(
        'relative rounded-lg border border-border bg-card p-4 font-mono animate-fade-in shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="p-2 rounded-full flex-shrink-0 border border-border bg-muted/30">
          <Icon className={cn('h-7 w-7', config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-xs font-bold uppercase tracking-widest', config.color)}>
              {config.label}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold border bg-transparent',
                config.badgeBorder,
              )}
            >
              {t?.severity || 'INFO'}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase">
              {threat.layer}
            </span>
          </div>

          <div className={cn('text-lg font-bold uppercase', config.color)}>
            {t?.category?.replace(/_/g, ' ') || 'UNKNOWN THREAT'}
            {t?.subcategory && (
              <span className="text-muted-foreground font-normal normal-case text-sm">
                {' — '}
                {t.subcategory}
              </span>
            )}
          </div>

          {threat.explanation && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {threat.explanation}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                isCritical ? 'bg-scada-critical animate-pulse' : 'bg-scada-warning animate-pulse',
              )}
            />
            <span className={cn('text-[10px] font-bold uppercase', config.color)}>
              Live
            </span>
          </div>
          <ShieldX className={cn('h-4 w-4', config.color)} />
        </div>
      </div>
    </div>
  );
}
