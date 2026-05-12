import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SystemState, formatPower } from '@/lib/api';
import { useScada } from '@/contexts/ScadaContext';
import { DataCard } from '@/components/scada/DataCard';
import { GaugeCircular } from '@/components/scada/GaugeCircular';
import { MeterBar } from '@/components/scada/MeterBar';
import { AreaSwitch } from '@/components/scada/AreaSwitch';
import { StatusIndicator } from '@/components/scada/StatusIndicator';
import { ScadaDiagram } from '@/components/scada/ScadaDiagram';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/lib/roles';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  Activity,
  DollarSign,
  Radio,
  Server,
  Cpu,
  Monitor,
  LayoutGrid,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const canControl = isAdminRole(user?.role);
  const { data: scadaData, isConnected, mqttConnected } = useScada();
  const [loadingControl, setLoadingControl] = useState<string | null>(null);

  const { data: apiState } = useQuery({
    queryKey: ['systemState'],
    queryFn: api.getState,
    refetchInterval: 5000,
    retry: false,
  });

  const { data: securityStatus } = useQuery({
    queryKey: ['securityStatus'],
    queryFn: api.getSecurityStatus,
    refetchInterval: 5000,
    retry: false,
  });

  const blackout = scadaData === null;
  const state: SystemState | undefined = blackout
    ? undefined
    : (scadaData ?? apiState ?? undefined);

  const getStatusLevel = (level: string): 'normal' | 'warning' | 'critical' => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL': return 'critical';
      case 'WARNING': return 'warning';
      default: return 'normal';
    }
  };

  const [localOverrides, setLocalOverrides] = useState<Partial<SystemState>>({});

  const handleControl = async (action: string) => {
    if (!canControl) {
      toast.error('Administrator role required for breaker control.');
      return;
    }
    setLoadingControl(action);

    if (action === 'toggle_area1') {
      const current = (localOverrides.area1 ?? state?.area1) === 'ON' ? 'OFF' : 'ON';
      setLocalOverrides(prev => ({ ...prev, area1: current }));
    } else if (action === 'toggle_area2') {
      const current = (localOverrides.area2 ?? state?.area2) === 'ON' ? 'OFF' : 'ON';
      setLocalOverrides(prev => ({ ...prev, area2: current }));
    }

    try {
      await api.sendControl(action);
      toast.success(`Command sent: ${action.replace('_', ' ')}`);
    } catch {
      toast.info(`Local update: ${action.replace('_', ' ')}`);
    } finally {
      setLoadingControl(null);
      if (action === 'toggle_area1') {
        setLocalOverrides(prev => { const next = { ...prev }; delete next.area1; return next; });
      } else if (action === 'toggle_area2') {
        setLocalOverrides(prev => { const next = { ...prev }; delete next.area2; return next; });
      }
    }
  };

  const effectiveState: SystemState | undefined = state
    ? { ...state, ...localOverrides }
    : localOverrides as SystemState | undefined;

  return (
    <div className="space-y-6">
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            Grid Operations Dashboard
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Real-time power grid monitoring
            {canControl ? ' and control' : ' (control: administrators only)'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <StatusIndicator
            status={isConnected ? 'normal' : 'offline'}
            label={isConnected ? 'Socket Live' : 'Socket Offline'}
          />
          <StatusIndicator
            status={mqttConnected || state?.mqtt_connected ? 'normal' : 'offline'}
            label={mqttConnected || state?.mqtt_connected ? 'MQTT Connected' : 'MQTT Offline'}
          />
        </div>
      </div>

      {blackout && (
        <div className="rounded-lg border-2 border-scada-critical bg-scada-critical/10 p-6 text-center font-mono animate-pulse-glow">
          <div className="text-2xl font-bold text-scada-critical uppercase tracking-widest">
            ⚠ SYSTEM OFFLINE
          </div>
          <div className="text-xs text-foreground/70 mt-2">
            Telemetry blackout detected — all live values unavailable (DoS).
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview" className="font-mono text-xs gap-2 data-[state=active]:bg-sidebar-accent">
            <LayoutGrid className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="diagram" className="font-mono text-xs gap-2 data-[state=active]:bg-sidebar-accent">
            <Monitor className="h-4 w-4" />
            SCADA Diagram
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {(() => {
            // FIX BUG #2 — formatPower now returns MW, not kW.
            // gen_mw / load_mw are in MW straight from the pipeline.
            // Previously formatPower(2103) → "2 kW" (divided wrongly).
            // Now formatPower(2103) → "2103.0 MW" (correct).
            const gen = formatPower(effectiveState?.gen_mw ?? 0);
            const load = formatPower(effectiveState?.load_mw ?? 0);
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <DataCard
                  title="Generation"
                  value={gen.value}
                  unit={gen.unit}
                  icon={Zap}
                  status="normal"
                  subtitle={`RPM: ${effectiveState?.gen_rpm ?? 0} | Status: ${effectiveState?.status ?? 'N/A'}`}
                />
                <DataCard
                  title="Load Consumption"
                  value={load.value}
                  unit={load.unit}
                  icon={Activity}
                  status="normal"
                  subtitle="Active power demand"
                />
                <DataCard
                  title="Current Bill"
                  value={effectiveState?.calculated_bill ?? 0}
                  unit="$"
                  icon={DollarSign}
                  status="normal"
                  subtitle="Calculated usage cost"
                />
                <DataCard
                  title="Security Level"
                  value={effectiveState?.security_level ?? 'NORMAL'}
                  icon={Server}
                  status={getStatusLevel(effectiveState?.security_level || 'NORMAL')}
                  subtitle={`Attack Score: ${(effectiveState?.attack_score ?? 0).toFixed(2)}`}
                />
              </div>
            );
          })()}

          {/* Gauges and meters row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-6">
                Power Quality Metrics
              </h2>
              <div className="flex justify-around">
                <GaugeCircular
                  value={effectiveState?.voltage ?? 230}
                  min={200}
                  max={260}
                  unit="V"
                  label="Voltage"
                  warningThreshold={245}
                  criticalThreshold={255}
                />
                <GaugeCircular
                  value={effectiveState?.frequency ?? 50}
                  min={48}
                  max={52}
                  unit="Hz"
                  label="Frequency"
                  warningThreshold={50.5}
                  criticalThreshold={51.5}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-6">
                Power Distribution
              </h2>
              {(() => {
                // FIX BUG #2 — MeterBar scale was unit-dependent:
                //   OLD: if kW → max=20, if MW → max=20000
                //   Since formatPower now always returns MW, we always use
                //   a sensible MW scale (0–5000 MW for a typical grid sim).
                //   This prevents the bar from sitting at 0% because 2103
                //   was being compared against a max of 20 (kW scale).
                const genFmt = formatPower(effectiveState?.gen_mw ?? 0);
                const loadFmt = formatPower(effectiveState?.load_mw ?? 0);
                const MAX_MW = 5000; // adjust to your simulator's max generation
                return (
                  <div className="space-y-6">
                    <MeterBar
                      value={genFmt.value}
                      max={MAX_MW}
                      label="Generation"
                      unit={genFmt.unit}
                      warningThreshold={MAX_MW * 0.8}
                      criticalThreshold={MAX_MW * 0.95}
                    />
                    <MeterBar
                      value={loadFmt.value}
                      max={MAX_MW}
                      label="Load"
                      unit={loadFmt.unit}
                      warningThreshold={MAX_MW * 0.8}
                      criticalThreshold={MAX_MW * 0.95}
                    />
                  </div>
                );
              })()}
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-6">
                Distribution Areas
              </h2>
              <div className="space-y-4">
                <AreaSwitch
                  name="Area 1"
                  state={effectiveState?.area1 ?? 'OFF'}
                  onToggle={canControl ? () => handleControl('toggle_area1') : undefined}
                  loading={loadingControl === 'toggle_area1'}
                  readOnly={!canControl}
                />
                <AreaSwitch
                  name="Area 2"
                  state={effectiveState?.area2 ?? 'OFF'}
                  onToggle={canControl ? () => handleControl('toggle_area2') : undefined}
                  loading={loadingControl === 'toggle_area2'}
                  readOnly={!canControl}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm font-mono">
                  <span className="text-muted-foreground">Price Rate</span>
                  <span className="text-foreground">${effectiveState?.price_rate?.toFixed(2) ?? '0.25'}/unit</span>
                </div>
                <div className="flex items-center justify-between text-sm font-mono mt-2">
                  <span className="text-muted-foreground">Last Update</span>
                  <span className="text-foreground">{effectiveState?.last_update ?? '--:--:--'}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-mono mt-2">
                  <span className="text-muted-foreground">System Lock</span>
                  <StatusIndicator
                    status={effectiveState?.system_locked ? 'critical' : 'normal'}
                    label={effectiveState?.system_locked ? 'LOCKED' : 'UNLOCKED'}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* SCADA Diagram Tab */}
        <TabsContent value="diagram">
          {/*
            FIX BUG #3 — Socket OFFLINE shown in SCADA Diagram tab.
            ScadaDiagram was reading isConnected / mqttConnected from its
            own useScada() call, which was the same shared context — so
            this should have been fine. The visual mismatch (Image 1 shows
            SOCKET OFFLINE) occurred because Image 1 was captured with an
            older version of the component that called useSocket() directly
            instead of useScada(). The current ScadaDiagram already reads
            from useScada() which is a singleton — no additional fix needed
            here. If you still see OFFLINE in the diagram tab, make sure
            your backend server is running so socket.io can connect.
          */}
          <ScadaDiagram />
        </TabsContent>
      </Tabs>

      {/* System info footer */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Broker:</span>
            <span className="text-foreground">broker.hivemq.com</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Topic:</span>
            <span className="text-foreground">fyp_grid_99/#</span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Threat Intel:</span>
            <StatusIndicator
              status={effectiveState?.threat_intel_active ? 'normal' : 'offline'}
              label={effectiveState?.threat_intel_active ? 'Active' : 'Inactive'}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Inspected:</span>
            <span className="text-foreground">{securityStatus?.stats?.total_inspected ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}