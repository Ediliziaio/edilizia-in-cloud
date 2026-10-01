export type CheckResult = "pending" | "ok" | "reserve" | "na";
export interface AcceptanceCheck {
  label: string;
  result: CheckResult;
  note: string;
}
export interface AcceptanceAction {
  work: string;
  owner: string;
  due: string;
}
export interface AcceptanceContent {
  title: string;
  date: string;
  scope: string;
  inspector: string;
  customer: string;
  outcome: "pending" | "positive" | "reserves" | "negative";
  checks: AcceptanceCheck[];
  reservations: string;
  actions: AcceptanceAction[];
  documents: string;
  notes: string;
}
export const outcomes = {
  pending: "Da verificare",
  positive: "Positivo",
  reserves: "Con riserve",
  negative: "Negativo",
};
export const results = {
  pending: "Da verificare",
  ok: "Verificato",
  reserve: "Con riserva",
  na: "Non applicabile",
};
export function emptyAcceptance(date: string): AcceptanceContent {
  return {
    title: "Verbale di verifica e consegna lavori",
    date,
    scope: "",
    inspector: "",
    customer: "",
    outcome: "pending",
    checks: [
      "Lavorazioni previste e finiture",
      "Funzionamento delle parti installate",
      "Pulizia e ripristino degli ambienti",
      "Documenti e istruzioni consegnati",
    ].map((label) => ({ label, result: "pending", note: "" })),
    reservations: "",
    actions: [],
    documents: "",
    notes: "",
  };
}
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function validateAcceptance(value: unknown, complete = false): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return ["Contenuto del verbale non valido"];
  const c = value as AcceptanceContent;
  const errors: string[] = [];
  for (const key of [
    "title",
    "date",
    "scope",
    "inspector",
    "customer",
    "reservations",
    "documents",
    "notes",
  ] as const) {
    if (
      typeof c[key] !== "string" ||
      c[key].length >
        (["title", "inspector", "customer"].includes(key) ? 200 : 4000)
    )
      errors.push(`Campo ${key} non valido o troppo lungo`);
  }
  if (errors.length) return errors;
  if (!c.title.trim() || !validDate(c.date))
    errors.push("Inserisci titolo e data validi");
  if (!Object.hasOwn(outcomes, c.outcome)) errors.push("Esito non valido");
  if (!Array.isArray(c.checks) || !c.checks.length || c.checks.length > 30)
    errors.push("Inserisci da 1 a 30 verifiche");
  else
    c.checks.forEach((v, i) => {
      if (
        !v ||
        typeof v.label !== "string" ||
        !v.label.trim() ||
        v.label.length > 200 ||
        typeof v.note !== "string" ||
        v.note.length > 2000 ||
        !Object.hasOwn(results, v.result)
      )
        errors.push(`Verifica ${i + 1} non valida`);
      else if (
        complete &&
        (v.result === "pending" ||
          ((v.result === "reserve" || v.result === "na") && !v.note.trim()))
      )
        errors.push(
          `Completa la verifica ${i + 1} e motiva riserve o non applicabilità`,
        );
    });
  if (!Array.isArray(c.actions) || c.actions.length > 30)
    errors.push("Elenco interventi non valido");
  else
    c.actions.forEach((a, i) => {
      if (
        !a ||
        typeof a.work !== "string" ||
        a.work.length > 2000 ||
        typeof a.owner !== "string" ||
        a.owner.length > 200 ||
        typeof a.due !== "string" ||
        (a.due !== "" && !validDate(a.due))
      )
        errors.push(`Intervento ${i + 1} non valido`);
      else if (
        complete &&
        (!a.work.trim() || !a.owner.trim() || !a.due || a.due < c.date)
      )
        errors.push(
          `Intervento ${i + 1}: indica attività, responsabile e scadenza non precedente alla verifica`,
        );
    });
  if (errors.length) return errors;
  if (complete) {
    if (!c.scope.trim() || !c.inspector.trim() || !c.customer.trim())
      errors.push("Indica lavori verificati, verificatore e cliente");
    if (c.outcome === "pending") errors.push("Scegli un esito della verifica");
    if (
      ["reserves", "negative"].includes(c.outcome) &&
      (!c.reservations.trim() || !Array.isArray(c.actions) || !c.actions.length)
    )
      errors.push(
        "Descrivi le riserve e almeno un intervento con responsabile e scadenza",
      );
    if (
      c.outcome === "positive" &&
      (c.reservations.trim() ||
        c.actions?.length ||
        c.checks?.some((v) => v.result === "reserve"))
    )
      errors.push(
        "Sono presenti riserve o attività aperte: scegli un esito coerente",
      );
    if (!c.checks?.some((v) => v.result === "ok" || v.result === "reserve"))
      errors.push("Verifica almeno una voce applicabile");
    if (!c.documents.trim())
      errors.push(
        "Indica i documenti consegnati, oppure specifica che non sono previsti",
      );
  }
  return errors;
}
