/**
 * La preparazione del POS dai dati dell'app, con un database finto: indirizzo
 * del cantiere dalla commessa (non la sede), figure della sicurezza, RSPP che
 * coincide col datore di lavoro, capocantiere della commessa che vince su
 * quello generico, lavoratori senza doppioni e senza i subappaltatori,
 * formazione spuntata solo dagli attestati, avvisi per quello che manca.
 */
import { describe, expect, it } from "vitest";
import { preparaPosDaApp } from "../../../supabase/functions/_shared/posDatiApp";

type Riga = Record<string, unknown>;

/** Un finto client Supabase: filtri eq/in/is sulle righe, select ignorata. */
function dbFinto(tabelle: Record<string, Riga[]>) {
  return {
    from(nome: string) {
      let righe = [...(tabelle[nome] ?? [])];
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (k: string, v: unknown) => { righe = righe.filter((r) => r[k] === v); return q; },
        in: (k: string, vs: unknown[]) => { righe = righe.filter((r) => vs.includes(r[k])); return q; },
        is: (k: string, v: unknown) => { righe = righe.filter((r) => (r[k] ?? null) === v); return q; },
        maybeSingle: () => Promise.resolve({ data: righe[0] ?? null, error: null }),
        then: (ok: (r: { data: Riga[]; error: null }) => unknown) => Promise.resolve({ data: righe, error: null }).then(ok),
      };
      return q;
    },
  };
}

const AZ = "az-1";
const ORD = "ord-1";

const base = (): Record<string, Riga[]> => ({
  orders: [{
    id: ORD, company_id: AZ, order_code: "ORD-2026-029", description: "Cappotto Termico — Fabio Riva", work_description: null,
    tipo_lavoro: "Cappotto termico", work_address: "Via Mazzini 14, Como", indirizzo_lavori: null,
    client_name: "Fabio Riva", client_company: null, client_address: "Via Mazzini 14, Como", client_phone: "333 1234567", client_email: null,
    work_start_date: "2026-09-08", work_end_date: null, expected_date: "2026-10-31", capomastro_user_id: null, deleted_at: null,
  }],
  anagrafica_azienda: [{
    company_id: AZ, ragione_sociale: "Demo Azienda S.r.l.", partita_iva: "01234567890", indirizzo_via: "Via dei Cantieri",
    indirizzo_numero_civico: "1", indirizzo_cap: "20099", indirizzo_comune: "Sesto San Giovanni", indirizzo_provincia: "MI",
    telefono: "02 1234567", email: null, pec: "demo@pec.it",
  }],
  companies: [{ id: AZ, name: "Demo Azienda" }],
  sicurezza_figure: [
    { company_id: AZ, attivo: true, ruolo: "datore_lavoro", nominativo: "Mario Rossi", esterno: false, mansioni_sicurezza: null },
    { company_id: AZ, attivo: true, ruolo: "rspp", nominativo: "mario  rossi", esterno: false, mansioni_sicurezza: "RSPP interno" },
    { company_id: AZ, attivo: true, ruolo: "capocantiere", nominativo: "Capo Generico", esterno: false, mansioni_sicurezza: "Sovrintende" },
    { company_id: AZ, attivo: true, ruolo: "rlst", nominativo: "Paolo Gialli", esterno: true, mansioni_sicurezza: null },
    { company_id: AZ, attivo: true, ruolo: "addetto_antincendio", nominativo: "Luca Bianchi", esterno: false, mansioni_sicurezza: null },
    { company_id: AZ, attivo: true, ruolo: "addetto_primo_soccorso", nominativo: "Luca Bianchi", esterno: false, mansioni_sicurezza: null },
  ],
  order_employees: [{ order_id: ORD, employee_id: "emp-1" }],
  order_campo_assignments: [
    { order_id: ORD, company_id: AZ, user_id: "u-luca", role_type: "employee", is_capocantiere: true },
    { order_id: ORD, company_id: AZ, user_id: "u-sub", role_type: "subcontractor", is_capocantiere: false },
  ],
  employees: [{
    id: "emp-1", first_name: "Luca", last_name: "Bianchi", qualifica: "Operaio specializzato", livello_inquadramento: null,
    user_id: "u-luca", formazione_sicurezza_completed: false, formazione_sicurezza_data: null, formazione_sicurezza_scadenza: null,
  }],
  hr_profili: [
    { id: "hr-luca", company_id: AZ, user_id: "u-luca", employee_id: "emp-1", nome: "Luca", cognome: "Bianchi", mansione: "Capocantiere" },
  ],
  profiles: [{ id: "u-sub", first_name: "Sub", last_name: "Appaltatore" }],
  hr_documenti: [
    { company_id: AZ, categoria: "corso_sicurezza", hr_profilo_id: "hr-luca", titolo: "Formazione generale 4 ore", ente: "ESEM", data_scadenza: null },
    { company_id: AZ, categoria: "corso_sicurezza", hr_profilo_id: "hr-luca", titolo: "Lavori in quota DPI anticaduta", ente: null, data_scadenza: "2027-05-01" },
  ],
  mezzi: [{ company_id: AZ, assegnato_order_id: ORD, deleted_at: null, id: "m1", nome: "Ducato", tipo: "furgone", targa: "GA123BC", su_mezzo_id: null }],
  subappaltatori_sicurezza: [{ company_id: AZ, order_id: ORD, ragione_sociale: "Ponteggi Srl", tipo_lavori: "Ponteggi", durc_scadenza: "2026-12-31" }],
});

