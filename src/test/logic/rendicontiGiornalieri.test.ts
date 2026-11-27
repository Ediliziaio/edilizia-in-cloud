import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (f: string, a: object) => rpc(f, a) } }));
import {
  avvisoUnitaVoce, importoRiga, payloadSalva, puoCopiare, rendicontoCopia, salvaPrezzoPerCommittente, senzaPrezzo, unisciVoci,
  type RigaRendiconto, type VoceListinoCommittente,
} from "@/lib/rendiconti/rendicontiGiornalieri";

const riga = (o: Partial<RigaRendiconto>): RigaRendiconto => ({
  chiave: "x", categoria: "manodopera", descrizione: "Voce", unita: "ora", quantita: 8, prezzo_unitario: null, prezzo_a_mano: false,
  prezzo_fonte: null, listino_voce_id: null, appalto_tariffa_id: null, employee_id: null, subappaltatore_id: null, mezzo_id: null,
  fase_id: null, maggiorazione_pct: 0, note: null, ...o,
});
const bozza = (righe: RigaRendiconto[]) => ({ order_id: "o", data: "2026-11-27", descrizione_lavori: "", note: "", righe });

beforeEach(() => rpc.mockReset());

it("il payload manda la voce del committente, la ditta e la maggiorazione, senza prezzo", () => {
  const p = payloadSalva(bozza([riga({ appalto_tariffa_id: "at1", subappaltatore_id: "s1", maggiorazione_pct: 25 })]));
  expect(p.righe[0]).toMatchObject({ appalto_tariffa_id: "at1", subappaltatore_id: "s1", maggiorazione_pct: 25 });
  expect(p.righe[0]).not.toHaveProperty("prezzo_unitario");
});

it("col prezzo a mano non si manda la voce del committente, ma il prezzo sì", () => {
  const p = payloadSalva(bozza([riga({ appalto_tariffa_id: "at1", prezzo_a_mano: true, prezzo_unitario: 40 })]));
  expect(p.righe[0]).toMatchObject({ prezzo_unitario: 40, prezzo_a_mano: true });
  expect(p.righe[0]).not.toHaveProperty("appalto_tariffa_id");
});

it("senza maggiorazione la chiave non c'è; l'importo la include", () => {
  expect(payloadSalva(bozza([riga({ listino_voce_id: "l1" })])).righe[0]).not.toHaveProperty("maggiorazione_pct");
  expect(importoRiga({ quantita: 2, prezzo_unitario: 30, maggiorazione_pct: 25 })).toBe(75);
  expect(importoRiga({ quantita: 2, prezzo_unitario: 30 })).toBe(60);
});

it("una ditta non ancora salvata non è «senza prezzo»: la tariffa la mette il database", () => {
  expect(senzaPrezzo(riga({ subappaltatore_id: "s1" }))).toBe(false);
  expect(senzaPrezzo(riga({}))).toBe(true);
});

it("la ricerca mette prima il committente e non ripete le voci già collegate", () => {
  const c: VoceListinoCommittente[] = [{ appalto_tariffa_id: "a", tariffa_id: "g1", codice: null, descrizione: "Operaio", unita: "ora", prezzo: 32, fonte: "committente", collegata: true }];
  const u = unisciVoci(c, [{ tariffa_id: "g1" }, { tariffa_id: "g2" }, {}]);
  expect(u.committente).toHaveLength(1);
  expect(u.generale.map((v) => v.tariffa_id)).toEqual(["g2", undefined]);
});

it("salvare il prezzo per il committente chiama la funzione giusta", async () => {
  rpc.mockResolvedValue({ data: { appalto_tariffa_id: "at9", contratto_id: "c", contratto_creato: true }, error: null });
  const e = await salvaPrezzoPerCommittente("o", "l1", 41.5, "ora", "Operaio");
  expect(rpc).toHaveBeenCalledWith("listino_committente_salva_prezzo", { p_order_id: "o", p_listino_voce_id: "l1", p_prezzo: 41.5, p_unita: "ora", p_descrizione: "Operaio" });
  expect(e.contratto_creato).toBe(true);
});

it("la copia chiama la funzione e si offre solo su un rendiconto vuoto in bozza", async () => {
  rpc.mockResolvedValue({ data: { id: "n", numero: 2, stato: "bozza", copiate: 3 }, error: null });
  expect((await rendicontoCopia("orig", "2026-11-28")).copiate).toBe(3);
  expect(rpc).toHaveBeenCalledWith("rendiconto_giornaliero_copia", { p_origine: "orig", p_data: "2026-11-28" });
  expect(puoCopiare("bozza", 0)).toBe(true);
  expect(puoCopiare("bozza", 2)).toBe(false);
  expect(puoCopiare("confermato", 0)).toBe(false);
});

it("l'avviso di unità scatta solo se le unità differiscono", () => {
  expect(avvisoUnitaVoce("ora", "giornata")).toBe(true);
  expect(avvisoUnitaVoce("Ora", "ora")).toBe(false);
  expect(avvisoUnitaVoce("ora", null)).toBe(false);
});
