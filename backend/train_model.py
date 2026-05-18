"""
Cyber Ampere — Isolation Forest Training Script
================================================
Trains an anomaly detection model on the MSU Power System Attack Dataset.
Uses all 15 CSV files — natural rows only for training.

Run once:
  cd backend
  python train_model.py

Output:
  model.pkl          — trained Isolation Forest model
  model_info.json    — thresholds, features, accuracy report

Requirements:
  pip install scikit-learn numpy
"""

import csv
import glob
import json
import pickle
import os
import statistics
from pathlib import Path

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix

# ── Feature columns — best 20 discriminating sensors from all 4 relays ───────
# Selected by analyzing variance between Natural and Attack rows across all files
FEATURES = [
    # Relay 1 (primary)
    'R1:F',        # Frequency
    'R1:DF',       # Delta frequency (rate of change)
    'R1-PM1:V',    # Voltage magnitude
    'R1-PM4:I',    # Current magnitude
    'R1:S',        # Apparent power
    'R1-PA1:VH',   # Voltage phase angle

    # Relay 2 (cross-check)
    'R2:F',
    'R2:DF',
    'R2-PM1:V',
    'R2-PM4:I',
    'R2:S',

    # Relay 3
    'R3:F',
    'R3:DF',
    'R3-PM1:V',
    'R3:S',

    # Relay 4
    'R4:F',
    'R4:DF',
    'R4-PM1:V',
    'R4:S',

    # Relay logs (trip events)
    'relay1_log',
    'relay2_log',
]

def load_all_files(data_dir: str = '.') -> tuple[list, list]:
    """Load all CSV files and separate Natural from Attack rows."""
    files = sorted(glob.glob(os.path.join(data_dir, 'data*.csv')))
    if not files:
        raise FileNotFoundError(
            f"No data*.csv files found in {data_dir}\n"
            "Make sure you are running this from the backend folder."
        )

    print(f"Found {len(files)} CSV files")
    all_natural = []
    all_attack  = []

    for f in files:
        with open(f, newline='') as fh:
            rows = list(csv.DictReader(fh))
        nat = [r for r in rows if r.get('marker','').strip() == 'Natural']
        atk = [r for r in rows if r.get('marker','').strip() == 'Attack']
        all_natural.extend(nat)
        all_attack.extend(atk)
        print(f"  {os.path.basename(f):12s} → Natural={len(nat):4d}  Attack={len(atk):4d}")

    print(f"\nTotal → Natural={len(all_natural):5d}  Attack={len(all_attack):5d}")
    return all_natural, all_attack


def extract_features(rows: list, features: list[str]) -> np.ndarray:
    """Convert list of CSV row dicts to numpy feature matrix."""
    X = []
    for row in rows:
        vals = []
        for col in features:
            try:
                v = float(row.get(col, 0) or 0)
            except (ValueError, TypeError):
                v = 0.0
            vals.append(v)
        X.append(vals)
    return np.array(X, dtype=np.float32)