describe("POS preparato dai dati dell'app", () => {
  it("prende il cantiere dalla commessa e l'impresa dall'anagrafica", async () => {
    const { contenuto } = await preparaPosDaApp(dbFinto(base()), AZ, ORD);
    expect(contenuto.opera.cantiere).toEqual({ via: "Via Mazzini 14", localita: "Como", provincia: "" });
    expect(contenuto.opera.committente).toMatchObject({ nominativo: "Fabio Riva", telefono: "333 1234567" });
    expect(contenuto.opera.descrizione_attivita).toBe("Cappotto termico — Cappotto Termico — Fabio Riva");
    expect(contenuto.opera.data_fine).toBe("2026-10-31");
    expect(contenuto.impresa).toMatchObject({
      ragione_sociale: "Demo Azienda S.r.l.",
      datore_lavoro: "Mario Rossi",
      sede_legale: { indirizzo: "Via dei Cantieri 1, 20099 Sesto San Giovanni (MI)", telefono: "02 1234567", email: "demo@pec.it" },
      durata_oltre_200_giorni: false,
    });
  });

  it("riconosce il datore di lavoro che fa l'RSPP e unisce gli incarichi degli addetti", async () => {
    const { contenuto } = await preparaPosDaApp(dbFinto(base()), AZ, ORD);
    expect(contenuto.rspp).toMatchObject({ svolto_da: "datore", nominativo: "mario  rossi", mansioni_sicurezza: "RSPP interno" });
    expect(contenuto.rls).toMatchObject({ tipo: "rlst", nominativo: "Paolo Gialli" });
    expect(contenuto.rls.mansioni_sicurezza).toMatch(/consultato sul POS/);
    expect(contenuto.emergenze.addetti).toHaveLength(1);
    expect(contenuto.emergenze.addetti[0]).toMatchObject({ nominativo: "Luca Bianchi", antincendio: true, primo_soccorso: true });
  });

  it("il capocantiere della commessa vince su quello generico; i subappaltatori non sono lavoratori", async () => {
    const { contenuto } = await preparaPosDaApp(dbFinto(base()), AZ, ORD);
    expect(contenuto.preposti.map((p) => p.nominativo)).toEqual(["Luca Bianchi"]);
    expect(contenuto.preposti[0].mansioni_sicurezza).toBe("Sovrintende");
    expect(contenuto.lavoratori).toEqual([{ qualifica: "Operaio specializzato", numero: 1, note: "" }]);
    expect(contenuto.formazione).toHaveLength(1);
    expect(contenuto.formazione[0]).toMatchObject({ nominativo: "Luca Bianchi", base: true, rischi_specifici: false, dpi_terza_categoria: true, rischi_cantiere: false });
    expect(contenuto.formazione[0].attestati).toContain("scad. 01/05/2027");
  });

  it("passa mezzi e subappaltatori della commessa, e avvisa di quello che manca", async () => {
    const tab = base();
    tab.sicurezza_figure = [];
    tab.orders[0].work_address = null;
    tab.order_employees = [];
    tab.order_campo_assignments = [];
    const { contenuto, contesto } = await preparaPosDaApp(dbFinto(tab), AZ, ORD);
    expect(contesto.mezzi).toEqual([{ nome: "Ducato", tipo: "furgone", targa: "GA123BC" }]);
    expect(contesto.subappaltatori).toEqual([{ ragione_sociale: "Ponteggi Srl", tipo_lavori: "Ponteggi", durc_scadenza: "2026-12-31" }]);
    expect(contesto.avvisi.join(" ")).toMatch(/indirizzo del cantiere/);
    expect(contesto.avvisi.join(" ")).toMatch(/figure della sicurezza/);
    expect(contesto.avvisi.join(" ")).toMatch(/Nessun lavoratore/);
    expect(contenuto.lavoratori).toEqual([]);
    // Mai la sede al posto del cantiere.
    expect(contenuto.opera.cantiere.via).toBe("");
  });

  it("una commessa di un'altra azienda non si legge", async () => {
    await expect(preparaPosDaApp(dbFinto(base()), "altra-azienda", ORD)).rejects.toThrow(/Commessa non trovata/);
  });
});
