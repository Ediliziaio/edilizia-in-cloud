export const company = "10000000-0000-4000-a000-000000000001";
export const user = "10000000-0000-4000-a000-000000000002";
export const alba = "10000000-0000-4000-a000-000000000003";
export const bruno = "10000000-0000-4000-a000-000000000004";
const cal = "10000000-0000-4000-a000-000000000020";
export const users = [{ id: user, first_name: "Ada", last_name: "Commerciale" }];
const now = new Date();
export const giorno = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", dateStyle: "short" }).format(now);
const demoStradale = import.meta.env.VITE_MAPPA_DEMO_REALE;
const scenario = new URLSearchParams(globalThis.location?.search).get("scenario");
const demoMimit = scenario === "mimit-demo";
const carburanteDemo = scenario === "carburante" || demoMimit;
const usaPartenze = ["partenze", "giro", "copertura", "ritardo", "flotta"].includes(scenario);
const puntoFuoriDemo = { lat: 45.9, lng: 9.7 };
export const sedeDemo = { lat: 45.46588, lng: 9.19032 };
export const magazzinoDemo = { lat: 45.51888, lng: 9.21705 };
const sitoA = demoStradale ? { lat: 45.478933, lng: 9.186912 } : { lat: 45.479, lng: 9.187 };
const sitoB = demoStradale ? { lat: 45.496129, lng: 9.234168 } : { lat: 45.497, lng: 9.245 };
const sitoC = demoStradale ? { lat: 45.432267, lng: 9.151021 } : { lat: 45.432, lng: 9.151 };
const viaA = "Via Marsala, Milano";
const viaB = "Via Aldo Tarabella, Milano";
const viaC = "Via Boffalora, Milano";
const appuntamento = (id, nome, ora, indirizzo, punto, extra = {}) => ({
  id, company_id: company, title: nome, appointment_date: giorno, appointment_time: ora,
  appointment_end_time: null, calendar_id: cal, assigned_to: user, contact_id: null, description: "",
  appointment_type: "sopralluogo", status: "confermato", is_completed: false, is_blocked_slot: false,
  lat: punto?.lat ?? null, lng: punto?.lng ?? null, formatted_address: indirizzo, ...extra,
});
const appointments = [
  appuntamento("1", "Rilievo centro", "09:00", demoStradale ? viaA : "Via Foro Buonaparte 1, Milano", sitoA),
  appuntamento("2", "Offerta est", "11:00", demoStradale ? viaB : "Via Rubattino 1, Milano", sitoB),
  appuntamento("3", "Sopralluogo sud", "14:00", demoStradale ? viaC : "Via Chiesa Rossa 1, Milano", sitoC),
  appuntamento("4", "Finiture da confermare", "16:30", null, null),
  appuntamento("5", "Assistenza da remoto", "17:00", "Milano", sitoB, { meeting_provider: "google_meet" }),
];
const risorsa = (resourceId, resourceName, resourceType) => ({
  resourceId, resourceName, resourceType, start_date: giorno, end_date: giorno,
});
const commessa = (id, order_code, description, punto, ora, people) => ({
  id, order_code, description, indirizzo_lavori: demoStradale ? (id === "a" ? viaA : viaB) : (id === "a" ? "Via Demo 1, Milano" : "Via Demo 2, Milano"),
  work_lat: punto.lat, work_lng: punto.lng, work_start_date: giorno, work_end_date: giorno,
  work_start_time: ora, work_end_time: id === "a" ? "12:00" : "18:00",
  expected_date: null, warehouse_arrival_date: null, created_at: now.toISOString(), current_status_id: "p",
  customer_id: "cliente", customer: { first_name: "Cliente", last_name: "Demo" }, status: { name: "Pianificato", color: "#0E6645" },
  resource_bookings: people, order_employees: people.filter(p => p.resourceType === "employee").map(p => ({
    employee: { id: p.resourceId, first_name: p.resourceName, last_name: "" },
  })), order_external_teams: people.filter(p => p.resourceType === "team").map(p => ({
    external_team: { id: p.resourceId, name: p.resourceName },
  })),
});
export const ordini = [
  commessa("a", "DEM-01", "Posa serramenti", sitoA, "08:00", [risorsa("ta", "Squadra A", "team"), risorsa(alba, "Alba Bianchi", "employee")]),
  commessa("b", "DEM-02", "Impianto elettrico", sitoB, "14:00", [risorsa("tb", "Squadra B", "team"), risorsa(bruno, "Bruno Monti", "employee")]),
];
if (scenario === "ritorno" || scenario === "giro") {
  const prenotazione = (start_time, end_time) => ({
    ...risorsa("ta", "Squadra A", "team"), start_time, end_time,
  });
  ordini[0].resource_bookings = [prenotazione("08:00", "10:00"), prenotazione("14:00", "16:00")];
  ordini[1].resource_bookings = [prenotazione("11:00", "12:00")];
}
const agendaRitardo = [
  { ...appointments[0], appointment_end_time: "10:00" },
  { ...appointments[1], appointment_time: "13:00", appointment_end_time: "14:00" },
  { ...appointments[2], appointment_time: "14:00", appointment_end_time: "14:05" },
];
const agendaCopertura = [appointments[0],
  { ...appointments[1], title: "Sopralluogo fuori copertura", formatted_address: "Punto di prova fuori dall’area di Milano", ...puntoFuoriDemo },
  appointments[2],
];
export const dati = {
  carburanteDemo, demoMimit, calls: [], rpcCalls: [], storicoCalls: [], viaggiCalls: [], schede: [], appointments: scenario === "ritardo" ? agendaRitardo : scenario === "copertura" ? agendaCopertura : demoStradale ? appointments.slice(0, 3) : appointments,
  ordini, posizioni: [],
  routing: true,
};
const annoDemo = Number(giorno.slice(0, 4));
const faseConclusa = "chiusura";
const cantiereStorico = (id, description, indirizzo, punto, fine, extra = {}) => ({
  id, description, company_id: company, order_code: `DEMO-${id.toUpperCase()}`, current_status_id: faseConclusa,
  status: "completato", work_end_date: fine, indirizzo_lavori: indirizzo, work_lat: punto?.lat, work_lng: punto?.lng,
  workflow_kind: "ordinaria", deleted_at: null, assigned_to: user, ...extra,
});
const storicoOrdini = [
  cantiereStorico("cm-a", "Serramenti Porta Garibaldi", viaA, sitoA, `${annoDemo - 1}-12-30`),
  cantiereStorico("cm-b", "Riqualificazione Lambrate", viaB, sitoB, `${annoDemo}-09-18`),
  cantiereStorico("cm-c", "Ristrutturazione Navigli", viaC, sitoC, `${annoDemo}-05-12`),
  cantiereStorico("cm-d", "Cartongessi Certosa", "Via Gallarate, Milano", null, `${annoDemo}-04-13`),
  cantiereStorico("cm-e", "Infissi Bicocca", "Viale Sarca, Milano", null, `${annoDemo}-03-20`),
  cantiereStorico("cm-f", "Recupero Bovisa", "Via Durando, Milano", { lat: 45.503369, lng: 9.164636 }, `${annoDemo - 1}-10-15`),
  cantiereStorico("cm-g", "Lavori in corso demo", viaA, sitoA, `${annoDemo}-05-01`, { current_status_id: "p", status: "in_corso" }),
  cantiereStorico("cm-h", "Lavori annullati demo", viaA, sitoA, `${annoDemo}-05-01`, { status: "annullato" }),
  cantiereStorico("cm-i", "Impianti Porta Venezia", "Via Melzo, Milano", { lat: 45.47445, lng: 9.21068 }, `${annoDemo}-08-20`, { assigned_to: bruno }),
  cantiereStorico("cm-j", "Restauro senza data", viaA, sitoA, null),
  cantiereStorico("cm-k", "Cantiere di altra azienda", viaA, sitoA, `${annoDemo}-07-10`, { company_id: "altra" }),
  cantiereStorico("cm-l", "Contenitore generale demo", viaA, sitoA, `${annoDemo}-07-10`, { workflow_kind: "generale" }),
];
export const schedaCantiereDemo = (id) => storicoOrdini.find(o => o.id === id && o.company_id === company);
const storicoDate = [
  { id: "h-a", order_id: "cm-a", status_id: faseConclusa, changed_at: `${annoDemo - 1}-12-31T23:30:00Z` },
  { id: "h-b", order_id: "cm-b", status_id: faseConclusa, changed_at: `${annoDemo}-09-19T10:00:00Z` },
  { id: "h-b-old", order_id: "cm-b", status_id: faseConclusa, changed_at: `${annoDemo - 1}-09-19T10:00:00Z` },
];
export const flotta = [
  { id: "flotta-furgone", nome: "Furgone Alfa", targa: "AB123CD", tipo: "furgone", contatore_unita: "km", contatore: 14832.4, marca: "Fiat", modello: "Ducato" },
  { id: "flotta-escavatore", nome: "Escavatore Beta", tipo: "macchina_movimento_terra", contatore_unita: "ore", contatore: 812.4 },
  { id: "flotta-auto", nome: "Auto Gamma", targa: "DE456FG", tipo: "autovettura", contatore_unita: "km" },
].map(m => ({ ...m, company_id: company, stato: "in_servizio", gestione: "singola", classe: "mezzo", possesso: "proprieta", deleted_at: null }));
const dataPrima = giorni => new Date(Date.parse(giorno) - giorni * 86400000).toISOString().slice(0, 10);
const sede = { ...sedeDemo, fonte: "Sede operativa configurata" };
const cantiereA = { ...sitoA, fonte: "Posizione del cantiere" };
const cantiereB = { ...sitoB, fonte: "Posizione del cantiere" };
const tratto = (da, a, partenza, arrivo) => ({ da, a, partenza, arrivo });
const viaggio = (id, g, ora, fine, km, fonte, tratte) => ({
  id, furgone: flotta[0].id, partenza: `${g}T${ora}:00+01:00`, arrivo: `${g}T${fine}:00+01:00`,
  km, fonte, stato: fonte === "stimati" || !fonte ? "inviato" : "verificato", tratte,
});
const viaggiFurgone = [
  viaggio("stima-alfa", giorno, "06:20", "06:58", 8.1, "stimati", [tratto("Sede", "Impianto elettrico · Lambrate", sede, cantiereB)]),
  viaggio("giro-alfa", giorno, "05:10", "06:10", 32.4, "contatore", [tratto("Sede", "Posa serramenti · Garibaldi", sede, cantiereA),
    tratto("Posa serramenti · Garibaldi", "Impianto elettrico · Lambrate", cantiereA, cantiereB), tratto("Impianto elettrico · Lambrate", "Sede", cantiereB, sede)]),
  viaggio("dichiarato-alfa", dataPrima(2), "05:45", "06:58", 18.5, "dichiarati", [tratto("Sede", "Deposito temporaneo", sede, null)]),
  viaggio("incompleto-alfa", dataPrima(9), "05:20", "06:58", null, null, [tratto("Deposito temporaneo", "Rimessa da confermare", null, null)]),
];
let parametriCarburante = { tipo: "gasolio", litri_100: demoMimit ? 10 : 8.5, dal: dataPrima(29) };
let prezzoCarburante = { euro_litro: 1.5, dal: dataPrima(29) };
let preferenzaCarburante = { zona: "lombardia", zona_impostata: null, preferisci_mimit: demoMimit };
let preferenzaDal = demoMimit ? dataPrima(1) : undefined;
const territoriMimit = [
  { chiave: "lombardia", nome: "Lombardia", prezzi: { gasolio: 2.44, benzina: 1.95 } },
  { chiave: "bolzano", nome: "Bolzano", prezzi: { gasolio: 3.66, benzina: 2.1 } },
];
const ordiniPerRitiro = [
  { id: "oda-a", oda_number: "ODA-01", status: "parziale", righe: [{ quantity: 10, quantity_received: 6 }] },
  { id: "oda-b", oda_number: "ODA-02", status: "confermato", righe: [{ quantity: 5, quantity_received: 0 }] },
  { id: "oda-c", oda_number: "ODA-03", status: "ricevuto", righe: [{ quantity: 2, quantity_received: 2 }] },
].map(o => ({ ...o, company_id: company, order_id: "cm-b", supplier_id: "fornitore-alfa", expected_delivery_date: giorno,
  suppliers: { name: "Materiali Milano", ritiro_indirizzo: "Via Tarabella 10", ritiro_citta: "Milano" } }));
