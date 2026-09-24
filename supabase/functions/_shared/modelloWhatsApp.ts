/**
 * Modelli WhatsApp (template approvati da Meta): lingua e testo (24/09/2026).
 *
 * Chi inviava un modello salvava in whatsapp_messages solo «[Template: nome]»:
 * nelle conversazioni si vedeva l'etichetta, non il messaggio arrivato al
 * cliente. Qui il corpo del modello (components_json di wa_meta_templates,
 * così come lo dà Meta) con le variabili {{1}}, {{2}}… sostituite dai valori
 * davvero inviati.
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

/** «it_IT» e «it» sono la stessa lingua per l'elenco dei modelli. */
export function lingueDelModello(lingua: unknown): string[] {
  const l = typeof lingua === "string" ? lingua.trim() : "";
  if (!l) return [];
  const base = l.split("_")[0];
  return base === l ? [l] : [l, base];
}

type Oggetto = Record<string, unknown>;

function oggetto(v: unknown): v is Oggetto {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Il testo del componente BODY del modello, o null se non c'è. */
export function corpoDelModello(componenti: unknown): string | null {
  if (!Array.isArray(componenti)) return null;
  const corpo = componenti.find((c) => oggetto(c) && String(c.type ?? "").toUpperCase() === "BODY");
  const testo = oggetto(corpo) ? corpo.text : null;
  return typeof testo === "string" && testo.trim() ? testo : null;
}

/** Il testo di un parametro d'invio: testo, oppure il valore di riserva di valuta e data. */
function testoDelParametro(p: unknown): string {
  if (!oggetto(p)) return "";
  if (typeof p.text === "string") return p.text;
  for (const chiave of ["currency", "date_time"]) {
    const v = p[chiave];
    if (oggetto(v) && typeof v.fallback_value === "string") return v.fallback_value;
  }
  return "";
}

/**
 * I valori del corpo, nell'ordine {{1}}, {{2}}…, presi dai componenti
 * d'invio (formato Meta: `[{ type: "body", parameters: [...] }]`).
 */
export function valoriDaiComponenti(componenti: unknown): string[] {
  if (!Array.isArray(componenti)) return [];
  const corpo = componenti.find((c) => oggetto(c) && String(c.type ?? "").toLowerCase() === "body");
  const parametri = oggetto(corpo) && Array.isArray(corpo.parameters) ? corpo.parameters : [];
  return parametri.map(testoDelParametro);
}

/**
 * Il corpo con {{n}} sostituite dai valori. Una variabile senza valore resta
 * scritta com'è: Meta non consegna un modello a cui manca un parametro, quindi
 * se succede è meglio vederlo.
 */
export function testoDelModello(corpo: string, valori: readonly string[]): string {
  return corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (segnaposto, n: string) => {
    const v = valori[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : segnaposto;
  });
}
