export const company = "10000000-0000-4000-a000-000000000001";
export const user = "10000000-0000-4000-a000-000000000002";
export const alba = "10000000-0000-4000-a000-000000000003";
export const bruno = "10000000-0000-4000-a000-000000000004";
const cal = "10000000-0000-4000-a000-000000000020";
export const users = [{ id: user, first_name: "Ada", last_name: "Commerciale" }];
const now = new Date();
export const giorno = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", dateStyle: "short" }).format(now);
const sitoA = { lat: 45.479, lng: 9.187 };
const sitoB = { lat: 45.497, lng: 9.245 };
const sitoC = { lat: 45.432, lng: 9.151 };
const appuntamento = (id, nome, ora, indirizzo, punto, extra = {}) => ({
  id, company_id: company, title: nome, appointment_date: giorno, appointment_time: ora,
  appointment_end_time: null, calendar_id: cal, assigned_to: user, contact_id: null, description: "",
  appointment_type: "sopralluogo", status: "confermato", is_completed: false, is_blocked_slot: false,
  lat: punto?.lat ?? null, lng: punto?.lng ?? null, formatted_address: indirizzo, ...extra,
});
const appointments = [
  appuntamento("1", "Rilievo centro", "09:00", "Via Foro Buonaparte 1, Milano", sitoA),
  appuntamento("2", "Offerta est", "11:00", "Via Rubattino 1, Milano", sitoB),
  appuntamento("3", "Sopralluogo sud", "14:00", "Via Chiesa Rossa 1, Milano", sitoC),
  appuntamento("4", "Finiture da confermare", "16:30", null, null),
  appuntamento("5", "Assistenza da remoto", "17:00", "Milano", sitoB, { meeting_provider: "google_meet" }),
];
const risorsa = (resourceId, resourceName, resourceType) => ({
  resourceId, resourceName, resourceType, start_date: giorno, end_date: giorno,
});
const commessa = (id, order_code, description, punto, ora, people) => ({
  id, order_code, description, indirizzo_lavori: id === "a" ? "Via Demo 1, Milano" : "Via Demo 2, Milano",
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
export const dati = {
  calls: [], schede: [], appointments,
  ordini, posizioni: [],
  routing: true,
};
const elenco = {
  profiles: users,
  marketing_contacts: [],
  marketing_calendars: [{ id: cal, name: "Calendario vendite", owner_id: user,
    is_active: true, duration_minutes: 60, color: "#1d4ed8" }],
  employees: [{ id: alba, first_name: "Alba", last_name: "Bianchi" }, { id: bruno, first_name: "Bruno", last_name: "Monti" }],
  external_teams: [{ id: "ta", name: "Squadra A" }, { id: "tb", name: "Squadra B" }],
  order_statuses: [{ id: "p", name: "Pianificato", color: "#0E6645" }],
};
const righe = (tabella) => tabella === "appointments" ? dati.appointments :
  tabella === "mappa_posizioni" ? dati.posizioni : elenco[tabella] ?? [];
const azienda = { id: company, name: "Azienda sintetica", email: "demo@example.invalid" };
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
  canEditMarketing: true, canEditMarketingOpportunities: true, canViewPersone: true, canViewMezzi: true,
  isLoading: false, solaLettura: false, onlyAssigned: false, onlyAssignedWork: false,
};
export function usePermissions() { return permessi; }
export const useCompanyStaffUsers = () => ({ data: users });
export const companyStaffUsersKeys = { all: ["staff-fixture"] };
export const useCompanyBase = () => null;
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
      select: () => catena, order: () => catena, range: () => catena, limit: () => catena,
      or: () => catena, abortSignal: () => catena, neq: () => catena, not: () => catena,
      is: () => catena, gt: () => catena, gte: () => catena, lte: () => catena, lt: () => catena,
      eq: (k, v) => { if (k === "id" || k === "assigned_to") risultato = risultato.filter(r => r[k] === v); return catena; },
      in: (k, v) => { if (k === "record_id" || k === "id") risultato = risultato.filter(r => v.includes(r[k])); return catena; },
      maybeSingle: () => { singola = true; return catena; }, single: () => { singola = true; return catena; },
    };
    return catena;
  },
  rpc: (name, p) => {
    const esegui = async () => {
      if (name === "mappa_presenze") return (p.p_personale ? [] : [
        { order_id: "a", user_id: alba, nome: "Alba Bianchi", tipo: "entrata", ora: `${giorno}T08:03:00+01:00`, fonte: "App operaio" },
        { order_id: "a", user_id: alba, nome: "Alba Bianchi", tipo: "uscita", ora: `${giorno}T12:01:00+01:00`, fonte: "App operaio" },
      ]);
      if (name === "mappa_km_effettivi") return [{ id: "viaggio1", mezzo: "Furgone demo", metri: 32400, partenza: `${giorno}T08:00:00+01:00`, fonte: "Contachilometri · verificato" }];
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
    invoke: async (name, { body } = {}) => {
      if (name !== "mappa-operativa") return { data: [], error: null };
      dati.calls.push(body);
      if (body.azione === "percorso") return { data: {
        tratte: body.punti.slice(1).map((_, i) => ({ metri: 4000 + i * 1500, secondi: 480 })),
        geometria: body.punti,
      } };
      if (body.azione === "vicini") return { data: {
        metodo: dati.routing ? "strada" : "linea", senzaOrigine: [], totale: 20, valutati: 5,
        risultati: [{ id: "uno", nome: "Ada Commerciale", fonte: "Attività precedente", aggiornato: `${giorno}T09:00:00+01:00`,
          metri: 2000, secondi: dati.routing ? 300 : null }],
      } };
      if (body.azione === "indirizzo") return { data: { risultati: [{ ...sitoC, etichetta: "Via Demo 8, Milano", civico: "8", cap: "20122" }] } };
      return { data: { ok: true }, error: null };
    },
  },
};
