// Preventivo di modulo → commessa: chi è il cliente e dove si lavora (06/10/2026).
//
// `orders.customer_id` punta a `profiles(id)`: è l'account di un cliente del portale. Il preventivo di modulo
// (Fotovoltaico, Ristrutturazione) tiene invece `cliente_id`, che è un CONTATTO del CRM (`marketing_contacts`).
// Passare l'uno all'altro dava una violazione di chiave esterna per ogni preventivo con un contatto collegato:
// in produzione 12 preventivi fotovoltaici e 2 di ristrutturazione hanno un contatto, 0 conversioni sono mai riuscite.
// Il contatto sa a quale profilo corrisponde (`customer_profile_id`, 37 contatti su 136.129 ce l'hanno): senza,
// la commessa nasce senza `customer_id` e i dati del cliente restano nei campi `client_*`, come nella conversione
// del preventivo generico e nell'automazione «crea cantiere». La RPC `create_order_atomic` non scrive né i campi
// `client_*` né l'indirizzo dei lavori: li scrive un aggiornamento subito dopo, come fa la pagina «Nuova commessa».
import { beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { lista?: unknown[]; riga?: unknown };
type Esito = { data: unknown; error: { message: string } | null };
const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, Risposta>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  aggiornamenti: [] as Array<{ tabella: string; patch: Record<string, unknown> }>,
  /** La tabella il cui aggiornamento deve fallire. */
  aggiornamentoFallisce: null as string | null,
  /** La tabella il cui aggiornamento passa senza errore ma non cambia nessuna riga (le regole di accesso non gliela fanno vedere). */
  aggiornamentoSenzaRighe: null as string | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    let aggiornamento = false;
    let conSelect = false;
    const q: Record<string, unknown> = {};
    const stesso = (): Record<string, unknown> => q;
    const riga = async (): Promise<Esito> => ({ data: stato.tabelle[tabella]?.riga ?? null, error: null });
    Object.assign(q, {
      select: (): Record<string, unknown> => { conSelect = true; return q; },
      eq: stesso, order: stesso, limit: stesso,
      update: (patch: Record<string, unknown>): Record<string, unknown> => {
        aggiornamento = true;
        stato.aggiornamenti.push({ tabella, patch });
        return q;
      },
      single: riga,
      maybeSingle: riga,
      then: (ok: (v: Esito) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve<Esito>(
          aggiornamento
            ? stato.aggiornamentoFallisce === tabella
              ? { data: null, error: { message: "permesso negato" } }
              // Come PostgREST: con .select() le righe aggiornate (lista vuota se la riga non è visibile a chi scrive).
              : { data: conSelect ? (stato.aggiornamentoSenzaRighe === tabella ? [] : [{ id: "riga-aggiornata" }]) : null, error: null }
            : { data: stato.tabelle[tabella]?.lista ?? [], error: null },
        ).then(ok, ko),
    });
    return q;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      rpc: async (fn: string, args: Record<string, unknown>): Promise<Esito> => {
        stato.rpc.push({ fn, args });
        if (fn === "create_order_atomic") return { data: { id: "ordine-1", success: true }, error: null };
        if (fn === "prossimo_numero_commessa") return { data: "C-2026-001", error: null };
        return { data: null, error: null };
      },
    },
  };
});

import { convertiFvInCommessa, convertiRstInCommessa } from "@/lib/moduli/convertiInCommessa";

const ordineInviato = () => {
  const chiamata = stato.rpc.find((c) => c.fn === "create_order_atomic");
  if (!chiamata) throw new Error("create_order_atomic non chiamata");
  return (chiamata.args as { p_order_data: Record<string, unknown> }).p_order_data;
};
const aggiornamentoOrdine = () => stato.aggiornamenti.find((a) => a.tabella === "orders")?.patch;

const CONTATTO = "11111111-1111-4111-8111-111111111111";
const PROFILO = "22222222-2222-4222-8222-222222222222";

