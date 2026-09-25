/**
 * Preventivi dei moduli: la copia di firma non è un preventivo, i moduli seguono
 * il piano, i preventivi fatti coi modelli nuovi si firmano online (25/09/2026).
 *
 * Dall'audit dei moduli di vendita:
 *   · i moduli edili (Tetti, Bagni…) firmano con una riga «ombra» in quotes
 *     (source «modulo:<chiave>:<progetto>», src/lib/moduli/quoteBridge.ts). Quella
 *     riga compariva nell'elenco come un preventivo «Classico» vuoto; «Scarica
 *     PDF» la rigenerava come preventivo classico vuoto (ed era quello che andava
 *     in firma); «Converti in Cantiere» creava una commessa col solo totale;
 *   · solo il Fotovoltaico controllava il piano: gli altri moduli si aprivano
 *     dall'indirizzo, e Ristrutturazione non aveva nemmeno il suo permesso;
 *   · i preventivi Tetti e Serramenti fatti con un modello della libreria non si
 *     potevano mandare in firma online.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { eRigaDiModulo, moduleSourceTag, preventivoDelModulo } from "@/lib/moduli/quoteBridge";
import { MODULI_VENDITA } from "@/lib/moduli-vendita/config";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const ROTTE = leggi("src/routes/companyRoutes.tsx");
const PROGETTO = "0b8a4c1e-2f3d-4e5f-8a9b-0c1d2e3f4a5b";

/** Cartella del modulo → chiave che il suo wizard passa a InviaFirmaCard. */
const MODULI_EDILI = [
  ["ristrutturazione", "rst"], ["bagni", "bagni"], ["tetti", "tetti"], ["climatizzazione", "clm"],
  ["elettrico", "ele"], ["termoidraulico", "idr"], ["pavimenti", "pav"], ["piscine", "pis"],
] as const;

const stepPdfDel = (cartella: string) => {
  const base = `src/pages/azienda/${cartella}`;
  const wizard = readdirSync(resolve(process.cwd(), base)).find(
    (voce) => voce.endsWith("Wizard") && statSync(resolve(process.cwd(), base, voce)).isDirectory(),
  );
  return leggi(`${base}/${wizard}/StepPdf.tsx`);
};