const giriSalvati = new Map();
const registro = new Map();
const autistaDemo = { id: "autista-demo", label: "Mario Demo" };
if (demoMimit) {
  const data = dataPrima(1);
  const tratta = (id, da, a, km) => ({ id, da, a, km, fonte: "stimati", destinazione: "commessa", order_id: "cm-b", minuti: 30 });
  registro.set("demo-mimit-giro", {
    id: "demo-mimit-giro", company_id: company, mezzo_id: flotta[0].id, mezzo_nome: flotta[0].nome,
    conducente: autistaDemo.label, conducente_hr_id: autistaDemo.id, stato: "inviato", versione: 1,
    partenza: data + "T08:00:00+01:00", arrivo: data + "T10:00:00+01:00", updated_at: data + "T10:00:00+01:00",
    contatore_inizio: null, contatore_fine: null, tariffa_km: null,
    note: "Consegna materiali a Lambrate e ritorno in sede",
    tratte: [tratta("andata-demo", "Sede", "Lambrate", 18), tratta("ritorno-demo", "Lambrate", "Sede", 22)],
  });
}
const nelPeriodo = (v, p) => {
  const g = v.partenza.slice(0, 10);
  return (!p.p_dal || g >= p.p_dal) && (!p.p_al || g <= p.p_al);
};
const elenco = {
  mezzi: flotta,
  purchase_orders: carburanteDemo ? ordiniPerRitiro : [],
  ddt_ricezione: carburanteDemo ? [{
    id: "ddt-a", company_id: company, order_id: "cm-b", purchase_order_id: "oda-a", numero_ddt: "DDT-01", data_ricezione: giorno, stato: "verificato",
  }, {
    id: "ddt-b", company_id: company, order_id: null, purchase_order_id: null, numero_ddt: "DDT-02", data_ricezione: giorno, stato: "ricevuto",
  }] : [],
  ddt_ordini_collegati: carburanteDemo ? ["ddt-a", "ddt-b"].flatMap(ddt_id =>
    ["oda-a", "oda-b"].map(purchase_order_id => ({ id: `${ddt_id}:${purchase_order_id}`, ddt_id, purchase_order_id, company_id: company }))) : [],
  orders: storicoOrdini,
  order_status_history: storicoDate,
  profiles: users,
  marketing_contacts: [],
  hr_sedi: usaPartenze ? [{ id: "magazzino", nome: "Magazzino centrale", ...magazzinoDemo, attiva: true }] : [],
  marketing_calendars: [{ id: cal, name: "Calendario vendite", owner_id: user, calendar_type: "personal",
    is_active: true, duration_minutes: 60, color: "#1d4ed8" }],
  employees: [{ id: alba, first_name: "Alba", last_name: "Bianchi" }, { id: bruno, first_name: "Bruno", last_name: "Monti" }],
  external_teams: [{ id: "ta", name: "Squadra A" }, { id: "tb", name: "Squadra B" }],
  order_statuses: [
    { id: "p", company_id: company, name: "Pianificato", color: "#0E6645", position: 1, is_support_phase: false },
    { id: faseConclusa, company_id: company, name: "Concluso", color: "#0E6645", position: 2, is_support_phase: false },
  ],
};
const righe = (tabella) => tabella === "appointments" ? dati.appointments :
  tabella === "mappa_posizioni" ? [
    ...dati.posizioni,
    { record_id: "cm-e", tipo: "cantiere", company_id: company, lat: 45.51496, lng: 9.20929 },
  ] : elenco[tabella] ?? [];
