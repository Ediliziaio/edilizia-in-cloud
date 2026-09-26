/**
 * Il riepilogo economico del preventivo generico (25/09/2026): listino, sconti,
 * risparmio IVA inclusa, voci opzionali e agevolazioni fiscali.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agevolazioniPreventivo, riepilogoPrezzi, type RigaPrezzo } from "../../../supabase/functions/_shared/prezziPreventivo";
import { DETRAZIONI_EDILIZIE } from "@/lib/fatturazione/detrazioniEdilizie";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Il preventivo di prova del 25/09: una riga scontata del 5%, un'opzionale, una nota, sconto sul totale del 5%.
const righe: RigaPrezzo[] = [
  { quantity: 4, unit_price: 890, line_total: 3560, vat_rate: 10 },
  { quantity: 2, unit_price: 1450, discount_percent: 5, line_total: 2755, vat_rate: 10 },
  { quantity: 6, unit_price: 180, line_total: 1080, vat_rate: 10, item_category: "posa" },
  { quantity: 1, unit_price: 350, line_total: 350, vat_rate: 22, item_category: "smaltimento" },
  { item_category: "subtotale", quantity: 0, unit_price: 0 },
  { quantity: 1, unit_price: 11800, line_total: 11800, vat_rate: 22 },
  { quantity: 1, unit_price: 1250, line_total: 1250, vat_rate: 22, is_optional: true },
  { item_category: "nota", quantity: 0, unit_price: 0 },
  { quantity: 1, unit_price: 980, line_total: 980, vat_rate: 22 },
];

describe("il riepilogo economico", () => {
  it("listino, sconti sulle voci, prezzo pieno e risparmio IVA inclusa", () => {
    const r = riepilogoPrezzi(righe, { subtotal: 20525, total: 22945.44 });
    expect(r.coerente).toBe(true);
    expect(r.listino).toBe(20670);
    expect(r.scontiVoci).toBe(145);
    expect(r.pieno).toBe(24312.6);
    expect(r.risparmio).toBe(1367.16);
    expect(r.risparmioPct).toBeCloseTo(5.62, 2);
    // L'opzionale fuori dal totale, IVA inclusa.
    expect(r.opzionali).toBe(1525);
  });

  it("una riga di sconto in negativo conta come sconto, non abbassa il listino", () => {
    const conRigaSconto: RigaPrezzo[] = [
      { quantity: 1, unit_price: 10000, line_total: 10000, vat_rate: 10 },
      { quantity: 1, unit_price: -500, line_total: -500, vat_rate: 10 },
    ];
    const r = riepilogoPrezzi(conRigaSconto, { subtotal: 9500, total: 10450 });
    expect(r.listino).toBe(10000);
    expect(r.scontiVoci).toBe(500);
    expect(r.risparmio).toBe(550);
  });

  it("se le righe non tornano coi totali salvati (prezzo a mano, righe nascoste) niente listino né risparmio", () => {
    const aMano: RigaPrezzo[] = [{ quantity: 1, unit_price: 0, line_total: 0, vat_rate: 10 }];
    const r = riepilogoPrezzi(aMano, { subtotal: 15000, total: 16500 });
    expect(r.coerente).toBe(false);
    expect(r.scontiVoci).toBe(0);
    expect(r.risparmio).toBe(0);
  });

  it("nel PDF il risparmio nasce da uno sconto vero, non dai centesimi dell'IVA", () => {
    const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");
    expect(pdf).toContain("const conRisparmio = scontiInVista && (conListino || Number(quote.discount_amount || 0) >= 0.01) && prezzi.risparmio >= 0.5;");
    // L'azienda che nasconde gli sconti non li vede comparire nel riepilogo.
    expect(pdf).toContain("&& opzione(\"pdf_mostra_sconti\", pdfImp.pdf_mostra_sconti !== false);");
    expect(pdf).toContain("drawTotal(\"Totale a listino\", fmtEur(prezzi.listino));");
    expect(pdf).toContain("`Voci opzionali, non comprese nel totale: + ${fmtEur(prezzi.opzionali)} IVA inclusa.`");
  });
});

describe("le agevolazioni fiscali", () => {
  it("stessi conti della scheda del costruttore: IVA media del preventivo, detrazione sulla spesa IVA inclusa", () => {
    const a = agevolazioniPreventivo(
      [
        { position: 1, preset_id: "ristrutturazione_50", label: "Ristrutturazione edilizia (Bonus Casa)", imponibile: 12498.75, aliquota_detrazione: 50 },
        { position: 0, preset_id: "ecobonus", label: "Ecobonus — riqualificazione energetica", imponibile: 7000, aliquota_detrazione: 50 },
      ],
      { imponibile: 19498.75, totale: 22945.44 },
    );
    expect(a).not.toBeNull();
    expect(a!.voci.map((v) => v.etichetta)).toEqual(["Ecobonus — riqualificazione energetica", "Ristrutturazione edilizia (Bonus Casa)"]);
    expect(a!.voci[0].spesa).toBe(8237.35);
    expect(a!.voci[0].detrazione).toBe(4118.68);
    expect(a!.detrazione).toBe(11472.73);
    expect(a!.costoDopo).toBe(11472.71);
    expect(a!.bonificoParlante).toBe(true);
  });

  it("la detrazione si ferma al tetto del bonus; mobili e verde non vogliono il bonifico parlante", () => {
    const tetto = DETRAZIONI_EDILIZIE.find((p) => p.id === "bonus_mobili")!.tettoSpesa!;
    const a = agevolazioniPreventivo(
      [{ position: 0, preset_id: "bonus_mobili", label: "Bonus mobili", imponibile: 10000, aliquota_detrazione: 50 }],
      { imponibile: 10000, totale: 12200 },
    );
    expect(a!.voci[0].oltreTetto).toBe(true);
    expect(a!.voci[0].detrazione).toBe(tetto * 0.5);
    expect(a!.bonificoParlante).toBe(false);
  });

  it("senza bonus, o con righe vuote, niente scheda", () => {
    expect(agevolazioniPreventivo(null, { imponibile: 100, totale: 122 })).toBeNull();
    expect(agevolazioniPreventivo([], { imponibile: 100, totale: 122 })).toBeNull();
    expect(agevolazioniPreventivo([{ imponibile: 0 }], { imponibile: 100, totale: 122 })).toBeNull();
  });

  it("i preset delle detrazioni si leggono ancora dal vecchio percorso, e il PDF stampa i bonus salvati sul preventivo", () => {
    expect(DETRAZIONI_EDILIZIE.find((p) => p.id === "ecobonus")?.tettoSpesa).toBe(60_000);
    const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");
    expect(pdf).toContain("agevolazioniPreventivo((quote as any).bonus_lines, { imponibile: round2q(subTotShown - scontoShown), totale: totShown })");
  });
});
