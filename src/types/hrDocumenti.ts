// Tipi per documenti/scadenze e assenze del dipendente (modulo Personale → Profili).

export type HrDocumentoCategoria =
  | "contratto" | "visita_medica" | "corso_sicurezza" | "idoneita" | "patente"
  | "durc" | "documento_identita" | "permesso_soggiorno" | "unilav" | "altro";

export type HrDocumentoStato = "valido" | "in_scadenza" | "scaduto" | "senza_scadenza";

export interface HrDocumento {
  id: string;
  company_id: string;
  hr_profilo_id: string;
  categoria: HrDocumentoCategoria;
  titolo: string | null;
  ente: string | null;
  data_rilascio: string | null;
  data_scadenza: string | null;
  alert_giorni_prima: number;
  file_path: string | null;
  file_name: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HrAssenzaTipo =
  | "malattia" | "infortunio" | "permesso" | "aspettativa" | "congedo"
  | "maternita" | "paternita" | "altro";

export interface HrAssenza {
  id: string;
  company_id: string;
  hr_profilo_id: string;
  tipo: HrAssenzaTipo;
  data_inizio: string;
  data_fine: string | null;
  giorni: number | null;
  protocollo: string | null;
  certificato_path: string | null;
  certificato_name: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORIA_DOC: { value: HrDocumentoCategoria; label: string; alert: number }[] = [
  { value: "contratto", label: "Contratto", alert: 30 },
  { value: "visita_medica", label: "Visita medica", alert: 30 },
  { value: "corso_sicurezza", label: "Corso sicurezza", alert: 60 },
  { value: "idoneita", label: "Idoneità", alert: 30 },
  { value: "patente", label: "Patente", alert: 60 },
  { value: "durc", label: "DURC", alert: 15 },
  { value: "documento_identita", label: "Documento d'identità", alert: 60 },
  { value: "permesso_soggiorno", label: "Permesso di soggiorno", alert: 60 },
  { value: "unilav", label: "Unilav", alert: 30 },
  { value: "altro", label: "Altro", alert: 30 },
];

export const TIPO_ASSENZA: { value: HrAssenzaTipo; label: string }[] = [
  { value: "malattia", label: "Malattia" },
  { value: "infortunio", label: "Infortunio" },
  { value: "permesso", label: "Permesso" },
  { value: "aspettativa", label: "Aspettativa" },
  { value: "congedo", label: "Congedo" },
  { value: "maternita", label: "Maternità" },
  { value: "paternita", label: "Paternità" },
  { value: "altro", label: "Altro" },
];

export function categoriaLabel(c: string): string {
  return CATEGORIA_DOC.find((x) => x.value === c)?.label ?? "Documento";
}
export function tipoAssenzaLabel(t: string): string {
  return TIPO_ASSENZA.find((x) => x.value === t)?.label ?? t;
}

/** Stato scadenza calcolato lato client (coerente con hr_documento_stato in DB). */
export function calcStato(dataScadenza: string | null, alertGiorni: number | null): HrDocumentoStato {
  if (!dataScadenza) return "senza_scadenza";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sc = new Date(dataScadenza + "T00:00:00");
  if (sc.getTime() < today.getTime()) return "scaduto";
  const soglia = new Date(today); soglia.setDate(soglia.getDate() + (alertGiorni ?? 30));
  if (sc.getTime() <= soglia.getTime()) return "in_scadenza";
  return "valido";
}

export const STATO_BADGE: Record<HrDocumentoStato, { label: string; cls: string }> = {
  scaduto: { label: "Scaduto", cls: "bg-red-100 text-red-700 border-red-200" },
  in_scadenza: { label: "In scadenza", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  valido: { label: "Valido", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  senza_scadenza: { label: "Senza scadenza", cls: "bg-muted text-muted-foreground border-transparent" },
};
