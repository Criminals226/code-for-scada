import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useScada } from '@/contexts/ScadaContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subHours, subDays } from 'date-fns';
import { CalendarIcon, Download, RefreshCw } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

interface LivePoint {
  timestamp: string;
  gen_mw: number;
  load_mw: number;
  voltage: number;
  frequency: number;
  security_level: string;
  attack_score: number;
  time: string;
}

export default function Historical() {
  const [startDate, setStartDate] = useState<Date>(subHours(new Date(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['historicalData', startDate.toISOString(), endDate.toISOString()],
    queryFn: () => api.getHistoricalData(startDate, endDate),
    retry: false,
  });

  const { data: scadaData, attackScore, posture } = useScada();
  const [liveBuffer, setLiveBuffer] = useState<LivePoint[]>([]);
  const lastSampledRef = useRef<number>(0);

  useEffect(() => {
    // FIX BUG #6 — Attack Score Timeline always flat.
    //
    // OLD: The effect ran on every `scadaData` change but the 900ms
    // debounce made it skip most ticks. More critically, `attackScore`
    // was captured from the closure at the time of the first render and
    // never reflected live updates because the dependency array was
    // implicitly stale. This caused the attack_score in every LivePoint
    // to be 0 regardless of actual score.
    //
    // FIX: Use a ref for the debounce timestamp so it never causes a
    // re-render. The effect still depends on [scadaData, attackScore,
    // posture] so it always has the current values.
    const now = Date.now();
    if (now - lastSampledRef.current < 900) return;
    lastSampledRef.current = now;

    const ts = new Date(now).toISOString();
    const point: LivePoint = scadaData
      ? {
          timestamp: ts,
          gen_mw: scadaData.gen_mw ?? 0,
          load_mw: scadaData.load_mw ?? 0,
          voltage: scadaData.voltage ?? 0,
          frequency: scadaData.frequency ?? 0,
          security_level: posture,
          // FIX: attackScore is now correctly captured from the live
          // dependency — previously it was always 0 because the closure
          // was stale. Now every point records the real score at sample time.
          attack_score: attackScore,
          time: format(new Date(now), 'HH:mm:ss'),
        }
      : {
          timestamp: ts,
          gen_mw: 0,
          load_mw: 0,
          voltage: 0,
          frequency: 0,
          security_level: 'CRITICAL',
          attack_score: attackScore,
          time: format(new Date(now), 'HH:mm:ss'),
        };
    setLiveBuffer((prev) => [...prev.slice(-119), point]);
  }, [scadaData, attackScore, posture]);

  const handleQuickRange = (hours: number) => {
    setEndDate(new Date());
    setStartDate(subHours(new Date(), hours));
  };

  const handleQuickRangeDays = (days: number) => {
    setEndDate(new Date());
    setStartDate(subDays(new Date(), days));
  };

  // FIX BUG #5 — Historical chart time-axis compression.
  //
  // OLD: `liveBuffer.length > 0` caused the chart to ALWAYS prefer the
  // live buffer even when the user selected a historical range (1H/6H/7D).
  // The live buffer only holds ~120 points (~2 minutes of data), so
  // selecting "1H" would show 2 minutes instead of 60 minutes.
  //
  // FIX: Only use the live buffer when the selected end date is within
  // the last 5 minutes (i.e. the user is looking at "now"). For any
  // historical window, use the backend data.
  const isLiveView = endDate.getTime() > Date.now() - 5 * 60 * 1000;

  const chartData = isLiveView && liveBuffer.length > 0
    ? liveBuffer
    : (data?.data?.map((point) => ({
        ...point,
        time: format(new Date(point.timestamp), 'HH:mm'),
      })) || []);

  const exportData = () => {
    if (!data?.data) return;

    const csv = [
      ['Timestamp', 'Generation (MW)', 'Load (MW)', 'Voltage (V)', 'Frequency (Hz)', 'Security Level', 'Attack Score'].join(','),
      ...data.data.map((point) =>
        [point.timestamp, point.gen_mw, point.load_mw, point.voltage, point.frequency, point.security_level, point.attack_score].join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scada-data-${format(startDate, 'yyyyMMdd-HHmm')}-${format(endDate, 'yyyyMMdd-HHmm')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            Historical Analytics
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Grid data visualization and trends
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase">Quick:</span>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(1)} className="font-mono text-xs">
            1H
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(6)} className="font-mono text-xs">
            6H
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(24)} className="font-mono text-xs">
            24H
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRangeDays(7)} className="font-mono text-xs">
            7D
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(startDate, 'MMM dd, HH:mm')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">→</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(endDate, 'MMM dd, HH:mm')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => date && setEndDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => refetch()} className="font-mono">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={exportData} disabled={!data?.data?.length} className="font-mono">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Data info */}
      <div className="text-sm font-mono text-muted-foreground">
        {isLoading ? (
          <span>Loading data...</span>
        ) : (
          <span>
            {isLiveView
              ? `Live: ${liveBuffer.length} samples`
              : `Showing ${data?.total_records ?? 0} data points`
            } from {format(startDate, 'PPpp')} to {format(endDate, 'PPpp')}
          </span>
        )}
      </div>

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="space-y-6">
          {/* Power Chart */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Power Generation & Load
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="time"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  fontFamily="JetBrains Mono"
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  fontFamily="JetBrains Mono"
                  // FIX BUG #1 — Label now says MW (matches data unit)
                  label={{ value: 'MW', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="gen_mw"
                  // FIX BUG #1 — Both legends now say MW, no more MW vs W mismatch
                  name="Generation (MW)"
                  stroke="hsl(var(--chart-1))"
                  fillOpacity={1}
                  fill="url(#colorGen)"
                />
                <Area
                  type="monotone"
                  dataKey="load_mw"
                  // FIX BUG #1 — Was "Load (W)" — now correctly "Load (MW)"
                  name="Load (MW)"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={1}
                  fill="url(#colorLoad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Voltage & Frequency Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
                Voltage Trend
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <YAxis
                    domain={['dataMin - 5', 'dataMax + 5']}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      fontFamily: 'JetBrains Mono',
                      fontSize: 12
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="voltage"
                    name="Voltage (V)"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
                Frequency Trend
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <YAxis
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      fontFamily: 'JetBrains Mono',
                      fontSize: 12
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="frequency"
                    name="Frequency (Hz)"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Security / Attack Score Timeline */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Attack Score Timeline
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAttack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="time"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  fontFamily="JetBrains Mono"
                />
                <YAxis
                  domain={[0, 20]}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  fontFamily="JetBrains Mono"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12
                  }}
                />
                {/* FIX BUG #6: attack_score is now recorded correctly in LivePoint */}
                <Area
                  type="monotone"
                  dataKey="attack_score"
                  name="Attack Score"
                  stroke="hsl(var(--chart-5))"
                  fillOpacity={1}
                  fill="url(#colorAttack)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : !isLoading ? (
        <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-card">
          <div className="text-center">
            <p className="text-lg font-mono text-muted-foreground">No data available</p>
            <p className="text-sm font-mono text-muted-foreground/70 mt-2">
              Try selecting a different time range or check if the backend is logging data
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}