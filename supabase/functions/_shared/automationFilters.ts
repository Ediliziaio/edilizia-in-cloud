/** Shared by the editor and the worker: malformed filters never match, even with NOT. */
export type FilterCondition = {
  id?: string; field?: string; operator?: string; value?: unknown; negate?: boolean; fieldType?: string;
};
export type FilterGroup = { id?: string; logic?: string; conditions?: Array<FilterCondition | FilterGroup> };
export type FilterOptions = { now?: Date; timeZone?: string };
const unary = new Set(["is_empty", "is_not_empty", "is_assigned", "is_not_assigned", "is_true", "is_false", "today", "yesterday"]);
const operators = new Set([...unary, "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "gt", "gte", "lt", "lte", "between", "on", "before", "after", "in_last_x_days", "in_next_x_days"]);
const aliases: Record<string, string> = { pipeline: "pipeline_id", stage: "stage_id", calendar: "calendar_id", appointment_date: "date", dnd_status: "opt_out", total_amount: "total", valid_until: "expires_at" };
export function filterValue(payload: Record<string, any>, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, field)) return payload[field];
  if (aliases[field] && Object.prototype.hasOwnProperty.call(payload, aliases[field])) return payload[aliases[field]];
  if (field.startsWith("custom_field.")) return payload.custom_field?.[field.slice(13)];
  return undefined;
}
export function emptyFilterValue(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}
export function filterRange(value: unknown): [unknown, unknown] {
  if (Array.isArray(value)) return [value[0], value[1]];
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return [v.from, v.to];
  }
  const parts = String(value ?? "").split(/[,;|]/);
  return [parts[0]?.trim(), parts[1]?.trim()];
}
function numeric(value: unknown): number {
  if (emptyFilterValue(value) || typeof value === "boolean" || typeof value === "object") return NaN;
  return Number(value);
}
function isDate(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value); }
function calendarDay(value: unknown, timeZone: string): number {
  if (!isDate(value)) return NaN;
  const raw = String(value);
  if (raw.length === 10) {
    const ms = Date.parse(raw + "T00:00:00Z");
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === raw ? ms / 86400000 : NaN;
  }
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return NaN;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`) / 86400000;
}
export function filterConditionError(c: FilterCondition): string | null {
  if (!c.field?.trim()) return "Scegli il campo da controllare.";
  if (!c.operator || !operators.has(c.operator)) return "Scegli un operatore valido.";
  if (unary.has(c.operator)) return null;
  if (emptyFilterValue(c.value)) return "Inserisci il valore del filtro.";
  if (c.operator === "between") {
    const [lo, hi] = filterRange(c.value);
    const dates = c.fieldType === "date" || isDate(lo) || isDate(hi);
    const from = dates ? calendarDay(lo, "Europe/Rome") : numeric(lo);
    const to = dates ? calendarDay(hi, "Europe/Rome") : numeric(hi);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return "Completa entrambi gli estremi dell’intervallo.";
    if (from > to) return "Il valore iniziale deve precedere quello finale.";
  }
  if (["gt", "gte", "lt", "lte", "in_last_x_days", "in_next_x_days"].includes(c.operator)) {
    const n = numeric(c.value);
    if (!Number.isFinite(n)) return "Inserisci un numero valido.";
    if (c.operator.includes("x_days") && (!Number.isInteger(n) || n < 0)) return "Inserisci un numero di giorni intero, da zero in su.";
  }
  if (["on", "before", "after"].includes(c.operator) && !Number.isFinite(calendarDay(c.value, "Europe/Rome"))) return "Scegli una data valida.";
  return null;
}
export function filterErrors(filters: FilterGroup | null | undefined, nested = false): string[] {
  if (!filters) return [];
  if (!Array.isArray(filters.conditions) || !["AND", "OR"].includes(filters.logic ?? "AND")) return ["Gruppo di condizioni non valido."];
  if (nested && !filters.conditions.length) return ["Completa o rimuovi il gruppo vuoto."];
  return filters.conditions.flatMap(c => {
    if (!c || typeof c !== "object") return ["Condizione non valida."];
    return "conditions" in c || "logic" in c ? filterErrors(c as FilterGroup, true) : [filterConditionError(c as FilterCondition)].filter((v): v is string => !!v);
  });
}
export function evaluateAutomationFilters(filters: FilterGroup | null | undefined, payload: Record<string, any>, options: FilterOptions = {}): boolean {
  if (!filters) return true;
  if (filterErrors(filters).length) return false;
  if (!filters.conditions?.length) return true;
  const timeZone = options.timeZone || "Europe/Rome";
  const now = options.now ?? new Date();
  const normalized = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const evaluate = (group: FilterGroup): boolean => {
    const results = group.conditions!.map(entry => {
      if ("conditions" in entry || "logic" in entry) return evaluate(entry as FilterGroup);
      const c = entry as FilterCondition;
      const actual = filterValue(payload, c.field!);
      const present = !emptyFilterValue(actual);
      const sa = normalized(actual), sv = normalized(c.value);
      const list = Array.isArray(actual) ? actual.map(normalized) : null;
      const expected = Array.isArray(c.value) ? c.value.map(normalized) : [sv];
      const na = numeric(actual), nv = numeric(c.value);
      const da = calendarDay(actual, timeZone), dv = calendarDay(c.value, timeZone);
      const today = calendarDay(now.toISOString(), timeZone);
      let match = false;
      switch (c.operator) {
        case "equals": match = list ? expected.every(v => list.includes(v)) : present && String(actual) === String(c.value); break;
        case "not_equals": match = list ? expected.every(v => !list.includes(v)) : present && String(actual) !== String(c.value); break;
        case "contains": match = list ? expected.every(v => list.includes(v)) : present && sa.includes(sv); break;
        case "not_contains": match = list ? expected.every(v => !list.includes(v)) : present && !sa.includes(sv); break;
        case "starts_with": match = present && sa.startsWith(sv); break;
        case "ends_with": match = present && sa.endsWith(sv); break;
        case "is_empty": case "is_not_assigned": match = !present; break;
        case "is_not_empty": case "is_assigned": match = present; break;
        case "gt": match = Number.isFinite(na) && na > nv; break;
        case "gte": match = Number.isFinite(na) && na >= nv; break;
        case "lt": match = Number.isFinite(na) && na < nv; break;
        case "lte": match = Number.isFinite(na) && na <= nv; break;
        case "between": {
          const [lo, hi] = filterRange(c.value);
          const dates = c.fieldType === "date" || isDate(lo) || isDate(hi);
          const a = dates ? da : na, l = dates ? calendarDay(lo, timeZone) : numeric(lo), h = dates ? calendarDay(hi, timeZone) : numeric(hi);
          match = Number.isFinite(a) && a >= l && a <= h; break;
        }
        case "is_true": match = actual === true || sa === "true" || sa === "1"; break;
        case "is_false": match = actual === false || sa === "false" || sa === "0"; break;
        case "on": match = Number.isFinite(da) && da === dv; break;
        case "before": match = Number.isFinite(da) && da < dv; break;
        case "after": match = Number.isFinite(da) && da > dv; break;
        case "today": match = Number.isFinite(da) && da === today; break;
        case "yesterday": match = Number.isFinite(da) && da === today - 1; break;
        case "in_last_x_days": match = Number.isFinite(da) && da >= today - nv && da <= today; break;
        case "in_next_x_days": match = Number.isFinite(da) && da >= today && da <= today + nv; break;
      }
      return c.negate ? !match : match;
    });
    return group.logic === "OR" ? results.some(Boolean) : results.every(Boolean);
  };
  try { return evaluate(filters); } catch { return false; }
}
export function matchesAutomationTriggerConfig(tcfg: Record<string, any>, payload: Record<string, any>, timeZone = "Europe/Rome"): boolean {
    // Check if trigger filters match (basic evaluation).
    // Il flow-builder salva i filtri in `trigger_filters`; supportiamo anche `filters`.
    const filters = tcfg.trigger_filters ?? tcfg.filters;
    if (filters) {
      if (!evaluateAutomationFilters(filters, payload, { timeZone })) return false;
    }

    // Filtri RAPIDI del trigger (configSchema del catalogo): prima erano
    // IGNORATI → es. il template "Alert Costo > €500" scattava su OGNI costo.
    const ep = payload as Record<string, unknown>;
    // Soglia importo: chiavi payload diverse per emettitore (costo=importo,
    // ordine=total_amount, opportunità=value) — prima leggeva solo `importo`
    // e su ordine_creato/opportunita_creata il filtro spegneva il trigger.
    const sogliaRaw = tcfg.importo_minimo ?? tcfg.importo_soglia ?? tcfg.valore_minimo;
    if (sogliaRaw != null && sogliaRaw !== "") {
      const soglia = Number(sogliaRaw);
      const importo = numeric(ep?.importo ?? ep?.total_amount ?? ep?.value ?? ep?.total);
      if (!Number.isFinite(soglia) || !(Number.isFinite(importo) && importo >= soglia)) return false;
    }
    // Stato di arrivo (ordine_stato_cambiato / ticket_stato_cambiato): confronto
    // normalizzato (minuscole, spazi→underscore) su status E status_name, perché
    // le aziende hanno stati con nomi propri. Prima era IGNORATO: scattava su
    // ogni cambio stato.
    if (typeof tcfg.stato_a === "string" && tcfg.stato_a !== "") {
      const normStato = (s: unknown) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, "_");
      const want = normStato(tcfg.stato_a);
      // current_status_id: il builder salva l'id della fase (i nomi le aziende
      // li cambiano, l'id resta).
      const got = [ep?.status, ep?.status_name, ep?.new_status, ep?.current_status_id].map(normStato);
      if (!got.includes(want)) return false;
    }
    // Priorità (ticket_creato / task_creato): prima ignorata.
    if (typeof tcfg.priorita_filtro === "string" && tcfg.priorita_filtro !== "") {
      if (String(ep?.priority ?? "").toLowerCase() !== tcfg.priorita_filtro.toLowerCase()) return false;
    }
    // Campagna (email_aperta): prima ignorata.
    if (tcfg.campagna_id && String(ep?.campaign_id ?? "") !== String(tcfg.campagna_id)) return false;
    // Form (form_compilato): prima ignorato.
    if (tcfg.form_id && String(ep?.form_id ?? "") !== String(tcfg.form_id)) return false;
    // Campo cambiato (contatto_aggiornato): richiede changed_fields nel payload
    // (emesso da fire_marketing_automation). Senza il dato non si può affermare che corrisponda.
    if (typeof tcfg.campo_filtro === "string" && tcfg.campo_filtro !== "") {
      if (!Array.isArray(ep?.changed_fields)) return false;
      if (!(ep.changed_fields as unknown[]).map(String).includes(tcfg.campo_filtro)) return false;
    }
    // Tipo appuntamento (appuntamento_creato): richiede appointment_type nel payload.
    if (typeof tcfg.tipo_filtro === "string" && tcfg.tipo_filtro !== "") {
      if (String(ep.appointment_type).toLowerCase() !== tcfg.tipo_filtro.toLowerCase()) return false;
    }
    // Calendario (trigger degli appuntamenti): la demo di un marchio non deve
    // far partire il flusso della consulenza di un altro marchio della stessa
    // azienda. calendar_id è nel payload dal 22/09/2026: un evento senza (più
    // vecchio) non passa, perché non si può dire da che calendario arrivi.
    if (typeof tcfg.calendario_id === "string" && tcfg.calendario_id !== "") {
      if (String(ep?.calendar_id ?? "") !== tcfg.calendario_id) return false;
    }
    // Numero WhatsApp Locale (whatsapp_ricevuto): solo i messaggi arrivati a
    // quel numero. Le risposte ai promemoria arrivano al numero degli
    // appuntamenti, e lì un «non posso» va visto subito.
    if (typeof tcfg.numero_whatsapp_id === "string" && tcfg.numero_whatsapp_id !== "") {
      if (String((payload as Record<string, unknown>)?.openwa_number_id ?? "") !== tcfg.numero_whatsapp_id) return false;
    }
    // Pipeline (trigger delle opportunità): era solo nell'interfaccia.
    if (typeof tcfg.pipeline_id === "string" && tcfg.pipeline_id !== "") {
      if (String(ep.pipeline_id ?? "") !== tcfg.pipeline_id) return false;
    }
    // Fonte (contatto_creato → payload.source; candidato_creato → payload.fonte)
    if (typeof tcfg.fonte_filtro === "string" && tcfg.fonte_filtro !== "") {
      const epf = payload as Record<string, unknown>;
      const src = String(epf?.source ?? epf?.fonte ?? "").toLowerCase();
      if (!src.includes(tcfg.fonte_filtro.toLowerCase())) return false;
    }
    // Ruolo del candidato (candidato_creato / candidato_assunto): "contiene".
    if (typeof tcfg.ruolo_filtro === "string" && tcfg.ruolo_filtro !== "") {
      const ruolo = String((payload as Record<string, unknown>)?.ruolo ?? "").toLowerCase();
      if (!ruolo.includes(tcfg.ruolo_filtro.toLowerCase())) return false;
    }
    // Fase di arrivo (candidato_fase_cambiata): confronto normalizzato sul nome.
    if (typeof tcfg.fase_a === "string" && tcfg.fase_a !== "") {
      const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();
      if (norm((payload as Record<string, unknown>)?.fase_nome) !== norm(tcfg.fase_a)) return false;
    }
    // Tipo richiesta (ferie_richiesta: ferie/permesso/malattia).
    if (typeof tcfg.tipo_richiesta_filtro === "string" && tcfg.tipo_richiesta_filtro !== "") {
      if (String((payload as Record<string, unknown>)?.tipo ?? "").toLowerCase() !== tcfg.tipo_richiesta_filtro.toLowerCase()) return false;
    }
    // Tipo colloquio (colloquio_fissato).
    if (typeof tcfg.tipo_colloquio_filtro === "string" && tcfg.tipo_colloquio_filtro !== "") {
      if (String((payload as Record<string, unknown>)?.tipo ?? "").toLowerCase() !== tcfg.tipo_colloquio_filtro.toLowerCase()) return false;
    }
    // Stage da/a (opportunita_stage_cambiato)
    if (tcfg.stage_a && String((payload as Record<string, unknown>)?.stage_id ?? "") !== String(tcfg.stage_a)) return false;
    if (tcfg.stage_da && String((payload as Record<string, unknown>)?.old_stage_id ?? "") !== String(tcfg.stage_da)) return false;
    // Pagina/moduli Facebook (campagna_facebook_lead → page_id / form_ids,
    // stile GHL): il payload dell'evento porta page_id e form_id dal
    // processore lead (meta-process-leads).
    if (tcfg.page_id && String((payload as Record<string, unknown>)?.page_id ?? "") !== String(tcfg.page_id)) return false;
    if (Array.isArray(tcfg.form_ids) && tcfg.form_ids.length > 0) {
      const evFormId = String((payload as Record<string, unknown>)?.form_id ?? "");
      if (!tcfg.form_ids.map(String).includes(evFormId)) return false;
    }
    // Tipo documento HR (documento_hr_in_scadenza → categoria_documento)
    if (tcfg.categoria_documento && tcfg.categoria_documento !== "tutte"
        && String((payload as Record<string, unknown>)?.categoria ?? "") !== String(tcfg.categoria_documento)) return false;
  return true;
}
