// Le colonne di un elenco le decide l'azienda (26/11/2026).
//
// La logica sta in `src/lib/tabelle/colonneTabella.ts`. Qui si controllano i casi che
// fanno male in produzione: una colonna sparita dal codice ma rimasta nella preferenza,
// una colonna nuova che deve comparire anche a chi ha già toccato le impostazioni, e una
// colonna fissa che nessuna preferenza vecchia può spegnere.
import { describe, expect, it } from "vitest";
import {
  type ColonnaTabella,
  type PreferenzaColonne,
  chiaviVisibili,
  colonneVisibili,
  conColonnaAccesa,
  conColonnaSpostata,
  preferenzaToccata,
  siPuoNascondere,
  statoColonne,
} from "@/lib/tabelle/colonneTabella";

const DEF: ColonnaTabella[] = [
  { chiave: "spunta", etichetta: "Selezione", ancorata: "inizio", fissa: true },
  { chiave: "numero", etichetta: "Numero", fissa: true },
  { chiave: "cliente", etichetta: "Cliente" },
  { chiave: "scadenza", etichetta: "Scadenza" },
  { chiave: "totale", etichetta: "Totale" },
  { chiave: "cig", etichetta: "CIG", spentaDiSerie: true },
  { chiave: "azioni", etichetta: "Azioni", ancorata: "fine", fissa: true },
];

const chiavi = (pref?: PreferenzaColonne) => colonneVisibili(DEF, pref).map((c) => c.chiave);

describe("di serie", () => {
  it("mostra le colonne dichiarate nel loro ordine, le ancorate agli estremi", () => {
    expect(chiavi()).toEqual(["spunta", "numero", "cliente", "scadenza", "totale", "azioni"]);
  });

  it("tiene fuori quelle spente di serie finché nessuno le accende", () => {
    expect(chiavi()).not.toContain("cig");
    expect(chiavi(conColonnaAccesa(DEF, undefined, "cig", true))).toContain("cig");
  });

  it("il CIG riaccese torna al suo posto, non in fondo", () => {
    const pref = conColonnaAccesa(DEF, undefined, "cig", true);
    expect(chiavi(pref)).toEqual(["spunta", "numero", "cliente", "scadenza", "totale", "cig", "azioni"]);
  });
});

describe("spegnere e riaccendere", () => {
  it("spegne una colonna e la ricorda come spenta per scelta", () => {
    const pref = conColonnaAccesa(DEF, undefined, "scadenza", false);
    expect(chiavi(pref)).toEqual(["spunta", "numero", "cliente", "totale", "azioni"]);
    expect(pref.nascoste).toContain("scadenza");
  });

  it("una colonna fissa non si spegne, nemmeno chiedendolo", () => {
    expect(siPuoNascondere(DEF[1])).toBe(false);
    const pref = conColonnaAccesa(DEF, undefined, "numero", false);
    expect(chiavi(pref)).toContain("numero");
  });

  it("una preferenza vecchia che nascondeva una colonna diventata fissa non la perde", () => {
    const vecchia: PreferenzaColonne = { ordine: ["cliente", "totale"], nascoste: ["numero", "scadenza"] };
    expect(chiavi(vecchia)).toContain("numero");
    expect(chiavi(vecchia)).not.toContain("scadenza");
  });

  it("riaccesa, torna al suo posto di serie", () => {
    const spenta = conColonnaAccesa(DEF, undefined, "cliente", false);
    const riaccesa = conColonnaAccesa(DEF, spenta, "cliente", true);
    expect(chiavi(riaccesa)).toEqual(["spunta", "numero", "cliente", "scadenza", "totale", "azioni"]);
  });
});

