/**
 * I campi di sistema degli oggetti oltre ai primi otto si risolvono davvero:
 * l'azienda (due tabelle), il dipendente (profilo HR), e gli oggetti che nascono
 * da una commessa o da un ticket.
 */
import { describe, expect, it } from "vitest";
import { caricaAzienda, resolveAutomationRecord } from "../../../supabase/functions/_shared/automationContext";

type Riga = Record<string, unknown>;

/** Un database finto: tabelle in memoria, filtri eq/is, ordine e limit ignorati (si prende la prima riga). */
function finto(tabelle: Record<string, Riga[]>) {
  const chiamate: Array<{ tabella: string; filtri: Record<string, unknown> }> = [];
  return {
    chiamate,
    from(tabella: string) {
      const filtri: Record<string, unknown> = {};
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtri[c] = v; return q; },
        is: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          chiamate.push({ tabella, filtri: { ...filtri } });
          const riga = (tabelle[tabella] ?? []).find((r) => Object.entries(filtri).every(([c, v]) => r[c] === v));
          return { data: riga ?? null, error: null as unknown };
        },
      };
      return q;
    },
  };
}

const AZ = "az-1";

describe("azienda", () => {
  it("completa companies con l'anagrafica fiscale e scrive la via col civico", async () => {
    const db = finto({
      companies: [{ id: AZ, name: "Rossi Srl", email: null, phone: null, legal_city: "Lodi", legal_province: "LO" }],
      anagrafica_azienda: [{ company_id: AZ, ragione_sociale: "Rossi Costruzioni S.r.l.", partita_iva: "01234567890", indirizzo_via: "Via Roma", indirizzo_numero_civico: "12", indirizzo_cap: "26900", telefono: "0371 123456", iban_principale: "IT60X0542811101000000123456", forma_giuridica: "S.r.l." }],
    });
    const a = await caricaAzienda(db, AZ);
    expect(a).toMatchObject({
      business_name: "Rossi Costruzioni S.r.l.", vat_number: "01234567890", address: "Via Roma 12", postal_code: "26900",
      phone: "0371 123456", bank_iban: "IT60X0542811101000000123456", forma_giuridica: "S.r.l.", city: "Lodi", province: "LO", country: "Italia",
    });
  });

  it("senza anagrafica usa le colonne di companies", async () => {
    const db = finto({ companies: [{ id: AZ, name: "Rossi Srl", legal_address: "Via Verdi 3", legal_city: "Milano" }] });
    const a = await caricaAzienda(db, AZ);
    expect(a).toMatchObject({ address: "Via Verdi 3", city: "Milano", country: "Italia" });
  });

  it("company non dipende dal record che ha fatto partire il flusso", async () => {
    const db = finto({ companies: [{ id: AZ, name: "Rossi Srl" }] });
    const r = await resolveAutomationRecord(db, "company", "qualunque", AZ, { entity_type: "order" });
    expect(r?.name).toBe("Rossi Srl");
  });
});

describe("dipendente", () => {
  it("prende i dati anagrafici dal profilo HR collegato", async () => {
    const db = finto({
      employees: [{ id: "e1", company_id: AZ, first_name: "Luca", last_name: "Verdi", data_assunzione: "2024-01-10" }],
      hr_profili: [{ company_id: AZ, employee_id: "e1", codice_fiscale: "VRDLCU80A01H501X", indirizzo: "Via Po 5", data_nascita: "1980-01-01", tipo_contratto: "indeterminato", mansione: "Carpentiere" }],
    });
    const r = await resolveAutomationRecord(db, "employee", "e1", AZ, { entity_type: "employee" });
    expect(r).toMatchObject({ first_name: "Luca", fiscal_code: "VRDLCU80A01H501X", address: "Via Po 5", date_of_birth: "1980-01-01", contract_type: "indeterminato", specializzazione: "Carpentiere", hire_date: "2024-01-10" });
  });

  it("senza profilo HR torna la riga di employees", async () => {
    const db = finto({ employees: [{ id: "e1", company_id: AZ, first_name: "Luca" }] });
    const r = await resolveAutomationRecord(db, "employee", "e1", AZ, { entity_type: "employee" });
    expect(r).toMatchObject({ first_name: "Luca" });
    expect(r?.fiscal_code).toBeUndefined();
  });
});

describe("oggetti legati a una commessa o a un ticket", () => {
  it("dall'ordine prende il giornale lavori di quell'ordine", async () => {
    const db = finto({
      orders: [{ id: "o1", company_id: AZ }],
      giornale_lavori: [{ id: "g1", company_id: AZ, order_id: "o1", condizioni_meteo: "sereno" }],
    });
    const r = await resolveAutomationRecord(db, "giornale_lavori", "o1", AZ, { entity_type: "order" });
    expect(r).toMatchObject({ id: "g1", condizioni_meteo: "sereno" });
    expect(db.chiamate.every((c) => c.filtri.company_id === AZ || c.tabella === "orders" && c.filtri.company_id === AZ)).toBe(true);
  });

  it("dal ticket prende il rapportino di quel ticket", async () => {
    const db = finto({
      tickets: [{ id: "t1", company_id: AZ }],
      rapportini_intervento: [{ id: "r1", company_id: AZ, ticket_id: "t1", ore_lavoro: 3 }],
    });
    const r = await resolveAutomationRecord(db, "rapportino", "t1", AZ, { entity_type: "ticket" });
    expect(r).toMatchObject({ id: "r1", ore_lavoro: 3 });
  });

  it("dall'ordine d'acquisto prende il fornitore collegato", async () => {
    const db = finto({
      purchase_orders: [{ id: "p1", company_id: AZ, supplier_id: "s1" }],
      suppliers: [{ id: "s1", company_id: AZ, name: "Ferramenta Bianchi" }],
    });
    const r = await resolveAutomationRecord(db, "supplier", "p1", AZ, { entity_type: "ordine_acquisto" });
    expect(r?.name).toBe("Ferramenta Bianchi");
  });

  it("non esce mai dall'azienda: ogni lettura è filtrata per company_id", async () => {
    const db = finto({ orders: [{ id: "o1", company_id: "altra" }], giornale_lavori: [{ id: "g1", company_id: "altra", order_id: "o1" }] });
    expect(await resolveAutomationRecord(db, "giornale_lavori", "o1", AZ, { entity_type: "order" })).toBeNull();
  });
});
