import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { documentoDaRendiconto } from "@/lib/documentiOperativi/preparaRendicontoGiornaliero";
import type { DettaglioRendiconto, RigaRendiconto } from "@/lib/rendiconti/rendicontiGiornalieri";

const riga = (o: Partial<RigaRendiconto>): RigaRendiconto => ({
  chiave: "x", categoria: "voce", descrizione: "Voce", unita: "cad", quantita: 1, prezzo_unitario: 10, prezzo_a_mano: false,
  prezzo_fonte: "generale", listino_voce_id: null, employee_id: null, mezzo_id: null, fase_id: null, note: null, ...o,
});
const dett = (stato: "bozza" | "confermato"): DettaglioRendiconto => ({
  testata: { id: "g", order_id: "o", data: "2026-11-20", numero: 7, stato, descrizione_lavori: "Massetto", note: null, rapportino_id: null, righe: 2, totale: 0, senza_prezzo: 0, sal_id: null, rapportini: 0, rapportini_nuovi: 0 },
  righe: [riga({ categoria: "materiale", descrizione: "Sabbia", quantita: 2, prezzo_unitario: 5 }), riga({ categoria: "manodopera", descrizione: "Mario", unita: "ora", quantita: 8, prezzo_unitario: 30 })],
});

it("raggruppa per categoria, calcola gli importi e marca la bozza", () => {
  const d = documentoDaRendiconto(dett("bozza"), { nome: "Cliente srl" }, "C-1");
  expect(d).toMatchObject({ tipo: "economia", numero: "7", data: "2026-11-20", commessa: "C-1", bozza: true, note: "Massetto" });
  expect(d.righe.map((r) => [r.gruppo, r.descrizione, r.importo])).toEqual([["Manodopera", "Mario", 240], ["Materiali", "Sabbia", 10]]);
});

it("un rendiconto confermato non è una bozza", () => {
  expect(documentoDaRendiconto(dett("confermato"), { nome: "C" }, null).bozza).toBeUndefined();
});
