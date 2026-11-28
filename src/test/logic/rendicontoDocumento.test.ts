/**
 * Il rendiconto giornaliero che diventa documento (28/11/2026): quale modello PDF prende, e che cosa
 * finisce in ogni colonna. Un giorno di soli viaggi va sul modello dei trasporti (carico → scarico,
 * km, mezzo, DDT); un giorno misto resta sull'economia, col viaggio nella nota della riga.
 */
import { expect, it } from "vitest";
import { documentoDaRendiconto, soloTrasporti } from "@/lib/documentiOperativi/preparaRendicontoGiornaliero";
import { celleRiga, colonneDocumento, titoloDocumento } from "@/lib/documentiOperativi/modello";
import type { DettaglioRendiconto, RigaRendiconto } from "@/lib/rendiconti/rendicontiGiornalieri";

const riga = (o: Partial<RigaRendiconto> = {}): RigaRendiconto => ({
  chiave: "k", categoria: "voce", descrizione: "Voce", unita: "cad", quantita: 1, prezzo_unitario: 10,
  prezzo_a_mano: true, prezzo_fonte: "manuale", listino_voce_id: null, appalto_tariffa_id: null,
  employee_id: null, subappaltatore_id: null, mezzo_id: null, fase_id: null, da_rapportino_id: null,
  maggiorazione_pct: 0, note: null, viaggio: null, ...o,
});

const dettaglio = (righe: RigaRendiconto[], stato: "bozza" | "confermato" = "confermato"): DettaglioRendiconto => ({
  testata: {
    id: "g1", order_id: "o1", data: "2026-12-22", numero: 13, stato, descrizione_lavori: "Trasporti del giorno",
    note: null, rapportino_id: null, righe: righe.length, totale: 0, senza_prezzo: 0, sal_id: null,
    rapportini: 0, rapportini_nuovi: 0, rapportini_ritirati: 0,
    n_manodopera: 0, n_mezzi: 0, n_trasporti: righe.length, n_materiali: 0, n_voci: 0,
  },
  righe,
});

const viaggio = riga({
  categoria: "trasporto", descrizione: "Trasporto", unita: "viaggio", quantita: 1, prezzo_unitario: 180,
  viaggio: { carico: "Cava Rossi, Verona", scarico: "Cantiere Via Po", mezzo: "AB 123 CD", ddt: "418", km: "55" },
});

const destinatario = { nome: "Committente S.r.l." };

it("un giorno di soli viaggi prende il modello dei trasporti, con la tratta in colonna", () => {
  expect(soloTrasporti([viaggio])).toBe(true);
  const d = documentoDaRendiconto(dettaglio([viaggio]), destinatario, "DEMO2-0031");
  expect(d.tipo).toBe("trasporti");
  expect(titoloDocumento(d)).toBe("Rendiconto trasporti");
  expect(colonneDocumento(d)).toEqual([
    "Data", "Carico / scarico", "Km", "Quantità e tariffa", "Mezzo", "Ore uomo", "Ore mezzo", "DDT", "Importo",
  ]);
  const celle = celleRiga(d, d.righe[0], 0);
  expect(celle[0]).toBe("22/12/2026");
  expect(celle[1]).toBe("Cava Rossi, Verona → Cantiere Via Po");
  expect(celle[2]).toBe("55");
  expect(celle[4]).toBe("AB 123 CD");
  expect(celle[7]).toBe("418");
  expect(celle[8]).toContain("180");
});

it("una bozza di trasporti esce come bozza", () => {
  expect(documentoDaRendiconto(dettaglio([viaggio], "bozza"), destinatario, null).bozza).toBe(true);
});

it("un giorno misto resta sull'economia, col viaggio nella nota della riga", () => {
  const persona = riga({ categoria: "manodopera", descrizione: "Mario Rossi", unita: "ora", quantita: 8, prezzo_unitario: 32 });
  expect(soloTrasporti([persona, viaggio])).toBe(false);
  const d = documentoDaRendiconto(dettaglio([persona, viaggio]), destinatario, null);
  expect(d.tipo).toBe("economia");
  expect(titoloDocumento(d)).toBe("Rendiconto giornaliero");
  // Le righe seguono l'ordine delle categorie: prima la manodopera, poi i trasporti.
  expect(d.righe.map((r) => r.gruppo)).toEqual(["Manodopera", "Trasporti"]);
  expect(d.righe[1].nota).toBe("Cava Rossi, Verona → Cantiere Via Po · AB 123 CD · DDT 418 · 55 km");
});

it("un trasporto senza viaggio non cambia modello: resta l'economia", () => {
  const senza = riga({ categoria: "trasporto", descrizione: "Trasporto a corpo", unita: "viaggio" });
  expect(soloTrasporti([senza])).toBe(false);
  expect(documentoDaRendiconto(dettaglio([senza]), destinatario, null).tipo).toBe("economia");
});
