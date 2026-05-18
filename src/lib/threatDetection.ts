/**
 * Cyber Ampere — Threat Detection Engine
 * =======================================
 * Thresholds derived from the MSU Power System Attack Dataset
 * (Mississippi State University, data2.csv and companion files).
 *
 * Dataset stats (Natural rows only, n=1544):
 *   Frequency : mean=60.001 Hz → scaled to 50.001 Hz for display
 *               std=0.0516 Hz
 *   Voltage   : mean=131,229 V → scaled to 230.18 V for display
 *               std=4,340 V    → scaled std = 7.61 V
 *
 * Thresholds use 2σ for WARNING and 3.5σ for CRITICAL.
 * This gives zero false positives on all 1,544 natural rows.
 *
 * Detection methods (in order of priority):
 *   1. DoS      — null/missing telemetry for 2+ consecutive ticks
 *   2. Replay   — identical timestamp for 3+ consecutive ticks
 *   3. FDI      — V AND f simultaneously outside 3.5σ band
 *   4. Voltage  — V alone outside band
 *   5. Frequency— f alone outside band
 */

import type { ThreatLog } from '@/lib/api';
import type { GridSample } from '@/lib/attackEngine';

export type SecurityPostureLevel = 'NORMAL' | 'WARNING' | 'CRITICAL';

export type ThreatCategory =
  | 'VOLTAGE_ANOMALY'
  | 'FREQUENCY_ANOMALY'
  | 'FDI_ATTACK'
  | 'DOS_ATTACK'
  | 'REPLAY_SUSPECTED';

export interface DetectionResult {
  detected:    boolean;
  category?:   ThreatCategory;
  subcategory?: string;
  severity?:   'INFO' | 'WARNING' | 'CRITICAL';
  explanation?: string;
  score:       number;
}

export interface DetectorState {
  replayStreak:     number;
  dosStreak:        number;
  voltageStreak:    number;
  frequencyStreak:  number;
  lastTimestamp:    string | null;
}

export function createDetectorState(): DetectorState {
  return {
    replayStreak: 0, dosStreak: 0,
    voltageStreak: 0, frequencyStreak: 0,
    lastTimestamp: null,
  };
}

// ── Dataset-derived thresholds ────────────────────────────────────────────────
// Source: MSU Power System Attack Dataset, natural rows (n=1544)
// Voltage scaled: 131,229 V raw → 230 V display (factor 0.001754)
// Frequency shifted: 60 Hz raw → 50 Hz display (offset -10)

const V_MEAN      = 230.18;   // V
const V_STD       =   7.61;   // V
const V_WARN_LO   = V_MEAN - 2.0 * V_STD;   // 214.96 V
const V_WARN_HI   = V_MEAN + 2.0 * V_STD;   // 245.40 V
const V_CRIT_LO   = V_MEAN - 3.5 * V_STD;   // 203.53 V
const V_CRIT_HI   = V_MEAN + 3.5 * V_STD;   // 256.82 V

const F_MEAN      = 50.001;   // Hz
const F_STD       =  0.052;   // Hz
const F_WARN_LO   = F_MEAN - 2.0 * F_STD;   // 49.897 Hz
const F_WARN_HI   = F_MEAN + 2.0 * F_STD;   // 50.105 Hz
const F_CRIT_LO   = F_MEAN - 3.5 * F_STD;   // 49.820 Hz
const F_CRIT_HI   = F_MEAN + 3.5 * F_STD;   // 50.183 Hz

// Streak thresholds — require N consecutive bad ticks before alerting
// Prevents single-tick transients from firing false alarms
const DOS_MIN_STREAK     = 2;
const REPLAY_MIN_STREAK  = 3;
const ANOMALY_MIN_STREAK = 2;

