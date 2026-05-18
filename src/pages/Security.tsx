import { useEffect, useState } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import { anomalyService, type AnomalyResult } from '@/lib/anomalyService';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, ShieldAlert, ShieldX,
  Brain, Activity, AlertTriangle, CheckCircle2,
  Database, Zap, RefreshCw, WifiOff,
} from 'lucide-react';

function postureColor(p: string) {
  if (p === 'CRITICAL') return 'text-red-400';
  if (p === 'WARNING')  return 'text-yellow-400';
  return 'text-emerald-400';
}

function postureBg(p: string) {
  if (p === 'CRITICAL') return 'border-red-500/40 bg-red-500/5';
  if (p === 'WARNING')  return 'border-yellow-400/40 bg-yellow-400/5';
  return 'border-emerald-500/40 bg-emerald-500/5';
}

function PostureIcon({ p }: { p: string }) {
  if (p === 'CRITICAL') return <ShieldX className="h-8 w-8 text-red-400"/>;
  if (p === 'WARNING')  return <ShieldAlert className="h-8 w-8 text-yellow-400"/>;
  return <ShieldCheck className="h-8 w-8 text-emerald-400"/>;
}

function ScoreBar({ score, max = 20 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= 15 ? 'bg-red-500' : score >= 5 ? 'bg-yellow-400' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-zinc-500">
        <span>0 — NORMAL</span>
        <span>5 — WARNING</span>
        <span>15 — CRITICAL — 20</span>
      </div>
      <div className="h-3 rounded-full bg-zinc-800 overflow-hidden relative">
        <div className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}/>
        {/* threshold markers */}
        <div className="absolute top-0 bottom-0 w-px bg-yellow-400/50"
          style={{ left: '25%' }}/>
        <div className="absolute top-0 bottom-0 w-px bg-red-500/50"
          style={{ left: '75%' }}/>
      </div>
      <div className="text-right text-xs font-mono font-bold text-zinc-300">
        {score.toFixed(2)} / 20
      </div>
    </div>
  );
}

function AnomalyMeter({ score }: { score: number }) {
  const pct = Math.min(score * 100, 100);
  const color = score > 0.6 ? 'bg-red-500' : score > 0.3 ? 'bg-yellow-400' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-zinc-500">
        <span>0% — normal</span>
        <span>100% — highly anomalous</span>
      </div>
      <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}/>
      </div>
      <div className="text-right text-xs font-mono font-bold text-zinc-300">
        {pct.toFixed(1)}% anomaly confidence
      </div>
    </div>
  );
}

