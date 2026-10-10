import { filterErrors } from "./automationFilters.ts";
import { automationWebhookUrl } from "./automationWebhook.ts";

export const conditionOperatorAliases: Record<string, string> = {
  uguale: "equals", diverso: "not_equals", contiene: "contains", non_contiene: "not_contains",
  inizia_con: "starts_with", finisce_con: "ends_with", vuoto: "is_empty", non_vuoto: "is_not_empty",
  maggiore: "gt", minore: "lt", maggiore_uguale: "gte", minore_uguale: "lte",
};

export function conditionConfigErrors(config: Record<string, any>): string[] {
  if (config.operatore_logico && !["AND", "OR"].includes(config.operatore_logico)) return ["La logica della condizione deve essere AND oppure OR."];
  const rows = Array.isArray(config.condizioni) ? config.condizioni
    : config.condition_field || config.variabile
      ? [{ campo: config.condition_field ?? config.variabile, operatore: config.condition_operator ?? config.operatore, valore: config.condition_value ?? config.valore }]
      : [];
  if (!rows.length) return ["Configura almeno un criterio per la condizione."];
  const errors: string[] = [];
  rows.forEach((row: any, index: number) => {
    if (!row || typeof row !== "object") { errors.push(`Criterio ${index + 1}: formato non valido.`); return; }
    const field = String(row.campo ?? row.variabile ?? "").trim();
    const operator = String(row.operatore ?? "uguale");
    if (["da_oggi", "prima_di_oggi"].includes(operator)) {
      if (!field) errors.push(`Criterio ${index + 1}: scegli un campo.`);
      return;
    }
    for (const error of filterErrors({ conditions: [{ field, operator: conditionOperatorAliases[operator] ?? operator, value: row.valore }] })) {
      errors.push(`Criterio ${index + 1}: ${error}`);
    }
  });
  return errors;
}

export function actionConfigErrors(config: Record<string, any>): string[] {
  // Match the worker's legacy action_type precedence; itemId is UI-only.
  const id = String(config.action_type ?? config.item_id ?? config.itemId ?? "");
  const errors: string[] = [];
  const integer = (key: string, min: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = config[key];
    if (value == null || value === "") return;
    if (typeof value === "boolean" || typeof value === "object" || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) errors.push(`${key}: scegli un intero tra ${min} e ${max === Number.MAX_SAFE_INTEGER ? "il massimo consentito" : max}.`);
  };
  if (id === "wait_for_event") integer("timeout_days", 1, 365);
  if (id === "crea_cs_task") integer("scadenza_giorni", 0, 365);
  if (id === "crea_account_azienda") integer("trial_giorni", 0, 90);
  if (id === "invia_fattura") integer("scadenza_giorni", 0, 365);
  if (id === "invia_notifica_team_admin" && config.canale && !["in_app", "email"].includes(config.canale)) errors.push("Canale della notifica non supportato.");
  if (id === "crea_cs_task" && config.priorita && !["urgente", "alta", "media", "bassa"].includes(config.priorita)) errors.push("Priorità CS non supportata.");
  if (id === "crea_account_azienda" && config.invia_credenziali && !["si", "no"].includes(config.invia_credenziali)) errors.push("Scegli se inviare il link di accesso.");
  if (id === "invia_fattura" && config.invia_email && !["si", "no"].includes(config.invia_email)) errors.push("Scegli se inviare l’avviso di addebito.");
  if (id === "drip_sequenza") {
    integer("num_messaggi", 1, 20);
    if (config.intervallo_ore != null && config.intervallo_ore !== "" && (!Number.isFinite(Number(config.intervallo_ore)) || Number(config.intervallo_ore) <= 0)) errors.push("L’intervallo della sequenza deve essere positivo.");
  }
  if (id === "crea_appuntamento") {
    integer("giorni_da_oggi", 0);
    if (config.orario && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(config.orario))) errors.push("Orario dell’appuntamento non valido.");
  }
  if (["crea_bozza_ordine", "crea_cantiere", "crea_fattura", "invia_fattura"].includes(id) && config.importo != null && config.importo !== "" && !String(config.importo).includes("{{")) {
    const amount = Number(String(config.importo).replace(",", "."));
    if (!["number", "string"].includes(typeof config.importo) || String(config.importo).trim() === "" || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)) || (id === "invia_fattura" && amount * 100 > 2147483647)) errors.push("L’importo deve essere un numero da zero in su, senza separatori delle migliaia e nei limiti consentiti.");
  }
  if (["chiama_webhook", "webhook_out"].includes(id)) {
    const url = config.url ?? config.webhook_url;
    if (url && !String(url).includes("{{")) {
      try { automationWebhookUrl(String(url)); } catch (error: any) { errors.push(error.message); }
    }
    if (config.headers != null && config.headers !== "") {
      try {
        const headers = typeof config.headers === "string" ? JSON.parse(config.headers) : config.headers;
        if (!headers || typeof headers !== "object" || Array.isArray(headers) || Object.values(headers).some(value => typeof value !== "string")) throw new Error();
      } catch { errors.push("Gli header del webhook devono essere un oggetto JSON con valori testuali."); }
    }
  }
  return errors;
}

export function delayConfigErrors(config: Record<string, any>): string[] {
  if (config.delay_tipo === "fino_a") {
    return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(config.delay_orario ?? ""))
      ? [] : ["Scegli un orario valido tra 00:00 e 23:59."];
  }
  if (config.delay_tipo === "prima_appuntamento") {
    const hours = config.delay_ore ?? config.ore ?? 24;
    return String(hours).trim() !== "" && Number.isFinite(Number(hours)) && Number(hours) >= 0
      ? [] : ["Le ore prima dell’appuntamento devono essere un numero da zero in su."];
  }
  const value = config.delay_durata ?? config.delay_value;
  if (value != null && value !== "" && (!Number.isInteger(Number(value)) || Number(value) <= 0)) {
    return ["La durata dell’attesa deve essere un intero maggiore di zero."];
  }
  if (["giorni", "ore", "minuti"].some(key => config[key] != null && (!Number.isInteger(Number(config[key])) || Number(config[key]) < 0))) {
    return ["Giorni, ore e minuti devono essere interi da zero in su."];
  }
  if (config.delay_unita && !["secondi", "minuti", "ore", "giorni", "settimane"].includes(config.delay_unita)) return ["Unità dell’attesa non supportata."];
  if (config.delay_unit && !["minutes", "hours", "days"].includes(config.delay_unit)) return ["Unità dell’attesa non supportata."];
  return []; // Unconfigured legacy delays retain the documented one-hour default.
}

/** Iterative reachability: also safe for imported, already-cyclic graphs. */
export function connectionCreatesCycle(edges: Array<{ source: string; target: string }>, source: string, target: string): boolean {
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
  const visited = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const node = pending.pop()!;
    if (node === source) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    pending.push(...(next.get(node) ?? []));
  }
  return false;
}

export function graphHasCycle(edges: Array<{ source: string; target: string }>): boolean {
  return edges.some(edge => connectionCreatesCycle(edges, edge.source, edge.target));
}
