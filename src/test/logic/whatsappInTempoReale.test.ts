/**
 * WhatsApp nelle automazioni (19/09/2026, richiesta di Florin): il lead che fa
 * una richiesta riceve subito il messaggio, anche alle 2 di notte, e un
 * WhatsApp rinviato non è un errore.
 *
 * Tiene fermo:
 *   · i passi delle automazioni saltano la finestra generale dei numeri: i
 *     tempi li decidono le attese e le fasce del passo, che restano;
 *   · le campagne a freddo la finestra la rispettano ancora;
 *   · un passo rinviato va nel registro come «skipped», e diventa «error» solo
 *     oltre il tetto dei 48 rinvii;
 *   · automazioni_attivita non conta i rinvii come esecuzioni;
 *   · nel builder «skipped» si legge «Rinviato».
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { statoRegistro } from "@/lib/automazioniRegistro";

const radice = join(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(join(radice, percorso), "utf8");

const motore = leggi("supabase/functions/process-automation/index.ts");

// Il corpo di una funzione del motore, dalla firma alla funzione successiva.
function corpo(nome: string): string {
  const inizio = motore.indexOf(`async function ${nome}(`);
  expect(inizio).toBeGreaterThan(0);
  const fine = motore.indexOf("\nasync function ", inizio + 1);
  return motore.slice(inizio, fine > 0 ? fine : undefined);
}

describe("WhatsApp Locale nelle automazioni", () => {
  const invio = corpo("executeSendWhatsAppLocale");

  it("parte subito: la finestra generale dei numeri non vale per le automazioni", () => {
    expect(invio).toMatch(/sendOpenWaMessage\(supabase, \{[\s\S]*?bypassQuietHours: true,[\s\S]*?\}\);/);
  });

  it("le fasce del passo restano, per chi le imposta (i solleciti)", () => {
    expect(invio).toMatch(/minutiAllaFascia\(romeMinuti\(\), leggiFasceOrarie\(cfg\.fasce_orarie\)\)/);
    expect(invio.indexOf("leggiFasceOrarie(cfg.fasce_orarie)")).toBeLessThan(invio.indexOf("sendOpenWaMessage("));
  });

  it("le campagne a freddo rispettano ancora la finestra", () => {
    const campagne = leggi("supabase/functions/openwa-campagna-dispatch/index.ts");
    expect(campagne).toMatch(/sendOpenWaMessage\(admin, \{/);
    expect(campagne).not.toMatch(/bypassQuietHours/);
  });
});

describe("un passo rinviato non è un errore", () => {
  it("nel registro va come «skipped»", () => {
    expect(motore).toMatch(/const rinviato = !result\.success && result\.defer && deferCount <= 48;/);
    expect(motore).toMatch(/status: result\.success \? "success" : rinviato \? "skipped" : "error",/);
  });

  it("il conteggio dei rinvii si fa prima del registro, una volta sola", () => {
    const conteggio = motore.indexOf("const deferCount = (ctx._defer_count || 0) + 1;");
    const registro = motore.indexOf('status: result.success ? "success" : rinviato ? "skipped" : "error",');
    expect(conteggio).toBeGreaterThan(0);
    expect(conteggio).toBeLessThan(registro);
    expect(motore.match(/const deferCount =/g)).toHaveLength(1);
  });

  it("automazioni_attivita non conta i rinvii fra le esecuzioni", () => {
    const cartella = join(radice, "supabase/migrations");
    const ultima = readdirSync(cartella)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(join(cartella, f), "utf8").includes("function public.automazioni_attivita("))
      .pop();
    expect(ultima).toBeDefined();
    const sql = readFileSync(join(cartella, ultima!), "utf8");
    expect(sql).toMatch(/and l\.status <> 'skipped'\s+order by l\.created_at desc/);
    expect(sql).toMatch(/count\(\*\) filter \(where l\.status <> 'skipped'\) as esecuzioni/);
    expect(sql).toMatch(/count\(\*\) filter \(where l\.status = 'error'\) as errori/);
  });

  it("nel builder «skipped» si legge «Rinviato», senza il rosso degli errori", () => {
    expect(statoRegistro("skipped")).toEqual({ etichetta: "Rinviato", tono: "attesa" });
    expect(statoRegistro("error")).toEqual({ etichetta: "Errore", tono: "errore" });
    expect(statoRegistro("success").etichetta).toBe("Riuscito");
    expect(statoRegistro("sconosciuto").etichetta).toBe("sconosciuto");
  });
});
