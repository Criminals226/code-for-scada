import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSocketContext } from '@/contexts/SocketContext';
import { useAttack } from '@/contexts/AttackContext';
import type { SystemState, ThreatLog } from '@/lib/api';
import {
  applyAttack,
  resetAttackEngine,
  type GridSample,
} from '@/lib/attackEngine';
import {
  detectThreat,
  postureFromScore,
  decayScore,
  buildThreatLog,
  createDetectorState,
  type SecurityPostureLevel,
} from '@/lib/threatDetection';
import {
  modelSystem,
  offlineSystem,
  type ModeledSystem,
  type PowerPlantState,
  type SmartFeederState,
  type SmartMeterState,
} from '@/lib/systemModel';
import { generateSCADAData } from '@/lib/scadaSimulator';
import { datasetService } from '@/lib/datasetService';

export interface ScadaThreatSummary {
  type: string;
  level: SecurityPostureLevel;
  raw: ThreatLog;
}

export interface ScadaComponents {
  plant: PowerPlantState;
  feeder: SmartFeederState;
  meter: SmartMeterState;
}

export interface ScadaContextValue {
  data: SystemState | null;
  prevData: SystemState | null;
  components: ScadaComponents;
  source: 'mqtt' | 'simulation' | 'offline' | 'dataset';
  logs: ThreatLog[];
  threat: ScadaThreatSummary | null;
  posture: SecurityPostureLevel;
  attackScore: number;
  isConnected: boolean;
  mqttConnected: boolean;
  // Dataset info — shown in AttackLab and Security pages
  datasetLabel: 'Natural' | 'Attack' | null;
  datasetRow: number;
  datasetAvailable: boolean;
  clearLogs: () => void;
}

const ScadaContext = createContext<ScadaContextValue | null>(null);

const TICK_MS = 1000;

