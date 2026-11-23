import { describe, expect, it } from "vitest";
import { completaBolla } from "@/lib/ddt/rileggiBolla";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";

const letta = leggiDDTdaAI({
  intestazione: { numero_ddt: "4727/05" },
  vettore: { tipo: "mittente", autista: "Mario Bianchi", note: "Targa AB 123 CD" },
  righe_merce: [
    { codice_articolo: "RCK35S4-S", descrizione: "Cls C 28-35 S4 XC1XC2", quantita: 4, unita_misura: "m3" },
    { codice_articolo: "214", descrizione: "214 INTEGRAZIONE VIAGGIO", quantita: 1, unita_misura: "Nr" },
  ],
});

describe("rileggere l'originale di una bolla scritta a mano (23/11/2026)", () => {
  it("propone solo la riga che manca e i dati del trasporto vuoti", () => {
    const c = completaBolla(letta, [{ codice_articolo: "rck35s4-s", descrizione: "cls c 28-35 s4 xc1xc2", posizione: 1 }],
      { targa_mezzo: null, autista_nome: null, corriere: null, trasporto_a_cura_di: null, porto: null });
    expect(c.righe.map((r) => [r.posizione, r.descrizione, r.quantita])).toEqual([[2, "214 INTEGRAZIONE VIAGGIO", 1]]);
    expect(c.campi).toMatchObject({ autista_nome: "Mario Bianchi", trasporto_a_cura_di: "fornitore" });
  });
  it("lo stesso calcestruzzo scritto diverso non si duplica; i campi scritti non si toccano", () => {
    const c = completaBolla(letta, [
      { codice_articolo: null, descrizione: "Calcestruzzo C28/35 S4 XC1 XC2", posizione: 1 },
      { codice_articolo: "214", descrizione: "trasporto", posizione: 2 },
    ], { targa_mezzo: "XX000XX", autista_nome: "Già scritto", corriere: null, trasporto_a_cura_di: "terzi", porto: null });
    expect(c.righe).toEqual([]);
    expect(c.campi.autista_nome).toBeUndefined();
    expect(c.campi.targa_mezzo).toBeUndefined();
    expect(c.campi.trasporto_a_cura_di).toBeUndefined();
  });
});
