// src/test/logic/modelliPagamentoEventiSql.test.ts
/**
 * I momenti d'incasso dei modelli di pagamento stanno in due posti: il codice (`rateEventi.ts`) e il database
 * (il vincolo di `payment_plan_template_rows` e l'elenco di `salva_modello_pagamento`). Qui si tengono uguali.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTI_MODELLO } from "@/lib/orders/modelliPagamento";
import { EVENTI_RATA } from "@/lib/orders/rateEventi";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007170000_modelli_pagamento.sql"), "utf8").replace(/--.*$/gm, "");
const elencoTra = (testo: string, inizio: string): string[] => {
  const da = testo.indexOf(inizio) + inizio.length;
  const a = testo.indexOf(")", da);
  return [...testo.slice(da, a).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

describe("momenti d'incasso dei modelli: codice e database dicono lo stesso", () => {
  it("il vincolo della tabella ammette tutti gli eventi tranne «stato commessa»", () => {
    const vincolo = elencoTra(sql, "check (trigger_evento in (");
    expect(vincolo.sort()).toEqual([...EVENTI_MODELLO].sort());
    expect(vincolo).not.toContain("stato_commessa");
  });

  it("l'elenco di salva_modello_pagamento è lo stesso", () => {
    const f = sql.match(/v_ammessi constant text\[\] := array\[([^\]]+)\]/)![1];
    const elenco = [...f.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(elenco.sort()).toEqual([...EVENTI_MODELLO].sort());
  });

  it("ogni evento dei modelli esiste tra gli eventi delle rate", () => {
    const tutti = EVENTI_RATA.map((e) => e.value as string);
    for (const e of EVENTI_MODELLO) expect(tutti, e).toContain(e);
  });
});
