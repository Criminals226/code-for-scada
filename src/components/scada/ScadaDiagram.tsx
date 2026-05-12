import { useEffect, useState } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import { useAttack } from '@/contexts/AttackContext';

function fmt(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return v.toFixed(d);
}

/** Fixed physical-layer palette — never driven by security posture. */
const PHY = { stroke: '#1D9E75', dark: '#0F6E56', pulse: '#5DCAA5' };
const BUS_GRAY = '#888780';

function postureColor(p: string) {
  if (p === 'CRITICAL') return '#E24B4A';
  if (p === 'WARNING') return '#EF9F27';
  return '#1D9E75';
}

function useSparkline(value: number | null | undefined, size = 28): number[] {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (value != null && Number.isFinite(value)) {
      setHistory((prev) => [...prev.slice(-(size - 1)), value]);
    }
  }, [value, size]);
  return history;
}

/** Operational pill: green NORMAL, gray OFFLINE (DoS telemetry drop only). */
function Pill({ x, y, offline }: { x: number; y: number; offline: boolean }) {
  const s = offline ? BUS_GRAY : PHY.stroke;
  return (
    <g>
      <rect x={x} y={y} width={70} height={16} rx={3} fill="#0E1417" stroke={s} />
      <circle cx={x + 9} cy={y + 8} r={3.5} fill={s}>
        {!offline && <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />}
      </circle>
      <text x={x + 18} y={y + 12} fill={s} fontSize={9} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
        {offline ? 'OFFLINE' : 'NORMAL'}
      </text>
    </g>
  );
}

function FlowDot({ pathId, dur, begin = '0s', color }: { pathId: string; dur: string; begin?: string; color: string }) {
  return (
    <circle r={3.2} fill={color} opacity={0.95}>
      <animateMotion dur={dur} begin={begin} repeatCount="indefinite">
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </circle>
  );
}

function CB({ x, y, closed, label, color }: { x: number; y: number; closed: boolean; label: string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={7} fill="#0E1417" stroke={color} strokeWidth={1.5} />
      {closed ? (
        <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={color} strokeWidth={2} />
      ) : (
        <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={color} strokeWidth={2} />
      )}
      <text x={x + 11} y={y + 3} fill="#B8B8B0" fontSize={8} fontFamily="JetBrains Mono, monospace">
        {label}
      </text>
    </g>
  );
}

function FrozenBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 34} y={y - 9} width={68} height={18} rx={4} fill="#854F0B" opacity={0.92} stroke="#EF9F27" strokeWidth={1} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontFamily="JetBrains Mono, monospace"
        fontWeight={700}
        fill="#FAC775"
      >
        FROZEN
      </text>
    </g>
  );
}

function OfflineBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 36} y={y - 8} width={72} height={16} rx={3} fill="#1A1A1A" stroke={BUS_GRAY} strokeWidth={1} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fontFamily="JetBrains Mono, monospace"
        fontWeight={700}
        fill={BUS_GRAY}
      >
        OFFLINE
      </text>
    </g>
  );
}

/** Red blinking telemetry value (FDI indicator). */
function InjectedValueText({
  x,
  y,
  anchor,
  size,
  children,
}: {
  x: number;
  y: number;
  anchor: 'middle' | 'end';
  size: number;
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fill="#E24B4A"
      fontSize={size}
      fontFamily="JetBrains Mono, monospace"
      fontWeight={700}
    >
      {children}
      <animate attributeName="opacity" values="1;0.35;1" dur="0.85s" repeatCount="indefinite" />
    </text>
  );
}

