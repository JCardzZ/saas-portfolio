#!/usr/bin/env python3
"""Resumen en Markdown de la evaluación del servidor MCP (mcp-eval.json). Sin informe, no escribe nada."""
import json
import os
import sys


def main() -> None:
    path = sys.argv[1]
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as file:
        report = json.load(file)
    kind = "modelo simulado" if report.get("simulated") else report.get("model", "modelo real")
    print()
    print(f"### Evaluación del servidor MCP ({kind})")
    print()
    print(f"**{report['passed']} de {report['total']}** tareas · {report['toolCalls']} llamadas a herramientas")
    failed = [task for task in report["tasks"] if not task["passed"]]
    if failed:
        print()
        for task in failed:
            print(f"- {task['id']} ({task['area']}): {'; '.join(task['failures'])}")


if __name__ == "__main__":
    main()