function preventivoFv(extra: Record<string, unknown> = {}) {
  stato.tabelle.fv_progetti = {
    riga: {
      id: "fv-1", company_id: "az-1", numero: "FV-2026-007", titolo: "Impianto 6 kWp", stato: "emesso",
      cliente_id: CONTATTO, cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: "mario@example.it", cliente_telefono: "347 123 4567",
      indirizzo: "Via Roma 1", comune: "Torino", cap: "10121", provincia: "TO",
      prezzo_vendita_iva_inclusa: 11000, prezzo_vendita_manuale: null, iva_aliquota: 0.1, ordine_id: null,
      ...extra,
    },
  };
  stato.tabelle.fv_componenti_progetto = {
    lista: [{ categoria: "modulo", descrizione: "Modulo 430 W", marca: "Marca", modello: "M430", quantita: 10, prezzo_unitario_netto: 120, prezzo_unitario_vendita: 1000, ordinamento: 0 }],
  };
  stato.tabelle.fv_servizi_progetto = { lista: [] };
  stato.tabelle.fv_manodopera_progetto = { lista: [] };
}

function preventivoRst(extra: Record<string, unknown> = {}) {
  stato.tabelle.rst_progetti = {
    riga: {
      id: "rst-1", company_id: "az-1", code: "RST-2026-001", stato: "accettato", note: "Ristrutturazione appartamento",
      cliente_id: CONTATTO, cliente_nome: "Anna", cliente_cognome: "Verdi", cliente_email: "anna@example.it", cliente_telefono: "333 765 4321",
      cantiere_indirizzo: "Corso Francia 5", cantiere_citta: "Torino", cantiere_cap: "10138", cantiere_provincia: "TO",
      totale: 12200, totale_imponibile: 10000, iva_pct: 22, prezzo_manuale: null, ordine_id: null,
      ...extra,
    },
  };
  stato.tabelle.rst_computo_voci = {
    lista: [{ capitolo_nome: "Opere", descrizione: "Posa pavimento", unita_misura: "mq", quantita: 100, prezzo_unitario: 100, sconto_pct: 0, importo: 10000, costo_materiali: 30, costo_manodopera: 20, ordine: 0 }],
  };
}

beforeEach(() => {
  stato.rpc.length = 0;
  stato.aggiornamenti.length = 0;
  stato.aggiornamentoFallisce = null;
  stato.aggiornamentoSenzaRighe = null;
  stato.tabelle = { order_statuses: { riga: { id: "stato-1" } }, marketing_contacts: { riga: { customer_profile_id: null } } };
});

