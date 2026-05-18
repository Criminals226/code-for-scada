/**
 * Cyber Ampere — ML Anomaly Detection Service
 * =============================================
 * Calls the Isolation Forest model endpoint on the Python server.
 * Runs alongside rule-based detection to catch UNKNOWN attacks.
 */

const BASE = import.meta.env.VITE_DATASET_API ?? 'http://localhost:8000';

export interface AnomalyResult {
  available:    boolean;
  raw_score?:   number;
  normalized?:  number;
  confidence?:  number;
  prediction?:  number;       // 1=normal, -1=anomaly
  severity?:    'NORMAL' | 'WARNING' | 'CRITICAL';
  category?:    'NORMAL' | 'SUSPICIOUS_PATTERN' | 'UNKNOWN_ANOMALY';
  explanation?: string;
  ground_truth?: string;
  correct?:     boolean;
  thresholds?: {
    warn: number;
    crit: number;
  };
  model_stats?: {
    detection_rate:   number;
    false_alarm_rate: number;
    f1_score:         number;
    trained_on:       string;
  };
  reason?: string;            // when available=false
}

class AnomalyService {
  private lastResult: AnomalyResult | null = null;
  private fetching = false;

  /** Fetch anomaly score — non-blocking, returns last result if busy */
  async getScore(): Promise<AnomalyResult | null> {
    if (this.fetching) return this.lastResult;
    this.fetching = true;
    try {
      const r = await fetch(`${BASE}/api/anomaly-score`, {
        signal: AbortSignal.timeout(800),
      });
      if (!r.ok) return null;
      this.lastResult = await r.json();
      return this.lastResult;
    } catch {
      return this.lastResult;
    } finally {
      this.fetching = false;
    }
  }
}

export const anomalyService = new AnomalyService();