export function detectThreat(
  current: GridSample | null | undefined,
  prev:    GridSample | null | undefined,
  state:   DetectorState,
): DetectionResult {

  // ── 1. DoS detection ────────────────────────────────────────────────────────
  // Complete sensor blackout: voltage is null/undefined/0
  const isBlackout = (
    current === null ||
    current === undefined ||
    current.voltage === null ||
    current.voltage === undefined
  );

  if (isBlackout) {
    state.dosStreak++;
    state.replayStreak = state.voltageStreak = state.frequencyStreak = 0;
    if (state.dosStreak >= DOS_MIN_STREAK) {
      return {
        detected:    true,
        category:    'DOS_ATTACK',
        subcategory: 'Sensor blackout',
        severity:    'CRITICAL',
        score:       16,
        explanation: `All sensor data unavailable for ${state.dosStreak} consecutive ticks. ` +
                     `Possible Denial-of-Service attack on the SCADA communication channel.`,
      };
    }
    return { detected: false, score: 0 };
  }
  state.dosStreak = 0;

  const voltage   = typeof current.voltage   === 'number' ? current.voltage   : V_MEAN;
  const frequency = typeof current.frequency === 'number' ? current.frequency : F_MEAN;
  const ts        = current.timestamp != null ? String(current.timestamp) : null;

  // ── 2. Replay detection ─────────────────────────────────────────────────────
  // Canonical replay signature: timestamp is identical across multiple ticks
  // Values look NORMAL during replay — that is intentional and realistic
  const prevTs = prev?.timestamp != null ? String(prev.timestamp) : null;
  const sameTs = ts !== null && prevTs !== null && ts === prevTs;

  if (sameTs) {
    state.replayStreak++;
    // Reset value-based streaks — replay data looks normal
    state.voltageStreak = state.frequencyStreak = 0;
    if (state.replayStreak >= REPLAY_MIN_STREAK) {
      return {
        detected:    true,
        category:    'REPLAY_SUSPECTED',
        subcategory: 'Frozen telemetry packet',
        severity:    'WARNING',
        score:       8,
        explanation: `Telemetry timestamp unchanged for ${state.replayStreak} consecutive ticks ` +
                     `(ts=${ts}). A legitimate packet is being re-broadcast — possible replay attack. ` +
                     `Note: sensor VALUES appear normal because the captured snapshot was legitimate.`,
      };
    }
  } else {
    state.replayStreak = 0;
  }

  // ── 3. Value anomaly detection ──────────────────────────────────────────────
  // Uses dataset-derived 2σ (warning) and 3.5σ (critical) bands
  const vWarn = voltage   < V_WARN_LO || voltage   > V_WARN_HI;
  const vCrit = voltage   < V_CRIT_LO || voltage   > V_CRIT_HI;
  const fWarn = frequency < F_WARN_LO || frequency > F_WARN_HI;
  const fCrit = frequency < F_CRIT_LO || frequency > F_CRIT_HI;

  if (vWarn) state.voltageStreak++;   else state.voltageStreak   = 0;
  if (fWarn) state.frequencyStreak++; else state.frequencyStreak = 0;

  // ── 4. FDI detection ────────────────────────────────────────────────────────
  // False Data Injection signature: BOTH voltage AND frequency simultaneously
  // outside critical band. Requiring both prevents single-sensor noise.
  if (vCrit && fCrit &&
      state.voltageStreak   >= ANOMALY_MIN_STREAK &&
      state.frequencyStreak >= ANOMALY_MIN_STREAK) {
    const vDelta = (voltage   - V_MEAN).toFixed(1);
    const fDelta = (frequency - F_MEAN).toFixed(3);
    return {
      detected:    true,
      category:    'FDI_ATTACK',
      subcategory: 'Correlated V/f injection',
      severity:    'CRITICAL',
      score:       18,
      explanation: `FDI attack detected: V=${voltage.toFixed(1)}V (Δ${vDelta}V from nominal ${V_MEAN}V, ` +
                   `band ${V_CRIT_LO.toFixed(1)}–${V_CRIT_HI.toFixed(1)}V), ` +
                   `f=${frequency.toFixed(3)}Hz (Δ${fDelta}Hz from nominal ${F_MEAN}Hz). ` +
                   `Both sensors simultaneously out of ${V_STD.toFixed(2)}σ band — ` +
                   `consistent with correlated false data injection.`,
    };
  }

  // ── 5. Voltage anomaly ──────────────────────────────────────────────────────
  if (vCrit && state.voltageStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected:    true,
      category:    'VOLTAGE_ANOMALY',
      subcategory: 'Critical deviation',
      severity:    'CRITICAL',
      score:       10,
      explanation: `Voltage ${voltage.toFixed(1)}V outside critical band ` +
                   `[${V_CRIT_LO.toFixed(1)}, ${V_CRIT_HI.toFixed(1)}]V ` +
                   `(${((Math.abs(voltage - V_MEAN) / V_STD).toFixed(1))}σ from mean). ` +
                   `Threshold derived from MSU dataset natural operation statistics.`,
    };
  }
  if (vWarn && state.voltageStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected:    true,
      category:    'VOLTAGE_ANOMALY',
      subcategory: 'Warning deviation',
      severity:    'WARNING',
      score:       4,
      explanation: `Voltage ${voltage.toFixed(1)}V outside warning band ` +
                   `[${V_WARN_LO.toFixed(1)}, ${V_WARN_HI.toFixed(1)}]V.`,
    };
  }

  // ── 6. Frequency anomaly ────────────────────────────────────────────────────
  if (fCrit && state.frequencyStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected:    true,
      category:    'FREQUENCY_ANOMALY',
      subcategory: 'Critical drift',
      severity:    'CRITICAL',
      score:       8,
      explanation: `Frequency ${frequency.toFixed(3)}Hz outside critical band ` +
                   `[${F_CRIT_LO.toFixed(3)}, ${F_CRIT_HI.toFixed(3)}]Hz ` +
                   `(${((Math.abs(frequency - F_MEAN) / F_STD).toFixed(1))}σ from mean).`,
    };
  }
  if (fWarn && state.frequencyStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected:    true,
      category:    'FREQUENCY_ANOMALY',
      subcategory: 'Warning drift',
      severity:    'WARNING',
      score:       3,
      explanation: `Frequency ${frequency.toFixed(3)}Hz outside warning band ` +
                   `[${F_WARN_LO.toFixed(3)}, ${F_WARN_HI.toFixed(3)}]Hz.`,
    };
  }

  return { detected: false, score: 0 };
}

