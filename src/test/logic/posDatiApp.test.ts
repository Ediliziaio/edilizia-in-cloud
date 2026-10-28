/**
 * La preparazione del POS dai dati dell'app, con un database finto: indirizzo
 * del cantiere dalla commessa (non la sede), figure della sicurezza, RSPP che
 * coincide col datore di lavoro, capocantiere della commessa che vince su
 * quello generico, lavoratori senza doppioni e senza i subappaltatori,
 * formazione controllata esplicitamente, avvisi per quello che manca.
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
    { company_id: AZ, attivo: true, ruolo: "datore_lavoro", hr_profilo_id:"hr-datore", nominativo: "Mario Rossi", esterno: false, mansioni_sicurezza: null },
    { company_id: AZ, attivo: true, ruolo: "rspp", hr_profilo_id:"hr-datore", nominativo: "mario  rossi", esterno: false, mansioni_sicurezza: "RSPP interno" },
    { company_id: AZ, attivo: true, ruolo: "capocantiere", nominativo: "Capo Generico", esterno: false, mansioni_sicurezza: "Sovrintende" },
    { company_id: AZ, attivo: true, ruolo: "rlst", nominativo: "Paolo Gialli", esterno: true, mansioni_sicurezza: null },
    { company_id: AZ, attivo: true, ruolo: "addetto_antincendio", hr_profilo_id:"hr-luca", nominativo: "Luca Bianchi", esterno: false, mansioni_sicurezza: null },
    { company_id: AZ, attivo: true, ruolo: "addetto_primo_soccorso", hr_profilo_id:"hr-luca", nominativo: "Luca Bianchi", esterno: false, mansioni_sicurezza: null },
  ],
  order_employees: [{ order_id: ORD, employee_id: "emp-1" }],
  order_campo_assignments: [
    { order_id: ORD, company_id: AZ, user_id: "u-luca", role_type: "employee", is_capocantiere: true },
    { order_id: ORD, company_id: AZ, user_id: "u-sub", role_type: "subcontractor", is_capocantiere: false },
  ],
  employees: [{
    company_id: AZ, id: "emp-1", first_name: "Luca", last_name: "Bianchi", qualifica: "Operaio specializzato", livello_inquadramento: null,
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
    expect(contenuto.formazione[0]).toMatchObject({ nominativo: "Luca Bianchi", base: false, rischi_specifici: false, dpi_terza_categoria: false, rischi_cantiere: false, verificata: false });
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

  it("fasi e turni dalla commessa senza nominare addetti dagli attestati", async () => {
    const t = base();
    // Niente addetti tra le figure: si propongono da chi ha l'attestato.
    t.sicurezza_figure = t.sicurezza_figure.filter((f) => !String(f.ruolo).startsWith("addetto_"));
    t.order_work_phases = [
      { company_id: AZ, order_id: ORD, name: "Montaggio ponteggio", position: 1 },
      { company_id: AZ, order_id: ORD, name: "Posa cappotto", position: 2 },
    ];
    t.hr_profili[0] = { ...t.hr_profili[0], orario_inizio: "08:00:00", orario_fine: "17:00:00", pausa_pranzo_minuti: 60, giorni_lavorativi: ["Lun", "Mar", "Mer", "Gio", "Ven"] };
    t.hr_documenti.push({ company_id: AZ, categoria: "corso_sicurezza", hr_profilo_id: "hr-luca", titolo: "Primo soccorso", ente: null, data_scadenza: null });
    const { contenuto, contesto } = await preparaPosDaApp(dbFinto(t), AZ, ORD);
    expect(contenuto.opera.descrizione_attivita).toContain("Fasi di lavoro: Montaggio ponteggio, Posa cappotto.");
    expect(contesto.fasi).toEqual(["Montaggio ponteggio", "Posa cappotto"]);
    expect(contenuto.opera.turni_lavoro).toBe("Turno unico diurno dalle 08:00 alle 17:00 con pausa di 60 minuti, dal lunedì al venerdì.");
    expect(contenuto.emergenze.addetti).toEqual([]);
    expect(contesto.avvisi.join(" ")).toMatch(/Gli attestati non costituiscono una nomina/);
  });

  it("un incarico documentato del sito prevale su quello globale ed esclude gli altri datori",async()=>{
    const t=base();
    t.sicurezza_incarichi=[
      {id:'i1',company_id:AZ,order_id:ORD,subappaltatore_id:null,ruolo:'capocantiere',nominativo:'Capo Nominato',dal:'2026-09-01',al:null,stato:'documentato',mansioni_sicurezza:'Nomina specifica'},
      {id:'i2',company_id:AZ,order_id:ORD,subappaltatore_id:'sub',ruolo:'rspp',nominativo:'RSPP esterna impresa',dal:'2026-09-01',al:null,stato:'documentato'},
      {id:'i3',company_id:AZ,order_id:ORD,subappaltatore_id:null,ruolo:'rspp',nominativo:'RSPP futura',dal:'2027-01-01',al:null,stato:'documentato'},
      {id:'i4',company_id:AZ,order_id:ORD,subappaltatore_id:null,ruolo:'rspp',nominativo:'RSPP proposta',dal:'2026-09-01',al:null,stato:'proposto'},
    ];
    const {contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.preposti).toEqual([expect.objectContaining({nominativo:'Capo Nominato',mansioni_sicurezza:'Nomina specifica'})]);
    expect(contenuto.rspp.nominativo).toBe('mario  rossi');
  });
  it("non unisce due operai omonimi e conserva il riferimento del relativo attestato",async()=>{
    const t=base();
    t.order_employees.push({order_id:ORD,employee_id:'emp-2'});
    t.employees.push({...t.employees[0],id:'emp-2',user_id:'u-omonimo'});
    t.hr_profili.push({...t.hr_profili[0],id:'hr-omonimo',user_id:'u-omonimo',employee_id:'emp-2'});
    const {contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.lavoratori.reduce((n,r)=>n+r.numero,0)).toBe(2);
    expect(contenuto.formazione).toHaveLength(2);
    expect(contenuto.formazione[0].attestati).toContain('Formazione generale');
    expect(contenuto.formazione[1].attestati).toBe('');
  });
  it("un errore in una fonte obbligatoria interrompe la preparazione",async()=>{
    const db=dbFinto(base());
    const guasto={from:(tab:string)=>tab==='sicurezza_incarichi'?{select:()=>({eq:()=>({eq:()=>({order:async()=>({data:null,error:{message:'fonte indisponibile'}})})})})}:db.from(tab)};
    await expect(preparaPosDaApp(guasto,AZ,ORD)).rejects.toThrow(/Fonte POS non disponibile/);
  });
  it("non tratta una prenotazione futura di ponteggio come presenza in cantiere",async()=>{
    const t=base();t.mezzi_allocazioni=[{company_id:AZ,order_id:ORD,quantita:100,dal:'2027-01-01',al:null,mezzo:{nome:'Ponteggio futuro',tipo:'ponteggio',unita_misura:'mq',deleted_at:null}}];
    const {contesto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contesto.mezzi.some(m=>m.nome.includes('Ponteggio futuro'))).toBe(false);
  });

  it("recupera le imprese del contratto anche senza il vecchio order_id anagrafico",async()=>{
    const t=base();t.subappaltatori_sicurezza=[{id:'sub-nuovo',company_id:AZ,order_id:null,ragione_sociale:'Impresa da contratto',tipo_lavori:'Impianti',durc_scadenza:null}];
    t.contratti_subappalto=[{company_id:AZ,order_id:ORD,subappaltatore_id:'sub-nuovo',stato:'attivo'}];
    const {contesto,contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contesto.subappaltatori).toEqual([{ragione_sociale:'Impresa da contratto',tipo_lavori:'Impianti',durc_scadenza:null}]);
    expect(contenuto.formazione).toHaveLength(1);
  });
  it("non legge un dipendente di un’altra azienda neppure con un collegamento incoerente",async()=>{
    const t=base();t.employees[0].company_id='altra-azienda';t.hr_profili=[];t.order_campo_assignments=[];
    const {contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.formazione).toEqual([]);expect(contenuto.lavoratori).toEqual([]);
  });

  it("flag HR storico e attestato scaduto restano fonti da controllare, senza spunte automatiche",async()=>{
    const t=base();t.employees[0].formazione_sicurezza_completed=true;
    t.hr_documenti[0].data_scadenza='2020-01-01';
    const {contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.formazione[0]).toMatchObject({base:false,rischi_specifici:false,dpi_terza_categoria:false,verificata:false});
    expect(contenuto.formazione[0].attestati).toContain('01/01/2020');
    expect(contenuto.formazione[0].attestati).toContain('Indicazione HR storica');
  });

  it("non unisce nomine di omonimi né attribuisce al datore un RSPP solo per il nome",async()=>{
    const t=base();
    t.sicurezza_figure.find(f=>f.ruolo==='rspp')!.hr_profilo_id='hr-altro-rspp';
    t.sicurezza_figure.find(f=>f.ruolo==='addetto_primo_soccorso')!.hr_profilo_id='hr-altro-luca';
    const {contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.rspp.svolto_da).toBe('interno');
    expect(contenuto.emergenze.addetti).toHaveLength(2);
    expect(contenuto.emergenze.addetti.every(a=>!(a.antincendio&&a.primo_soccorso))).toBe(true);
  });

  it("una commessa di un'altra azienda non si legge", async () => {
    await expect(preparaPosDaApp(dbFinto(base()), "altra-azienda", ORD)).rejects.toThrow(/Commessa non trovata/);
  });
  it("non attribuisce attestati quando due profili HR puntano al medesimo dipendente",async()=>{
    const t=base();t.hr_profili.push({...t.hr_profili[0],id:'hr-ambiguo'});
    const {contenuto,contesto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.formazione).toHaveLength(1);expect(contenuto.formazione[0].attestati).toBe('');expect(contenuto.formazione[0].riferimento_addetto).toBeUndefined();expect(contesto.avvisi.join(' ')).toContain('ambiguo');
  });
  it("un lavoratore esterno legacy non diventa un dipendente nel POS",async()=>{
    const t=base();t.employees[0].role_type='subappaltatore';t.order_campo_assignments=[];
    const {contenuto,contesto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
    expect(contenuto.formazione).toEqual([]);expect(contenuto.lavoratori).toEqual([]);expect(contesto.avvisi.join(' ')).toContain('legacy');
  });
  it("conserva l’identificativo HR del collegamento univoco senza confermare la formazione",async()=>{
    const {contenuto}=await preparaPosDaApp(dbFinto(base()),AZ,ORD);
    expect(contenuto.formazione[0].riferimento_addetto).toEqual({tipo:'hr',id:'hr-luca'});expect(contenuto.formazione[0].verificata).toBe(false);
  });

 it("controlla anche l’anagrafica del solo accesso Campo prima di importarla come propria",async()=>{
  const t=base();t.order_employees=[];t.employees[0].role_type='subappaltatore';
  const {contenuto,contesto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);
  expect(contenuto.formazione).toEqual([]);expect(contesto.avvisi.join(' ')).toContain('legacy');
 });
 it("una persona recuperata per il solo capomastro non diventa automaticamente un operaio assegnato",async()=>{
  const t=base();t.order_employees=[];t.order_campo_assignments=[];t.orders[0].capomastro_user_id='u-luca';
  const {contenuto}=await preparaPosDaApp(dbFinto(t),AZ,ORD);expect(contenuto.formazione).toEqual([]);
 });

});