describe.each([
  ["fotovoltaico", preventivoFv, (): Promise<unknown> => convertiFvInCommessa("fv-1", "utente-1")],
  ["ristrutturazione", preventivoRst, (): Promise<unknown> => convertiRstInCommessa("rst-1", "utente-1")],
] as const)("%s → commessa: il cliente", (_modulo, prepara, converti) => {
  it("il contatto del CRM NON diventa customer_id (la chiave esterna punta ai profili): senza account del portale, null", async () => {
    prepara();
    await converti();
    expect(ordineInviato().customer_id).toBeNull();
  });

  it("se il contatto ha un account del portale, la commessa è di quel profilo", async () => {
    prepara();
    stato.tabelle.marketing_contacts = { riga: { customer_profile_id: PROFILO } };
    await converti();
    expect(ordineInviato().customer_id).toBe(PROFILO);
  });

  it("senza contatto collegato niente customer_id, e il preventivo si converte lo stesso", async () => {
    prepara({ cliente_id: null });
    await converti();
    expect(ordineInviato().customer_id).toBeNull();
  });

  it("nome, email, telefono e indirizzo dei lavori finiscono sulla commessa (la RPC non li scrive: «Cliente non disponibile» nella scheda)", async () => {
    prepara();
    await converti();
    const patch = aggiornamentoOrdine();
    const fv = _modulo === "fotovoltaico";
    expect(patch).toMatchObject({
      client_name: fv ? "Mario Rossi" : "Anna Verdi",
      client_email: fv ? "mario@example.it" : "anna@example.it",
      client_phone: fv ? "347 123 4567" : "333 765 4321",
      // Lo stesso indirizzo in entrambe le colonne, come fa «Nuova commessa»: il calendario e le schede leggono `indirizzo_lavori`.
      indirizzo_lavori: fv ? "Via Roma 1, 10121 Torino (TO)" : "Corso Francia 5, 10138 Torino (TO)",
      work_address: fv ? "Via Roma 1, 10121 Torino (TO)" : "Corso Francia 5, 10138 Torino (TO)",
    });
    // Il legame col preventivo si scrive nello stesso aggiornamento.
    expect(patch).toHaveProperty(fv ? "fv_progetto_id" : "rst_progetto_id", fv ? "fv-1" : "rst-1");
  });

  it("senza indirizzo o contatti non si scrivono campi vuoti", async () => {
    if (_modulo === "fotovoltaico") preventivoFv({ indirizzo: null, comune: null, cap: null, provincia: null, cliente_email: null, cliente_telefono: null });
    else preventivoRst({ cantiere_indirizzo: null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null, cliente_email: null, cliente_telefono: null });
    await converti();
    const patch = aggiornamentoOrdine() ?? {};
    for (const campo of ["client_email", "client_phone", "indirizzo_lavori", "work_address"]) expect(patch).not.toHaveProperty(campo);
  });

  it("tutto scritto: nessun avviso", async () => {
    prepara();
    const esito = (await converti()) as { orderId: string; avviso?: string | null };
    expect(esito.avviso ?? null).toBeNull();
  });

  // 07/10/2026. Per il ruolo «solo assegnati» la commessa appena creata non è «sua» (can_see_order): l'UPDATE passa senza errore e
  // non cambia nessuna riga. Prima si guardava solo l'errore: cliente e indirizzo non si scrivevano e l'avviso non compariva.
  it("se l'aggiornamento della commessa non cambia nessuna riga (nessun errore) l'esito lo dice: cliente e indirizzo non sono stati scritti", async () => {
    prepara();
    stato.aggiornamentoSenzaRighe = "orders";
    const esito = (await converti()) as { orderId: string; avviso?: string | null };
    expect(esito.orderId).toBe("ordine-1");
    expect(esito.avviso).toMatch(/cliente e indirizzo/);
    // il preventivo si lega comunque alla commessa
    const tabella = _modulo === "fotovoltaico" ? "fv_progetti" : "rst_progetti";
    expect(stato.aggiornamenti.find((a) => a.tabella === tabella)?.patch).toEqual({ ordine_id: "ordine-1" });
  });

  it("se è il legame sul preventivo a non cambiare nessuna riga (nessun errore) la conversione lo dice: commessa creata ma non collegata", async () => {
    prepara();
    stato.aggiornamentoSenzaRighe = _modulo === "fotovoltaico" ? "fv_progetti" : "rst_progetti";
    await expect(converti()).rejects.toThrow(/Commessa creata ma non collegata al preventivo/);
  });

  it("se i dati del cliente non si riescono a scrivere la commessa c'è già, resta legata al preventivo e l'esito lo dice", async () => {
    prepara();
    stato.aggiornamentoFallisce = "orders";
    const esito = (await converti()) as { orderId: string; avviso?: string | null };
    expect(esito.orderId).toBe("ordine-1");
    expect(esito.avviso).toMatch(/cliente e indirizzo/);
    // Il preventivo si lega comunque alla commessa: un secondo clic non ne crea un'altra.
    const tabella = _modulo === "fotovoltaico" ? "fv_progetti" : "rst_progetti";
    expect(stato.aggiornamenti.find((a) => a.tabella === tabella)?.patch).toEqual({ ordine_id: "ordine-1" });
  });
});
