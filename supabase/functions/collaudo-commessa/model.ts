import { leggiSchema, leggiValori, mancanti, valoriInBozza, type CampoModulo, type ModuloSchema, type ValoreCampo } from "../_shared/moduliCantiere.ts";

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
  /** Copia dei campi del modello presa alla creazione: se il modello cambia, questo verbale non cambia. */
  campi?: CampoModulo[];
  valori?: ValoreCampo[];
  /** Il modello da cui nasce: decide se il capocantiere può vederlo e firmarlo. */
  modulo_id?: string;
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
const LIMITE_FIRMA = 500 * 1024;
const PNG_INIZIO = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** La firma tracciata sullo schermo (PNG in base64), in byte; null se non è un PNG o è troppo grande. */
export function firmaInByte(immagine: unknown): Uint8Array | null {
  if (typeof immagine !== "string" || !immagine.startsWith("data:image/png;base64,")) return null;
  const base64 = immagine.slice("data:image/png;base64,".length);
  if (base64.length > (LIMITE_FIRMA * 4) / 3 + 4) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return PNG_INIZIO.every((b, i) => bytes[i] === b) ? bytes : null;
  } catch {
    return null;
  }
}
export function validaFirma(firma: unknown): string[] {
  const f = (firma ?? {}) as { immagine?: unknown; nome?: unknown };
  const errori: string[] = [];
  if (typeof f.nome !== "string" || !f.nome.trim() || f.nome.length > 200) errori.push("Scrivi il nome di chi firma");
  if (!firmaInByte(f.immagine)) errori.push("Firma non valida: falla ripetere");
  return errori;
}

/** Un verbale nuovo dal modello dell'azienda; senza modello è quello di sempre. */
export function acceptanceDaModello(date: string, modello: ModuloSchema | null, moduloId?: string): AcceptanceContent {
  const vuoto = emptyAcceptance(date);
  if (!modello) return vuoto;
  return {
    ...vuoto,
    title: modello.titolo?.trim() || vuoto.title,
    checks: modello.voci?.length
      ? modello.voci.map((label) => ({ label, result: "pending" as const, note: "" }))
      : vuoto.checks,
    campi: structuredClone(modello.campi.filter((c) => !c.archiviato)),
    valori: [],
    ...(moduloId ? { modulo_id: moduloId } : {}),
  };
}
/**
 * Il capo compila, non riscrive il modello: titolo, elenco delle voci, campi e modello restano quelli di partenza,
 * qualunque cosa arrivi dal telefono. Da lui si prendono solo l'esito e il motivo di ogni voce, oltre al resto del verbale.
 */
export function verbaleDelCapo(arrivato: AcceptanceContent, base: AcceptanceContent): AcceptanceContent {
  const scritte = Array.isArray(arrivato.checks) ? arrivato.checks : [];
  return {
    ...arrivato,
    title: base.title,
    checks: base.checks.map((voce, i) => {
      const scritta = scritte[i];
      return {
        label: voce.label,
        result: scritta && Object.hasOwn(results, scritta.result) ? scritta.result : "pending",
        note: typeof scritta?.note === "string" ? scritta.note : "",
      };
    }),
    campi: base.campi,
    modulo_id: base.modulo_id,
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
  if (c.campi !== undefined && !Array.isArray(c.campi)) errors.push("Dati del collaudo non validi");
  if (c.modulo_id !== undefined && typeof c.modulo_id !== "string") errors.push("Modello del verbale non valido");
  if (c.valori !== undefined && (!Array.isArray(c.valori) || leggiValori(c.valori).length !== c.valori.length))
    errors.push("Valori del collaudo non validi");
  if (errors.length) return errors;
  if (complete) {
    const campi = leggiSchema({ campi: c.campi }).campi;
    const manca = mancanti(campi, valoriInBozza(leggiValori(c.valori)));
    if (manca.length) errors.push(`Compila: ${manca.join(", ")}`);
  }
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
