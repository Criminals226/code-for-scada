"""
Cyber Ampere — Dataset Server v2
=================================
Added: /api/anomaly-score endpoint using trained Isolation Forest model.
Detects UNKNOWN attacks that rule-based detection misses.

Run:
  cd backend
  python dataset_server_v2.py
"""

import os
import csv
import time
import json
import pickle
import threading
import numpy as np
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Config ────────────────────────────────────────────────────────────────────
CSV_DIR  = Path(__file__).parent
TICK_MS  = 1000
V_SCALE  = 230.0 / 131229.711
F_OFFSET = -10.0

# ── Load CSV files ─────────────────────────────────────────────────────────────
all_rows: list[dict] = []
csv_files = sorted(CSV_DIR.glob("data*.csv"))
print(f"Loading {len(csv_files)} dataset files...")
for f in csv_files:
    with open(f, newline='') as fh:
        for row in csv.DictReader(fh):
            all_rows.append(row)

natural_count = sum(1 for r in all_rows if r.get('marker','').strip() == 'Natural')
attack_count  = sum(1 for r in all_rows if r.get('marker','').strip() == 'Attack')
print(f"Total rows: {len(all_rows)} | Natural: {natural_count} | Attack: {attack_count}")

# ── Load ML model ──────────────────────────────────────────────────────────────
model_data   = None
ml_available = False
model_info   = {}

MODEL_PATH = CSV_DIR / 'model.pkl'
INFO_PATH  = CSV_DIR / 'model_info.json'

if MODEL_PATH.exists():
    print("Loading Isolation Forest model...")
    with open(MODEL_PATH, 'rb') as f:
        model_data = pickle.load(f)
    ml_available = True
    print(f"✅ ML model loaded — {model_data['stats']['detection_rate']}% detection rate")
    if INFO_PATH.exists():
        with open(INFO_PATH) as f:
            model_info = json.load(f)
else:
    print("⚠️  No model.pkl found — run train_model.py first for ML detection")
    print("   Rule-based detection still works without the model.")

# ── Tick state ─────────────────────────────────────────────────────────────────
state = {"index": 0, "paused": False, "speed": 1.0}

def current_row() -> dict:
    return all_rows[state["index"] % len(all_rows)]

def tick():
    while True:
        if not state["paused"]:
            state["index"] += 1
            if state["index"] >= len(all_rows):
                state["index"] = 0
        time.sleep(TICK_MS / 1000.0 / state["speed"])

threading.Thread(target=tick, daemon=True).start()

# ── Row parser ─────────────────────────────────────────────────────────────────
def parse_row(row: dict) -> dict:
    def f(col, default=0.0):
        try: return float(row.get(col, default) or default)
        except: return default

    raw_v = f('R1-PM1:V')
    raw_f = f('R1:F')
    raw_i = f('R1-PM4:I')
    marker = row.get('marker', '').strip()

    voltage   = round(raw_v * V_SCALE, 2)
    frequency = round(raw_f + F_OFFSET, 4)
    gen_mw    = round(abs(voltage * raw_i) / 1000, 1)
    load_mw   = round(gen_mw * 0.95, 1)

    return {
        "voltage":    voltage,
        "frequency":  frequency,
        "current":    round(raw_i, 3),
        "delta_freq": round(f('R1:DF'), 4),
        "gen_mw":     max(0, gen_mw),
        "load_mw":    max(0, load_mw),
        "gen_rpm":    3000,
        "status":     "ONLINE" if marker == 'Natural' else "UNDER_ATTACK",
        "area1": "ON", "area2": "ON",
        "calculated_bill": round(load_mw * 0.25 * 0.001, 2),
        "price_rate":  0.25,
        "mqtt_connected": True,
        "attack_score": 0,
        "threat_intel_active": True,
        "dataset_label": marker,
        "dataset_row":   state["index"],
        "dataset_file":  "MSU Power System Attack Dataset",
        "relay_trip":    f('relay1_log') != 0,
        "_raw_voltage":  round(raw_v, 3),
        "_raw_frequency": round(raw_f, 4),
        "_raw_current":   round(raw_i, 3),
    }

