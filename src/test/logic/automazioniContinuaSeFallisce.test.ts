import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 05/10/2026 — nei flussi dei lead l'email veniva prima del WhatsApp: quando
// l'email falliva (credito, indirizzo che rimbalza) l'iscrizione si chiudeva e il
// WhatsApp non partiva mai. Ogni passo può ora scegliere «continua anche se non
// riesce» (config_json.continua_se_fallisce): l'errore resta scritto, la catena va
// avanti. È una scelta del singolo passo: senza, tutto resta com'era.

const motore = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");

// Il ciclo che esegue i passi della coda: da «executeNode» fino al «Mark current item as done».
const inizio = motore.indexOf("const result: any = await executeNode(supabase, node, item);");
const fine = motore.indexOf("// Mark current item as done", inizio);
const ciclo = motore.slice(inizio, fine);

describe("passo che fallisce: continua solo se il flusso lo chiede", () => {
  it("l'opzione si legge dal passo ed è un sì esplicito", () => {
    expect(inizio).toBeGreaterThan(0);
    expect(fine).toBeGreaterThan(inizio);
    expect(ciclo).toContain("node.config_json?.continua_se_fallisce === true");
  });

  it("andare avanti scrive l'errore nella coda e accoda i passi successivi come riusciti", () => {
    const aiuto = ciclo.slice(ciclo.indexOf("const proseguiDopoFallimento"), ciclo.indexOf("if (!result.success && result.fermaIscrizione && continuaComunque)"));
    expect(aiuto).toContain('markQueueItem(supabase, item.id, "failed", errore)');
    expect(aiuto).toContain("queueNextNodes(supabase, item, node, { success: true");
    // L'iscrizione NON si segna fallita: è proprio quello che si vuole evitare.
    expect(aiuto).not.toContain('status: "failed"');
  });

  it("vale per tutte e tre le uscite di errore: disiscritto/rimbalzo, rinvii finiti, tentativi finiti", () => {
    // La definizione è «const proseguiDopoFallimento = async (…)»: le chiamate sono solo gli usi.
    const usi = ciclo.match(/await proseguiDopoFallimento\(/g) ?? [];
    expect(usi.length).toBe(3);
    expect(ciclo).toContain("result.fermaIscrizione && continuaComunque");
    expect(ciclo).toContain("deferCount > 48 && continuaComunque");
    expect(ciclo).toContain("else if (continuaComunque)");
  });

  it("senza l'opzione resta il comportamento di sempre: tentativi, poi iscrizione fallita", () => {
    const dopoTentativi = ciclo.slice(ciclo.indexOf("else if (continuaComunque)"));
    expect(dopoTentativi).toContain('status: "failed"');
    expect(dopoTentativi).toContain("automation_dead_letter");
    // E la disiscrizione ferma ancora tutta la sequenza se il passo non ha scelto di continuare.
    expect(ciclo).toContain('status: "canceled"');
  });

  it("i tentativi si fanno comunque prima di andare avanti (nessuno scarto al primo errore)", () => {
    const retry = ciclo.indexOf("if (attempts < item.max_attempts)");
    const prosegui = ciclo.indexOf("else if (continuaComunque)");
    expect(retry).toBeGreaterThan(0);
    expect(prosegui).toBeGreaterThan(retry);
  });
});
