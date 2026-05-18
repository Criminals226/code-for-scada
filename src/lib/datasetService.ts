/**
 * Cyber Ampere — Dataset API Service
 * ====================================
 * Connects your frontend to the Python dataset streaming server.
 * When the server is running, this replaces scadaSimulator.ts as
 * the data source — real MSU Power System Attack Dataset rows
 * stream at 1 tick per second.
 *
 * Usage in ScadaContext.tsx:
 *   import { DatasetService } from '@/lib/datasetService';
 *   const service = new DatasetService();
 *   const data = await service.getState();
 */

const BASE = import.meta.env.VITE_DATASET_API ?? 'http://localhost:8000';

export interface DatasetState {
  voltage:          number;
  frequency:        number;
  current:          number;
  delta_freq:       number;
  gen_mw:           number;
  load_mw:          number;
  gen_rpm:          number;
  status:           string;
  area1:            string;
  area2:            string;
  calculated_bill:  number;
  price_rate:       number;
  mqtt_connected:   boolean;
  attack_score:     number;
  threat_intel_active: boolean;
  // Ground truth from dataset
  dataset_label:    'Natural' | 'Attack';
  dataset_row:      number;
  dataset_file:     string;
  relay_trip:       boolean;
}

export interface DatasetInfo {
  dataset:       string;
  total_rows:    number;
  natural_rows:  number;
  attack_rows:   number;
  current_index: number;
  current_label: string;
  files_loaded:  number;
  speed:         number;
  paused:        boolean;
}

export class DatasetService {
  private available: boolean | null = null;

  /** Check if the Python server is reachable */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const r = await fetch(`${BASE}/api/info`, { signal: AbortSignal.timeout(2000) });
      this.available = r.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  /** Get current sensor reading */
  async getState(): Promise<DatasetState | null> {
    try {
      const r = await fetch(`${BASE}/api/state`);
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  }

  /** Get dataset metadata */
  async getInfo(): Promise<DatasetInfo | null> {
    try {
      const r = await fetch(`${BASE}/api/info`);
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  }

  /** Get last N rows as history */
  async getHistory(n = 60): Promise<DatasetState[]> {
    try {
      const r = await fetch(`${BASE}/api/history?n=${n}`);
      if (!r.ok) return [];
      return r.json();
    } catch {
      return [];
    }
  }

  async pause()  { await fetch(`${BASE}/api/control/pause`,  { method: 'POST' }); }
  async resume() { await fetch(`${BASE}/api/control/resume`, { method: 'POST' }); }

  async setSpeed(x: number) {
    await fetch(`${BASE}/api/control/speed/${x}`, { method: 'POST' });
  }
}

export const datasetService = new DatasetService();