export function ScadaDiagram() {
  const { components, source, isConnected, mqttConnected, posture, attackScore, data } = useScada();
  const { type: attackType, active: attackActive } = useAttack();
  const { plant, feeder, meter } = components;

  const isDoS = attackActive && attackType === 'DOS';
  const isFdi = attackActive && attackType === 'FDI';
  const isReplay = attackActive && attackType === 'REPLAY';

  const a1On = meter.area1 === 'ON';
  const a2On = meter.area2 === 'ON';

  const pc = postureColor(posture);
  const voltHist = useSparkline(plant.voltage);

  const lineStroke = isDoS ? BUS_GRAY : PHY.stroke;
  const lineDash = isDoS ? '12 10' : '6 4';
  const telStroke = isDoS ? BUS_GRAY : '#3B7E9C';
  const telDash = isDoS ? '8 6' : '3 3';

  const motionOn = !isDoS && !isReplay;

  const cbStroke = PHY.stroke;

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          ⚡ Smart grid — plant → feeder → meter → areas
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase">
          <span className="text-muted-foreground">
            Source: <span className="text-foreground">{source}</span>
          </span>
          <span className={isConnected ? 'text-scada-normal' : 'text-scada-offline'}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${isConnected ? 'bg-scada-normal' : 'bg-scada-offline'}`} />
            {isConnected ? 'Live' : 'Offline'}
          </span>
          <span className={mqttConnected ? 'text-scada-info' : 'text-scada-offline'}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${mqttConnected ? 'bg-scada-info' : 'bg-scada-offline'}`} />
            MQTT
          </span>
          <span style={{ color: pc }}>{posture}</span>
        </div>
      </div>

      <svg viewBox="0 0 980 460" className="w-full h-auto" style={{ background: '#0A0F12' }}>
        <defs>
          <filter id="g-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={3} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="fdi-outline-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={3} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="grid-bg" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#152025" strokeWidth="0.5" />
          </pattern>
          <path id="p-hv" d="M 200 110 L 350 110" />
          <path id="p-dist" d="M 540 110 L 690 110" />
          <path id="p-bus-a1" d="M 800 200 L 800 280 L 730 280" />
          <path id="p-bus-a2" d="M 800 200 L 800 280 L 870 280" />
        </defs>

        <rect x={0} y={0} width={980} height={460} fill="url(#grid-bg)" />

        {/* POWER PLANT */}
        <g>
          {isFdi && (
            <rect
              x={38}
              y={48}
              width={164}
              height={144}
              rx={8}
              fill="none"
              stroke="#E24B4A"
              strokeWidth={2}
              filter="url(#fdi-outline-glow)"
              opacity={0.95}
            />
          )}
          <rect x={40} y={50} width={160} height={140} rx={6} fill="#0E1417" stroke={PHY.stroke} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={120} y={70} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            POWER PLANT
          </text>
          <circle cx={120} cy={115} r={22} fill="none" stroke={PHY.stroke} strokeWidth={1.5} />
          <circle cx={120} cy={115} r={4} fill={PHY.stroke} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line
              key={a}
              x1={120}
              y1={115}
              x2={120 + Math.cos((a * Math.PI) / 180) * 20}
              y2={115 + Math.sin((a * Math.PI) / 180) * 20}
              stroke={PHY.stroke}
              strokeWidth={1.5}
            >
              {motionOn && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 120 115"
                  to="360 120 115"
                  dur="3s"
                  repeatCount="indefinite"
                />
              )}
            </line>
          ))}
          <Pill x={45} y={55} offline={isDoS} />
          {isDoS && <OfflineBadge x={175} y={62} />}
          <text x={120} y={155} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            {fmt(plant.generation, 1)} MW · {fmt(plant.rpm, 0)} RPM
          </text>
          {isFdi ? (
            <InjectedValueText x={120} y={172} anchor="middle" size={10}>
              {`${fmt(plant.voltage, 1)} V · ${fmt(plant.frequency, 2)} Hz`}
            </InjectedValueText>
          ) : (
            <text x={120} y={172} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
              {fmt(plant.voltage, 1)} V · {fmt(plant.frequency, 2)} Hz
            </text>
          )}
        </g>

        <use href="#p-hv" stroke={lineStroke} strokeWidth={2.5} fill="none" strokeDasharray={lineDash} opacity={0.85} />
        <text x={275} y={102} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
          HV line
        </text>
        {motionOn && <FlowDot pathId="p-hv" dur="2.2s" color={PHY.pulse} />}
        {motionOn && <FlowDot pathId="p-hv" dur="2.2s" begin="0.7s" color={PHY.pulse} />}

        {/* GRID FEEDER */}
        <g>
          {isFdi && (
            <rect
              x={348}
              y={48}
              width={194}
              height={144}
              rx={8}
              fill="none"
              stroke="#E24B4A"
              strokeWidth={2}
              filter="url(#fdi-outline-glow)"
              opacity={0.95}
            />
          )}
          <rect x={350} y={50} width={190} height={140} rx={6} fill="#0E1417" stroke={PHY.stroke} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={445} y={70} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            GRID FEEDER
          </text>
          <text x={445} y={84} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Distribution centre
          </text>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={385 + i * 30} y={100} width={18} height={40} rx={2} fill={PHY.dark} stroke={PHY.stroke} />
          ))}
          <Pill x={355} y={55} offline={isDoS} />
          {isDoS && <OfflineBadge x={528} y={62} />}
          {isFdi ? (
            <InjectedValueText x={445} y={158} anchor="middle" size={10}>
              {`${fmt(feeder.voltage, 1)} V · CB1`}
            </InjectedValueText>
          ) : (
            <text x={445} y={158} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
              {fmt(feeder.voltage, 1)} V · CB1
            </text>
          )}
          {isFdi ? (
            <InjectedValueText x={445} y={174} anchor="middle" size={10}>
              {`${fmt(feeder.feederLoad, 1)} MW · ${fmt(feeder.frequency, 2)} Hz`}
            </InjectedValueText>
          ) : (
            <text x={445} y={174} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
              {fmt(feeder.feederLoad, 1)} MW · {fmt(feeder.frequency, 2)} Hz
            </text>
          )}
        </g>

        <use href="#p-dist" stroke={lineStroke} strokeWidth={2.5} fill="none" strokeDasharray={lineDash} opacity={0.85} />
        <text x={615} y={102} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
          dist. line
        </text>
        {motionOn && <FlowDot pathId="p-dist" dur="2s" color={PHY.pulse} />}
        {motionOn && <FlowDot pathId="p-dist" dur="2s" begin="0.6s" color={PHY.pulse} />}

        {/* SMART METER */}
        <g>
          {isFdi && (
            <rect
              x={688}
              y={48}
              width={224}
              height={144}
              rx={8}
              fill="none"
              stroke="#E24B4A"
              strokeWidth={2}
              filter="url(#fdi-outline-glow)"
              opacity={0.95}
            />
          )}
          <rect x={690} y={50} width={220} height={140} rx={6} fill="#0E1417" stroke={PHY.stroke} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={800} y={70} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            SMART METER
          </text>
          <rect x={720} y={88} width={160} height={42} rx={3} fill="#06120A" stroke={PHY.stroke} />
          <text x={800} y={115} textAnchor="middle" fill={PHY.stroke} fontSize={18} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {fmt(meter.load, 1)} MW
          </text>
          <text x={870} y={126} textAnchor="end" fill={PHY.stroke} fontSize={8} fontFamily="JetBrains Mono, monospace">
            kWh
          </text>
          <Pill x={695} y={55} offline={isDoS} />
          {isDoS && <OfflineBadge x={895} y={62} />}
          {isReplay && <FrozenBadge x={800} y={82} />}
          {isFdi ? (
            <InjectedValueText x={800} y={150} anchor="middle" size={10}>
              {`${fmt(meter.voltage, 1)} V`}
            </InjectedValueText>
          ) : (
            <text x={800} y={150} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
              {fmt(meter.voltage, 1)} V
            </text>
          )}
          <text x={800} y={172} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            ${fmt(meter.calculatedBill, 2)} · $0.25/unit
          </text>
        </g>

        <line x1={800} y1={190} x2={800} y2={280} stroke={lineStroke} strokeWidth={2} strokeDasharray={isDoS ? '10 8' : undefined} />
        <line x1={730} y1={280} x2={870} y2={280} stroke={lineStroke} strokeWidth={2} strokeDasharray={isDoS ? '10 8' : undefined} />
        <text x={800} y={205} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
          distribution bus
        </text>

        <CB x={760} y={280} closed={a1On} label="CB-A1" color={cbStroke} />
        <CB x={840} y={280} closed={a2On} label="CB-A2" color={cbStroke} />

        {motionOn && a1On && <FlowDot pathId="p-bus-a1" dur="1.8s" color={PHY.pulse} />}
        {motionOn && a2On && <FlowDot pathId="p-bus-a2" dur="1.8s" color={PHY.pulse} />}

        {/* AREA 1 */}
        <g>
          <rect x={580} y={310} width={200} height={120} rx={6} fill="#0E1417" stroke={PHY.stroke} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={680} y={328} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            AREA 1
          </text>
          <text x={680} y={342} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Industrial zone
          </text>
          <rect x={585} y={314} width={36} height={14} rx={3} fill={a1On ? PHY.dark : '#5F5E5A'} stroke={PHY.stroke} />
          <text
            x={603}
            y={324}
            textAnchor="middle"
            fill={a1On ? '#C8F5E6' : '#0A0F12'}
            fontSize={8}
            fontFamily="JetBrains Mono, monospace"
            fontWeight={700}
          >
            {meter.area1}
          </text>
          <rect x={620} y={372} width={22} height={28} fill={a1On ? PHY.dark : 'none'} stroke={PHY.stroke} />
          <rect x={642} y={365} width={22} height={35} fill={a1On ? PHY.dark : 'none'} stroke={PHY.stroke} />
          <rect x={664} y={378} width={22} height={22} fill={a1On ? PHY.dark : 'none'} stroke={PHY.stroke} />
          <line x1={628} y1={372} x2={628} y2={355} stroke={PHY.stroke} />
          <line x1={650} y1={365} x2={650} y2={345} stroke={PHY.stroke} />
          <text x={680} y={418} textAnchor="middle" fill={PHY.stroke} fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {fmt(meter.area1Load, 2)} MW
          </text>
        </g>

        {/* AREA 2 */}
        <g>
          <rect x={820} y={310} width={140} height={120} rx={6} fill="#0E1417" stroke={PHY.stroke} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={890} y={328} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            AREA 2
          </text>
          <text x={890} y={342} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Residential zone
          </text>
          <rect x={825} y={314} width={36} height={14} rx={3} fill={a2On ? PHY.dark : '#5F5E5A'} stroke={PHY.stroke} />
          <text
            x={843}
            y={324}
            textAnchor="middle"
            fill={a2On ? '#C8F5E6' : '#0A0F12'}
            fontSize={8}
            fontFamily="JetBrains Mono, monospace"
            fontWeight={700}
          >
            {meter.area2}
          </text>
          <polygon points="870,370 890,355 910,370" fill="none" stroke={PHY.stroke} />
          <rect x={870} y={370} width={40} height={28} fill="none" stroke={PHY.stroke} />
          {[0, 1, 2].flatMap((c) =>
            [0, 1].map((r) => (
              <rect
                key={`${c}-${r}`}
                x={874 + c * 11}
                y={374 + r * 11}
                width={7}
                height={7}
                fill={a2On ? PHY.dark : 'none'}
                stroke={PHY.stroke}
              />
            ))
          )}
          <text x={890} y={418} textAnchor="middle" fill={PHY.stroke} fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {fmt(meter.area2Load, 2)} MW
          </text>
        </g>

        <path
          id="p-tel"
          d="M 690 130 Q 500 250 320 320"
          fill="none"
          stroke={telStroke}
          strokeWidth={1.2}
          strokeDasharray={telDash}
          opacity={0.7}
        />
        <text x={500} y={245} fill={isDoS ? BUS_GRAY : '#5DA0BC'} fontSize={9} fontFamily="JetBrains Mono, monospace">
          telemetry · MQTT
        </text>

        {/* SCADA — frame stays neutral; posture only in text */}
        <g>
          <rect x={30} y={310} width={290} height={130} rx={6} fill="#0E1417" stroke="#1F2A30" strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={175} y={328} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            SCADA CONTROL CENTRE
          </text>
          <rect x={38} y={345} width={130} height={50} rx={3} fill="#06120A" stroke="#1F2A30" />
          <text x={42} y={357} fill="#888780" fontSize={8} fontFamily="JetBrains Mono, monospace">
            V trend
          </text>
          {voltHist.length > 1 &&
            (() => {
              const min = Math.min(...voltHist);
              const max = Math.max(...voltHist) || min + 1;
              const pts = voltHist
                .map((v, i) => {
                  const x = 42 + (i / (voltHist.length - 1)) * 122;
                  const y = 390 - ((v - min) / (max - min || 1)) * 30;
                  return `${x},${y}`;
                })
                .join(' ');
              return <polyline points={pts} fill="none" stroke={PHY.stroke} strokeWidth={1.5} />;
            })()}
          <text x={180} y={357} fill="#888780" fontSize={8} fontFamily="JetBrains Mono, monospace">
            Load MW
          </text>
          {[12, 18, 14, 22, 16, 10].map((h, i) => (
            <rect key={i} x={180 + i * 18} y={395 - h} width={12} height={h} fill={PHY.stroke} opacity={0.55} />
          ))}
          <line x1={38} y1={405} x2={310} y2={405} stroke="#1F2A30" />
          <text x={42} y={420} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            SEC: <tspan fill={pc}>{posture}</tspan>
          </text>
          <text x={130} y={420} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            ATK: {attackScore.toFixed(2)}/20
          </text>
          <text x={42} y={433} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Bill: ${fmt(meter.calculatedBill, 2)}
          </text>
          <text x={150} y={433} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Broker: hivemq.com
          </text>
        </g>

        <rect x={0} y={444} width={980} height={16} fill="#06120A" />
        <text x={10} y={456} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
          {`Load: ${fmt(data?.load_mw, 1)} MW  ·  Gen: ${fmt(data?.gen_mw, 1)} MW  ·  ${fmt(data?.voltage, 1)} V  ·  ${fmt(data?.frequency, 2)} Hz  ·  ${data?.status ?? 'OFFLINE'}`}
        </text>
      </svg>
    </div>
  );
}