describe("l'ordine", () => {
  it("rispetta l'ordine salvato", () => {
    const pref: PreferenzaColonne = { ordine: ["totale", "numero", "cliente", "scadenza"], nascoste: [] };
    expect(chiavi(pref)).toEqual(["spunta", "totale", "numero", "cliente", "scadenza", "azioni"]);
  });

  it("sposta una colonna dove le si dice", () => {
    const pref = conColonnaSpostata(DEF, undefined, "totale", 0);
    expect(chiavi(pref)).toEqual(["spunta", "totale", "numero", "cliente", "scadenza", "azioni"]);
  });

  it("non lascia uscire dai bordi né sposta chi non è visibile", () => {
    expect(chiavi(conColonnaSpostata(DEF, undefined, "numero", 99)).at(-2)).toBe("numero");
    expect(chiavi(conColonnaSpostata(DEF, undefined, "cig", 0))).not.toContain("cig");
  });

  it("le ancorate non si spostano: restano agli estremi", () => {
    const pref = conColonnaSpostata(DEF, undefined, "azioni", 0);
    const fuori = chiavi(pref);
    expect(fuori[0]).toBe("spunta");
    expect(fuori.at(-1)).toBe("azioni");
  });
});

describe("quando la pagina cambia", () => {
  it("ignora una colonna che non esiste più nel codice", () => {
    const pref: PreferenzaColonne = { ordine: ["numero", "iban_vecchio", "cliente"], nascoste: ["sparita"] };
    expect(chiavi(pref)).toEqual(["spunta", "numero", "cliente", "scadenza", "totale", "azioni"]);
  });

  it("una colonna nuova compare anche a chi ha già una preferenza salvata", () => {
    // La preferenza è stata scritta quando «scadenza» non esisteva ancora.
    const vecchia: PreferenzaColonne = { ordine: ["numero", "cliente", "totale"], nascoste: [] };
    expect(chiavi(vecchia)).toEqual(["spunta", "numero", "cliente", "scadenza", "totale", "azioni"]);
  });

  it("ma una spenta a mano resta spenta anche dopo", () => {
    const vecchia: PreferenzaColonne = { ordine: ["numero", "cliente"], nascoste: ["scadenza", "totale"] };
    expect(chiavi(vecchia)).toEqual(["spunta", "numero", "cliente", "azioni"]);
  });

  it("non duplica una colonna ripetuta nella preferenza", () => {
    const sporca: PreferenzaColonne = { ordine: ["numero", "numero", "cliente"], nascoste: [] };
    expect(chiavi(sporca).filter((k) => k === "numero")).toHaveLength(1);
  });
});

describe("il pannellino", () => {
  it("elenca prima le accese nell'ordine scelto, poi le spente", () => {
    const pref = conColonnaAccesa(DEF, undefined, "cliente", false);
    expect(statoColonne(DEF, pref)).toEqual([
      { colonna: DEF[1], accesa: true },
      { colonna: DEF[3], accesa: true },
      { colonna: DEF[4], accesa: true },
      { colonna: DEF[2], accesa: false },
      { colonna: DEF[5], accesa: false },
    ]);
  });

  it("non elenca le ancorate: non si toccano", () => {
    const elencate = statoColonne(DEF).map((s) => s.colonna.chiave);
    expect(elencate).not.toContain("spunta");
    expect(elencate).not.toContain("azioni");
  });

  it("«Ripristina predefinite» si offre solo se qualcosa è stato cambiato", () => {
    expect(preferenzaToccata(undefined)).toBe(false);
    expect(preferenzaToccata({ ordine: [], nascoste: [] })).toBe(false);
    expect(preferenzaToccata(conColonnaAccesa(DEF, undefined, "cliente", false))).toBe(true);
  });
});

describe("chiaviVisibili", () => {
  it("dà l'insieme da interrogare dentro la riga", () => {
    const visibili = chiaviVisibili(DEF, conColonnaAccesa(DEF, undefined, "totale", false));
    expect(visibili.has("cliente")).toBe(true);
    expect(visibili.has("totale")).toBe(false);
  });
});