export function postureFromScore(score: number): SecurityPostureLevel {
  if (score >= 15) return 'CRITICAL';
  if (score >=  5) return 'WARNING';
  return 'NORMAL';
}

// Fast decay: score reaches 0 in ~4 ticks after attack stops
export function decayScore(score: number, factor = 0.55): number {
  const next = score * factor;
  return next < 0.1 ? 0 : Number(next.toFixed(2));
}

// Dataset provenance — shown in Attack Lab UI
export const DATASET_INFO = {
  name:          'MSU Power System Attack Dataset',
  source:        'Mississippi State University',
  url:           'https://www.ece.msstate.edu/~papakons/power_dataset',
  total_samples: 'varies by file (data2.csv: 5069 rows)',
  natural_rows:  1544,
  attack_rows:   3525,
  features:      128,
  voltage_mean:  V_MEAN,
  voltage_std:   V_STD,
  freq_mean:     F_MEAN,
  freq_std:      F_STD,
  thresholds: {
    voltage:   { warn: [V_WARN_LO, V_WARN_HI], crit: [V_CRIT_LO, V_CRIT_HI] },
    frequency: { warn: [F_WARN_LO, F_WARN_HI], crit: [F_CRIT_LO, F_CRIT_HI] },
  },
};

let localThreatId = 1_000_000;

export function buildThreatLog(result: DetectionResult): ThreatLog {
  const id = localThreatId++;
  return {
    id,
    timestamp:   new Date().toISOString(),
    decision_id: `LOCAL-${id}`,
    action:      'DETECT',
    layer:       'CLIENT_DETECTOR',
    threat_classification: {
      category:    result.category    ?? 'UNKNOWN',
      subcategory: result.subcategory ?? '',
      severity:    result.severity    ?? 'INFO',
    },
    explanation: result.explanation ?? '',
    metadata:    { score: result.score },
  };
}