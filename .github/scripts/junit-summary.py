#!/usr/bin/env python3
"""Resume los resultados JUnit (XML) de una carpeta como Markdown, para $GITHUB_STEP_SUMMARY.

Uso: junit-summary.py <carpeta con TEST-*.xml> <título>
"""
import glob
import sys
import xml.etree.ElementTree as ET

directory, title = sys.argv[1], sys.argv[2]
tests = failures = skipped = 0
seconds = 0.0
failed = []

for path in sorted(glob.glob(f"{directory}/*.xml")):
    suite = ET.parse(path).getroot()
    tests += int(suite.get("tests", 0))
    failures += int(suite.get("failures", 0)) + int(suite.get("errors", 0))
    skipped += int(suite.get("skipped", 0))
    seconds += float(suite.get("time", 0))
    for case in suite.iter("testcase"):
        if case.find("failure") is not None or case.find("error") is not None:
            failed.append(f"{case.get('classname', '').rsplit('.', 1)[-1]} › {case.get('name')}")

print(f"### {title}")
print()
if tests == 0:
    print("⚠️ No se encontró ningún resultado de test.")
    sys.exit(0)
print("| Tests | Correctos | Fallidos | Omitidos | Tiempo |")
print("| ---: | ---: | ---: | ---: | ---: |")
print(f"| {tests} | {tests - failures - skipped} | {failures} | {skipped} | {seconds:.1f} s |")
if failed:
    print()
    print("**Fallidos:**")
    for name in failed[:30]:
        print(f"- `{name}`")
