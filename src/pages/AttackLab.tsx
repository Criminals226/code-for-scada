import { useEffect, useState } from 'react';
import { useAttack, type AttackType } from '@/contexts/AttackContext';
import { useScada } from '@/contexts/ScadaContext';
import { cn } from '@/lib/utils';
import {
  FlaskConical, Play, Square, Zap, WifiOff, RefreshCw,
  ShieldAlert, Clock, Activity, AlertTriangle
} from 'lucide-react';

type LaunchableAttack = Exclude<AttackType, 'NONE'>;

interface AttackDef {
  type:       LaunchableAttack;
  icon:       React.ElementType;
  name:       string;
  severity:   'CRITICAL' | 'WARNING';
  score:      number;
  tagline:    string;
  whatDetector: string;
  expectedPosture: string;
}

const ATTACKS: AttackDef[] = [
  {
    type: 'FDI',
    icon: Zap,
    name: 'False Data Injection',
    severity: 'CRITICAL',
    score: 18,
    tagline: 'Injects false V/f into the MQTT telemetry stream',
    whatDetector:
      'Detector checks both V and f simultaneously. If both exceed their critical bands for 2+ ' +
      'consecutive ticks it classifies this as a correlated injection (FDI_ATTACK, score 18).',
    expectedPosture: 'CRITICAL — nominal gauge arcs preserved; injected V/f digits blink red; diagram red outlines',
  },
  {
    type: 'REPLAY',
    icon: RefreshCw,
    name: 'Replay Attack',
    severity: 'WARNING',
    score: 8,
    tagline: 'Re-broadcasts a frozen legitimate telemetry snapshot',
    whatDetector:
      'Detector compares timestamps across ticks. If the same timestamp appears 3+ times it ' +
      'classifies as REPLAY_SUSPECTED (score 8). Gauges show NORMAL values because the captured ' +
      'data was legitimate — this is intentional and realistic.',
    expectedPosture: 'WARNING — gauges look normal, only timestamp is frozen',
  },
  {
    type: 'DOS',
    icon: WifiOff,
    name: 'Denial of Service',
    severity: 'CRITICAL',
    score: 16,
    tagline: 'Nulls all telemetry — complete sensor blackout',
    whatDetector:
      'Detector checks for null voltage on each tick. After 2 consecutive null ticks it classifies ' +
      'as DOS_ATTACK (score 16). All display values show NULL.',
    expectedPosture: 'CRITICAL — NULL telemetry; gray OFFLINE badges, dashed links (no full-screen overlay)',
  },
];

const NOMINAL_V = 230;
const NOMINAL_F = 50;

