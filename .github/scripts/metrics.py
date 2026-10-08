#!/usr/bin/env python3
"""Deja las métricas de un job en metrics/<id del job>.json para pipeline-status.json.

Uso: metrics.py <id del job> [--junit <carpeta>] [--jacoco <csv>] [clave=valor ...]
Los valores numéricos se guardan como números. Solo van datos del resultado, nunca rutas ni logs.
"""
import csv
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

job, args = sys.argv[1], sys.argv[2:]
metrics = {}

while args:
    arg = args.pop(0)
    if arg == "--junit":
        tests = failed = skipped = 0
        for path in glob.glob(f"{args.pop(0)}/*.xml"):
            suite = ET.parse(path).getroot()
            tests += int(suite.get("tests", 0))
            failed += int(suite.get("failures", 0)) + int(suite.get("errors", 0))
            skipped += int(suite.get("skipped", 0))
        if tests:
            metrics.update(tests=tests, failed=failed, skipped=skipped)
    elif arg == "--jacoco":
        path = args.pop(0)
        if os.path.exists(path):
            missed = covered = 0
            with open(path, newline="") as report:
                for row in csv.DictReader(report):
                    missed += int(row["LINE_MISSED"])
                    covered += int(row["LINE_COVERED"])
            if missed + covered:
                metrics["coverage"] = round(100 * covered / (missed + covered), 1)
    elif "=" in arg:
        key, value = arg.split("=", 1)
        if value == "":
            continue
        try:
            metrics[key] = int(value)
        except ValueError:
            try:
                metrics[key] = float(value)
            except ValueError:
                metrics[key] = {"true": True, "false": False}.get(value, value)

os.makedirs("metrics", exist_ok=True)
with open(f"metrics/{job}.json", "w") as out:
    json.dump(metrics, out)
print(f"metrics/{job}.json: {json.dumps(metrics)}")
