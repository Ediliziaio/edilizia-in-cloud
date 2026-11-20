import { expect, it } from "vitest";
import { parseContractExtract } from "@/lib/orders/contractExtract";
import { avvisiCoperturaLettura, integraCostiEspliciti } from "@/lib/orders/completezzaLettura";
const testo = "TOTALE OPERE EDILI € 79.209,55 MANODOPERA Operaio/i specializzato: presenza di nr 4 operai - Ore normali (36 settimanali) - 40% del totale opere edili € 31.683,82 IMPIANTO ELETTRICO";
it("recupera il costo esplicito della manodopera senza trasformare quattro operai in quattro acquisti", () => {
  const prima = parseContractExtract({ voci: [] });
  const r = integraCostiEspliciti(prima, [testo]);
  expect(r.voci).toHaveLength(1);
  expect(r.voci[0]).toMatchObject({ quantita: 1, unita: "a corpo", quantita_da_confermare: true, natura: "lavorazione", prezzo_unitario_eur: 31683.82 });
  expect(integraCostiEspliciti(r, [testo]).voci).toHaveLength(1);
  expect(prima.voci).toHaveLength(0);
});
it("non ricostruisce costi se il valore non coincide con percentuale e base stampate", () => {
  expect(integraCostiEspliciti(parseContractExtract({ voci: [] }), [testo.replace("31.683,82", "41.683,82")]).voci).toHaveLength(0);
});
it("segnala la risposta vuota e la mancata quadratura senza correggere gli importi", () => {
  expect(avvisiCoperturaLettura(parseContractExtract({ dati_appalto: { stima_eur: 100 }, voci: [] }))[0]).toMatch(/incompleta/);
  const e = parseContractExtract({ importo_totale_eur: 10500, voci: [{ descrizione: "Impianto a corpo", quantita: 1, prezzo_unitario_eur: 7100 }] });
  expect(avvisiCoperturaLettura(e)[0]).toMatch(/3\.?400,00/);
  expect(e.voci[0].prezzo_unitario_eur).toBe(7100);
});
