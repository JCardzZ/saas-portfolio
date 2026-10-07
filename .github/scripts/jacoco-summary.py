#!/usr/bin/env python3
"""Resume la cobertura de JaCoCo (CSV) como Markdown y, opcionalmente, como insignia.

Uso: jacoco-summary.py <jacocoTestReport.csv> [salida.json]
El JSON sigue el esquema "endpoint" de shields.io (https://shields.io/badges/endpoint-badge).
"""
import csv
import json
import sys

totals = {"INSTRUCTION": [0, 0], "BRANCH": [0, 0], "LINE": [0, 0]}
with open(sys.argv[1], newline="") as report:
    for row in csv.DictReader(report):
        for counter, pair in totals.items():
            pair[0] += int(row[f"{counter}_MISSED"])
            pair[1] += int(row[f"{counter}_COVERED"])


def percent(counter):
    missed, covered = totals[counter]
    return 100 * covered / (missed + covered) if missed + covered else 0.0


lines = percent("LINE")
print("### Cobertura (JaCoCo)")
print()
print("| Líneas | Ramas | Instrucciones |")
print("| ---: | ---: | ---: |")
print(f"| {lines:.1f} % | {percent('BRANCH'):.1f} % | {percent('INSTRUCTION'):.1f} % |")
print()
print("Sin contar el código generado del contrato OpenAPI ni el de MapStruct.")

if len(sys.argv) > 2:
    color = "brightgreen" if lines >= 80 else "green" if lines >= 70 else "yellow" if lines >= 60 else "red"
    with open(sys.argv[2], "w") as badge:
        json.dump({"schemaVersion": 1, "label": "cobertura", "message": f"{lines:.0f}%", "color": color}, badge)
