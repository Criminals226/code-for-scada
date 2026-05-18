"""
Cyber Ampere — Real Dataset Streaming Server
=============================================
Streams rows from the MSU Power System Attack Dataset via FastAPI.
Each tick (1 second) sends one row of real sensor data to the frontend.

Dataset: Mississippi State University Power System Attack Dataset
File:    data2.csv (and any other CSV in the same folder)
Columns used:
  R1:F       → frequency (60Hz system, scaled to 50Hz for display)
  R1-PM1:V   → voltage magnitude (130kV, scaled to 230V for display)
  R1-PM4:I   → current (amps)
  R1:DF      → delta frequency
  marker     → Natural | Attack (ground truth label)

Install dependencies:
  pip install fastapi uvicorn pandas

Run:
  python dataset_server.py

Then in your .env:
  VITE_DATASET_API=http://localhost:8000
"""

import os
import csv
import time
import threading
from pathlib import Path
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────
CSV_DIR   = Path(__file__).parent          # folder containing your CSV files
TICK_MS   = 1000                           # 1 second per row
V_SCALE   = 230.0 / 131229.711            # scale 130kV → 230V display
F_OFFSET  = -10.0                          # shift 60Hz → 50Hz display

# ── Load all CSV files ────────────────────────────────────────────────────────
all_rows: list[dict] = []

csv_files = sorted(CSV_DIR.glob("data*.csv"))
print(f"Loading {len(csv_files)} dataset files...")

for f in csv_files:
    with open(f, newline='') as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            all_rows.append(row)

print(f"Total rows loaded: {len(all_rows)}")
natural_count = sum(1 for r in all_rows if r.get('marker','').strip() == 'Natural')
attack_count  = sum(1 for r in all_rows if r.get('marker','').strip() == 'Attack')
print(f"Natural: {natural_count}  |  Attack: {attack_count}")

# ── State ─────────────────────────────────────────────────────────────────────
state = {
    "index":      0,
    "paused":     False,
    "loop":       True,
    "speed":      1.0,     # multiplier: 2.0 = 2× speed
}

def current_row() -> dict:
    return all_rows[state["index"] % len(all_rows)]

def parse_row(row: dict) -> dict:
    """Convert raw dataset row to frontend-compatible format."""
    def f(col: str, default=0.0) -> float:
        try:    return float(row.get(col, default))
        except: return default

    raw_v = f('R1-PM1:V')
    raw_f = f('R1:F')
    raw_i = f('R1-PM4:I')
    raw_df= f('R1:DF')
    marker= row.get('marker', '').strip()

    # Scale to frontend display units
    voltage   = raw_v * V_SCALE
    frequency = raw_f + F_OFFSET
    current   = raw_i

    # Derive generation and load from current × voltage (apparent power proxy)
    # Frontend expects MW. Use scaled values.
    gen_mw  = round(abs(voltage * current) / 1000, 1)   # kVA → MW approx
    load_mw = round(gen_mw * 0.95, 1)                    # ~5% transmission loss

    # Relay trip indicator
    relay_trip = f('relay1_log') != 0 or f('relay2_log') != 0

    return {
        "voltage":     round(voltage, 2),
        "frequency":   round(frequency, 4),
        "current":     round(current, 3),
        "delta_freq":  round(raw_df, 4),
        "gen_mw":      max(0, gen_mw),
        "load_mw":     max(0, load_mw),
        "gen_rpm":     3000,
        "status":      "ONLINE" if marker == 'Natural' else "UNDER_ATTACK",
        "area1":       "ON",
        "area2":       "ON",
        "calculated_bill": round(load_mw * 0.25 * 0.001, 2),
        "price_rate":  0.25,
        "mqtt_connected": True,
        "attack_score":   0,
        "threat_intel_active": True,
        # Ground truth from dataset
        "dataset_label":  marker,           # "Natural" or "Attack"
        "dataset_row":    state["index"],
        "dataset_file":   "MSU Power System Attack Dataset",
        "relay_trip":     relay_trip,
        # Raw values for detection engine
        "_raw_voltage":   round(raw_v, 3),
        "_raw_frequency": round(raw_f, 4),
        "_raw_current":   round(raw_i, 3),
    }

# ── Tick thread ───────────────────────────────────────────────────────────────
def tick():
    while True:
        if not state["paused"]:
            state["index"] += 1
            if state["loop"] and state["index"] >= len(all_rows):
                state["index"] = 0
        time.sleep(TICK_MS / 1000.0 / state["speed"])

tick_thread = threading.Thread(target=tick, daemon=True)
tick_thread.start()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Cyber Ampere Dataset Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/state")
def get_state():
    """Current sensor reading from dataset."""
    return parse_row(current_row())

@app.get("/api/info")
def get_info():
    """Dataset metadata."""
    return {
        "dataset":       "MSU Power System Attack Dataset",
        "total_rows":    len(all_rows),
        "natural_rows":  natural_count,
        "attack_rows":   attack_count,
        "current_index": state["index"],
        "current_label": current_row().get('marker','').strip(),
        "files_loaded":  len(csv_files),
        "speed":         state["speed"],
        "paused":        state["paused"],
    }

@app.post("/api/control/pause")
def pause():
    state["paused"] = True
    return {"ok": True}

@app.post("/api/control/resume")
def resume():
    state["paused"] = False
    return {"ok": True}

@app.post("/api/control/speed/{multiplier}")
def set_speed(multiplier: float):
    state["speed"] = max(0.1, min(10.0, multiplier))
    return {"speed": state["speed"]}

@app.post("/api/control/seek/{index}")
def seek(index: int):
    state["index"] = max(0, min(index, len(all_rows) - 1))
    return {"index": state["index"]}

@app.get("/api/history")
def get_history(n: int = 60):
    """Last n rows as history array."""
    end   = state["index"]
    start = max(0, end - n)
    return [parse_row(all_rows[i]) for i in range(start, end)]

if __name__ == "__main__":
    import uvicorn
    print("\n✅ Cyber Ampere Dataset Server starting...")
    print(f"   Dataset: {len(all_rows)} rows ({natural_count} natural, {attack_count} attack)")
    print(f"   API:     http://localhost:8000")
    print(f"   Docs:    http://localhost:8000/docs\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)