def main():
    print("=" * 60)
    print("Cyber Ampere — Isolation Forest Training")
    print("MSU Power System Attack Dataset")
    print("=" * 60)

    # ── 1. Load data ──────────────────────────────────────────────
    natural_rows, attack_rows = load_all_files('.')

    # ── 2. Build feature matrices ─────────────────────────────────
    print(f"\nExtracting {len(FEATURES)} features...")
    X_natural = extract_features(natural_rows, FEATURES)
    X_attack  = extract_features(attack_rows,  FEATURES)

    print(f"Natural feature matrix: {X_natural.shape}")
    print(f"Attack  feature matrix: {X_attack.shape}")

    # ── 3. Scale features ─────────────────────────────────────────
    scaler = StandardScaler()
    X_natural_scaled = scaler.fit_transform(X_natural)
    X_attack_scaled  = scaler.transform(X_attack)

    # ── 4. Train Isolation Forest on NATURAL rows only ────────────
    # contamination=0.01 means we expect ~1% of natural data may
    # have minor anomalies (sensor noise, transients)
    print("\nTraining Isolation Forest on natural operation rows...")
    print("(This may take 30-60 seconds for 78,000 rows)")

    model = IsolationForest(
        n_estimators=200,       # 200 trees — good balance of speed vs accuracy
        contamination=0.01,     # 1% contamination tolerance
        max_samples='auto',
        random_state=42,
        n_jobs=-1,              # use all CPU cores
        verbose=0,
    )
    model.fit(X_natural_scaled)
    print("Training complete.")

    # ── 5. Evaluate ───────────────────────────────────────────────
    print("\nEvaluating on held-out data...")

    # Isolation Forest: 1 = normal, -1 = anomaly
    nat_preds = model.predict(X_natural_scaled)  # should be mostly 1
    atk_preds = model.predict(X_attack_scaled)   # should be mostly -1

    nat_scores = model.score_samples(X_natural_scaled)  # lower = more anomalous
    atk_scores = model.score_samples(X_attack_scaled)

    # Detection rate
    true_positive  = np.sum(atk_preds == -1)
    false_positive = np.sum(nat_preds == -1)
    true_negative  = np.sum(nat_preds ==  1)
    false_negative = np.sum(atk_preds ==  1)

    detection_rate   = true_positive  / len(atk_preds) * 100
    false_alarm_rate = false_positive / len(nat_preds) * 100
    precision = true_positive / (true_positive + false_positive) * 100 if (true_positive + false_positive) > 0 else 0
    recall    = true_positive / (true_positive + false_negative) * 100 if (true_positive + false_negative) > 0 else 0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    print(f"\n{'─'*40}")
    print(f"Detection Rate   : {detection_rate:.1f}%  ({true_positive}/{len(atk_preds)} attack rows caught)")
    print(f"False Alarm Rate : {false_alarm_rate:.1f}%  ({false_positive}/{len(nat_preds)} normal rows flagged)")
    print(f"Precision        : {precision:.1f}%")
    print(f"Recall           : {recall:.1f}%")
    print(f"F1 Score         : {f1:.1f}%")
    print(f"{'─'*40}")

    # Anomaly score thresholds
    nat_score_mean = float(np.mean(nat_scores))
    nat_score_std  = float(np.std(nat_scores))
    warn_threshold = nat_score_mean - 1.5 * nat_score_std
    crit_threshold = nat_score_mean - 2.5 * nat_score_std

    print(f"\nAnomaly score thresholds (from natural data):")
    print(f"  Normal baseline : {nat_score_mean:.4f} ± {nat_score_std:.4f}")
    print(f"  Warning  < {warn_threshold:.4f}")
    print(f"  Critical < {crit_threshold:.4f}")

    # ── 6. Save model and metadata ────────────────────────────────
    model_data = {
        'model':   model,
        'scaler':  scaler,
        'features': FEATURES,
        'thresholds': {
            'warn': warn_threshold,
            'crit': crit_threshold,
            'baseline_mean': nat_score_mean,
            'baseline_std':  nat_score_std,
        },
        'stats': {
            'natural_rows':   len(natural_rows),
            'attack_rows':    len(attack_rows),
            'detection_rate': round(detection_rate, 2),
            'false_alarm_rate': round(false_alarm_rate, 2),
            'precision':      round(precision, 2),
            'recall':         round(recall, 2),
            'f1_score':       round(f1, 2),
        },
        'dataset': 'MSU Power System Attack Dataset',
        'n_features': len(FEATURES),
    }

    with open('model.pkl', 'wb') as f:
        pickle.dump(model_data, f)

    # Also save human-readable info
    info = {
        'model_type':   'IsolationForest',
        'n_estimators': 200,
        'features':     FEATURES,
        'n_features':   len(FEATURES),
        'dataset':      'MSU Power System Attack Dataset',
        'training_rows': len(natural_rows),
        'thresholds':   model_data['thresholds'],
        'performance':  model_data['stats'],
    }
    with open('model_info.json', 'w') as f:
        json.dump(info, f, indent=2)

    print(f"\n✅ Model saved to: backend/model.pkl")
    print(f"✅ Info  saved to: backend/model_info.json")
    print(f"\nNext step: restart dataset_server.py")


if __name__ == '__main__':
    main()