function fmt(v: number | null | undefined, d = 1, unit = ''): string {
  if (v == null || !isFinite(v) || v === 0) return 'NULL';
  return `${v.toFixed(d)}${unit}`;
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function AttackLab() {
  const { type: activeType, active, startedAt, startAttack, stopAttack } = useAttack();
  const { data, attackScore, posture, logs } = useScada();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeDef = ATTACKS.find(a => a.type === activeType);
  const runningMs = active && startedAt ? now - startedAt : 0;

  const voltage   = data?.voltage   ?? null;
  const frequency = data?.frequency ?? null;
  const genMw     = data?.gen_mw    ?? null;
  const loadMw    = data?.load_mw   ?? null;
  const isDoS     = active && activeType === 'DOS';
  const isFdi     = active && activeType === 'FDI';
  const isReplay  = active && activeType === 'REPLAY';

  const vAnomaly = voltage   != null && (voltage   < 214 || voltage   > 246);
  const vCrit    = voltage   != null && (voltage   < 204 || voltage   > 256);
  const fAnomaly = frequency != null && (frequency < 49.4 || frequency > 50.6);
  const fCrit    = frequency != null && (frequency < 49.0 || frequency > 51.0);

  const postureColor =
    posture === 'CRITICAL' ? 'text-red-500' :
    posture === 'WARNING'  ? 'text-yellow-400' : 'text-emerald-400';

  const scoreBarColor =
    attackScore >= 15 ? 'bg-red-500' :
    attackScore >=  5 ? 'bg-yellow-400' : 'bg-emerald-500';

  type RowStatus = 'normal' | 'warn' | 'crit' | 'null' | 'info';
  interface Row { metric: string; expected: string; live: string; status: RowStatus; note: string }

  const rows: Row[] = [
    {
      metric: 'Voltage',
      expected: `${NOMINAL_V} V (±14 V band)`,
      live: isDoS ? 'NULL' : fmt(voltage, 1, ' V'),
      status: isDoS ? 'null' : vCrit ? 'crit' : vAnomaly ? 'warn' : 'normal',
      note: isFdi
        ? `+${((voltage ?? NOMINAL_V) - NOMINAL_V).toFixed(1)} V injected`
        : isReplay ? 'frozen at capture value'
        : isDoS    ? 'no data'
        : 'within band',
    },
    {
      metric: 'Frequency',
      expected: `${NOMINAL_F} Hz (±0.6 Hz band)`,
      live: isDoS ? 'NULL' : fmt(frequency, 2, ' Hz'),
      status: isDoS ? 'null' : fCrit ? 'crit' : fAnomaly ? 'warn' : 'normal',
      note: isFdi
        ? `+${((frequency ?? NOMINAL_F) - NOMINAL_F).toFixed(2)} Hz injected`
        : isReplay ? 'frozen at capture value'
        : isDoS    ? 'no data'
        : 'within band',
    },
    {
      metric: 'Generation',
      expected: '2800–3200 MW',
      live: isDoS ? 'NULL' : fmt(genMw, 1, ' MW'),
      status: isDoS ? 'null' : 'info',
      note: isReplay ? 'frozen at capture value' : isDoS ? 'no data' : 'normal',
    },
    {
      metric: 'Load',
      expected: 'tracks generation',
      live: isDoS ? 'NULL' : fmt(loadMw, 1, ' MW'),
      status: isDoS ? 'null' : 'info',
      note: isReplay ? 'frozen at capture value' : isDoS ? 'no data' : 'normal',
    },
    {
      metric: 'Timestamp',
      expected: 'advances each tick',
      live: isReplay ? 'FROZEN' : isDoS ? 'NULL' : 'LIVE',
      status: isReplay ? 'crit' : isDoS ? 'null' : 'normal',
      note: isReplay
        ? 'same timestamp repeating — replay signature'
        : isDoS ? 'no data' : 'incrementing normally',
    },
    {
      metric: 'Attack score',
      expected: '0 / 20',
      live: `${attackScore.toFixed(2)} / 20`,
      status: attackScore >= 15 ? 'crit' : attackScore >= 5 ? 'warn' : 'normal',
      note: posture,
    },
  ];

  function rowColor(s: RowStatus): string {
    if (s === 'crit') return 'text-red-400 font-bold';
    if (s === 'warn') return 'text-yellow-400 font-bold';
    if (s === 'null') return 'text-zinc-500 italic';
    if (s === 'info') return 'text-zinc-300';
    return 'text-emerald-400';
  }
  function rowBadge(s: RowStatus): string {
    if (s === 'crit') return 'bg-red-500/20 text-red-400 border border-red-500/40';
    if (s === 'warn') return 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/30';
    if (s === 'null') return 'bg-zinc-700/30 text-zinc-500 border border-zinc-600/30';
    if (s === 'info') return 'bg-zinc-700/30 text-zinc-400 border border-zinc-600/30';
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
  }
  function rowBadgeLabel(s: RowStatus): string {
    if (s === 'crit')   return 'ANOMALY';
    if (s === 'warn')   return 'WARNING';
    if (s === 'null')   return 'NULL';
    if (s === 'info')   return '—';
    return 'NORMAL';
  }

  return (
    <div className="space-y-5 font-mono">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <FlaskConical className="h-6 w-6 text-red-400"/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wider uppercase">
              Attack Simulation Lab
            </h1>
            <p className="text-xs text-zinc-500 uppercase tracking-widest">
              Red team exercise — controlled environment
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShieldAlert className={cn('h-5 w-5', postureColor)}/>
          <span className={cn('text-sm font-bold uppercase tracking-widest', postureColor)}>
            {posture}
          </span>
          <span className="text-zinc-600 mx-2">|</span>
          <span className="text-xs text-zinc-500">
            ATK SCORE:
          </span>
          <span className={cn(
            'text-sm font-bold',
            attackScore >= 15 ? 'text-red-400' :
            attackScore >=  5 ? 'text-yellow-400' : 'text-emerald-400'
          )}>
            {attackScore.toFixed(2)} / 20
          </span>
        </div>
      </div>

      {/* ── Active attack banner ── */}
      {active && activeDef && (
        <div className={cn(
          'rounded-lg border px-4 py-3 flex items-center gap-3 text-sm',
          activeDef.severity === 'CRITICAL'
            ? 'border-red-500/40 bg-red-500/10'
            : 'border-yellow-400/40 bg-yellow-400/10'
        )}>
          <activeDef.icon className={cn(
            'h-4 w-4 shrink-0 animate-pulse',
            activeDef.severity === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'
          )}/>
          <span className={cn(
            'font-bold uppercase tracking-wider',
            activeDef.severity === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'
          )}>
            {activeDef.name} ACTIVE
          </span>
          <span className="text-zinc-400">—</span>
          <span className="text-zinc-300">{activeDef.tagline}</span>
          <div className="ml-auto flex items-center gap-3">
            <Clock className="h-3.5 w-3.5 text-zinc-500"/>
            <span className="text-zinc-400 text-xs">{elapsed(runningMs)}</span>
            <button
              onClick={stopAttack}
              className="flex items-center gap-1.5 px-3 py-1 rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-white text-xs transition-colors"
            >
              <Square className="h-3 w-3"/>
              Stop
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* ── LEFT: Attack cards (2/5) ── */}
        <div className="xl:col-span-2 space-y-3">
          {ATTACKS.map(atk => {
            const isActive = active && activeType === atk.type;
            const Icon = atk.icon;
            return (
              <div key={atk.type} className={cn(
                'rounded-lg border p-4 space-y-3 transition-all',
                isActive
                  ? atk.severity === 'CRITICAL'
                    ? 'border-red-500/60 bg-red-500/5'
                    : 'border-yellow-400/60 bg-yellow-400/5'
                  : 'border-zinc-700 bg-zinc-900/50'
              )}>
                {/* Card header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn(
                      'h-4 w-4',
                      isActive
                        ? atk.severity === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'
                        : 'text-zinc-500'
                    )}/>
                    <span className={cn(
                      'font-bold text-sm uppercase tracking-wide',
                      isActive
                        ? atk.severity === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'
                        : 'text-zinc-300'
                    )}>
                      {atk.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded border',
                      atk.severity === 'CRITICAL'
                        ? 'border-red-500/40 text-red-400 bg-red-500/10'
                        : 'border-yellow-400/40 text-yellow-400 bg-yellow-400/10'
                    )}>
                      {atk.severity}
                    </span>
                    <span className="text-xs text-zinc-600">score {atk.score}</span>
                  </div>
                </div>

                {/* Detection note */}
                <div className="rounded bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
                  <div className="text-xs text-zinc-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Activity className="h-3 w-3"/>
                    Detection logic
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{atk.whatDetector}</p>
                </div>

                {/* Expected output */}
                <div className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-3 w-3 text-zinc-600 mt-0.5 shrink-0"/>
                  <span className="text-zinc-500">{atk.expectedPosture}</span>
                </div>

                {/* Launch / Stop */}
                <button
                  onClick={() => isActive ? stopAttack() : startAttack(atk.type)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2 rounded border text-sm font-bold uppercase tracking-wider transition-all',
                    isActive
                      ? 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white'
                      : atk.severity === 'CRITICAL'
                        ? 'border-red-500/60 text-red-400 bg-red-500/10 hover:bg-red-500/20'
                        : 'border-yellow-400/60 text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20'
                  )}
                >
                  {isActive
                    ? <><Square className="h-3.5 w-3.5"/>Stop attack</>
                    : <><Play className="h-3.5 w-3.5"/>Launch</>
                  }
                </button>
              </div>
            );
          })}
        </div>

        {/* ── RIGHT: Live telemetry + logs (3/5) ── */}
        <div className="xl:col-span-3 space-y-4">

          {/* Telemetry impact table */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
                Live telemetry impact
              </span>
              <span className="text-xs text-zinc-600">
                {active ? `${activeType} in progress` : 'no attack active'}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-zinc-800/60">
                <tr>
                  {['Metric','Expected','Live value','Status','Note'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-zinc-500 uppercase tracking-wider font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map(row => (
                  <tr key={row.metric} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-zinc-300 font-bold">{row.metric}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{row.expected}</td>
                    <td className={cn('px-3 py-2.5', rowColor(row.status))}>{row.live}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-xs px-2 py-0.5 rounded', rowBadge(row.status))}>
                        {rowBadgeLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600 italic">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Attack score bar */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3 space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span className="uppercase tracking-wider">Attack score</span>
              <span className={cn(
                'font-bold',
                attackScore >= 15 ? 'text-red-400' :
                attackScore >= 5  ? 'text-yellow-400' : 'text-emerald-400'
              )}>
                {attackScore.toFixed(2)} / 20 — {posture}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', scoreBarColor)}
                style={{ width: `${Math.min((attackScore / 20) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-700">
              <span>0–5: NORMAL</span>
              <span>5–15: WARNING</span>
              <span>15–20: CRITICAL</span>
            </div>
          </div>

          {/* Threat log */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700">
              <span className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
                Detection log
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-zinc-800">
              {logs.length === 0 ? (
                <div className="px-4 py-6 text-center text-zinc-600 text-xs">
                  No threats detected — system nominal
                </div>
              ) : (
                logs.slice(0, 20).map(log => {
                  const sev = log.threat_classification?.severity ?? 'INFO';
                  return (
                    <div key={log.id} className="px-4 py-2.5 flex items-start gap-3">
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5',
                        sev === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                        sev === 'WARNING'  ? 'bg-yellow-400/10 text-yellow-400' :
                        'bg-zinc-700/30 text-zinc-400'
                      )}>
                        {sev}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-300 truncate">
                          {log.threat_classification?.category?.replace(/_/g,' ')}
                        </div>
                        <div className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
                          {log.explanation}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-700 shrink-0 ml-auto">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}