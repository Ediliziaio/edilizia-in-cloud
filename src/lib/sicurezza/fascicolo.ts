export const RUOLI_INCARICO = {
  datore_lavoro: "Datore di lavoro",
  responsabile_lavori: "Responsabile dei lavori",
  progettista: "Progettista",
  direttore_lavori: "Direttore dei lavori",
  csp: "CSP",
  cse: "CSE",
  rup: "RUP",
  direttore_tecnico: "Direttore tecnico",
  capocantiere: "Capocantiere",
  preposto: "Preposto",
  rspp: "RSPP",
  rls: "RLS",
  rlst: "RLST",
  medico_competente: "Medico competente",
  addetto_antincendio: "Addetto antincendio",
  addetto_primo_soccorso: "Addetto primo soccorso",
  referente_operativo: "Referente operativo",
  referente_amministrativo: "Referente amministrativo",
} as const;
export type RuoloIncarico = keyof typeof RUOLI_INCARICO;
export const STATO_EVIDENZA = {
  da_richiedere: "Da richiedere",
  richiesto: "Richiesto",
  ricevuto: "Da verificare",
  integrazione: "Integrazione necessaria",
  verificato: "Verificato",
  non_applicabile: "Non applicabile",
  superato: "Superato",
} as const;
export type StatoEvidenza = keyof typeof STATO_EVIDENZA;
export interface AmbitoFascicolo {
  companyId: string;
  subId?: string;
  orderId?: string;
}
export interface IncaricoSicurezza {
  figura_id?: string | null;
  id: string;
  company_id: string;
  subappaltatore_id: string | null;
  order_id: string | null;
  ruolo: RuoloIncarico;
  nominativo: string;
  telefono: string | null;
  email: string | null;
  nominante: string | null;
  dal: string;
  al: string | null;
  area: string | null;
  stato: "proposto" | "documentato" | "cessato";
  atto_riferimento: string | null;
  mansioni_sicurezza: string | null;
  note: string | null;
  updated_at: string;
}
export interface OperaioEsterno {
  id: string;
  company_id: string;
  subappaltatore_id: string;
  nome: string;
  cognome: string;
  mansione: string;
  telefono: string | null;
  attivo: boolean;
  note: string | null;
}
export interface AssegnazioneEsterna {
  fase_id?:string|null;
  id: string;
  company_id: string;
  subappaltatore_id: string;
  operaio_id: string;
  order_id: string;
  dal: string;
  al: string | null;
  area: string | null;
  attivita: string;
  note: string | null;
}
export interface EvidenzaFascicolo {
  fase_id?: string | null;
  applicabile_dal?: string | null;
  applicabile_al?: string | null;
  catalogo_id?: string | null;
  catalogo_versione?: number | null;
  incarico_id?: string | null;
  id: string;
  company_id: string;
  subappaltatore_id: string | null;
  operaio_id: string | null;
  order_id: string | null;
  tipo: string;
  titolo: string;
  origine_requisito: "da_verificare" | "normativa" | "contratto" | "interna";
  riferimento_requisito: string | null;
  stato: StatoEvidenza;
  file_path: string | null;
  file_name: string | null;
  data_rilascio: string | null;
  data_scadenza: string | null;
  competenza: string | null;
  revisione: string | null;
  termine: string | null;
  referente: string | null;
  verificato_da: string | null;
  verificato_il: string | null;
  note: string | null;
  updated_at: string;
}
export const oggiSicurezza = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(
    new Date(),
  );
export function nelPeriodo(dal: string, al: string | null, data: string) {
  return dal <= data && (!al || al >= data);
}
function dataValida(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
export function errorePeriodo(dal: string, al?: string | null) {
  if (!dataValida(dal)) return "Indica una data di inizio valida.";
  if (al && !dataValida(al)) return "Indica una data di fine valida.";
  return al && al < dal ? "La fine non può precedere l’inizio." : null;
}
export function statoIncarico(
  i: Pick<IncaricoSicurezza, "dal" | "al" | "stato">,
  oggi = oggiSicurezza(),
) {
  if (i.stato === "cessato" || (i.al && i.al < oggi)) return "Cessato";
  if (i.dal > oggi) return "Futuro";
  return i.stato === "documentato"
    ? "Incarico documentato"
    : "Nomina da verificare";
}
export interface FaseFascicolo {id:string;company_id:string;order_id:string;name:string;start_date:string|null;end_date:string|null}
export function errorePeriodoApplicabilita(dal?:string|null,al?:string|null){
 if(dal&&!dataValida(dal))return "Indica una data di applicabilità iniziale valida.";
 if(al&&!dataValida(al))return "Indica una data di applicabilità finale valida.";
 return dal&&al&&al<dal?"La fine dell’applicabilità non può precedere l’inizio.":null;
}
/** The explicit requirement interval is separate from file expiry and planning dates. */
export function nelContestoApplicabilita(e:Pick<EvidenzaFascicolo,'fase_id'|'applicabile_dal'|'applicabile_al'>,c:{data?:string;faseId?:string}={}) {
 if(c.data&&(!dataValida(c.data)||e.applicabile_dal&&e.applicabile_dal>c.data||e.applicabile_al&&e.applicabile_al<c.data))return false;
 return !c.faseId||!e.fase_id||c.faseId===e.fase_id;
}
/** Evidence belongs to its subject; a POS from another site never satisfies this site. */
export function evidenzaPertinente(
  e: Pick<EvidenzaFascicolo, "order_id" | "tipo" | "operaio_id" | "fase_id" | "applicabile_dal" | "applicabile_al">,
  orderId: string,
  operai: string[] = [],
  contesto:{data?:string;faseId?:string}={data:oggiSicurezza()},
) {
  if (e.order_id && e.order_id !== orderId) return false;
  if (e.tipo === "pos" && e.order_id !== orderId) return false;
  return (!e.operaio_id || operai.includes(e.operaio_id))&&nelContestoApplicabilita(e,contesto);
}
export function esitoEvidenza(
  e: Pick<EvidenzaFascicolo, "stato" | "data_scadenza">,
  oggi = oggiSicurezza(),
) {
  if (e.stato === "superato" || e.stato === "non_applicabile")
    return STATO_EVIDENZA[e.stato];
  if (e.data_scadenza && e.data_scadenza < oggi) return "Scaduto";
  return STATO_EVIDENZA[e.stato];
}
