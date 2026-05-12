import { useEffect, useMemo, useState } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import { useAttack } from '@/contexts/AttackContext';
import { cn } from '@/lib/utils';

function fmt(v: number | null | undefined, d = 1, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return `${v.toFixed(d)}${suffix}`;
}

const G = { stroke: '#1D9E75', dark: '#0F6E56', pulse: '#5DCAA5' };
const R = { stroke: '#E24B4A', dark: '#A32D2D', pulse: '#FF7B79' };
const A = { stroke: '#EF9F27', dark: '#854F0B', pulse: '#FAC775' };
const D = { stroke: '#888780', dark: '#5F5E5A', pulse: '#AAAAAA' };
type Palette = typeof G;

type DiagramZone = 'plant' | 'feeder' | 'meter' | 'area1' | 'area2' | 'panel';

function postureColor(p: string) {
  if (p === 'CRITICAL') return R.stroke;
  if (p === 'WARNING')  return A.stroke;
  return G.stroke;
}

function useSparkline(value: number | null, size = 28): number[] {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (value != null && Number.isFinite(value))
      setHistory(prev => [...prev.slice(-(size - 1)), value]);
  }, [value, size]);
  return history;
}

function Pill({ cx, cy, label, pal }: { cx: number; cy: number; label: string; pal: Palette }) {
  return (
    <>
      <rect x={cx - 36} y={cy - 9} width="72" height="18" rx="9" fill="none" stroke={pal.stroke} strokeWidth="0.8" opacity="0.6"/>
      <circle cx={cx - 22} cy={cy} r="3" fill={pal.pulse}>
        <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      <text x={cx - 10} y={cy} dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={pal.stroke}>{label}</text>
    </>
  );
}

function FlowDot({ path, dur, begin = '0s', color }: { path: string; dur: string; begin?: string; color: string }) {
  return (
    <circle r="4" fill={color} opacity="0.85">
      <animateMotion dur={dur} begin={begin} repeatCount="indefinite"><mpath href={`#${path}`}/></animateMotion>
    </circle>
  );
}

function CB({ cx, cy, closed, label, color }: { cx: number; cy: number; closed: boolean; label: string; color: string }) {
  return (
    <>
      <rect x={cx - 11} y={cy - 8} width="22" height="16" rx="2" fill="none" stroke={color} strokeWidth="1"/>
      {closed
        ? <><line x1={cx-8} y1={cy-5} x2={cx+8} y2={cy+5} stroke={color} strokeWidth="0.8"/><line x1={cx+8} y1={cy-5} x2={cx-8} y2={cy+5} stroke={color} strokeWidth="0.8"/></>
        : <line x1={cx-7} y1={cy} x2={cx+7} y2={cy} stroke={color} strokeWidth="0.8" strokeDasharray="2 2"/>
      }
      <text x={cx} y={cy+18} textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={color} opacity="0.75">{label}</text>
    </>
  );
}

function FdiBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="14" fill="#A32D2D" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite"/>
      </circle>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="14" fill="#FF7B79">⚡</text>
    </g>
  );
}

function ReplayBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="14" fill="#854F0B" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="1.2s" repeatCount="indefinite"/>
      </circle>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="13" fill="#FAC775">⏸</text>
    </g>
  );
}

function DosBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="14" fill="#3A3A3A" opacity="0.95"/>
      <line x1={x-8} y1={y-8} x2={x+8} y2={y+8} stroke="#888780" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1={x+8} y1={y-8} x2={x-8} y2={y+8} stroke="#888780" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  );
}

function FrozenLabel({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x-26} y={y-9} width="52" height="18" rx="4" fill="#854F0B" opacity="0.9"/>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="9" fontFamily="monospace" fontWeight="700" fill="#FAC775">FROZEN</text>
    </g>
  );
}

function FdiInjectionLabels({ voltage, frequency }: { voltage: number; frequency: number }) {
  return (
    <g>
      <rect x="172" y="98" width="92" height="18" rx="3" fill="#A32D2D" opacity="0.92"/>
      <text x="218" y="107" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fontWeight="700" fill="#FF7B79">V: {voltage.toFixed(1)} ⚡</text>
      <rect x="172" y="118" width="92" height="18" rx="3" fill="#A32D2D" opacity="0.92"/>
      <text x="218" y="127" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fontWeight="700" fill="#FF7B79">f: {frequency.toFixed(2)} ⚡</text>
    </g>
  );
}

