export type ContactsTab = "all" | "lists";
export type ContactsSortField = "first_name" | "phone" | "email" | "company_name" | "created_at" | "last_activity_at";
export type ContactsSortDirection = "asc" | "desc";

const VALID_TABS = new Set<ContactsTab>(["all", "lists"]);
const VALID_PAGE_SIZES = new Set([25, 50, 100]);
const VALID_SORT_FIELDS = new Set<ContactsSortField>([
  "first_name",
  "phone",
  "email",
  "company_name",
  "created_at",
  "last_activity_at",
]);
const VALID_SORT_DIRECTIONS = new Set<ContactsSortDirection>(["asc", "desc"]);

export interface ContactsUrlStateInput {
  activeTab: unknown;
  page: unknown;
  pageSize: unknown;
  sortField: unknown;
  sortDirection: unknown;
}

export interface ContactsUrlState {
  activeTab: ContactsTab;
  page: number;
  pageSize: number;
  sortField: ContactsSortField;
  sortDirection: ContactsSortDirection;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function normalizeContactsUrlState(input: ContactsUrlStateInput): ContactsUrlState {
  const page = toPositiveInteger(input.page, 1);
  const requestedPageSize = toPositiveInteger(input.pageSize, 25);
  const activeTab = typeof input.activeTab === "string" && VALID_TABS.has(input.activeTab as ContactsTab)
    ? input.activeTab as ContactsTab
    : "all";
  const pageSize = VALID_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 25;
  const sortField = typeof input.sortField === "string" && VALID_SORT_FIELDS.has(input.sortField as ContactsSortField)
    ? input.sortField as ContactsSortField
    : "created_at";
  const sortDirection = typeof input.sortDirection === "string" && VALID_SORT_DIRECTIONS.has(input.sortDirection as ContactsSortDirection)
    ? input.sortDirection as ContactsSortDirection
    : "desc";

  return {
    activeTab,
    page,
    pageSize,
    sortField,
    sortDirection,
  };
}

export function toggleContactsPageSelection(
  selectedIds: Set<string>,
  visibleContactIds: string[],
): Set<string> {
  const next = new Set(selectedIds);
  const visibleIds = visibleContactIds.filter(Boolean);
  if (visibleIds.length === 0) return next;

  const everyVisibleSelected = visibleIds.every((id) => next.has(id));
  visibleIds.forEach((id) => {
    if (everyVisibleSelected) next.delete(id);
    else next.add(id);
  });

  return next;
}

/**
 * Gli operatori del pannello «Filtri». Il significato lo decide il database
 * (`marketing_contatti_dei_gruppi`): qui servono il nome e cosa vuole come
 * valore. «è»/«non è» su un testo libero cercano «contiene», come prima.
 */
export type OperatoreFiltro =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after"
  | "last_days"
  | "older_than_days";

/** Operatori che non vogliono un valore. */
export const OPERATORI_SENZA_VALORE: ReadonlySet<string> = new Set(["is_empty", "is_not_empty"]);

/** Operatori che vogliono un numero di giorni. */
export const OPERATORI_A_GIORNI: ReadonlySet<string> = new Set(["last_days", "older_than_days"]);

/** Campi data del contatto: «è», «prima del», «dopo il» vogliono un giorno. */
const CAMPI_DATA = new Set(["created_at", "last_activity_at"]);

/**
 * Una regola si può applicare? Senza valore non filtra niente, e prima la
 * pagina la contava lo stesso fra i filtri attivi: «1 filtro» su un elenco
 * che non era filtrato.
 */
export function regolaCompleta(regola: { field: string; operator: string; value: string }): boolean {
  if (OPERATORI_SENZA_VALORE.has(regola.operator)) return true;
  const valore = (regola.value ?? "").trim();
  if (OPERATORI_A_GIORNI.has(regola.operator)) {
    if (!/^\d{1,4}$/.test(valore)) return false;
    const giorni = Number(valore);
    return giorni >= 1 && giorni <= 3650;
  }
  if (CAMPI_DATA.has(regola.field)) return giornoValido(valore);
  return valore.length > 0;
}

function giornoValido(valore: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore);
  if (!m) return false;
  const data = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return data.getUTCFullYear() === Number(m[1]) && data.getUTCMonth() === Number(m[2]) - 1 && data.getUTCDate() === Number(m[3]);
}

/**
 * I gruppi con le sole regole applicabili, senza i gruppi rimasti vuoti: è
 * quello che «Applica» salva, così il conteggio dei filtri dice il vero.
 */
export function soloRegoleComplete<R extends { field: string; operator: string; value: string }, G extends { rules: R[] }>(
  gruppi: G[],
): G[] {
  return gruppi
    .map((gruppo) => ({ ...gruppo, rules: gruppo.rules.filter(regolaCompleta) }))
    .filter((gruppo) => gruppo.rules.length > 0);
}

/** Una regola dei filtri avanzati, nel formato che capisce il database. */
export type RegolaPerIlDatabase = Record<string, string>;

/**
 * Traduce i gruppi del pannello «Filtri» nel JSON che legge la funzione
 * `marketing_contatti_dei_gruppi`: regole in AND dentro il gruppo, gruppi fra
 * loro in OR.
 *
 * Le regole incomplete si scartano. Le date partono così come sono
 * (AAAA-MM-GG, o un numero di giorni): il giorno intero, sull'ora italiana, lo
 * calcola il database. Prima lo calcolava il browser in UTC, e un giorno
 * cominciava alle 02:00. I valori viaggiano nel corpo della richiesta, non
 * nell'URL: non serve più togliere virgole e parentesi, che nei tag ci sono.
 */
export function regoleGruppiPerIlDatabase(
  gruppi: Array<{ rules: Array<{ field: string; operator: string; value: string }> }>,
): Array<{ regole: RegolaPerIlDatabase[] }> | null {
  const usabili = soloRegoleComplete(gruppi).map((gruppo) => ({
    regole: gruppo.rules.map((regola): RegolaPerIlDatabase => ({
      campo: regola.field,
      operatore: regola.operator,
      valore: OPERATORI_SENZA_VALORE.has(regola.operator) ? "" : (regola.value ?? "").trim(),
    })),
  }));

  return usabili.length > 0 ? usabili : null;
}
