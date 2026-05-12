import { cn } from '@/lib/utils';

interface GaugeCircularProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  /** Keep arc in nominal styling even when value crosses thresholds (e.g. FDI-injected readings). */
  forceNeutralArc?: boolean;
  /** Blink center value in injection-alert styling (FDI). */
  injectionValueHighlight?: boolean;
  /** Subtle frozen-telemetry styling for replay (localized text only). */
  replayFrozenHighlight?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function GaugeCircular({
  value,
  min,
  max,
  unit,
  label,
  warningThreshold,
  criticalThreshold,
  forceNeutralArc = false,
  injectionValueHighlight = false,
  replayFrozenHighlight = false,
  size = 'md',
  className,
}: GaugeCircularProps) {
  const normalizedValue = Math.min(Math.max((value - min) / (max - min), 0), 1);

  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-32 h-32',
    lg: 'w-40 h-40',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  const getColor = () => {
    if (injectionValueHighlight) return 'text-scada-critical animate-pulse';
    if (replayFrozenHighlight) return 'text-scada-warning';
    if (!forceNeutralArc && criticalThreshold && value >= criticalThreshold) return 'text-scada-critical';
    if (!forceNeutralArc && warningThreshold && value >= warningThreshold) return 'text-scada-warning';
    return 'text-scada-normal';
  };

  const getStrokeColor = () => {
    if (forceNeutralArc) return 'stroke-scada-normal';
    if (criticalThreshold && value >= criticalThreshold) return 'stroke-scada-critical';
    if (warningThreshold && value >= warningThreshold) return 'stroke-scada-warning';
    return 'stroke-scada-normal';
  };

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (normalizedValue * circumference * 0.75);

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <div className={cn('relative', sizeClasses[size])}>
        <svg className="w-full h-full -rotate-[135deg]" viewBox="0 0 100 100">
          {/* Background arc */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            className="stroke-secondary"
            strokeWidth="8"
            strokeDasharray={`${circumference * 0.75} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            className={cn('transition-all duration-500', getStrokeColor())}
            strokeWidth="8"
            strokeDasharray={`${circumference * 0.75} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              filter: 'drop-shadow(0 0 4px currentColor)',
            }}
          />
          {/* Tick marks */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <line
              key={tick}
              x1="50"
              y1="10"
              x2="50"
              y2="15"
              className="stroke-muted-foreground"
              strokeWidth="2"
              transform={`rotate(${tick * 270} 50 50)`}
            />
          ))}
        </svg>
        
        {/* Center value display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-mono font-bold', textSizes[size], getColor())}>
            {value.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground uppercase">{unit}</span>
        </div>
      </div>
      
      {/* Label */}
      <span className="mt-2 text-sm font-mono text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}
