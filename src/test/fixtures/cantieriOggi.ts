import type {
  RigaCantiere,
  OggiOrder,
  OggiPhase,
  OggiTask,
  OggiOverview,
} from "@/lib/orders/cantieriOggi";
export const oggiNow = new Date("2026-10-27T10:00:00+01:00");
export const oggiRow = (over: Partial<RigaCantiere> = {}): RigaCantiere => ({
  id: "o1",
  codice: "C-1",
  descrizione: "Rifacimento bagno",
  indirizzo: "Via Roma 12, Milano",
  stato: "in_corso",
  responsabile: "Marco Rossi",
  previste: 0,
  timbrate: 0,
  rapportini_oggi: 0,
  rapportini_da_approvare: 0,
  correzioni: 0,
  bolle: 0,
  ultimo_segnale: null,
  giorni_senza_segnale: null,
  ...over,
});
export const oggiOrder = (over: Partial<OggiOrder> = {}): OggiOrder => ({
  id: "o1",
  assigned_to: "u1",
  client_name: "Cliente uno",
  work_start_date: "2026-10-20",
  work_end_date: "2026-11-01",
  ...over,
});
export const oggiPhase = (over: Partial<OggiPhase> = {}): OggiPhase => ({
  id: "f1",
  order_id: "o1",
  name: "Posa pavimento",
  start_date: "2026-10-26",
  end_date: "2026-10-28",
  status: "in_corso",
  position: 1,
  ...over,
});
export const oggiTask = (over: Partial<OggiTask> = {}): OggiTask => ({
  id: "t1",
  order_id: "o1",
  title: "Conferma ordine",
  status: "da_fare",
  due_date: "2026-10-26",
  assigned_to: "u1",
  ufficio_id: null,
  bloccata_da_task_id: null,
  attende_fase_id: null,
  ...over,
});
export const oggiOverview = (
  over: Partial<OggiOverview> = {},
): OggiOverview => ({ orders: [oggiOrder()], phases: [], tasks: [], ...over });