function prettifyCategory(cat: string): string {
  return cat
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function asGridSample(s: SystemState | null): GridSample | null {
  if (!s) return null;
  return { ...s, timestamp: s.last_update ?? Date.now() };
}

function toSystemState(
  base: SystemState | null,
  modeled: ModeledSystem,
  attackScore: number,
  posture: SecurityPostureLevel,
  mqttConnected: boolean,
): SystemState {
  return {
    gen_mw:             modeled.plant.generation ?? 0,
    gen_rpm:            modeled.plant.rpm ?? 0,
    status:             modeled.plant.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
    load_mw:            modeled.meter.load ?? 0,
    voltage:            modeled.plant.voltage ?? 0,
    frequency:          modeled.plant.frequency ?? 0,
    area1:              base?.area1 ?? 'ON',
    area2:              base?.area2 ?? 'ON',
    calculated_bill:    base?.calculated_bill ?? 0,
    security_level:     posture,
    system_locked:      base?.system_locked ?? false,
    mqtt_connected:     mqttConnected,
    attack_score:       Number(attackScore.toFixed(2)),
    threat_intel_active: base?.threat_intel_active ?? false,
    price_rate:         base?.price_rate ?? 0.25,
    last_update:
      typeof modeled.sample.timestamp === 'string'
        ? modeled.sample.timestamp
        : new Date(modeled.sample.timestamp ?? Date.now()).toISOString(),
    data_source: base?.data_source,
  };
}

export function ScadaProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, mqttConnected, rawState } = useSocketContext();
  const { type: attackType, active: attackActive } = useAttack();

  const attackRef = useRef({ type: attackType, active: attackActive });
  useEffect(() => {
    attackRef.current = { type: attackType, active: attackActive };
    if (!attackActive) resetAttackEngine();
  }, [attackType, attackActive]);

  const rawStateRef = useRef<SystemState | null>(rawState);
  useEffect(() => { rawStateRef.current = rawState; }, [rawState]);

  const mqttConnectedRef = useRef(mqttConnected);
  useEffect(() => { mqttConnectedRef.current = mqttConnected; }, [mqttConnected]);

  // Dataset state
  const [datasetAvailable, setDatasetAvailable] = useState(false);
  const [datasetLabel, setDatasetLabel]         = useState<'Natural' | 'Attack' | null>(null);
  const [datasetRow, setDatasetRow]             = useState(0);
  const datasetAvailableRef                     = useRef(false);

  // Check if dataset server is reachable on mount
  useEffect(() => {
    datasetService.isAvailable().then((ok) => {
      setDatasetAvailable(ok);
      datasetAvailableRef.current = ok;
      if (ok) {
        console.log('✅ Cyber Ampere: MSU Power Dataset server connected at localhost:8000');
      } else {
        console.log('ℹ️  Cyber Ampere: Dataset server not found — using simulator fallback');
      }
    });
  }, []);

  // Detection state
  const scoreRef               = useRef(0);
  const postureRef             = useRef<SecurityPostureLevel>('NORMAL');
  const lastLoggedCategoryRef  = useRef<string | null>(null);
  const detectorStateRef       = useRef(createDetectorState());
  useEffect(() => {
    lastLoggedCategoryRef.current = null;
  }, [attackType, attackActive]);

  const prevSampleRef = useRef<GridSample | null>(null);
  const [data, setData]             = useState<SystemState | null>(null);
  const [prevData, setPrevData]     = useState<SystemState | null>(null);
  const [components, setComponents] = useState<ScadaComponents>(() => {
    const off = offlineSystem();
    return { plant: off.plant, feeder: off.feeder, meter: off.meter };
  });
  const [source, setSource]         = useState<'mqtt' | 'simulation' | 'offline' | 'dataset'>('simulation');
  const [logs, setLogs]             = useState<ThreatLog[]>([]);
  const [posture, setPosture]       = useState<SecurityPostureLevel>('NORMAL');
  const [attackScore, setAttackScore] = useState(0);

  // Main pipeline tick
  useEffect(() => {
    const tick = async () => {
      // ── 1. Get base data ─────────────────────────────────────────────────────
      // Priority: MQTT → Real Dataset API → Simulator
      let baseSample: GridSample;
      let currentSource: 'mqtt' | 'simulation' | 'dataset' = 'simulation';

      const mqttSample = mqttConnectedRef.current
        ? asGridSample(rawStateRef.current)
        : null;

      if (mqttSample) {
        // MQTT is connected — use live hardware data
        baseSample    = mqttSample;
        currentSource = 'mqtt';

      } else if (datasetAvailableRef.current) {
        // Dataset server is running — stream real MSU attack data
        const dsState = await datasetService.getState();
        if (dsState) {
          // Convert dataset state to GridSample
          baseSample = {
            voltage:         dsState.voltage,
            frequency:       dsState.frequency,
            gen_mw:          dsState.gen_mw,
            load_mw:         dsState.load_mw,
            gen_rpm:         dsState.gen_rpm,
            status:          dsState.status,
            area1:           dsState.area1,
            area2:           dsState.area2,
            calculated_bill: dsState.calculated_bill,
            price_rate:      dsState.price_rate,
            mqtt_connected:  false,
            attack_score:    0,
            threat_intel_active: true,
            system_locked:   false,
            security_level:  'NORMAL',
            last_update:     new Date().toISOString(),
            // Use dataset row index as timestamp so Replay detector
            // can compare it across ticks
            timestamp:       String(dsState.dataset_row),
            data_source:     'simulation',
          } as GridSample;
          currentSource = 'dataset';
          // Track ground truth label for UI display
          setDatasetLabel(dsState.dataset_label as 'Natural' | 'Attack');
          setDatasetRow(dsState.dataset_row);
        } else {
          // Dataset fetch failed — fall back to simulator
          baseSample    = generateSCADAData();
          currentSource = 'simulation';
        }

      } else {
        // No MQTT, no dataset — use built-in simulator
        baseSample    = generateSCADAData();
        currentSource = 'simulation';
      }

      // ── 2. System modelling (Plant → Feeder → Meter) ─────────────────────────
      const modeled = modelSystem(baseSample);

      // ── 3. Attack transformation ──────────────────────────────────────────────
      const tampered = applyAttack(modeled.sample, attackRef.current);

      // ── 3a. DoS blackout ──────────────────────────────────────────────────────
      if (tampered === null) {
        const off    = offlineSystem();
        const result = detectThreat(null, prevSampleRef.current, detectorStateRef.current);
        if (result.detected) {
          const next = Math.min(20, result.score);
          scoreRef.current    = next;
          postureRef.current  = postureFromScore(next);
          setAttackScore(Number(next.toFixed(2)));
          setPosture(postureRef.current);
          const cat = result.category ?? 'UNKNOWN';
          if (lastLoggedCategoryRef.current !== cat) {
            lastLoggedCategoryRef.current = cat;
            setLogs((prev) => [buildThreatLog(result), ...prev].slice(0, 100));
          }
        }
        prevSampleRef.current = null;
        setComponents({ plant: off.plant, feeder: off.feeder, meter: off.meter });
        setSource('offline');
        setPrevData((prev) => prev);
        setData(null);
        return;
      }

      const finalModeled = modelSystem(tampered);

      // ── 4. Threat detection ───────────────────────────────────────────────────
      const result = detectThreat(
        finalModeled.sample,
        prevSampleRef.current,
        detectorStateRef.current,
      );

      if (result.detected) {
        const next = Math.min(20, result.score);
        scoreRef.current   = next;
        postureRef.current = postureFromScore(next);
        setAttackScore(Number(next.toFixed(2)));
        setPosture(postureRef.current);
        const cat = result.category ?? 'UNKNOWN';
        if (lastLoggedCategoryRef.current !== cat) {
          lastLoggedCategoryRef.current = cat;
          setLogs((prev) => [buildThreatLog(result), ...prev].slice(0, 100));
        }
      } else {
        lastLoggedCategoryRef.current = null;
        const next = decayScore(scoreRef.current);
        if (next !== scoreRef.current) {
          scoreRef.current   = next;
          postureRef.current = postureFromScore(next);
          setAttackScore(next);
          setPosture(postureRef.current);
        }
      }

      prevSampleRef.current = finalModeled.sample;

      // ── 5. Commit to UI ───────────────────────────────────────────────────────
      const finalState = toSystemState(
        rawStateRef.current,
        finalModeled,
        scoreRef.current,
        postureRef.current,
        mqttConnectedRef.current,
      );

      setData((prev) => { setPrevData(prev); return finalState; });
      setComponents({
        plant:  finalModeled.plant,
        feeder: finalModeled.feeder,
        meter:  finalModeled.meter,
      });
      setSource(currentSource);
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const threat = useMemo<ScadaThreatSummary | null>(() => {
    if (!logs.length || posture === 'NORMAL') return null;
    const top = logs[0];
    const sev = (top.threat_classification?.severity ?? 'INFO').toUpperCase();
    const level: SecurityPostureLevel =
      sev === 'CRITICAL' ? 'CRITICAL' : sev === 'WARNING' ? 'WARNING' : 'NORMAL';
    return {
      type:  prettifyCategory(top.threat_classification?.category ?? 'UNKNOWN'),
      level,
      raw:   top,
    };
  }, [logs, posture]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    scoreRef.current   = 0;
    postureRef.current = 'NORMAL';
    setAttackScore(0);
    setPosture('NORMAL');
  }, []);

  const value = useMemo<ScadaContextValue>(
    () => ({
      data,
      prevData,
      components,
      source,
      logs,
      threat,
      posture,
      attackScore,
      isConnected,
      mqttConnected,
      datasetLabel,
      datasetRow,
      datasetAvailable,
      clearLogs,
    }),
    [
      data, prevData, components, source, logs, threat,
      posture, attackScore, isConnected, mqttConnected,
      datasetLabel, datasetRow, datasetAvailable, clearLogs,
    ],
  );

  return <ScadaContext.Provider value={value}>{children}</ScadaContext.Provider>;
}

export function useScada(): ScadaContextValue {
  const ctx = useContext(ScadaContext);
  if (!ctx) throw new Error('useScada must be used within a ScadaProvider');
  return ctx;
}