export default function Security() {
  const { posture, attackScore, logs, threat, datasetLabel, datasetRow, datasetAvailable } = useScada();
  const [anomaly, setAnomaly] = useState<AnomalyResult | null>(null);

  // Poll ML anomaly score every second
  useEffect(() => {
    const poll = async () => {
      const result = await anomalyService.getScore();
      if (result) setAnomaly(result);
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  const mlSeverity  = anomaly?.severity  ?? 'NORMAL';
  const mlCategory  = anomaly?.category  ?? 'NORMAL';
  const mlAvailable = anomaly?.available ?? false;

  // Combined posture — worst of rule-based and ML
  const combinedPosture =
    posture === 'CRITICAL' || mlSeverity === 'CRITICAL' ? 'CRITICAL' :
    posture === 'WARNING'  || mlSeverity === 'WARNING'  ? 'WARNING'  : 'NORMAL';

  return (
    <div className="space-y-5 font-mono">

      {/* Header */}
      <div className="flex items-center gap-3">
        <PostureIcon p={combinedPosture}/>
        <div>
          <h1 className="text-xl font-bold text-white uppercase tracking-wider">
            Security Posture
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest">
            Live threat detection — dual-layer detection engine
          </p>
        </div>
        <div className={cn('ml-auto flex items-center gap-2 px-4 py-2 rounded-lg border', postureBg(combinedPosture))}>
          <span className={cn('text-lg font-bold uppercase tracking-widest', postureColor(combinedPosture))}>
            {combinedPosture}
          </span>
        </div>
      </div>

      {/* Dataset source badge */}
      {datasetAvailable && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900/50 text-xs text-zinc-400">
          <Database className="h-3.5 w-3.5 text-blue-400"/>
          <span>Source: MSU Power System Attack Dataset</span>
          <span className="text-zinc-600">·</span>
          <span>Row {datasetRow}</span>
          <span className="text-zinc-600">·</span>
          <span className={datasetLabel === 'Attack' ? 'text-red-400 font-bold' : 'text-emerald-400'}>
            Ground truth: {datasetLabel ?? '—'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── LAYER 1: Rule-based Detection ── */}
        <div className={cn('rounded-lg border p-5 space-y-4', postureBg(posture))}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-zinc-400"/>
              <span className="font-bold text-sm text-white uppercase tracking-wide">
                Layer 1 — Rule-based Detection
              </span>
            </div>
            <span className={cn('text-xs px-2 py-0.5 rounded border font-bold uppercase',
              posture === 'CRITICAL' ? 'border-red-500/40 text-red-400 bg-red-500/10' :
              posture === 'WARNING'  ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/10' :
              'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
            )}>
              {posture}
            </span>
          </div>

          <div className="text-xs text-zinc-500 space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-red-400"/> FDI detection (V+f correlated injection)
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3 w-3 text-yellow-400"/> Replay detection (timestamp freeze)
            </div>
            <div className="flex items-center gap-2">
              <WifiOff className="h-3 w-3 text-zinc-500"/> DoS detection (telemetry blackout)
            </div>
          </div>

          <ScoreBar score={attackScore}/>

          {/* Active threat */}
          {threat ? (
            <div className={cn('rounded-lg border px-3 py-2',
              threat.level === 'CRITICAL' ? 'border-red-500/40 bg-red-500/10' :
              'border-yellow-400/40 bg-yellow-400/10'
            )}>
              <div className={cn('text-xs font-bold uppercase',
                threat.level === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'
              )}>
                {threat.type}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                {threat.raw.explanation}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5"/>
              No active threats — system nominal
            </div>
          )}

          {/* Thresholds from dataset */}
          <div className="rounded bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-1">
            <div className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
              Dataset-derived thresholds
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-zinc-500">V warning band</div>
              <div className="text-zinc-300">214.96 – 245.40 V</div>
              <div className="text-zinc-500">V critical band</div>
              <div className="text-zinc-300">203.53 – 256.82 V</div>
              <div className="text-zinc-500">f warning band</div>
              <div className="text-zinc-300">49.897 – 50.105 Hz</div>
              <div className="text-zinc-500">f critical band</div>
              <div className="text-zinc-300">49.820 – 50.183 Hz</div>
              <div className="text-zinc-500">Source</div>
              <div className="text-zinc-300">MSU dataset, n=1,544</div>
            </div>
          </div>
        </div>

        {/* ── LAYER 2: ML Anomaly Detection ── */}
        <div className={cn('rounded-lg border p-5 space-y-4',
          !mlAvailable ? 'border-zinc-700 bg-zinc-900/30' :
          mlSeverity === 'CRITICAL' ? 'border-red-500/40 bg-red-500/5' :
          mlSeverity === 'WARNING'  ? 'border-yellow-400/40 bg-yellow-400/5' :
          'border-emerald-500/40 bg-emerald-500/5'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-400"/>
              <span className="font-bold text-sm text-white uppercase tracking-wide">
                Layer 2 — ML Anomaly Detection
              </span>
            </div>
            <span className={cn('text-xs px-2 py-0.5 rounded border font-bold uppercase',
              !mlAvailable ? 'border-zinc-600 text-zinc-500 bg-zinc-800/50' :
              mlSeverity === 'CRITICAL' ? 'border-red-500/40 text-red-400 bg-red-500/10' :
              mlSeverity === 'WARNING'  ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/10' :
              'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
            )}>
              {mlAvailable ? mlSeverity : 'NOT READY'}
            </span>
          </div>

          {!mlAvailable ? (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500">
                Isolation Forest model not loaded yet.
              </div>
              <div className="rounded bg-zinc-800/60 border border-zinc-700 p-3 text-xs text-zinc-400 space-y-1">
                <div className="text-zinc-300 font-bold mb-2">To enable ML detection:</div>
                <div>1. Open terminal in backend folder</div>
                <div>2. Run: <span className="text-blue-400">pip install scikit-learn numpy</span></div>
                <div>3. Run: <span className="text-blue-400">python train_model.py</span></div>
                <div>4. Restart: <span className="text-blue-400">python dataset_server_v2.py</span></div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 space-y-1">
                <div className="flex items-center gap-2">
                  <Brain className="h-3 w-3 text-blue-400"/>
                  Isolation Forest — detects UNKNOWN attack patterns
                </div>
                <div className="flex items-center gap-2">
                  <Database className="h-3 w-3 text-blue-400"/>
                  Trained on {anomaly?.model_stats?.trained_on ?? '—'} from MSU dataset
                </div>
              </div>

              <AnomalyMeter score={anomaly?.normalized ?? 0}/>

              {/* Detection result */}
              {mlCategory !== 'NORMAL' ? (
                <div className={cn('rounded-lg border px-3 py-2',
                  mlSeverity === 'CRITICAL' ? 'border-red-500/40 bg-red-500/10' :
                  'border-yellow-400/40 bg-yellow-400/10'
                )}>
                  <div className={cn('text-xs font-bold uppercase flex items-center gap-2',
                    mlSeverity === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'
                  )}>
                    <AlertTriangle className="h-3.5 w-3.5"/>
                    {mlCategory.replace(/_/g,' ')}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    {anomaly?.explanation}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5"/>
                  Sensor pattern within normal operating envelope
                </div>
              )}

              {/* Model performance */}
              <div className="rounded bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-1">
                <div className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
                  Model performance (on MSU dataset)
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-zinc-500">Algorithm</div>
                  <div className="text-zinc-300">Isolation Forest</div>
                  <div className="text-zinc-500">Detection rate</div>
                  <div className="text-emerald-400 font-bold">
                    {anomaly?.model_stats?.detection_rate ?? '—'}%
                  </div>
                  <div className="text-zinc-500">False alarm rate</div>
                  <div className="text-zinc-300">
                    {anomaly?.model_stats?.false_alarm_rate ?? '—'}%
                  </div>
                  <div className="text-zinc-500">F1 score</div>
                  <div className="text-zinc-300">
                    {anomaly?.model_stats?.f1_score ?? '—'}%
                  </div>
                  <div className="text-zinc-500">Anomaly score</div>
                  <div className="text-zinc-300">
                    {anomaly?.raw_score?.toFixed(4) ?? '—'}
                  </div>
                </div>
              </div>

              {/* Ground truth comparison */}
              {anomaly?.ground_truth && (
                <div className="flex items-center justify-between text-xs rounded bg-zinc-800/30 px-3 py-2">
                  <span className="text-zinc-500">Dataset ground truth</span>
                  <div className="flex items-center gap-2">
                    <span className={anomaly.ground_truth === 'Attack'
                      ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                      {anomaly.ground_truth}
                    </span>
                    {anomaly.correct !== undefined && (
                      <span className={anomaly.correct ? 'text-emerald-400' : 'text-red-400'}>
                        {anomaly.correct ? '✓ correct' : '✗ missed'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detection log */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
            Detection log
          </span>
          <span className="text-xs text-zinc-600">{logs.length} events</span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800">
          {logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-600 text-xs">
              No threats detected — system nominal
            </div>
          ) : (
            logs.slice(0, 30).map(log => {
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
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-300">
                      {log.threat_classification?.category?.replace(/_/g,' ')}
                      {log.threat_classification?.subcategory &&
                        <span className="text-zinc-600 ml-2">
                          — {log.threat_classification.subcategory}
                        </span>
                      }
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
                      {log.explanation}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-700 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}