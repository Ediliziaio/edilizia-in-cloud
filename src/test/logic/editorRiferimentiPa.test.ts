/**
 * Editor del modulo Fatturazione, lotto 4 (15/11/2026): riferimenti PA, ufficio, commessa e
 * cambio cliente nello stato dell'editor, e cosa finisce nel salvataggio.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildSavePayload, editorReducer, riferimentiDelCliente, type EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import { modificaRiferimento, normalizzaRiferimenti, proponiDallaCommessa, riferimentoManuale, togliCommessa } from "../../../supabase/functions/_shared/riferimentiPaFattura";

const ENTE = { ragione_sociale: "Comune di Demolandia", tipo_cliente: "PA" as const, codice_fiscale: "80012345678", codice_sdi: "UFTST2" };
const righe = [
  { id: "r1", numero_linea: 1, descrizione: "Lavori", quantita: 1, unita_misura: "pz", prezzo_unitario: 100, imponibile: 100, aliquota_iva: "22", imposta: 22, totale_riga: 122 },
  { id: "r2", numero_linea: 2, descrizione: "Fornitura", quantita: 1, unita_misura: "pz", prezzo_unitario: 50, imponibile: 50, aliquota_iva: "22", imposta: 11, totale_riga: 61 },
];
const commessa = proponiDallaCommessa({ id: "ord-13", codice: "DEMO2-0013" }, [
  { id: "rp-1", tipo: "contratto", numero: "Rep. 1234/2026", data: "2026-03-01", cig: "1234567ABC", cup: "J51B21000140006" },
]);
const iniziale = (extra: Partial<EditorState> = {}): EditorState =>
  editorReducer({} as EditorState, { type: "INIT", payload: { id: "d1", stato: "bozza", tipo: "fattura_pa", righe, anagrafica_id: "ana-ente", cliente_snapshot: ENTE, ordine_id: "ord-13", riferimenti_pa: commessa, ...extra } as never });

describe("editor: riferimenti PA e ufficio", () => {
  it("l'ufficio scelto diventa il CodiceDestinatario, e si toglie", () => {
    let s = editorReducer(iniziale(), { type: "SET_UFFICIO_PA", ufficio: { id: "uff-1", codice: "UFTST1", descrizione: "Ragioneria", anagrafica_id: "ana-ente", origine: "manuale" } });
    expect(s.ufficio_pa_id).toBe("uff-1");
    expect(s.cliente_snapshot?.codice_sdi).toBe("UFTST1");
    expect(s.cliente_snapshot?.ufficio_pa?.origine).toBe("manuale");
    s = editorReducer(s, { type: "SET_UFFICIO_PA", ufficio: null });
    expect(s.ufficio_pa_id).toBeNull();
    expect(s.cliente_snapshot?.ufficio_pa).toBeUndefined();
  });

  it("cambio cliente: via ufficio e riferimenti dall'anagrafica; restano quelli della commessa (li controlla la coerenza)", () => {
    const dallAnagrafica = proponiDallaCommessa({ id: "ord-13" }, [], [], { id: "ana-ente", cig: "Z1A2B3C4D5" });
    let s = iniziale({ riferimenti_pa: [...commessa, ...dallAnagrafica] });
    s = editorReducer(s, { type: "SET_UFFICIO_PA", ufficio: { id: "uff-2", codice: "UFTST2", anagrafica_id: "ana-ente", origine: "anagrafica" } });
    expect(riferimentiDelCliente(s)).toEqual(expect.arrayContaining(["il riferimento PA dell'anagrafica", "ufficio destinatario"]));
    s = editorReducer(s, { type: "SET_CLIENTE", anagrafica_id: "ana-altro", snapshot: { ...ENTE, ragione_sociale: "Comune B", codice_sdi: "UFBBB1" } });
    expect(s.ufficio_pa_id).toBeNull();
    expect(s.cliente_snapshot?.ufficio_pa).toBeUndefined();
    expect(normalizzaRiferimenti(s.riferimenti_pa).map((r) => r.origine)).toEqual(["commessa"]);
  });

  it("stesso cliente corretto a mano: ufficio e riferimenti restano", () => {
    let s = editorReducer(iniziale(), { type: "SET_UFFICIO_PA", ufficio: { id: "uff-1", codice: "UFTST1", anagrafica_id: "ana-ente", origine: "manuale" } });
    s = editorReducer(s, { type: "SET_CLIENTE", anagrafica_id: "ana-ente", snapshot: { ...ENTE, codice_sdi: "UFTST1", pec: "comune@pec.it" } });
    expect(s.ufficio_pa_id).toBe("uff-1");
    expect(s.cliente_snapshot?.ufficio_pa?.codice).toBe("UFTST1");
    expect(normalizzaRiferimenti(s.riferimenti_pa)).toHaveLength(1);
  });

  it("cliente scelto dall'anagrafica con CIG/CUP: proposti come riferimento «dall'anagrafica» se la fattura non ne ha", () => {
    let s = iniziale({ anagrafica_id: undefined, cliente_snapshot: undefined, riferimenti_pa: [], ordine_id: undefined });
    s = editorReducer(s, { type: "SET_CLIENTE", anagrafica_id: "ana-ente", snapshot: { ...ENTE, cig: "1234567ABC", cup: "J51B21000140006" } });
    const r = normalizzaRiferimenti(s.riferimenti_pa);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ origine: "anagrafica", cig: "1234567ABC", cup: "J51B21000140006", order_id: null });
  });

  it("G: cambio commessa nello stato (SET_COMMESSA) e H: la modifica a mano resta sulla fattura", () => {
    const modificati = [modificaRiferimento(commessa[0], { cig: "Z9Z9Z9Z9Z9" }), riferimentoManuale()];
    let s = editorReducer(iniziale(), { type: "SET_RIFERIMENTI_PA", riferimenti: modificati });
    expect(normalizzaRiferimenti(s.riferimenti_pa)[0]).toMatchObject({ cig: "Z9Z9Z9Z9Z9", modificato: true });
    const { risultato } = togliCommessa(normalizzaRiferimenti(s.riferimenti_pa), "ord-13");
    s = editorReducer(s, { type: "SET_COMMESSA", ordine_id: "ord-15", riferimenti: risultato });
    expect(s.ordine_id).toBe("ord-15");
    expect(normalizzaRiferimenti(s.riferimenti_pa).map((r) => r.origine)).toEqual(["manuale"]);
  });

  it("K: il salvataggio porta riferimenti (righe riallineate), ufficio, commessa e colonne vecchie allineate", () => {
    let s = editorReducer(iniziale(), { type: "SET_RIFERIMENTI_PA", riferimenti: [{ ...commessa[0], righe_id: ["r2", "riga-tolta"] }] });
    s = editorReducer(s, { type: "SET_UFFICIO_PA", ufficio: { id: "uff-1", codice: "UFTST1", anagrafica_id: "ana-ente", origine: "manuale" } });
    const p = buildSavePayload(s) as Record<string, unknown>;
    expect(p.ordine_id).toBe("ord-13");
    expect(p.ufficio_pa_id).toBe("uff-1");
    expect(p.cig).toBe("1234567ABC");
    expect(p.cup).toBe("J51B21000140006");
    const rif = normalizzaRiferimenti(p.riferimenti_pa);
    expect(rif[0]).toMatchObject({ righe_id: ["r2"], numeri_linea: [2] });
    // Ricaricato com'era salvato: niente si perde.
    const riaperto = editorReducer({} as EditorState, { type: "INIT", payload: { ...s, ...JSON.parse(JSON.stringify(p)) } as never });
    expect(normalizzaRiferimenti(riaperto.riferimenti_pa)).toEqual(rif);
    expect(riaperto.cliente_snapshot?.ufficio_pa?.codice).toBe("UFTST1");
  });

  it("documento vecchio senza riferimenti_pa: le colonne vecchie restano come sono", () => {
    const s = iniziale({ riferimenti_pa: [], cig: "ZA12345678", cup: "B12H20000070001" } as never);
    const p = buildSavePayload(s) as Record<string, unknown>;
    expect(p).toMatchObject({ cig: "ZA12345678", cup: "B12H20000070001", riferimenti_pa: [] });
  });
});

import { mapRow } from "@/hooks/useDocumentiFiscali";
describe("caricamento del documento nell'editor", () => {
  it("la riga del database porta riferimenti_pa e ufficio_pa_id (senza, il primo salvataggio li cancellava)", () => {
    const d = mapRow({ id: "d1", company_id: "c", tipo: "fattura_pa", righe, riferimenti_pa: commessa, ufficio_pa_id: "uff-1", ordine_id: "ord-13" });
    expect(d.riferimenti_pa).toEqual(commessa);
    expect(d.ufficio_pa_id).toBe("uff-1");
    const s = editorReducer({} as EditorState, { type: "INIT", payload: d });
    expect(normalizzaRiferimenti((buildSavePayload(s) as Record<string, unknown>).riferimenti_pa)).toHaveLength(1);
  });
});