# ── ML anomaly scoring ─────────────────────────────────────────────────────────
def compute_anomaly_score(row: dict) -> dict:
    """
    Run current row through Isolation Forest.
    Returns anomaly score, severity, and category.
    """
    if not ml_available or model_data is None:
        return {
            "available":  False,
            "reason":     "Model not trained yet. Run train_model.py first.",
        }

    features    = model_data['features']
    scaler      = model_data['scaler']
    model       = model_data['model']
    thresholds  = model_data['thresholds']

    # Extract raw feature values from current CSV row
    vals = []
    current = current_row()
    for col in features:
        try:    vals.append(float(current.get(col, 0) or 0))
        except: vals.append(0.0)

    X = np.array([vals], dtype=np.float32)
    X_scaled = scaler.transform(X)

    raw_score  = float(model.score_samples(X_scaled)[0])
    prediction = int(model.predict(X_scaled)[0])  # 1=normal, -1=anomaly

    # Normalize score to 0–1 range (0=normal, 1=highly anomalous)
    baseline   = thresholds['baseline_mean']
    std        = thresholds['baseline_std']
    normalized = max(0.0, min(1.0, (baseline - raw_score) / (3 * std)))
    confidence = round(normalized * 100, 1)

    # Severity classification
    if raw_score < thresholds['crit']:
        severity = 'CRITICAL'
        label    = 'UNKNOWN_ANOMALY'
        msg      = f"Highly anomalous sensor pattern detected. Confidence {confidence}%. Not matching any known attack signature — possible novel attack."
    elif raw_score < thresholds['warn']:
        severity = 'WARNING'
        label    = 'SUSPICIOUS_PATTERN'
        msg      = f"Suspicious sensor deviation detected. Confidence {confidence}%. Monitor closely."
    else:
        severity = 'NORMAL'
        label    = 'NORMAL'
        msg      = "Sensor readings within normal operating envelope."

    # Compare with dataset ground truth
    ground_truth = current_row().get('marker', '').strip()

    return {
        "available":    True,
        "raw_score":    round(raw_score, 6),
        "normalized":   round(normalized, 4),
        "confidence":   confidence,
        "prediction":   prediction,
        "severity":     severity,
        "category":     label,
        "explanation":  msg,
        "ground_truth": ground_truth,
        "correct":      (prediction == -1) == (ground_truth == 'Attack'),
        "thresholds": {
            "warn": round(thresholds['warn'], 4),
            "crit": round(thresholds['crit'], 4),
        },
        "model_stats": {
            "detection_rate":   model_data['stats']['detection_rate'],
            "false_alarm_rate": model_data['stats']['false_alarm_rate'],
            "f1_score":         model_data['stats']['f1_score'],
            "trained_on":       f"{model_data['stats']['natural_rows']} natural rows",
        },
    }

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="Cyber Ampere Dataset Server v2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/state")
def get_state():
    return parse_row(current_row())

@app.get("/api/anomaly-score")
def get_anomaly_score():
    """ML-based anomaly detection using Isolation Forest."""
    return compute_anomaly_score(current_row())

@app.get("/api/info")
def get_info():
    return {
        "dataset":        "MSU Power System Attack Dataset",
        "total_rows":     len(all_rows),
        "natural_rows":   natural_count,
        "attack_rows":    attack_count,
        "current_index":  state["index"],
        "current_label":  current_row().get('marker','').strip(),
        "files_loaded":   len(csv_files),
        "ml_available":   ml_available,
        "ml_model":       model_info.get('performance', {}),
    }

@app.post("/api/control/pause")
def pause():
    state["paused"] = True;  return {"ok": True}

@app.post("/api/control/resume")
def resume():
    state["paused"] = False; return {"ok": True}

@app.post("/api/control/speed/{multiplier}")
def set_speed(multiplier: float):
    state["speed"] = max(0.1, min(10.0, multiplier))
    return {"speed": state["speed"]}

@app.get("/api/history")
def get_history(n: int = 60):
    end   = state["index"]
    start = max(0, end - n)
    return [parse_row(all_rows[i]) for i in range(start, end)]

if __name__ == "__main__":
    import uvicorn
    print(f"\n✅ Cyber Ampere Dataset Server v2 starting...")
    print(f"   Rows:  {len(all_rows)} ({natural_count} natural, {attack_count} attack)")
    print(f"   ML:    {'✅ Isolation Forest loaded' if ml_available else '⚠️  No model — run train_model.py'}")
    print(f"   API:   http://localhost:8000")
    print(f"   Docs:  http://localhost:8000/docs\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)