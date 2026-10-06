/**
 * L'indirizzo dei lavori (06/10/2026): quando i lavori sono «allo stesso indirizzo del cliente», come si legge
 * da un preventivo, come si scrive in una riga, e cosa ne fanno l'anteprima e il PDF.
 */
import { describe, expect, it } from "vitest";
import {
  indirizziUguali, indirizziUgualiStretti, indirizzoVuoto, lavoriDiversiDalCliente, leggiIndirizzo, norma, testoIndirizzo,
  valoreDaCopiare, type Indirizzo,
} from "@/lib/preventivatore/indirizzoLavori";
import { anteprimaSerramenti } from "@/lib/serramenti/anteprima";
import { isWizardStepComplete } from "@/pages/azienda/serramenti/SerramentiWizard/helpers";

const CLIENTE: Indirizzo = { indirizzo: "Via Tortona 33", citta: "Milano", cap: "20121", provincia: "MI" };
const VUOTO: Indirizzo = { indirizzo: null, citta: null, cap: null, provincia: null };

describe("norma", () => {
  it("toglie spazi ai bordi e doppi, e le maiuscole", () => {
    expect(norma("  Via   Roma  1 ")).toBe("via roma 1");
    expect(norma(null)).toBe("");
    expect(norma(undefined)).toBe("");
  });
});

describe("leggiIndirizzo", () => {
  it("legge i quattro campi del cliente o del cantiere; vuoto e spazi sono «niente»", () => {
    const p: Record<string, unknown> = {
      cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", cliente_cap: "20121", cliente_provincia: "MI",
      cantiere_indirizzo: "   ", cantiere_citta: "", cantiere_cap: null, cantiere_provincia: 5,
    };
    expect(leggiIndirizzo(p, "cliente")).toEqual(CLIENTE);
    expect(leggiIndirizzo(p, "cantiere")).toEqual(VUOTO);
    expect(indirizzoVuoto(leggiIndirizzo(p, "cantiere"))).toBe(true);
    expect(indirizzoVuoto(leggiIndirizzo(p, "cliente"))).toBe(false);
  });
});

describe("indirizziUguali: i lavori sono allo stesso indirizzo del cliente?", () => {
  it("con i lavori vuoti sì, anche se il cliente ha l'indirizzo (così dicevano «stesso» i preventivi di prima)", () => {
    expect(indirizziUguali(CLIENTE, VUOTO)).toBe(true);
    expect(indirizziUguali(VUOTO, VUOTO)).toBe(true);
  });

  it("con gli stessi valori sì, senza badare a maiuscole e spazi", () => {
    expect(indirizziUguali(CLIENTE, CLIENTE)).toBe(true);
    expect(indirizziUguali(CLIENTE, { ...CLIENTE, indirizzo: "via  tortona 33 ", provincia: "mi" })).toBe(true);
  });

  it("scritti solo alcuni campi, ma uguali: sì; basta uno diverso: no", () => {
    expect(indirizziUguali(CLIENTE, { ...VUOTO, citta: "Milano" })).toBe(true);
    expect(indirizziUguali(CLIENTE, { ...VUOTO, citta: "Torino" })).toBe(false);
    expect(indirizziUguali(CLIENTE, { ...CLIENTE, cap: "10121" })).toBe(false);
    expect(indirizziUguali(CLIENTE, { ...CLIENTE, provincia: "TO" })).toBe(false);
    // Stessa via in un'altra città: è un altro cantiere (il PDF di prima non se ne accorgeva).
    expect(indirizziUguali(CLIENTE, { ...CLIENTE, citta: "Torino" })).toBe(false);
  });

  it("il cliente senza indirizzo e i lavori scritti: sono altrove", () => {
    expect(indirizziUguali(VUOTO, { ...VUOTO, indirizzo: "Via Roma 4" })).toBe(false);
  });
});

describe("indirizziUgualiStretti: negli edili «vuoto» non è «uguale»", () => {
  it("serve qualcosa di scritto, e tutti i campi uguali (senza badare a maiuscole e spazi)", () => {
    expect(indirizziUgualiStretti(CLIENTE, CLIENTE)).toBe(true);
    expect(indirizziUgualiStretti(CLIENTE, { ...CLIENTE, indirizzo: "via  tortona 33 ", provincia: "mi" })).toBe(true);
    // Il contatto ha un indirizzo e il cantiere è vuoto: sono due cose diverse (da qui la spunta spenta).
    expect(indirizziUgualiStretti(CLIENTE, VUOTO)).toBe(false);
    expect(indirizziUgualiStretti(VUOTO, VUOTO)).toBe(false);
    expect(indirizziUgualiStretti(CLIENTE, { ...CLIENTE, cap: "20122" })).toBe(false);
    // A differenza di indirizziUguali, che per i serramenti conta il vuoto come «stesso indirizzo».
    expect(indirizziUguali(CLIENTE, VUOTO)).toBe(true);
  });
});

