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
  it("racconta la fase di prima, quella di adesso e chi l'ha presa", () => {
    expect(
      testoNotaAggiornamento({
        flusso: "FB - Nuovo",
        fasePrima: "Non interessato per ora",
        faseDopo: "Da Chiamare",
        callCenter: "Venusia BeMade",
      }),
    ).toBe(
      "L'automazione «FB - Nuovo» ha ritrovato questa opportunità aperta e l'ha riportata in «Da Chiamare» (era in «Non interessato per ora»). Assegnata come da flusso: call center Venusia BeMade.",
    );
  });

  it("se era già nella fase giusta lo dice, senza inventare uno spostamento", () => {
    expect(testoNotaAggiornamento({ fasePrima: "Da Chiamare", faseDopo: "Da Chiamare" })).toBe(
      "L'automazione ha ritrovato questa opportunità aperta in «Da Chiamare»: non ne ha creata un'altra.",
    );
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

  it("l'assegnazione del flusso vale anche su un'opportunità già assegnata", () => {
    const azione = MOTORE.split('case "create_opportunity": {')[1];
    expect(azione).toMatch(/if \(ncfg\.assegnato_a\) patch\.assigned_to = ncfg\.assegnato_a;/);
    expect(azione).toMatch(/if \(ncfg\.call_center_id\) patch\.call_center_id = ncfg\.call_center_id;/);
  });

  it("nel costruttore l'azione si chiama «Crea o aggiorna opportunità»", () => {
    expect(CATALOGO).toMatch(/id: 'crea_opportunita',\s*label: 'Crea o aggiorna opportunità'/);
  });
});