const azienda = { id: company, operational_province: "MI", name: "Azienda sintetica", email: "demo@example.invalid" };
const auth = { effectiveCompany: azienda, company: azienda, user: { id: user },
  profile: { id: user, first_name: "Ada", last_name: "Demo", company_id: company },
  role: "company_admin", isLoading: false };
export function useAuth() { return auth; }
export function useAuthSelector(selector) { return selector(auth); }
export const useAuthCompany = () => auth;
export const useAuthUser = () => auth;
export const useAuthImpersonation = () => auth;
export const useAuthActions = () => auth;
export const COMPANY_CHOSEN_KEY = "qa-choice";

const permessi = {
  isAdmin: true, canViewAllTeamCalendar: true, canViewCalendar: true, canViewOrders: true, canEditOrders: true,
  canViewMarketingAppointments: true, canViewMarketingContacts: true, canViewMarketingOpportunities: true,
  canEditMarketing: true, canEditMarketingOpportunities: true, canViewPersone: true, canViewMezzi: scenario !== "flotta-senza-permesso",
  canViewCosts: carburanteDemo,
  isLoading: false, solaLettura: false, onlyAssigned: false, onlyAssignedWork: false,
};
export function usePermissions() { return permessi; }
export const useCompanyStaffUsers = () => ({ data: users });
export const companyStaffUsersKeys = { all: ["staff-fixture"] };
export const useCompanyBase = () => usaPartenze ? sedeDemo : null;
export const useGoogleCalendarSync = () => ({ isGoogleConnected: false, hasGoogleConnection: false });
export const useAppleCalendarSync = () => ({ isAppleConnected: false });
export const useOutlookCalendarSync = () => ({ isOutlookConnected: false });
const refetch = async () => ({ data: [] });
export const useWorkCalendarData = (_from, _to, scope) => ({
  scope, teamAppointments: scope === "team",
  orders: { data: ordini, isLoading: false, refetch }, appointments: { data: [], refetch },
  unplanned: { data: [], refetch }, localTasks: { data: [], refetch },
});
export const useCampoAssignments = () => ({ data: ordini.map(o => ({ id: o.id, order_id: o.id, order: { ...o, status: "in_corso" } })) });
const sub = { on: () => sub, subscribe: () => sub };
export const supabase = {
  channel: () => sub, removeChannel: async () => {},
  auth: { getSession: async () => ({ data: { session: null } }) },
  from: (tabella) => {
    let singola = false;
    let risultato = [...righe(tabella)];
    const catena = {
      then: (si, no) => Promise.resolve({ data: singola ? risultato[0] ?? null : risultato, error: null }).then(si, no),
      select: () => catena,
      order: (k, opzione) => {
        if (tabella === "order_status_history" && k === "changed_at") {
          risultato.sort((a, b) => a[k].localeCompare(b[k]) * (opzione?.ascending === false ? -1 : 1));
        }
        return catena;
      },
      range: (da, a) => { risultato = risultato.slice(da, a + 1); return catena; },
      limit: () => catena,
      or: (espressione) => {
        if (tabella === "orders") risultato = risultato.filter(r => espressione.split(",").some(filtro => {
          const [k, , v] = filtro.split(".");
          return r[k] === v;
        }));
        return catena;
      },
      abortSignal: () => catena,
      neq: (k, v) => { if (tabella === "orders") risultato = risultato.filter(r => r[k] !== v); return catena; },
      not: (k, op, v) => {
        if (tabella === "orders" && op === "is") risultato = risultato.filter(r => r[k] !== v);
        return catena;
      },
      is: (k, v) => { if (tabella === "orders") risultato = risultato.filter(r => r[k] === v); return catena; },
      gt: () => catena, gte: () => catena, lte: () => catena, lt: () => catena,
      eq: (k, v) => { if (["orders", "order_statuses", "order_status_history", "purchase_orders", "ddt_ricezione"].includes(tabella) || k === "id" || k === "assigned_to") risultato = risultato.filter(r => r[k] === v); return catena; },
      in: (k, v) => { if (["record_id", "order_id", "id", "status", "purchase_order_id"].includes(k)) risultato = risultato.filter(r => v.includes(r[k])); return catena; },
      maybeSingle: () => { singola = true; return catena; }, single: () => { singola = true; return catena; },
    };
    return catena;
  },
  rpc: (name, p) => {
    dati.rpcCalls.push(name);
    const esegui = async () => {
      if (name === "carburante_mimit_giorno") return p.p_giorno === dataPrima(1) ? { giorno: p.p_giorno, territori: territoriMimit } : null;
      if (name === "mezzo_carburante_riferimento_salva") {
        preferenzaDal = p.p_dal;
        preferenzaCarburante = { zona: p.p_zona ?? "lombardia", zona_impostata: p.p_zona, preferisci_mimit: p.p_preferisci_mimit };
        return null;
      }
      if (name === "mezzo_carburante_config") {
        const riferimento = preferenzaDal && p.p_giorno >= preferenzaDal ? preferenzaCarburante :
          { zona: "lombardia", zona_impostata: null, preferisci_mimit: false };
        const dato = territoriMimit.find(t => t.chiave === riferimento.zona)?.prezzi.gasolio;
        const stima = riferimento.preferisci_mimit && dato && p.p_giorno === dataPrima(1)
          ? { fonte: "mimit", zona: riferimento.zona, euro_litro: dato / 1.22, euro_litro_lordo: dato }
          : { fonte: "aziendale", zona: riferimento.zona, euro_litro: prezzoCarburante.euro_litro, euro_litro_lordo: null };
        return { consumo: parametriCarburante, prezzi: { gasolio: prezzoCarburante }, riferimento, zone: territoriMimit, stima };
      }
      if (name === "mezzo_carburante_salva") {
        parametriCarburante = { tipo: p.p_tipo, litri_100: p.p_litri_100, dal: p.p_dal };
        if (p.p_euro_litro != null) prezzoCarburante = { euro_litro: p.p_euro_litro, dal: p.p_dal };
        return null;
      }
      if (name === "mezzi_quadro_percorrenze") {
        if (demoMimit) {
          const viaggi = [...registro.values()].filter(v => v.stato !== "bozza" && nelPeriodo(v, p) &&
            (!p.p_mezzo || v.mezzo_id === p.p_mezzo) && (!p.p_ordine || v.tratte.some(t => t.order_id === p.p_ordine)));
          const totali = { viaggi: viaggi.length, km_verificati: 0, km_stimati: 0, km_dichiarati: 0,
            litri: 0, costo_carburante: 0, costo_tariffa: null, tratte_senza_km: 0, km_senza_parametri: 0, mimit: true };
          for (const v of viaggi) {
            for (const t of v.tratte.filter(t => !p.p_ordine || t.order_id === p.p_ordine)) {
              const campo = t.fonte === "stimati" ? "km_stimati" : v.stato === "verificato" ? "km_verificati" : "km_dichiarati";
              totali[campo] += t.km;
              totali.litri += t.km * parametriCarburante.litri_100 / 100;
            }
          }
          totali.costo_carburante = Math.round(totali.litri * territoriMimit[0].prezzi.gasolio / 1.22 * 100) / 100;
          return { totali, mezzi: viaggi.length ? [{ mezzo_id: flotta[0].id, nome: flotta[0].nome, targa: flotta[0].targa, ...totali }] : [] };
        }
        if (p.p_dal && p.p_ordine) {
          const viaggi = [...registro.values()].filter(v => v.stato !== "bozza" && nelPeriodo(v, p));
          const tratte = viaggi.flatMap(v => v.tratte.filter(t => t.order_id === p.p_ordine));
          const km_verificati = tratte.reduce((n, t) => n + (t.km ?? 0), 0);
          const litri = km_verificati * parametriCarburante.litri_100 / 100;
          return { totali: { viaggi: viaggi.length, km_verificati, km_stimati: 0, km_dichiarati: 0, litri, tratte_senza_km: 0,
            costo_carburante: Math.round(litri * prezzoCarburante.euro_litro * 100) / 100, costo_tariffa: null, km_senza_parametri: 0 }, mezzi: [] };
        }
        const kmCommessa = [...registro.values()].filter(v => v.stato === "verificato")
          .flatMap(v => v.tratte).filter(t => t.order_id === p.p_ordine).reduce((km, t) => km + (t.km ?? 0), 0);
        const km = p.p_ordine ? 20 + kmCommessa : 32.4;
        const litri = (km + 8.1) * parametriCarburante.litri_100 / 100;
        const totali = { viaggi: 2, km_verificati: km, km_dichiarati: 0, km_stimati: 8.1, tratte_senza_km: 0,
          litri, costo_carburante: Math.round(litri * prezzoCarburante.euro_litro * 100) / 100, costo_tariffa: null, km_senza_parametri: 0 };
        return { totali, mezzi: [{ mezzo_id: flotta[0].id, nome: flotta[0].nome, targa: flotta[0].targa, ...totali }] };
      }
      if (name === "mezzi_piano_fonti") return { fonti: [], legami: [] };
      if (name === "mezzi_storico_percorsi") {
        dati.viaggiCalls.push(p);
        const items = viaggiFurgone.filter(v => p.p_company === company && p.p_mezzo === v.furgone &&
          v.partenza.slice(0, 10) >= p.p_dal && v.partenza.slice(0, 10) <= p.p_al);
        const somma = valori => valori.length ? valori.reduce((a, b) => a + b, 0) : null;
        return { items: items.slice(p.p_offset, p.p_offset + 20), totali: {
          viaggi: items.length, senza_km: items.filter(v => v.km == null).length,
          registrati: somma(items.filter(v => v.fonte === "contatore" || v.fonte === "dichiarati").map(v => v.km)),
          stimati: somma(items.filter(v => v.fonte === "stimati").map(v => v.km)),
        } };
      }
      if (name === "mezzi_giro_contesto") return {
        autisti: autistaDemo.label.toLowerCase().includes(p.p_autista.toLowerCase()) ? [autistaDemo] : [],
        cantieri: storicoOrdini.filter(o => ["cm-a", "cm-b"].includes(o.id) &&
          `${o.order_code} ${o.indirizzo_lavori}`.toLowerCase().includes(p.p_cantiere.toLowerCase()))
          .map(o => ({ id: o.id, label: o.order_code, indirizzo: o.indirizzo_lavori })),
      };
      if (name === "mezzi_viaggi_contesto") return {
        mezzo: { ...flotta.find(m => m.id === p.p_mezzo), conducente_hr_id: autistaDemo.id },
        conducenti: !p.p_q || autistaDemo.label.toLowerCase().includes(p.p_q.toLowerCase()) ? [autistaDemo] : [],
        cantieri: storicoOrdini.filter(o => ["cm-a", "cm-b"].includes(o.id) &&
          (!p.p_q || `${o.order_code} ${o.indirizzo_lavori}`.toLowerCase().includes(p.p_q.toLowerCase())))
          .map(o => ({ id: o.id, label: o.order_code, indirizzo: o.indirizzo_lavori })),
        altri_cantieri: false, sede: { label: "Sede operativa", ...sede }, puo_verificare: true, vede_costi: true, puo_scrivere: true,
      };
      if (name === "mezzi_giro_salva") {
        const scelti = ordiniPerRitiro.filter(o => p.p_oda.includes(o.id));
        const tappe = [
          ...(scelti.length ? [{ luogo: "Materiali Milano · Via Tarabella 10, Milano", oda: scelti.map(o => o.id) }] : []),
          ...p.p_commesse.map(id => {
            const o = schedaCantiereDemo(id);
            return { luogo: `${o.order_code} · ${o.indirizzo_lavori}`, order_id: id };
          }),
          ...(p.p_rientro ? [{ luogo: p.p_luogo }] : []),
        ];
        const tratte = tappe.map((x, i) => ({ id: crypto.randomUUID(), da: tappe[i - 1]?.luogo ?? p.p_luogo, a: x.luogo,
          order_id: x.order_id ?? null, destinazione: x.order_id ? "commessa" : "generale",
          fonte: "dichiarati", km: null, minuti: null, oda: x.oda ?? [] }));
        giriSalvati.set(p.p_id, { id: p.p_id, mezzo_id: p.p_mezzo, mezzo: flotta.find(m => m.id === p.p_mezzo).nome,
          autista: autistaDemo.label, partenza: `${p.p_partenza}:00+01:00`, arrivo: `${p.p_arrivo}:00+01:00`,
          commesse: p.p_commesse, oda: p.p_oda, tratte, viaggio_id: null, stato_viaggio: null, annullato_il: null });
        return p.p_id;
      }
      if (name === "mezzi_giri_elenco") return [...giriSalvati.values()].filter(g => g.commesse.includes(p.p_order))
        .map(g => ({ ...g, stato_viaggio: registro.get(g.viaggio_id)?.stato ?? null }));
      if (name === "mezzi_giro_annulla") {
        giriSalvati.get(p.p_giro).annullato_il = new Date().toISOString();
        return null;
      }
      if (name === "mezzi_giro_registra") {
        const g = giriSalvati.get(p.p_giro);
        if (g.viaggio_id) return registro.get(g.viaggio_id);
        const id = crypto.randomUUID();
        const v = { ...g, id, company_id: company, mezzo_nome: g.mezzo, conducente: g.autista, conducente_hr_id: autistaDemo.id,
          stato: "bozza", versione: 1, contatore_inizio: null, contatore_fine: null, tariffa_km: null, updated_at: g.arrivo,
          note: `Da giro pianificato · ODA ${ordiniPerRitiro.filter(o => g.oda.includes(o.id)).map(o => o.oda_number).join(", ")}` };
        giriSalvati.set(g.id, { ...g, viaggio_id: id });
        registro.set(id, v);
        return v;
      }
      if (name === "mezzi_viaggi_salva") {
        const v = registro.get(p.p_id);
        registro.set(p.p_id, { ...v, ...p.p_dati, versione: v.versione + 1,
          stato: p.p_azione === "verifica" ? "verificato" : p.p_azione === "invia" ? "inviato" : "bozza",
          partenza: v.partenza, arrivo: v.arrivo });
        return { id: p.p_id, versione: v.versione + 1 };
      }
      if (name === "mezzi_viaggi_elenco") return { items: [...registro.values()].filter(v =>
        (!p.p_mezzo || p.p_mezzo === v.mezzo_id) && nelPeriodo(v, p) &&
        (!p.p_order || v.tratte.some(t => t.order_id === p.p_order)))
        .map(v => p.p_order ? { ...v, ambito_commessa: true, tratte: v.tratte.filter(t => t.order_id === p.p_order) } : v), has_more: false };
      if (name === "mezzi_viaggi_storico") return [];
      if (name === "mappa_mezzi_giorno") {
        if (p.p_company !== company || scenario === "flotta-senza-permesso" || p.p_dopo) return [];
        const luogo = (nome, fonte, punto, order_id, extra = {}) => ({ nome, fonte, ...punto, order_id, ...extra });
        const oggi = p.p_giorno === giorno;
        const base = { posizione: null, destinazione: null, destinazioni: 0, metri_registrati: null, metri_stimati: null,
          fonti_registrate: [], contaore: null, contaore_aggiornato: null };
        const dataOra = `${giorno}T09:30:00+01:00`;
        const destinazione = luogo("Impianto elettrico · Lambrate", "Piano mezzi", sitoB, "b", { dal: giorno });
        const furgone = { ...base, id: "flotta-furgone", nome: "Furgone Alfa", targa: "AB123CD", tipo: "furgone", stradale: true, unita: "km",
          posizione: oggi ? luogo("Sede operativa", "Ultimo arrivo registrato", sedeDemo, null, { quando: dataOra }) : null,
          destinazione: p.p_personale ? null : destinazione, destinazioni: p.p_personale ? 0 : 1,
          metri_registrati: oggi ? 32400 : null, metri_stimati: oggi ? 8100 : null,
          fonti_registrate: oggi ? ["Contachilometri · verificato"] : [] };
        const escavatore = { ...base, id: "flotta-escavatore", nome: "Escavatore Beta", targa: null, tipo: "macchina_movimento_terra",
          stradale: false, unita: "ore", posizione: oggi ? luogo("Posa serramenti · Garibaldi", "Assegnazione al cantiere", sitoA, "a",
            { quando: `${giorno}T07:30:00+01:00` }) : null, contaore: oggi ? 812.4 : null, contaore_aggiornato: oggi ? dataOra : null };
        const auto = { ...base, id: "flotta-auto", nome: "Auto Gamma", targa: "DE456FG", tipo: "autovettura", stradale: true, unita: "km",
          destinazioni: oggi ? 2 : 0 };
        return p.p_personale ? [furgone] : [furgone, escavatore, auto];
      }
      if (name === "mappa_storico_cantieri") {
        dati.storicoCalls.push({ ...p });
        if (p.p_company !== company) return [];
        return storicoOrdini.filter(o => o.company_id === company && (!p.p_personale || o.assigned_to === user) &&
          o.workflow_kind !== "generale" && !o.deleted_at && o.current_status_id === faseConclusa &&
          o.status !== "annullato" && (!p.p_dopo || o.id > p.p_dopo)).flatMap(o => {
            const chiusura = storicoDate.filter(h => h.order_id === o.id && h.status_id === faseConclusa)
              .sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0];
            const data = chiusura ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", dateStyle: "short" }).format(new Date(chiusura.changed_at)) : o.work_end_date;
            if ((data ? Number(data.slice(0, 4)) : null) !== p.p_anno) return [];
            const correzione = righe("mappa_posizioni").find(r => r.record_id === o.id);
            return [{ id: o.id, titolo: o.description, codice: o.order_code, indirizzo: o.indirizzo_lavori,
              lat: correzione?.lat ?? o.work_lat, lng: correzione?.lng ?? o.work_lng, data, chiusura_registrata: !!chiusura }];
          }).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 250);
      }
      if (name === "mappa_timbrature_gps") {
        if (!usaPartenze || p.p_giorno !== giorno) return [];
        const proprie = {
          id: "gps1", order_id: null, persona_id: user, nome: "Ada Commerciale", tipo: "entrata",
          ora: giorno + "T07:55:00+01:00", fonte: "App operaio", ...magazzinoDemo,
          sede: "Magazzino centrale", esito: "dentro", precisione: 9,
        };
        return p.p_personale ? [proprie] : [proprie, {
          id: "gps2", order_id: "a", persona_id: alba, nome: "Alba Bianchi", tipo: "uscita",
          ora: giorno + "T12:01:00+01:00", fonte: "App operaio", lat: sitoA.lat + 0.003,
          lng: sitoA.lng + 0.002, sede: null, esito: "fuori", precisione: 12,
        }];
      }
      if (name === "mappa_assegnati" && scenario === "flotta" && p.p_giorno === giorno) return [
        { order_id: "a", user_id: alba, nome: "Alba Bianchi", squadra_id: "ta", employee_id: alba, mezzo_id: "flotta-furgone", mezzo: "Furgone Alfa" },
        { order_id: "b", user_id: bruno, nome: "Bruno Monti", squadra_id: "tb", employee_id: bruno, mezzo_id: "flotta-furgone", mezzo: "Furgone Alfa" },
      ];
      if (name === "mappa_assegnati" && scenario === "giro") return [{
        order_id: "a", user_id: alba, nome: "Alba Bianchi", squadra_id: "ta",
        employee_id: alba, mezzo_id: null, mezzo: null,
      }];
      if (name === "mappa_presenze") return (p.p_personale || p.p_giorno !== giorno ? [] : [
        { order_id: "a", user_id: alba, nome: "Alba Bianchi", tipo: "entrata", ora: `${giorno}T08:03:00+01:00`, fonte: "App operaio" },
        { order_id: "a", user_id: alba, nome: "Alba Bianchi", tipo: "uscita", ora: `${giorno}T12:01:00+01:00`, fonte: "App operaio" },
        ...(scenario === "giro" ? [
          { order_id: "a", user_id: alba, nome: "Alba Bianchi", tipo: "entrata", ora: `${giorno}T14:02:00+01:00`, fonte: "App operaio" },
          { order_id: "a", user_id: bruno, nome: "Bruno Monti", tipo: "entrata", ora: `${giorno}T15:07:00+01:00`, fonte: "App operaio" },
        ] : []),
      ]);
      if (name === "mappa_km_effettivi") return [{ id: "viaggio1", mezzo: "Furgone demo", metri: 32400, partenza: `${giorno}T08:00:00+01:00`, fonte: "Contachilometri · verificato" }];
      if (name === "mappa_km_da_registrare") return [{
        id: "viaggio2", mezzo_id: "mezzo1", mezzo: "Furgone da completare", partenza: `${giorno}T09:00:00+01:00`,
      }];
      if (name === "mappa_salva_posizione") {
        dati.posizioni = dati.posizioni.filter(x => x.record_id !== p.p_record);
        dati.posizioni.push({ record_id: p.p_record, lat: p.p_lat, lng: p.p_lng });
      }
      return [];
    };
    const promise = esegui().then(data => ({ data, error: null }));
    return Object.assign(promise, { abortSignal: () => promise });
  },
  functions: {
    invoke: async (name, { body, signal } = {}) => {
      if (name !== "mappa-operativa") return { data: [], error: null };
      dati.calls.push(body);
      if (body.azione === "percorso" && demoStradale) {
        const risposta = await fetch("/qa-percorso-osrm", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body.punti), signal,
        });
        if (!risposta.ok) return { error: { context: risposta } };
        dati.percorsoStradale = await risposta.json();
        return { data: dati.percorsoStradale };
      }
      if (body.azione === "percorso") {
        const esterno = body.punti.findIndex(p => p.lat === puntoFuoriDemo.lat && p.lng === puntoFuoriDemo.lng);
        const esito = esterno === -1 ? {
          tratte: body.punti.slice(1).map((_, i) => ({ metri: 4000 + i * 1500, secondi: 480 })),
          geometria: body.punti, geometrieTratte: body.punti.slice(1).map((p, i) => [body.punti[i], p]),
        } : {
          tratte: body.punti.slice(1).map(() => null), geometria: [],
          problema: "fuori_copertura", puntiFuoriCopertura: [esterno],
        };
        dati.percorsoStradale = esito;
        return { data: esito };
      }
      if (body.azione === "vicini") return { data: {
        metodo: dati.routing ? "strada" : "linea", senzaOrigine: [], totale: 20, valutati: 5,
        risultati: [{ id: body.tipo === "squadre" ? "ta" : user, nome: body.tipo === "squadre" ? "Squadra A" : "Ada Commerciale", fonte: "Attività precedente", aggiornato: `${giorno}T08:40:00+01:00`,
          metri: 2000, secondi: dati.routing ? 300 : null, margineArrivo: 15, margineRientro: 20 }],
        esclusi: dati.routing ? [{ id: "escluso", nome: "Luca Demo", motivo: "rientro", metri: 1500, secondi: 480, margineRientro: -4 }] : [],
      } };
      if (body.azione === "indirizzo") return { data: { risultati: [{ ...sitoC, etichetta: "Via Demo 8, Milano", civico: "8", cap: "20122" }] } };
      return { data: { ok: true }, error: null };
    },
  },
};
