import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  personeDaAvvisare,
  tagsUniti,
  testoNotaAggiornamento,
} from "../../../supabase/functions/_shared/creaAggiornaOpportunita.ts";

const MOTORE = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");
const CATALOGO = readFileSync(join(__dirname, "../../lib/flow-node-catalog.ts"), "utf8");

describe("Crea o aggiorna opportunità — nota e avvisi", () => {
  // 18/09/2026: una nuova richiesta non riporta più la scheda in «Da Chiamare».
  it("dice dove resta la scheda e che non la riporta indietro", () => {
    expect(
      testoNotaAggiornamento({
        flusso: "FB - Nuovo",
        fasePrima: "Non risponde 3",
        faseFlusso: "Da Chiamare",
      }),
    ).toBe(
      "L'automazione «FB - Nuovo» ha ritrovato questa opportunità aperta in «Non risponde 3» e l'ha lasciata lì: non la riporta in «Da Chiamare» e non ne crea un'altra.",
    );
  });

  it("se è già nella fase del flusso lo dice, senza inventare uno spostamento", () => {
    expect(testoNotaAggiornamento({ fasePrima: "Da Chiamare", faseFlusso: "Da Chiamare" })).toBe(
      "L'automazione ha ritrovato questa opportunità aperta in «Da Chiamare»: non ne ha creata un'altra.",
    );
  });

  it("scrive chi l'ha presa solo quando non era di nessuno", () => {
    expect(
      testoNotaAggiornamento({ flusso: "FB - Nuovo", fasePrima: "Da Chiamare", faseFlusso: "Da Chiamare", callCenter: "Venusia BeMade" }),
    ).toBe(
      "L'automazione «FB - Nuovo» ha ritrovato questa opportunità aperta in «Da Chiamare»: non ne ha creata un'altra. Non era di nessuno: l'ha presa call center Venusia BeMade.",
    );
    expect(testoNotaAggiornamento({ fasePrima: "Standby", faseFlusso: "Da Chiamare" })).not.toMatch(/presa/);
  });

  it("avvisa ogni persona una volta sola", () => {
    expect(personeDaAvvisare(["a", null, "a", "", undefined, "b"])).toEqual(["a", "b"]);
  });

  it("unisce le etichette senza doppioni", () => {
    expect(tagsUniti(["facebook", "nuovo"], ["nuovo", "lead-recuperato", " "])).toEqual(["facebook", "nuovo", "lead-recuperato"]);
  });
});

describe("Crea o aggiorna opportunità — motore e catalogo", () => {
  it("il motore cerca l'opportunità aperta della stessa pipeline prima di crearne una", () => {
    const azione = MOTORE.split('case "create_opportunity": {')[1].split("case \"move_opportunity\"")[0];
    expect(azione).toMatch(/\.eq\("pipeline_id", pipelineId\)[\s\S]*?\.eq\("status", "open"\)[\s\S]*?\.is\("deleted_at", null\)/);
    expect(azione.indexOf('action: "update_opportunity"')).toBeLessThan(azione.indexOf(".insert(insertData)"));
  });

  it("la scheda già aperta non si sposta e non cambia di mano", () => {
    const azione = MOTORE.split('case "create_opportunity": {')[1];
    // Niente stage_id nel patch: la fase la decide chi lavora la scheda.
    expect(azione.split(".insert(insertData)")[0]).not.toMatch(/patch\.stage_id/);
    expect(azione).toMatch(/if \(!esistente\.assigned_to && ncfg\.assegnato_a\) patch\.assigned_to = ncfg\.assegnato_a;/);
    expect(azione).toMatch(/if \(!esistente\.call_center_id && ncfg\.call_center_id\) patch\.call_center_id = ncfg\.call_center_id;/);
  });

  it("nel costruttore l'azione si chiama «Crea o aggiorna opportunità»", () => {
    expect(CATALOGO).toMatch(/id: 'crea_opportunita',\s*label: 'Crea o aggiorna opportunità'/);
  });
});