describe("la copia di firma di un preventivo di modulo", () => {
  it("si riconosce dalla sua origine", () => {
    expect(eRigaDiModulo(moduleSourceTag("tetti", PROGETTO))).toBe(true);
    expect(eRigaDiModulo("manual")).toBe(false);
    expect(eRigaDiModulo("sito")).toBe(false);
    expect(eRigaDiModulo(null)).toBe(false);
  });

  it.each(MODULI_EDILI)("%s: riporta al preventivo del modulo, che ha la sua rotta", (cartella, chiave) => {
    expect(stepPdfDel(cartella)).toContain(`moduleKey="${chiave}"`);
    expect(preventivoDelModulo(moduleSourceTag(chiave, PROGETTO))?.href).toBe(`/azienda/${cartella}/${PROGETTO}/modifica`);
    expect(ROTTE).toContain(`<Route path="${cartella}/:id/modifica"`);
  });

  it("non compare nell'elenco dei preventivi, né nella vista unificata", () => {
    expect(leggi("src/components/marketing/preventivi/UnifiedPreventiviList.tsx")).toContain(".filter((q) => !eRigaDiModulo(q.source))");
    const cartella = resolve(process.cwd(), "supabase/migrations");
    const migrazione = readdirSync(cartella).find((f) => f.endsWith("_moduli_permesso_ristrutturazione_e_righe_firma.sql"));
    expect(migrazione).toBeDefined();
    expect(readFileSync(resolve(cartella, migrazione!), "utf8")).toContain("q.source IS NULL OR q.source NOT LIKE \\'modulo:%\\'");
  });

  it("dal dettaglio non si modifica, duplica o converte: si apre il preventivo del modulo", () => {
    const dettaglio = leggi("src/pages/azienda/marketing/QuoteDetail.tsx");
    expect(dettaglio).toContain("const rigaDiModulo = eRigaDiModulo(quote.source);");
    expect(dettaglio).toContain('{quote.status === "bozza" && !rigaDiModulo && (');
    expect(dettaglio.match(/\{quote\.status === "accettata" && !rigaDiModulo && \(/g) ?? []).toHaveLength(2);
    expect(dettaglio).toContain("{!rigaDiModulo && (");
    expect(dettaglio).toContain("Apri il preventivo {moduloDellaRiga.nome}");
  });

  it("il server non la rigenera come preventivo classico e non la converte in cantiere", () => {
    const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");
    const guardia = pdf.indexOf('quote.source.startsWith("modulo:")');
    expect(guardia).toBeGreaterThan(0);
    expect(guardia).toBeLessThan(pdf.indexOf("const resolveTemplate = async"));
    const converti = leggi("supabase/functions/converti-preventivo-cantiere/index.ts");
    expect(converti.indexOf('quote.source.startsWith("modulo:")')).toBeGreaterThan(0);
    expect(converti.indexOf('quote.source.startsWith("modulo:")')).toBeLessThan(converti.indexOf("// 3. Verifica stato preventivo"));
  });
});

describe("i moduli seguono il piano, come il Fotovoltaico", () => {
  const edili = MODULI_VENDITA.filter((m) => m.availability === "available" && m.slug !== "fotovoltaico");

  it("i moduli controllati sono quelli disponibili del catalogo", () => {
    expect(edili.map((m) => m.slug).sort()).toEqual(
      ["bagni", "climatizzazione", "elettrico", "pavimenti", "piscine", "ristrutturazione", "serramenti", "termoidraulico", "tetti"],
    );
  });

  it.each(edili)("$slug: ogni rotta passa dal permesso del modulo", (modulo) => {
    const rotte = [...ROTTE.matchAll(new RegExp(`<Route path="${modulo.slug}(?:/[^"]*)?" element=\\{([\\s\\S]*?)\\} />`, "g"))];
    expect(rotte.length).toBeGreaterThanOrEqual(3);
    for (const [, elemento] of rotte) expect(elemento).toContain(`<FeatureRoute featureKey="${modulo.flag}">`);
  });

  it("il permesso di Ristrutturazione esiste, uguale a quello di Bagni", () => {
    const cartella = resolve(process.cwd(), "supabase/migrations");
    const nome = readdirSync(cartella).find((f) => f.endsWith("_moduli_permesso_ristrutturazione_e_righe_firma.sql"))!;
    const sql = readFileSync(resolve(cartella, nome), "utf8");
    expect(sql).toMatch(/select 'modulo_ristrutturazione_attivo', 'Hammer', 'Ristrutturazione'[\s\S]*?where b\.key = 'modulo_bagni_attivo'/);
    expect(sql).toMatch(/where o\.feature_key = 'modulo_bagni_attivo'/);
    expect(sql).toMatch(/where d\.feature_key = 'modulo_bagni_attivo'/);
  });
});

describe("i preventivi fatti coi modelli nuovi si firmano online", () => {
  it("Tetti: l'invio in firma non è più spento dal modello", () => {
    const tetti = stepPdfDel("tetti");
    expect(tetti).toContain("disabled={computoVuoto}");
    expect(tetti).not.toMatch(/disabled=\{[^}]*modello_snapshot/);
  });

  it("Serramenti: la pagina di firma usa il modello congelato nel preventivo", () => {
    const funzione = leggi("supabase/functions/sr-genera-pdf/index.ts");
    expect(funzione).not.toContain("Pagina firma non ancora collegata");
    expect(funzione).toContain("modelloDelPreventivo ?? template ?? {}");
    expect(leggi("src/lib/serramenti/api.ts")).not.toContain("non è ancora collegata");
    expect(leggi("src/components/serramenti/StepPdf.tsx")).not.toContain("!!p.modello_snapshot");
  });
});