function BlackoutOverlay() {
  return (
    <g>
      <rect x="20" y="28" width="622" height="462" rx="8" fill="#0A0A0A" opacity="0.75"/>
      <circle cx="340" cy="200" r="56" fill="none" stroke="#888780" strokeWidth="2" opacity="0.6"/>
      <line x1="300" y1="160" x2="380" y2="240" stroke="#888780" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
      <line x1="380" y1="160" x2="300" y2="240" stroke="#888780" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
      <text x="340" y="278" textAnchor="middle" fontSize="16" fontFamily="monospace" fontWeight="700" fill="#888780">TELEMETRY BLACKOUT</text>
      <text x="340" y="300" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#666660">DoS — all sensor data nulled</text>
    </g>
  );
}

function AttackBanner({ type }: { type: string }) {
  if (type === 'NONE') return null;
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    FDI:    { bg: '#A32D2D', text: '#FF7B79', label: '⚡  FDI ACTIVE — voltage +30V · frequency +1Hz injected into telemetry' },
    REPLAY: { bg: '#854F0B', text: '#FAC775', label: '⏸  REPLAY ACTIVE — telemetry frozen at captured snapshot · timestamp static' },
    DOS:    { bg: '#3A3A3A', text: '#AAAAAA', label: '✕  DoS ACTIVE — all telemetry nulled · complete sensor blackout' },
  };
  const c = cfg[type];
  if (!c) return null;
  return (
    <g>
      <rect x="22" y="482" width="636" height="20" rx="4" fill={c.bg} opacity="0.95"/>
      <text x="340" y="492" textAnchor="middle" dominantBaseline="central" fontSize="11" fontFamily="monospace" fontWeight="700" fill={c.text}>{c.label}</text>
    </g>
  );
}

