/**
 * Moduli di vendita: niente promesse che il prodotto non mantiene (25/09/2026).
 *
 * L'audit dei preventivatori ha trovato:
 *   · il Preventivatore Serramenti proponeva ancora «65% Ecobonus», che dal 2025
 *     non esiste (src/lib/preventivi/incentivi.ts: 50% abitazione principale,
 *     36% le altre, tetto 96.000 €), con un tetto di 60.000 € scritto a mano;
 *   · le schede dei moduli promettevano Conto Termico, Ecobonus 65%, Superbonus,
 *     stratigrafie certificate, subappalti e un «PDF a 3 pagine» che nessun
 *     preventivatore fa.
 *
 * Tiene fermo:
 *   · Serramenti propone solo le aliquote del catalogo condiviso;
 *   · un 65% salvato in passato si mostra al 50%, mai come 65%;
 *   · il filtro dell'elenco serramenti non cerca più il 65%;
 *   · nessuna scheda di modulo promette quelle cose.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MODULI_VENDITA } from "@/lib/moduli-vendita/config";
import { INCENTIVI_SERRAMENTI } from "@/lib/preventivi/incentivi";
import {
  ALIQUOTE_DETRAZIONE_SERRAMENTI,
  aliquotaDetrazioneSerramenti,
  calcolaEcobonus,
} from "@/lib/serramenti/ecobonus";
import { BONUS_OPTIONS } from "@/pages/azienda/serramenti/SerramentiIndex/constants";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("serramenti: la detrazione del 2026", () => {
  it("propone solo le aliquote del catalogo condiviso: 50% prima casa, 36% le altre", () => {
    expect(ALIQUOTE_DETRAZIONE_SERRAMENTI.map((i) => i.pct)).toEqual([50, 36]);
    expect(INCENTIVI_SERRAMENTI.some((i) => i.pct === 65)).toBe(false);
  });

  it("un valore salvato che non si può più proporre si mostra al 50%", () => {
    expect(aliquotaDetrazioneSerramenti(65)).toBe(50);
    expect(aliquotaDetrazioneSerramenti(null)).toBe(50);
    expect(aliquotaDetrazioneSerramenti(36)).toBe(36);
    expect(aliquotaDetrazioneSerramenti(50)).toBe(50);
  });

  it("il tetto di spesa è quello del catalogo, 96.000 €", () => {
    const calcolo = calcolaEcobonus({ imponibile_eur: 150_000, aliquota: 50 });
    expect(calcolo.base_calcolo).toBe(96_000);
    expect(calcolo.detrazione_totale).toBe(48_000);
    expect(calcolo.rata_annuale).toBe(4_800);
  });

  it("l'economia del preventivo e il filtro dell'elenco non scrivono aliquote a mano", () => {
    const economia = leggi("src/components/serramenti/StepEconomia.tsx");
    expect(economia).not.toMatch(/value="65"|65% Ecobonus|50 \| 65/);
    expect(economia).toContain("ALIQUOTE_DETRAZIONE_SERRAMENTI.map(");
    expect(BONUS_OPTIONS.map((o) => o.value)).toEqual(["any", "50", "36", "none"]);
    expect(leggi("src/pages/azienda/serramenti/SerramentiIndex.tsx")).not.toMatch(/=== "65"|!== 65/);
  });
});

describe("le schede dei moduli dicono solo quello che c'è", () => {
  it.each(MODULI_VENDITA)("$slug", (modulo) => {
    const testo = [modulo.tagline, modulo.descrizione, ...modulo.benefici].join(" · ");
    expect(testo).not.toMatch(/conto termico|65\s*%|50\/65|superbonus|stratigrafi|subappalt|3 pagine/i);
  });
});