describe("valoreDaCopiare: cosa si scrive copiando un campo", () => {
  it("vuoto = null; la provincia sempre in maiuscolo (un contatto del CRM può averla «mi»); il resto tale e quale", () => {
    expect(valoreDaCopiare("provincia", "mi")).toBe("MI");
    expect(valoreDaCopiare("provincia", "MI")).toBe("MI");
    expect(valoreDaCopiare("citta", "Monza")).toBe("Monza");
    expect(valoreDaCopiare("cap", "20900")).toBe("20900");
    expect(valoreDaCopiare("indirizzo", "via Roma 1")).toBe("via Roma 1");
    expect(valoreDaCopiare("citta", "")).toBeNull();
    expect(valoreDaCopiare("citta", null)).toBeNull();
    expect(valoreDaCopiare("provincia", undefined)).toBeNull();
  });
});

describe("lavoriDiversiDalCliente (su un preventivo)", () => {
  const preventivo = (extra: Record<string, unknown> = {}) => ({
    cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", cliente_cap: "20121", cliente_provincia: "MI", ...extra,
  });

  it("cantiere vuoto o uguale: no; scritto e diverso: sì", () => {
    expect(lavoriDiversiDalCliente(preventivo())).toBe(false);
    expect(lavoriDiversiDalCliente(preventivo({ cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano" }))).toBe(false);
    expect(lavoriDiversiDalCliente(preventivo({ cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza" }))).toBe(true);
  });
});

describe("testoIndirizzo", () => {
  it("una riga sola: via, CAP e città, provincia fra parentesi", () => {
    expect(testoIndirizzo(CLIENTE)).toBe("Via Tortona 33, 20121 Milano (MI)");
  });

  it("senza i pezzi che mancano non restano virgole né parentesi vuote", () => {
    expect(testoIndirizzo({ ...CLIENTE, cap: null })).toBe("Via Tortona 33, Milano (MI)");
    expect(testoIndirizzo({ ...CLIENTE, provincia: null })).toBe("Via Tortona 33, 20121 Milano");
    expect(testoIndirizzo({ ...VUOTO, citta: "Milano" })).toBe("Milano");
    expect(testoIndirizzo({ ...VUOTO, provincia: "MI" })).toBe("MI");
    expect(testoIndirizzo(VUOTO)).toBe("");
  });
});

describe("anteprima a destra: la riga «Cantiere»", () => {
  const OGGI = new Date("2026-10-06T10:00:00Z");
  const del = (extra: Record<string, unknown>) =>
    anteprimaSerramenti({
      cliente_nome: "Anna", cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", cliente_cap: "20121", cliente_provincia: "MI",
      ...extra,
    } as Parameters<typeof anteprimaSerramenti>[0], undefined, { oggi: OGGI });

  it("lavori allo stesso indirizzo (anche copiato): la riga non ripete l'indirizzo del cliente", () => {
    expect(del({}).cantiere).toBeNull();
    expect(del({ cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano", cantiere_cap: "20121", cantiere_provincia: "MI" }).cantiere).toBeNull();
  });

  it("stesso indirizzo ma con il piano: resta solo il piano", () => {
    expect(del({ cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano", cantiere_piano: "3° con ascensore" }).cantiere)
      .toBe("stesso indirizzo · piano 3° con ascensore");
  });

  it("lavori altrove: via, CAP e città, provincia e piano", () => {
    expect(del({ cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino", cantiere_cap: "10121", cantiere_provincia: "TO", cantiere_piano: "2" }).cantiere)
      .toBe("Via Roma 12, 10121 Torino, TO, piano 2");
  });
});

describe("passo «Immobile»: l'indirizzo non conta più per dirlo completo", () => {
  it("restano il tipo di intervento e il piano", () => {
    expect(isWizardStepComplete("immobile", { cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza" })).toBe(false);
    expect(isWizardStepComplete("immobile", { tipo_intervento: "sostituzione" })).toBe(true);
    expect(isWizardStepComplete("immobile", { cantiere_piano: "2" })).toBe(true);
  });
});
