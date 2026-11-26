/**
 * La testata che «Crea la commessa» manda a `prepara_commessa_computo_atomic` (26/11/2026).
 *
 * `contact_id`, `customer_id` e `opportunity_id` sono uuid nel database ma stringhe vuote nella
 * bozza del computo finché nessuno li sceglie — e almeno due lo sono sempre, perché il cliente
 * viene o dal CRM (`clienteId`) o dall'anagrafica (`clienteAnagraficaId`). Una stringa vuota in
 * un campo uuid fa fallire l'intera RPC con 22P02 «invalid input syntax for type uuid: ""», che
 * all'utente arriva come «Alcuni dati non sono nel formato giusto»: nessuna commessa, nessun
 * indizio. È successo dal 23/11/2026 (la pubblicazione #253 aveva tolto le guardie `if (…)`)
 * fino al 26/11: tre giorni in cui dal computo non nasceva nessuna commessa.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";

/** L'esito finto della RPC. Esplicito: senza, l'inferenza passa per `vi.fn` e torna `any` (TS7011). */
type EsitoRpc = Promise<{ data: string; error: null }>;
const rpc = vi.fn((_nome: string, _args: Record<string, unknown>): EsitoRpc => Promise.resolve({ data: "quote-1", error: null }));
// La fabbrica di vi.mock viene issata sopra la dichiarazione di `rpc`: la chiama, non la cattura.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (nome: string, args: Record<string, unknown>): EsitoRpc => rpc(nome, args) },
}));
vi.mock("@/lib/moduli/quoteBridge", () => ({
  // `Promise<null>` scritto: il progetto ha strictNullChecks spento, e lì `null` da solo vale `any` (TS7011).
  getModuleQuote: async (): Promise<null> => null,
  preparaDatiModuleQuote: async () => ({ quoteNumber: "PR-1", patch: { title: "Preventivo", client_name: "Rossi" } }),
}));
vi.mock("@/lib/moduli/esitoOffertaModulo", () => ({ esitoOffertaModulo: () => false }));
vi.mock("../../../supabase/functions/_shared/personalizzazioneDocumenti", () => ({
  personalizzazioneDocumento: () => ({ numeroAutomaticoComputo: false }),
}));

import { preparaCommessaDaComputo, type DatiCommessaComputo } from "@/lib/computo/commessaDaComputo";

/** Una bozza minima che crea la commessa: una voce con prezzo, importi riconciliati senza IVA. */
function datiCon(collegamenti: { clienteId?: string; clienteAnagraficaId?: string; opportunitaId?: string }): DatiCommessaComputo {
  const voce = { ...voceVuota(), descrizione: "Scavo", unita: "mc", quantita: "10", prezzo: "100" };
  return {
    companyId: "azienda-1", userId: "utente-1", draftId: "bozza-1",
    bozza: { ...bozzaVuota(), ...collegamenti, committente: "Rossi", voci: [voce] },
    subtotal: 1000, vatAmount: 0, total: 1000, aliquotaIva: 0,
    rate: [], validityDays: 30, conCosti: false,
    generaPdf: async () => new Blob(["x"]),
  };
}

/**
 * La testata come arriva al database: il JSON della richiesta, non l'oggetto in memoria.
 * È la differenza che conta — una chiave a `undefined` sparisce nella serializzazione e la
 * funzione tiene il valore già salvato (`coalesce`), una stringa vuota invece arriva e rompe.
 */
async function testataSpedita(collegamenti: Parameters<typeof datiCon>[0]) {
  await preparaCommessaDaComputo(datiCon(collegamenti));
  const [nome, args] = rpc.mock.calls.at(-1) as unknown as [string, { p_testata: Record<string, unknown> }];
  expect(nome).toBe("prepara_commessa_computo_atomic");
  return JSON.parse(JSON.stringify(args.p_testata)) as Record<string, unknown>;
}

describe("testata della commessa dal computo", () => {
  beforeEach(() => rpc.mockClear());

  it("il cliente scelto dall'anagrafica non porta un contatto vuoto", async () => {
    const testata = await testataSpedita({ clienteId: "", clienteAnagraficaId: "anagrafica-1", opportunitaId: "" });
    expect(testata.customer_id).toBe("anagrafica-1");
    expect(testata).not.toHaveProperty("contact_id");
    expect(testata).not.toHaveProperty("opportunity_id");
  });

  it("il cliente scelto dal CRM non porta un'anagrafica vuota", async () => {
    const testata = await testataSpedita({ clienteId: "contatto-1", clienteAnagraficaId: "", opportunitaId: "" });
    expect(testata.contact_id).toBe("contatto-1");
    expect(testata).not.toHaveProperty("customer_id");
  });

  it("nessun campo della testata è una stringa vuota: in un uuid farebbe fallire tutta la RPC", async () => {
    const testata = await testataSpedita({ clienteId: "", clienteAnagraficaId: "", opportunitaId: "" });
    expect(Object.entries(testata).filter(([, v]) => v === "")).toEqual([]);
  });
});