export function ScadaDiagram() {
  const { components, source, isConnected, mqttConnected, posture, attackScore, data } = useScada();
  const { type: attackType, active: attackActive } = useAttack();
  const { plant, feeder, meter } = components;

  const a1On = meter.area1 === 'ON';
  const a2On = meter.area2 === 'ON';
  const isDoS    = attackActive && attackType === 'DOS';
  const isFdi    = attackActive && attackType === 'FDI';
  const isReplay = attackActive && attackType === 'REPLAY';
  const atk      = attackActive ? attackType : 'NONE';

  const globalPal: Palette = G;
  const plantPal:  Palette = G;
  const feederPal: Palette = G;
  const meterPal:  Palette = G;
  const areaPal:   Palette = G;

  const flowActive = !isDoS;
  const flowDur    = isReplay ? '3.5s' : '1.3s';

  const plantLabel  = 'NORMAL';
  const feederLabel = 'NORMAL';
  const meterLabel  = 'NORMAL';

  const pc = postureColor(posture);
  const voltHist = useSparkline(plant.voltage);

  const [selectedZone, setSelectedZone] = useState<DiagramZone | null>(null);
  const [hoverZone, setHoverZone] = useState<DiagramZone | null>(null);

  const pickZone = (z: DiagramZone) => {
    setSelectedZone((cur) => (cur === z ? null : z));
  };

  const zoneDetail = useMemo(() => {
    if (!selectedZone) return null;
    switch (selectedZone) {
      case 'plant':
        return {
          title: 'Power plant',
          rows: [
            { k: 'Source', v: source },
            { k: 'Generation', v: isDoS ? '—' : `${fmt(plant.generation, 1)} MW` },
            { k: 'RPM', v: isDoS ? '—' : `${fmt(plant.rpm, 0)}` },
            { k: 'Voltage', v: isDoS ? '—' : `${fmt(plant.voltage, 1)} V` },
            { k: 'Frequency', v: isDoS ? '—' : `${fmt(plant.frequency, 2)} Hz` },
          ],
        };
      case 'feeder':
        return {
          title: 'Grid feeder',
          rows: [
            { k: 'Voltage', v: isDoS ? '—' : `${fmt(feeder.voltage, 1)} V` },
            { k: 'Feeder load', v: isDoS ? '—' : `${fmt(feeder.feederLoad, 1)} MW` },
            { k: 'Frequency', v: isDoS ? '—' : `${fmt(feeder.frequency, 2)} Hz` },
          ],
        };
      case 'meter':
        return {
          title: 'Smart meter',
          rows: [
            { k: 'Total load', v: isDoS ? '—' : `${fmt(meter.load, 1)} MW` },
            { k: 'Bill (sim)', v: isDoS ? 'suspended' : `$${fmt(meter.calculatedBill, 2)}` },
            { k: 'Areas', v: isDoS ? '—' : `${meter.area1} / ${meter.area2}` },
          ],
        };
      case 'area1':
        return {
          title: 'Area 1 — Industrial',
          rows: [
            { k: 'Feeder', v: isDoS ? 'OFFLINE' : meter.area1 },
            { k: 'Load', v: isDoS ? '—' : `${fmt(meter.area1Load, 1)} MW` },
            { k: 'CB-A1', v: a1On && !isDoS ? 'Closed (energized)' : 'Open / offline' },
          ],
        };
      case 'area2':
        return {
          title: 'Area 2 — Residential',
          rows: [
            { k: 'Feeder', v: isDoS ? 'OFFLINE' : meter.area2 },
            { k: 'Load', v: isDoS ? '—' : `${fmt(meter.area2Load, 1)} MW` },
            { k: 'CB-A2', v: a2On && !isDoS ? 'Closed (energized)' : 'Open / offline' },
          ],
        };
      case 'panel':
        return {
          title: 'SCADA control centre',
          rows: [
            { k: 'Security posture', v: posture },
            { k: 'Attack score', v: attackScore.toFixed(2) },
            { k: 'Bill', v: isDoS ? 'suspended' : `$${fmt(meter.calculatedBill, 2)}` },
            { k: 'Grid status', v: data?.status ?? '—' },
          ],
        };
      default:
        return null;
    }
  }, [
    selectedZone,
    source,
    isDoS,
    plant.generation,
    plant.rpm,
    plant.voltage,
    plant.frequency,
    feeder.voltage,
    feeder.feederLoad,
    feeder.frequency,
    meter.load,
    meter.calculatedBill,
    meter.area1,
    meter.area2,
    meter.area1Load,
    meter.area2Load,
    a1On,
    a2On,
    posture,
    attackScore,
    data?.status,
  ]);

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          ⚡ Smart grid — plant → feeder → meter → areas · click zones for live detail
        </span>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-muted-foreground uppercase">{source}</span>
          <span className={cn('flex items-center gap-1.5', isConnected ? 'text-green-400' : 'text-muted-foreground')}>
            <span className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-green-400' : 'bg-muted-foreground')}/>
            {isConnected ? 'Live' : 'Offline'}
          </span>
          <span className={cn('flex items-center gap-1.5', mqttConnected ? 'text-blue-400' : 'text-muted-foreground')}>
            <span className={cn('w-2 h-2 rounded-full', mqttConnected ? 'bg-blue-400' : 'bg-muted-foreground')}/>
            MQTT
          </span>
          <span style={{ color: pc }} className="font-bold uppercase">{posture}</span>
        </div>
      </div>

      <svg width="100%" viewBox="0 0 680 560" style={{ display: 'block' }}>
        <defs>
          <marker id="sld-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <path id="fp-pf" d="M190,135 L230,135" fill="none"/>
          <path id="fp-fm" d="M400,135 L440,135" fill="none"/>
          <path id="fp-a1" d="M540,220 L540,255 L380,255 L380,320" fill="none"/>
          <path id="fp-a2" d="M540,220 L540,255 L560,255 L560,320" fill="none"/>
        </defs>

        {/* POWER PLANT */}
        <rect x="20" y="30" width="170" height="190" rx="8"
          fill="none" stroke={plantPal.stroke} strokeWidth="1.5"/>
        <Pill cx={95} cy={52} label={plantLabel} pal={plantPal}/>
        <text x="105" y="72" textAnchor="middle" dominantBaseline="central" fontSize="13" fontFamily="monospace" fontWeight="600" fill={plantPal.stroke}>Power plant</text>
        <circle cx="105" cy="135" r="44" fill="none" stroke={plantPal.dark} strokeWidth="1.5"/>
        <circle cx="105" cy="135" r="7"  fill="none" stroke={plantPal.dark} strokeWidth="1.5"/>
        <path d="M105 128 C101 116 90 109 84 116 C78 123 86 133 105 128Z" fill="none" stroke={plantPal.dark} strokeWidth="1.5"/>
        <path d="M112 141 C122 139 131 132 129 124 C127 116 117 117 112 141Z" fill="none" stroke={plantPal.dark} strokeWidth="1.5"/>
        <path d="M98 142 C92 153 93 163 101 164 C110 166 113 155 98 142Z" fill="none" stroke={plantPal.dark} strokeWidth="1.5"/>
        {!isDoS && (
          <circle cx="105" cy="91" r="3.5" fill={plantPal.pulse}>
            <animateTransform attributeName="transform" type="rotate" from="0 105 135" to="360 105 135" dur={isReplay ? '6s' : '3s'} repeatCount="indefinite"/>
          </circle>
        )}
        <text x="105" y="192" textAnchor="middle" dominantBaseline="central" fontSize="11" fontFamily="monospace" fill={plantPal.stroke} opacity="0.9">
          {isDoS ? 'NULL  ·  NULL' : `${fmt(plant.generation,1)} MW · ${fmt(plant.rpm,0)} RPM`}
        </text>
        <text x="105" y="210" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={plantPal.stroke} opacity="0.7">
          {isDoS ? 'NULL  ·  NULL' : isFdi ? `${fmt(plant.voltage,1)} V ⚡ · ${fmt(plant.frequency,2)} Hz ⚡` : `${fmt(plant.voltage,1)} V · ${fmt(plant.frequency,2)} Hz`}
        </text>
        {isFdi    && <FdiBadge    x={174} y={34}/>}
        {isReplay && <ReplayBadge x={174} y={34}/>}
        {isDoS    && <DosBadge    x={174} y={34}/>}

        {/* HV LINE */}
        <line x1="190" y1="135" x2="230" y2="135" stroke={globalPal.stroke} strokeWidth="1.5" strokeDasharray={isReplay ? '3 5' : '5 3'} markerEnd="url(#sld-arr)"/>
        <circle cx="202" cy="135" r="3" fill={globalPal.stroke} opacity="0.5"/>
        <circle cx="216" cy="135" r="3" fill={globalPal.stroke} opacity="0.5"/>
        <text x="210" y="124" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={globalPal.stroke} opacity="0.75">HV line</text>
        {isFdi    && <FdiInjectionLabels voltage={plant.voltage ?? 0} frequency={plant.frequency ?? 0}/>}
        {isReplay && <FrozenLabel x={210} y={150}/>}
        {flowActive && <FlowDot path="fp-pf" dur={flowDur} color={globalPal.pulse}/>}

        {/* GRID FEEDER */}
        <rect x="230" y="30" width="170" height="190" rx="8"
          fill="none" stroke={feederPal.stroke} strokeWidth="1.5"/>
        <Pill cx={305} cy={52} label={feederLabel} pal={feederPal}/>
        <text x="315" y="72" textAnchor="middle" dominantBaseline="central" fontSize="13" fontFamily="monospace" fontWeight="600" fill={feederPal.stroke}>Grid feeder</text>
        <text x="315" y="90" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={feederPal.stroke} opacity="0.65">Distribution centre</text>
        <line x1="272" y1="118" x2="358" y2="118" stroke={feederPal.dark} strokeWidth="2.5"/>
        <line x1="282" y1="134" x2="348" y2="134" stroke={feederPal.dark} strokeWidth="1.5" opacity="0.7"/>
        <line x1="292" y1="148" x2="338" y2="148" stroke={feederPal.dark} strokeWidth="1" opacity="0.45"/>
        <line x1="315" y1="118" x2="315" y2="158" stroke={feederPal.dark} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.3"/>
        <text x="315" y="178" textAnchor="middle" dominantBaseline="central" fontSize="11" fontFamily="monospace" fill={feederPal.stroke} opacity="0.9">
          {isDoS ? 'NULL  ·  CB1' : `${fmt(feeder.voltage,1)} V · CB1`}
        </text>
        <text x="315" y="196" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={feederPal.stroke} opacity="0.7">
          {isDoS ? 'NULL  ·  NULL' : `${fmt(feeder.feederLoad,1)} MW · ${fmt(feeder.frequency,2)} Hz`}
        </text>
        {isFdi    && <FdiBadge    x={394} y={34}/>}
        {isReplay && <ReplayBadge x={394} y={34}/>}
        {isDoS    && <DosBadge    x={394} y={34}/>}

        {/* DIST LINE */}
        <line x1="400" y1="135" x2="440" y2="135" stroke={feederPal.stroke} strokeWidth="1.5" strokeDasharray={isReplay ? '3 5' : '5 3'} markerEnd="url(#sld-arr)"/>
        <circle cx="412" cy="135" r="3" fill={feederPal.stroke} opacity="0.5"/>
        <circle cx="426" cy="135" r="3" fill={feederPal.stroke} opacity="0.5"/>
        <text x="420" y="124" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={feederPal.stroke} opacity="0.75">dist. line</text>
        {isReplay && <FrozenLabel x={420} y={150}/>}
        {flowActive && <FlowDot path="fp-fm" dur={flowDur} begin="0.3s" color={feederPal.pulse}/>}

        {/* SMART METER */}
        <rect x="440" y="30" width="200" height="190" rx="8"
          fill="none" stroke={meterPal.stroke} strokeWidth="1.5"/>
        <Pill cx={535} cy={52} label={meterLabel} pal={meterPal}/>
        <text x="540" y="72" textAnchor="middle" dominantBaseline="central" fontSize="13" fontFamily="monospace" fontWeight="600" fill={meterPal.stroke}>Smart meter</text>
        <circle cx="540" cy="130" r="38" fill="none" stroke={meterPal.dark} strokeWidth="1.5"/>
        <text x="540" y="130" textAnchor="middle" dominantBaseline="central" fontSize="14" fontFamily="monospace" fontWeight="700" fill={meterPal.stroke}>{isDoS ? '---' : 'kWh'}</text>
        <text x="540" y="178" textAnchor="middle" dominantBaseline="central" fontSize="11" fontFamily="monospace" fill={meterPal.stroke} opacity="0.9">
          {isDoS ? 'NULL' : `${fmt(meter.load,1)} MW`}
        </text>
        <text x="540" y="196" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={meterPal.stroke} opacity="0.7">
          {isDoS ? 'billing suspended' : `$${fmt(meter.calculatedBill,2)} · $0.25/unit`}
        </text>
        {isFdi    && <FdiBadge    x={634} y={34}/>}
        {isReplay && <ReplayBadge x={634} y={34}/>}
        {isDoS    && <DosBadge    x={634} y={34}/>}

        {/* DISTRIBUTION BUS */}
        <line x1="540" y1="220" x2="540" y2="255" stroke={meterPal.stroke} strokeWidth="1.5"/>
        <line x1="330" y1="255" x2="610" y2="255" stroke={meterPal.stroke} strokeWidth="2"/>
        <text x="540" y="245" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={meterPal.stroke} opacity="0.55">distribution bus</text>

        {/* CB-A1 */}
        <line x1="380" y1="255" x2="380" y2="278" stroke={areaPal.stroke} strokeWidth="1.5"/>
        <CB cx={380} cy={287} closed={a1On && !isDoS} label="CB-A1" color={areaPal.stroke}/>
        <line x1="380" y1="295" x2="380" y2="320" stroke={areaPal.stroke} strokeWidth="1.5"/>

        {/* CB-A2 */}
        <line x1="560" y1="255" x2="560" y2="278" stroke={areaPal.stroke} strokeWidth="1.5"/>
        <CB cx={560} cy={287} closed={a2On && !isDoS} label="CB-A2" color={areaPal.stroke}/>
        <line x1="560" y1="295" x2="560" y2="320" stroke={areaPal.stroke} strokeWidth="1.5"/>

        {flowActive && a1On && <FlowDot path="fp-a1" dur={flowDur} color={areaPal.pulse}/>}
        {flowActive && a2On && <FlowDot path="fp-a2" dur={flowDur} begin="0.35s" color={areaPal.pulse}/>}

        {/* AREA 1 */}
        <rect x="280" y="320" width="200" height="160" rx="8"
          fill="none" stroke={areaPal.stroke} strokeWidth="1.5"/>
        <text x="380" y="342" textAnchor="middle" dominantBaseline="central" fontSize="13" fontFamily="monospace" fontWeight="600" fill={areaPal.stroke}>Area 1</text>
        <text x="380" y="360" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={areaPal.stroke} opacity="0.65">Industrial zone</text>
        <circle cx="288" cy="340" r="5" fill={a1On ? G.stroke : '#888780'}>
          {a1On && !isDoS && <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite"/>}
        </circle>
        <text x="298" y="340" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={a1On ? G.stroke : '#888780'}>{meter.area1}</text>
        <rect x="319" y="382" width="46" height="48" rx="2" fill="none" stroke={areaPal.dark} strokeWidth="1"/>
        <rect x="328" y="370" width="11" height="16" rx="1" fill="none" stroke={areaPal.dark} strokeWidth="1"/>
        <rect x="347" y="366" width="11" height="20" rx="1" fill="none" stroke={areaPal.dark} strokeWidth="1"/>
        <circle cx="333" cy="365" r="2" fill="none" stroke={areaPal.dark} strokeWidth="0.7" opacity="0.5"/>
        <circle cx="352" cy="361" r="2" fill="none" stroke={areaPal.dark} strokeWidth="0.7" opacity="0.5"/>
        <rect x="375" y="382" width="46" height="48" rx="2" fill="none" stroke={areaPal.dark} strokeWidth="1"/>
        <rect x="384" y="370" width="11" height="16" rx="1" fill="none" stroke={areaPal.dark} strokeWidth="1"/>
        <rect x="403" y="366" width="11" height="20" rx="1" fill="none" stroke={areaPal.dark} strokeWidth="1"/>
        <circle cx="389" cy="365" r="2" fill="none" stroke={areaPal.dark} strokeWidth="0.7" opacity="0.5"/>
        <circle cx="408" cy="361" r="2" fill="none" stroke={areaPal.dark} strokeWidth="0.7" opacity="0.5"/>
        <text x="380" y="447" textAnchor="middle" dominantBaseline="central" fontSize="11" fontFamily="monospace" fill={areaPal.stroke} opacity="0.9">
          {isDoS ? 'NULL' : isReplay ? `${fmt(meter.area1Load,1)} MW ⏸` : `${fmt(meter.area1Load,1)} MW`}
        </text>
        <text x="380" y="465" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={areaPal.stroke} opacity="0.65">
          {isDoS ? 'billing suspended' : `$${fmt(meter.calculatedBill != null ? meter.calculatedBill/2 : null, 2)}`}
        </text>

        {/* AREA 2 */}
        <rect x="460" y="320" width="200" height="160" rx="8"
          fill="none" stroke={areaPal.stroke} strokeWidth="1.5"/>
        <text x="560" y="342" textAnchor="middle" dominantBaseline="central" fontSize="13" fontFamily="monospace" fontWeight="600" fill={areaPal.stroke}>Area 2</text>
        <text x="560" y="360" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={areaPal.stroke} opacity="0.65">Residential zone</text>
        <circle cx="468" cy="340" r="5" fill={a2On ? G.stroke : '#888780'}>
          {a2On && !isDoS && <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite"/>}
        </circle>
        <text x="478" y="340" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={a2On ? G.stroke : '#888780'}>{meter.area2}</text>
        <polygon points="530,420 560,392 590,420" fill="none" stroke={areaPal.dark} strokeWidth="1.5"/>
        <rect x="536" y="420" width="48" height="32" rx="2" fill="none" stroke={areaPal.dark} strokeWidth="1.5"/>
        {[0,1,2].flatMap((c) => [0,1].map((r) => (
          <rect key={`${c}${r}`} x={541+c*15} y={425+r*13} width="10" height="9" rx="1" fill="none" stroke={areaPal.dark} strokeWidth="0.8"/>
        )))}
        <text x="560" y="465" textAnchor="middle" dominantBaseline="central" fontSize="11" fontFamily="monospace" fill={areaPal.stroke} opacity="0.9">
          {isDoS ? 'NULL' : isReplay ? `${fmt(meter.area2Load,1)} MW ⏸` : `${fmt(meter.area2Load,1)} MW`}
        </text>
        <text x="560" y="483" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={areaPal.stroke} opacity="0.65">
          {isDoS ? 'billing suspended' : `$${fmt(meter.calculatedBill != null ? meter.calculatedBill/2 : null, 2)}`}
        </text>

        {/* DoS blackout overlay — sits on top of everything */}
        {isDoS && <BlackoutOverlay/>}

        {/* TELEMETRY WIRE */}
        <path d="M315 255 L140 318" fill="none" stroke={globalPal.stroke} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.45"/>
        <text x="210" y="298" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={globalPal.stroke} opacity="0.5">telemetry · MQTT</text>

        {/* SCADA PANEL */}
        <rect x="20" y="320" width="240" height="170" rx="8" fill="none" stroke={globalPal.stroke} strokeWidth="1.2"/>
        <text x="140" y="342" textAnchor="middle" dominantBaseline="central" fontSize="12" fontFamily="monospace" fontWeight="600" fill={globalPal.stroke}>SCADA control centre</text>
        <rect x="36" y="356" width="90" height="54" rx="4" fill="none" stroke={globalPal.stroke} strokeWidth="0.5" opacity="0.35"/>
        <text x="81" y="368" textAnchor="middle" dominantBaseline="central" fontSize="9" fontFamily="monospace" fill={globalPal.stroke} opacity="0.65">V trend</text>
        {voltHist.length > 1 && (() => {
          const min = Math.min(...voltHist);
          const max = Math.max(...voltHist) || (min + 1);
          const pts = voltHist.map((v, i) => {
            const x = 38 + (i / (voltHist.length - 1)) * 86;
            const y = 403 - ((v - min) / (max - min || 1)) * 26;
            return `${x},${y}`;
          }).join(' ');
          return <polyline points={pts} fill="none" stroke={globalPal.stroke} strokeWidth="1.4"/>;
        })()}
        <rect x="140" y="356" width="90" height="54" rx="4" fill="none" stroke={globalPal.stroke} strokeWidth="0.5" opacity="0.35"/>
        <text x="185" y="368" textAnchor="middle" dominantBaseline="central" fontSize="9" fontFamily="monospace" fill={globalPal.stroke} opacity="0.65">Load MW</text>
        {[12,18,14,22,16,10].map((h, i) => (
          <rect key={i} x={144+i*13} y={410-h} width="10" height={h} rx="1"
            fill={isDoS ? D.stroke : i===4 ? A.stroke : globalPal.stroke} opacity="0.75"/>
        ))}
        <circle cx="36" cy="424" r="4" fill={pc}>
          <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite"/>
        </circle>
        <text x="46" y="424" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={pc}>SEC: {posture}</text>
        <text x="36" y="442" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={globalPal.stroke} opacity="0.8">ATK: {attackScore.toFixed(2)} / 20</text>
        <text x="36" y="459" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={globalPal.stroke} opacity="0.8">
          {isDoS ? 'Bill: suspended' : `Bill: $${fmt(meter.calculatedBill,2)}`}
        </text>
        <text x="36" y="476" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={globalPal.stroke} opacity="0.7">Broker: hivemq.com</text>

        {/* Interactive SLD hit layer — above static graphics */}
        <g className="scada-diagram-hits">
          <title>Click a highlighted region for node detail</title>
          <rect
            x="20" y="30" width="170" height="190" rx="8"
            fill="transparent"
            stroke={hoverZone === 'plant' || selectedZone === 'plant' ? plantPal.stroke : 'transparent'}
            strokeWidth={hoverZone === 'plant' || selectedZone === 'plant' ? 2.5 : 0}
            className="cursor-pointer transition-[stroke,stroke-width] duration-150"
            onMouseEnter={() => setHoverZone('plant')}
            onMouseLeave={() => setHoverZone(null)}
            onClick={() => pickZone('plant')}
          />
          <rect
            x="230" y="30" width="170" height="190" rx="8"
            fill="transparent"
            stroke={hoverZone === 'feeder' || selectedZone === 'feeder' ? feederPal.stroke : 'transparent'}
            strokeWidth={hoverZone === 'feeder' || selectedZone === 'feeder' ? 2.5 : 0}
            className="cursor-pointer transition-[stroke,stroke-width] duration-150"
            onMouseEnter={() => setHoverZone('feeder')}
            onMouseLeave={() => setHoverZone(null)}
            onClick={() => pickZone('feeder')}
          />
          <rect
            x="440" y="30" width="200" height="190" rx="8"
            fill="transparent"
            stroke={hoverZone === 'meter' || selectedZone === 'meter' ? meterPal.stroke : 'transparent'}
            strokeWidth={hoverZone === 'meter' || selectedZone === 'meter' ? 2.5 : 0}
            className="cursor-pointer transition-[stroke,stroke-width] duration-150"
            onMouseEnter={() => setHoverZone('meter')}
            onMouseLeave={() => setHoverZone(null)}
            onClick={() => pickZone('meter')}
          />
          <rect
            x="280" y="320" width="200" height="160" rx="8"
            fill="transparent"
            stroke={hoverZone === 'area1' || selectedZone === 'area1' ? areaPal.stroke : 'transparent'}
            strokeWidth={hoverZone === 'area1' || selectedZone === 'area1' ? 2.5 : 0}
            className="cursor-pointer transition-[stroke,stroke-width] duration-150"
            onMouseEnter={() => setHoverZone('area1')}
            onMouseLeave={() => setHoverZone(null)}
            onClick={() => pickZone('area1')}
          />
          <rect
            x="460" y="320" width="200" height="160" rx="8"
            fill="transparent"
            stroke={hoverZone === 'area2' || selectedZone === 'area2' ? areaPal.stroke : 'transparent'}
            strokeWidth={hoverZone === 'area2' || selectedZone === 'area2' ? 2.5 : 0}
            className="cursor-pointer transition-[stroke,stroke-width] duration-150"
            onMouseEnter={() => setHoverZone('area2')}
            onMouseLeave={() => setHoverZone(null)}
            onClick={() => pickZone('area2')}
          />
          <rect
            x="20" y="320" width="240" height="170" rx="8"
            fill="transparent"
            stroke={hoverZone === 'panel' || selectedZone === 'panel' ? globalPal.stroke : 'transparent'}
            strokeWidth={hoverZone === 'panel' || selectedZone === 'panel' ? 2.5 : 0}
            className="cursor-pointer transition-[stroke,stroke-width] duration-150"
            onMouseEnter={() => setHoverZone('panel')}
            onMouseLeave={() => setHoverZone(null)}
            onClick={() => pickZone('panel')}
          />
        </g>

        {/* ATTACK BANNER */}
        <AttackBanner type={atk}/>

        {/* BOTTOM BAR */}
        <line x1="20" y1="498" x2="660" y2="498" stroke={globalPal.stroke} strokeWidth="0.4" opacity="0.25"/>
        <text x="340" y="515" textAnchor="middle" dominantBaseline="central" fontSize="10" fontFamily="monospace" fill={globalPal.stroke} opacity="0.7">
          {isDoS
            ? 'Load: NULL  ·  Gen: NULL  ·  V: NULL  ·  Hz: NULL  ·  OFFLINE'
            : `Load: ${fmt(data?.load_mw,1)} MW  ·  Gen: ${fmt(data?.gen_mw,1)} MW  ·  ${fmt(data?.voltage,1)} V  ·  ${fmt(data?.frequency,2)} Hz  ·  ${data?.status ?? 'OFFLINE'}`
          }
        </text>
      </svg>

      {zoneDetail && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 font-mono text-xs">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 text-foreground font-semibold uppercase tracking-wide">
              <span className="text-scada-info">●</span>
              {zoneDetail.title}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
              {zoneDetail.rows.map((row) => (
                <div key={row.k} className="flex justify-between gap-4 border-b border-border/40 pb-0.5 sm:border-0">
                  <dt>{row.k}</dt>
                  <dd className="text-foreground font-medium tabular-nums shrink-0">{row.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button
            type="button"
            className="shrink-0 self-start rounded border border-border px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => setSelectedZone(null)}
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}