"""Rigenera i seed progettuali, senza leggere/scrivere il database."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def activity(key, label, previous, skills, quantity="input.fixed_scope", unit="intervento", kind="production", evidence=None):
    return {"id": key, "label": label, "kind": kind, "dependencies": [{"activity_id": x, "relation": "FS"} for x in previous],
            "quantity_source": quantity, "unit": unit, "skills": skills,
            "hours_per_unit": None, "setup_person_hours": None, "crew_capacity_curve": None,
            "calendar_id": None, "material_requirements": [],
            "completion_requirements": evidence or ["approved_measure_or_checklist"],
            "calibration_state": "requires_company_configuration"}

def template(key, label, inputs, steps, special):
    return {"id": key, "version": 1, "label": label, "status": "design_seed",
            "required_inputs": inputs, "activities": steps,
            "payment_rules": {"source": "validated_contract", "sal_conditions": [], "supplier_terms": []},
            "prerequisites": special, "activation_gate": "validated_company_coefficients_calendar_resources_and_contract"}

def seq(rows):
    out = []
    for r in rows:
        key, label, skills, *opts = r
        out.append(activity(key, label, [out[-1]["id"]] if out else [], skills, **(opts[0] if opts else {})))
    return out

catalog = {"schema_version": 1, "runtime_activation": False, "default_timezone": "Europe/Rome",
           "note": "Seed da compilare nei moduli esistenti. Nessuna durata o aliquota universale; nessuna scrittura ufficiale.",
           "templates": [
template("bathroom", "Bagno", ["survey", "surfaces", "plumbing_points", "layout", "access", "product_choices", "contract"], seq([
    ("survey", "Rilievo e scelte", ["technician"], {"kind": "approval"}),
    ("kit", "Conferma kit e prerequisiti", ["procurement"], {"kind": "approval"}),
    ("setup", "Protezioni e allestimento", ["builder", "helper"]),
    ("demolition", "Demolizione e smaltimento", ["builder", "helper"]),
    ("rough_plumbing", "Predisposizioni idrauliche", ["plumber"], {"quantity": "input.plumbing_points", "unit": "punto"}),
    ("rough_electric", "Predisposizioni elettriche", ["electrician"]),
    ("tests", "Prove prima della chiusura", ["technician"], {"kind": "approval", "evidence": ["validated_test_results"]}),
    ("substrates", "Supporti", ["builder"], {"quantity": "input.surfaces", "unit": "m2"}),
    ("waterproofing", "Sistema impermeabilizzazione", ["installer"]),
    ("technical_wait", "Attesa del sistema applicabile", [], {"kind": "technical_wait", "evidence": ["validated_product_waiting_rule", "required_conditions"]}),
    ("tiling", "Posa e finiture", ["tiler"], {"quantity": "input.surfaces", "unit": "m2"}),
    ("fixtures", "Sanitari e accessori", ["plumber", "installer"]),
    ("handover", "Verifiche e consegna", ["site_manager"], {"kind": "milestone", "evidence": ["accepted_tests", "defect_list", "required_documents"]}),
]), ["verified_substrate", "confirmed_client_choices", "compatible_products"]),
template("windows", "Serramenti", ["openings", "survey_version", "product_choices", "access", "supplier_terms", "contract"], seq([
    ("visit", "Sopralluogo", ["technician"]), ("survey", "Rilievo definitivo", ["surveyor"], {"kind": "approval"}),
    ("choice", "Conferma prodotto e distinta", ["technician"], {"kind": "approval"}),
    ("order", "Ordine e condizioni avvio", ["procurement"], {"kind": "approval"}),
    ("production_wait", "Produzione fornitore", [], {"kind": "supplier_wait", "evidence": ["accepted_order", "approved_measures", "required_deposit", "confirmed_lead_time"]}),
    ("receive", "Ricezione e controllo kit", ["warehouse"]),
    ("appointment", "Appuntamento e mezzi", ["planner"], {"kind": "approval"}),
    ("installation", "Rimozione e posa", ["window_installer", "helper"], {"quantity": "input.openings", "unit": "apertura"}),
    ("adjust", "Regolazioni e ripristini", ["window_installer"]),
    ("accept", "Accettazione e documenti", ["site_manager"], {"kind": "milestone"}),
]), ["final_measure_revision", "complete_compatible_kit", "access_and_lifting_plan"]),
template("photovoltaic", "Fotovoltaico", ["validated_project", "components", "roof", "access", "practices_scope", "contract"], seq([
    ("project", "Verifica e progetto", ["technician"], {"kind": "approval"}),
    ("readiness", "Condizioni avvio", ["site_manager"], {"kind": "approval"}),
    ("kit", "Acquisti e kit compatibile", ["procurement", "warehouse"]),
    ("setup", "Allestimento e accessi", ["installer"]),
    ("mount", "Strutture e moduli", ["pv_installer"], {"quantity": "input.module_count", "unit": "modulo"}),
    ("electric", "Parte elettrica e componenti previsti", ["electrician"]),
    ("tests", "Prove applicabili", ["technician"], {"kind": "approval", "evidence": ["validated_test_results"]}),
    ("handover", "Consegna documentale", ["site_manager"], {"kind": "milestone"}),
    ("activation", "Pratiche e attivazione applicabili", ["technical_office"], {"kind": "milestone", "evidence": ["required_external_outcomes"]}),
]), ["project_compatibility", "qualified_resources", "verified_roof_access", "applicable_authorizations"]),
template("renovation", "Ristrutturazione completa", ["zones", "work_quantities", "existing_conditions", "window_scope", "occupation", "contract"], seq([
    ("survey", "Verifiche perimetro e zone", ["technician"], {"kind": "approval"}),
    ("setup", "Allestimento", ["builder"]), ("demolition", "Demolizioni per zone", ["builder", "helper"]),
    ("structure", "Opere previste", ["builder"]), ("rough_services", "Impianti distinti per competenza", ["plumber", "electrician"]),
    ("tests", "Prove prima di chiudere", ["technician"], {"kind": "approval"}),
    ("substrates", "Supporti", ["builder"]), ("finishes", "Finiture", ["tiler", "decorator"]),
    ("installation", "Installazioni finali", ["installer"]),
    ("handover", "Collaudi, difetti e consegna", ["site_manager"], {"kind": "milestone"}),
]) + [activity("window_survey", "Rilievo serramenti compatibile con opere", ["structure"], ["surveyor"], kind="approval"),
      activity("window_delivery", "Fornitura serramenti", ["window_survey"], [], kind="supplier_wait"),
      activity("window_install", "Posa serramenti", ["window_delivery", "substrates"], ["window_installer"])],
    ["zone_compatibility", "client_decisions", "subcontract_inclusions", "approved_variations"]),
template("construction", "Costruzione annuale / sviluppo proprio", ["project", "lots", "ownership_mode", "land_scope", "funding", "contract_or_sales_plan"], seq([
    ("conditions", "Condizioni preliminari", ["technical_office"], {"kind": "approval"}),
    ("setup", "Allestimento", ["builder"]), ("earthwork", "Scavi e opere preliminari", ["machine_operator"]),
    ("foundations", "Fondazioni", ["structural_crew"]), ("structure", "Struttura", ["structural_crew"]),
    ("envelope", "Involucro", ["builder", "roof_installer"]),
    ("services", "Impianti per lotti", ["plumber", "electrician"]),
    ("tests", "Prove e verifiche", ["technician"], {"kind": "approval"}),
    ("finishes", "Finiture", ["tiler", "decorator"]),
    ("handover", "Consegne e documenti", ["site_manager"], {"kind": "milestone"}),
    ("financial_close", "Chiusura economica e unità", ["administration"], {"kind": "milestone"}),
]), ["confirmed_authorizations", "funding_conditions", "lot_allocation_policy", "progressive_detail"]),
]}

# La consegna della ristrutturazione richiede anche la posa dei serramenti,
# se la compilazione conferma che tale ambito è incluso.
renovation = next(t for t in catalog["templates"] if t["id"] == "renovation")
next(a for a in renovation["activities"] if a["id"] == "handover")["dependencies"].append({"activity_id": "window_install", "relation": "FS"})

for t in catalog["templates"]:
    nodes = {a["id"]: a for a in t["activities"]}
    assert len(nodes) == len(t["activities"])
    visited, visiting = set(), set()
    def visit(k):
        if k in visited: return
        assert k not in visiting, (t["id"], "cycle", k)
        visiting.add(k)
        for dep in nodes[k]["dependencies"]:
            assert dep["activity_id"] in nodes
            visit(dep["activity_id"])
        visiting.remove(k); visited.add(k)
    for k in nodes: visit(k)

(ROOT / "templates.v1.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
print(f"5 seed validati, {sum(len(t['activities']) for t in catalog['templates'])} attività; nessun ciclo o riferimento mancante")
