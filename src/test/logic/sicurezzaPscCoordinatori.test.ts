/**
 * PSC, coordinatori e committente (09/11/2026).
 *
 * Prima: il PSC era una frase dentro le note di un altro adempimento, i
 * coordinatori non esistevano, il POS delle ditte era un controllo a
 * posteriori, e il committente — che l'app nomina nella notifica e sul
 * cartello — non si poteva scrivere da nessuna parte.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adempimentiPrimaDiPartire,
  SOGLIA_UOMINI_GIORNO,
} from "../../../shared/silvio-commessa/partenza.ts";
import { RUOLI_INCARICO } from "@/lib/sicurezza/fascicolo";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

const conDitte = (ditte: number) =>
  adempimentiPrimaDiPartire({
    lavoro: "Ristrutturazione appartamento",
    inizio: "2026-12-09",
    ditte,
    fasi: [{ nome: "Demolizioni", dal: "2026-12-09", al: "2026-12-11" }],
  });

describe("Il committente si può finalmente scrivere", () => {
  it("è fra i ruoli del cantiere, ed è il primo della catena", () => {
    expect(RUOLI_INCARICO.committente).toBe("Committente");
    expect(Object.keys(RUOLI_INCARICO)[0]).toBe("committente");
  });

  it("il database lo accetta", () => {
    const sql = leggi(
      "supabase/migrations/20290114100000_incarichi_il_committente.sql",
    );
    expect(sql).toContain("sicurezza_incarichi_ruolo_check");
    expect(sql).toMatch(/check \([\s\S]*'committente'/);
    // Gli altri ruoli restano: non si toglie niente a chi è già registrato.
    for (const r of ["csp", "cse", "responsabile_lavori", "preposto"]) {
      expect(sql).toContain(`'${r}'`);
    }
  });
});

describe("Con più imprese nascono tre scadenze che prima non c'erano", () => {
  const a = conDitte(2);
  const tipi = a.map((x) => x.tipo);

  it("i coordinatori si chiedono al committente, dieci giorni prima", () => {
    expect(tipi).toContain("nomina_coordinatori");
    const v = a.find((x) => x.tipo === "nomina_coordinatori")!;
    expect(v.scadenza).toBe("2026-11-24");
    expect(v.testo).toMatch(/committente deve nominare/);
  });

  it("il PSC arriva prima del POS, perché il POS gli deve andare dietro", () => {
    const psc = a.find((x) => x.tipo === "psc")!;
    const pos = a.find((x) => x.tipo === "pos_ditte")!;
    expect(psc.scadenza! < pos.scadenza!).toBe(true);
    expect(psc.testo).toMatch(/senza PSC i lavori non possono partire/);
    // Non è un documento dell'impresa: è del committente, e si chiede.
    expect(psc.titolo).toMatch(/dal committente/);
  });

  it("il POS di ogni ditta si pretende prima che entri", () => {
    const v = a.find((x) => x.tipo === "pos_ditte")!;
    expect(v.titolo).toContain("2 ditte");
    expect(v.testo).toMatch(/non entra/);
  });
});

describe("Con un'impresa sola", () => {
  it("PSC e coordinatori non servono: non si inventano obblighi", () => {
    const tipi = conDitte(0).map((x) => x.tipo);
    expect(tipi).not.toContain("psc");
    expect(tipi).not.toContain("nomina_coordinatori");
    expect(tipi).not.toContain("pos_ditte");
  });

  it("la mole dei lavori fa scattare la notifica, non il PSC", () => {
    // Art. 99 guarda gli uomini-giorno; l'art. 90 c. 3 guarda quante imprese.
    const grande = adempimentiPrimaDiPartire({
      lavoro: "Impianto elettrico capannone",
      inizio: "2027-02-01",
      ditte: 0,
      fasi: [{ nome: "Impianto", dal: null, al: null, giorni: 60, persone: 4 }],
    });
    expect(grande.map((x) => x.tipo)).toEqual(["notifica_preliminare"]);
    expect(grande[0].testo).toContain(`${SOGLIA_UOMINI_GIORNO}`);
  });
});

describe("I nomi si leggono in italiano", () => {
  it("lo scadenzario non stampa più le parole in codice", () => {
    const pagina = leggi("src/pages/azienda/SicurezzaCantiere.tsx");
    expect(pagina).toContain("nomeTipoAdempimento(a.tipo)");
    expect(pagina).not.toContain('a.tipo?.replace(/_/g, " ")');
  });

  it("i tipi nuovi hanno un nome, in app e negli avvisi", () => {
    const lib = leggi("src/lib/sicurezza/scadenzeCommessa.ts");
    const fn = leggi("supabase/functions/hr-check-scadenze/index.ts");
    for (const t of ["psc", "nomina_coordinatori", "pos_ditte"]) {
      expect(lib).toContain(`${t}:`);
      expect(fn).toContain(`${t}:`);
    }
  });
});
