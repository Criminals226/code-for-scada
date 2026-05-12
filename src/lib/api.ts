// API Service Layer for SCADA Backend Communication
const BACKEND_ORIGIN = (import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '');
const API_BASE = `${BACKEND_ORIGIN}/api`;
interface LoginCredentials {
  username: string;
  password: string;
}

interface User {
  username: string;
  role: string;
  full_name: string;
}

interface SystemState {
  gen_mw: number;
  gen_rpm: number;
  status: string;
  load_mw: number;
  voltage: number;
  frequency: number;
  area1: string;
  area2: string;
  calculated_bill: number;
  security_level: string;
  system_locked: boolean;
  mqtt_connected: boolean;
  attack_score: number;
  threat_intel_active: boolean;
  price_rate: number;
  last_update: string;
  data_source?: 'simulation' | 'hardware';
}

/**
 * FIX BUG #1 — Unit Mismatch (MW vs W on chart labels).
 *
 * OLD behaviour:
 *   formatPower(2576)  → { value: 2, unit: 'kW' }   ← lost 576 MW, wrong scale
 *   formatPower(1)     → { value: 1, unit: 'kW' }   ← looked fine on dashboard
 *
 * ROOT CAUSE: The function treated the incoming number as raw *watts*, so
 * 2576 MW was being divided by 1000 and displayed as "2 kW". The SCADA
 * pipeline stores everything in **MW**, so no conversion is needed at all —
 * just display the value with the correct unit label.
 *
 * FIX: Values from the pipeline are always in MW. Return them as-is with
 * "MW" as the unit. The only formatting we do is rounding to 1 decimal.
 * This makes the chart legend read "Generation (MW)" and "Load (MW)" —
 * consistent units on every chart axis.
 *
 * BEFORE (broken):
 *   formatPower(2576) → { value: 2,    unit: 'kW' }   ← wrong
 *   formatPower(1)    → { value: 1,    unit: 'kW' }   ← misleading
 *
 * AFTER (fixed):
 *   formatPower(2576) → { value: 2576, unit: 'MW' }   ← correct
 *   formatPower(1)    → { value: 1,    unit: 'MW' }   ← correct
 */
export function formatPower(mw: number): { value: number; unit: string } {
  if (!Number.isFinite(mw)) return { value: 0, unit: 'MW' };
  return { value: Number(mw.toFixed(1)), unit: 'MW' };
}

interface SecurityStatus {
  security_posture: string;
  attack_score: number;
  stats: {
    total_inspected: number;
    total_blocked: number;
    threat_intel_blocks: number;
  };
  threat_intel: {
    enabled: boolean;
    total_indicators: number;
    last_refresh: string | null;
  };
  timestamp: string;
}

interface ThreatLog {
  id: number;
  timestamp: string;
  decision_id: string;
  action: string;
  layer: string;
  threat_classification: {
    category: string;
    subcategory: string;
    severity: string;
  };
  explanation: string;
  metadata: Record<string, unknown>;
}

interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  username: string;
  details: Record<string, unknown>;
}

interface GridDataPoint {
  id: number;
  timestamp: string;
  gen_mw: number;
  load_mw: number;
  voltage: number;
  frequency: number;
  security_level: string;
  attack_score: number;
}

interface HistoricalDataResponse {
  start: string;
  end: string;
  total_records: number;
  data: GridDataPoint[];
}

interface StatsResponse {
  total_threats: number;
  critical_threats: number;
  threats_by_category: Record<string, number>;
  security_engine_stats: {
    total_inspected: number;
    total_blocked: number;
    threat_intel_blocks: number;
    attack_score: number;
    security_posture: string;
  };
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchWithAuth<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    ...options?.headers,
  };

  if (!(options?.body instanceof FormData) && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 401) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `API Error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: User }> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await fetch(`${BACKEND_ORIGIN}/login`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      redirect: 'manual',
    });

    if (response.status === 404) {
      throw new ApiError(404, 'Backend not reachable (missing /login route)');
    }

    if (response.type === 'opaqueredirect' || response.status === 302 || response.status === 200) {
      return { success: true };
    }

    return { success: false };
  },

  async logout(): Promise<void> {
    await fetch(`${BACKEND_ORIGIN}/logout`, { credentials: 'include' });
  },

  async getState(): Promise<SystemState> {
    return fetchWithAuth<SystemState>('/state');
  },

  async getMe(): Promise<User> {
    return fetchWithAuth<User>('/me');
  },

  async getSecurityStatus(): Promise<SecurityStatus> {
    return fetchWithAuth<SecurityStatus>('/v1/security-status');
  },

  async getHistoricalData(start: Date, end: Date): Promise<HistoricalDataResponse> {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return fetchWithAuth<HistoricalDataResponse>(`/v1/historical-data?${params}`);
  },

  async getThreatLogs(limit = 50): Promise<ThreatLog[]> {
    return fetchWithAuth<ThreatLog[]>(`/get_logs?type=threats&limit=${limit}`);
  },

  async getAuditLogs(limit = 50): Promise<AuditLog[]> {
    return fetchWithAuth<AuditLog[]>(`/get_logs?type=audit&limit=${limit}`);
  },

  async getStats(): Promise<StatsResponse> {
    return fetchWithAuth<StatsResponse>('/get_stats');
  },

  async sendControl(action: string): Promise<{ success: boolean; message?: string }> {
    return fetchWithAuth<{ success: boolean; message?: string }>('/control', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },
};

export type {
  LoginCredentials,
  User,
  SystemState,
  SecurityStatus,
  ThreatLog,
  AuditLog,
  GridDataPoint,
  HistoricalDataResponse,
  StatsResponse,
};

export { ApiError };