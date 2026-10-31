#!/usr/bin/env python3
"""Validate approved SRS traceability without treating planned tests as passes."""

import csv
import hashlib
import json
import re
import sys
from pathlib import Path


def check(root: Path) -> list[str]:
    folder = root / "docs/planning"
    baseline = json.loads((folder / "srs-baseline.json").read_text())
    manifest = json.loads((folder / "tasks.json").read_text())
    with (folder / "srs-traceability.csv").open(newline="") as source:
        rows = list(csv.DictReader(source))
    errors = []
    requirements = {item["id"]: item for item in baseline["requirements"]}
    tasks = {task["id"]: task for task in manifest["tasks"]}
    if len(requirements) != 73:
        errors.append("SRS baseline must have 73 distinct requirements")
    if sum(item["priority"] == "P0" for item in requirements.values()) != 60:
        errors.append("SRS baseline must have 60 P0 requirements")
    if sum(item["priority"] == "P1" for item in requirements.values()) != 13:
        errors.append("SRS baseline must have 13 P1 requirements")
    if len(tasks) != len(manifest["tasks"]):
        errors.append("Duplicate task IDs")
    if len(rows) != len(requirements) or {row["srs_id"] for row in rows} != set(requirements):
        errors.append("RTM must contain every SRS requirement exactly once")
    source = root / baseline["source"]
    if source.exists() and hashlib.sha256(source.read_bytes()).hexdigest() != baseline["sha256"]:
        errors.append("Original SRS changed: rebaseline through supervisor change control")
    seen_scenarios = set()
    for row in rows:
        key = row["srs_id"]
        original = requirements.get(key)
        if original is None:
            continue
        for field in ("priority", "requirement", "acceptance"):
            if row[field] != original[field]:
                errors.append(f"{key}: original {field} drift")
        if row["primary_owner"] != "PRODUCT":
            errors.append(f"{key}: missing or incorrect primary implementation owner")
        if row["priority"] == "P0":
            task = tasks.get(row["primary_task"])
            owners = [task["id"] for task in tasks.values() if key in task["srs_ids"]]
            if task is None or owners != [row["primary_task"]]:
                errors.append(f"{key}: expected exactly one primary task, found {owners}")
        elif not row["primary_task"].startswith("P1-"):
            errors.append(f"{key}: P1 backlog ownership missing")
        for field in ("supporting_ui", "qa_tasks"):
            if not row[field] or any(task_id not in tasks for task_id in row[field].split(";")):
                errors.append(f"{key}: invalid {field}")
        for field in ("positive_test", "negative_test"):
            scenario = row[field]
            if not scenario or scenario in seen_scenarios:
                errors.append(f"{key}: missing or duplicated scenario ID")
            seen_scenarios.add(scenario)
        if row["test_status"] not in {"planned", "running", "passed", "failed", "blocked", "skipped"}:
            errors.append(f"{key}: invalid test status")
        if row["supervisor_decision"] == "accepted":
            if row["test_status"] != "passed" or not re.fullmatch(r"[0-9a-f]{40}", row["commit_sha"]):
                errors.append(f"{key}: acceptance requires passing evidence on an exact commit")
            if not row["evidence"] or not row["contract_version"] or not row["environment"]:
                errors.append(f"{key}: acceptance evidence is incomplete")
            # AUTH 004 / VID 005 explicitly specify mock behavior, so CI is
            # their proper acceptance environment. Real provider interactions
            # remain mandatory for the other integration requirements.
            if key in {"AUTH 001", "AUTH 003"} or key.startswith("AI ") or (key.startswith("VID ") and key != "VID 005"):
                if "Real-HTTPS" not in row["environment"]:
                    errors.append(f"{key}: mock checks cannot establish real provider acceptance")
    for task in tasks.values():
        if task["status"] not in manifest["task_states"]:
            errors.append(f"{task['id']}: invalid task status")
        if any(dependency not in tasks for dependency in task["depends_on"]):
            errors.append(f"{task['id']}: unknown prerequisite task")
        if task["status"] == "done" and (not task["evidence"] or not task["commit"]):
            errors.append(f"{task['id']}: done requires commit and evidence")
    return errors


if __name__ == "__main__":
    project = Path(__file__).resolve().parents[1]
    try:
        failures = check(project)
    except (OSError, ValueError, KeyError) as error:
        failures = [str(error)]
    if failures:
        print("Planning traceability FAILED:\n" + "\n".join("- " + item for item in failures), file=sys.stderr)
        sys.exit(1)
    print("Planning traceability OK: 73 SRS rows; 60 P0 uniquely assigned; 13 P1 tracked. Planned coverage is not implementation acceptance.")
