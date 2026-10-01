"""Controllo dei seed e delle quadrature del benchmark, non scheduler runtime."""
import json
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
f = json.loads((root / "pilota-bagno.v1.json").read_text())
now = datetime.fromisoformat(f["start"])
cal = f["calendar"]
crew_hours = person_hours = Decimal(0)
cost = Decimal(0)
for a in f["activities"]:
    if "elapsed_hours" in a:
        now += timedelta(hours=a["elapsed_hours"])
        continue
    duration = a["production_hours"]
    crew_hours += Decimal(duration)
    person_hours += Decimal(duration) * len(a["crew_hourly_rates"])
    cost += Decimal(duration) * sum(Decimal(str(r)) for r in a["crew_hourly_rates"])
    for _ in range(duration):
        while now.weekday() not in cal["weekdays"] or not cal["start_hour"] <= now.hour < cal["end_hour"]:
            now += timedelta(hours=1)
        now += timedelta(hours=1)
assert now.isoformat() == f["expected"]["finish"]
assert crew_hours == f["expected"]["crew_production_hours"]
assert person_hours == f["expected"]["person_hours"]
assert cost == f["expected"]["labor_cost"]
m = f["materials"]
assert m["received_quantity"] == m["consumed_A"] + m["consumed_B"] + m["final_stock"]
assert m["transferred_residue"] == m["consumed_B"] + m["final_stock"]
v = f["expected_material_values"]
assert v["A"] == m["consumed_A"] * m["unit_net_cost"]
assert v["B"] == m["consumed_B"] * m["unit_net_cost"]
assert v["stock"] == m["final_stock"] * m["unit_net_cost"]
assert v["A"] + v["B"] + v["stock"] == v["consolidated_net"]
assert sum(f["financial"]["documented_payments"]) == f["financial"]["gross_purchase"]
cases = json.loads((root / "casi-accettazione.v1.json").read_text())["cases"]
assert [c["number"] for c in cases] == list(range(1, 141))
assert len({c["id"] for c in cases}) == 140
print("OK: calendario fixture, 60 ore squadra, 76 ore-persona, costo 2300, materiali/cassa e 140 ID; nessuna prova runtime DB implicita")
