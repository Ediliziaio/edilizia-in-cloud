import { ACTION_MAP, campiObbligatoriMancanti } from "./flow-node-catalog";
import { actionConfigErrors, conditionConfigErrors, conditionOperatorAliases, delayConfigErrors, graphHasCycle } from "../../supabase/functions/_shared/automationValidation";
import { evaluateAutomationFilters, filterErrors, matchesAutomationTriggerConfig, automationTriggerConfigErrors } from "../../supabase/functions/_shared/automationFilters";

export type PreviewNode = { id: string; type?: string; data: Record<string, any> };
export type PreviewEdge = { source: string; target: string; label?: unknown };
export type PreviewStep = { nodeId: string; label: string; status: "planned" | "blocked" | "skipped" | "unverified"; detail: string; text?: string };
export type PlatformPreviewScenario = { triggerId: string; payload: Record<string, unknown> };

export function previewAutomationConfiguration(nodes: PreviewNode[]) {
  return nodes.filter(node => !["note", "end"].includes(node.type ?? "")).map(node => {
    const cfg = node.data;
    const id = String(cfg.itemId ?? cfg.item_id ?? cfg.action_type ?? cfg.trigger_type ?? cfg.trigger_event ?? "");
    const errors = [
      ...filterErrors(cfg.trigger_filters ?? cfg.filters),
      ...(node.type === "trigger" ? automationTriggerConfigErrors(cfg) : []),
      ...(id ? campiObbligatoriMancanti(id, cfg).map(field => `Completa ${field.label}.`) : []),
      ...(["condition", "goal"].includes(node.type ?? "") ? conditionConfigErrors(cfg) : []),
      ...(node.type === "delay" ? delayConfigErrors(cfg) : []),
      ...(node.type === "action" ? actionConfigErrors(cfg) : []),
    ];
    if (node.type === "action" && !id) errors.push("Scegli il tipo di azione.");
    return { nodeId: node.id, label: cfg.label || ACTION_MAP[id]?.label || node.type || "Passo", errors };
  });
}

/** Pure and bounded: never creates enrollments, writes data or calls a provider. */
export function previewAutomationPath(nodes: PreviewNode[], edges: PreviewEdge[], contact: Record<string, any>, timeZone = "Europe/Rome", scenario?: PlatformPreviewScenario): PreviewStep[] {
  if (graphHasCycle(edges)) return [{ nodeId: "", label: "Flusso", status: "blocked", detail: "Connessioni circolari: correggi il grafo prima della prova." }];
  const steps: PreviewStep[] = [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const roots = nodes.filter(node => node.type === "trigger");
  const pending = roots.length ? roots.map(node => node.id) : nodes.filter(node => node.type !== "note" && !edges.some(edge => edge.target === node.id)).map(node => node.id);
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const fields: Record<string, any> = scenario ? { ...scenario.payload } : { ...contact, full_name: fullName, name: fullName };
  const resolveText = (text: string) => text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (token, key) => {
    if (scenario) return fields[key] == null ? token : String(fields[key]);
    const field = key.replace(/^(contatto|contact)\./, "");
    return key === field && key.includes(".") ? token : fields[field] == null ? token : String(fields[field]);
  });
  const visited = new Set<string>();
  while (pending.length && steps.length < 200) {
    const id = pending.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node || node.type === "note" || node.type === "end") continue;
    const cfg = node.data;
    const itemId = String(cfg.itemId ?? cfg.item_id ?? cfg.action_type ?? cfg.trigger_type ?? cfg.trigger_event ?? "");
    const step: PreviewStep = { nodeId: id, label: cfg.label || ACTION_MAP[itemId]?.label || node.type || "Passo", status: "planned", detail: "Passo previsto; nessuna modifica eseguita." };
    let outgoing = edges.filter(edge => edge.source === id);
    if (node.type === "trigger") {
      const errors = [...filterErrors(cfg.trigger_filters ?? cfg.filters), ...automationTriggerConfigErrors(cfg)];
      if (errors.length) { step.status = "blocked"; step.detail = errors.join(" "); outgoing = []; }
      else if (cfg.isEmpty) step.detail = "Ingresso ricevente simulato: nessun evento creato.";
      else if (scenario) {
        const needed = ({ trial_in_scadenza: "trial.giorni_rimasti", crediti_ai_bassi: "crediti.saldo", fattura_piattaforma_scaduta: "fattura.giorni_ritardo" } as Record<string, string>)[itemId]
          ?? (itemId === "piano_cambiato" && cfg.tipo_cambio ? "piano.tipo_cambio" : itemId === "ticket_piattaforma_aperto" && cfg.priorita_filtro ? "ticket.priorita" : undefined);
        if (node.id !== scenario.triggerId) { step.status = "skipped"; step.detail = "Ingresso diverso dall’evento scelto per la simulazione."; outgoing = []; }
        else if (needed && (fields[needed] == null || String(fields[needed]).trim() === "")) { step.status = "unverified"; step.detail = `Completa il dato simulato ${needed}: il filtro non è verificabile senza questo valore.`; outgoing = []; }
        else if (!matchesAutomationTriggerConfig(cfg, fields, timeZone)) { step.status = "skipped"; step.detail = "I dati dell’evento simulato non soddisfano i filtri."; outgoing = []; }
        else step.detail = "Filtri verificati sui dati simulati: nessun evento reale creato.";
      }
      else if (!/^(contatto_|tag_|contact_|contact_tag|compleanno_contatto)/.test(itemId) || JSON.stringify(cfg).includes("custom_field.")) {
        step.status = "unverified"; step.detail = "Serve il record originale dell’evento o i suoi campi personalizzati. Il solo contatto non basta."; outgoing = [];
      } else if (!matchesAutomationTriggerConfig(cfg, contact, timeZone)) {
        step.status = "skipped"; step.detail = "I filtri non corrispondono: questo ingresso non prosegue."; outgoing = [];
      } else step.detail = "Filtri del contatto verificati. È simulato l’evento, non il suo verificarsi reale.";
    } else if (node.type === "condition" || node.type === "goal") {
      const errors = conditionConfigErrors(cfg);
      if (errors.length) { step.status = "blocked"; step.detail = errors.join(" "); outgoing = []; }
      else {
        const rows = Array.isArray(cfg.condizioni) ? cfg.condizioni : [{ campo: cfg.condition_field ?? cfg.variabile, operatore: cfg.condition_operator ?? cfg.operatore, valore: cfg.condition_value ?? cfg.valore }];
        const conditionFields = rows.map((row: any) => String(row.campo ?? row.variabile ?? "").replace(/^\{\{\s*|\s*\}\}$/g, ""));
        if (conditionFields.some((field: string) => scenario ? !Object.hasOwn(fields, field) : field.includes(".") && !/^(contatto|contact)\./.test(field)) || rows.some((row: any) => ["da_oggi", "prima_di_oggi"].includes(row.operatore))) {
          step.status = "unverified"; step.detail = "Questo criterio richiede dati aggiuntivi o il calendario: ramo non simulato."; outgoing = [];
        } else {
          const matched = evaluateAutomationFilters({ logic: cfg.operatore_logico ?? "AND", conditions: rows.map((row: any, index: number) => ({ field: scenario ? conditionFields[index] : conditionFields[index].replace(/^(contatto|contact)\./, ""), operator: conditionOperatorAliases[row.operatore ?? "uguale"] ?? row.operatore, value: row.valore })) }, fields, { timeZone });
          step.detail = node.type === "goal" ? `Obiettivo ${matched ? "raggiunto: il flusso termina" : "non raggiunto: prosegue"}.` : `Criterio verificato: ramo ${matched ? "Sì" : "No"}.`;
          if (node.type === "goal" && matched) outgoing = [];
          else if (node.type === "condition" && outgoing.some(edge => !!edge.label)) outgoing = outgoing.filter(edge => {
            const label = String(edge.label ?? "").trim().toLowerCase();
            return matched ? ["sì", "si", "yes", "true", "vero"].includes(label) : ["no", "false", "falso"].includes(label);
          });
        }
      }
    } else if (node.type === "delay") {
      const errors = delayConfigErrors(cfg);
      if (errors.length) { step.status = "blocked"; step.detail = errors.join(" "); outgoing = []; }
      else step.detail = "Attesa configurata. Data effettiva e finestra d’invio verranno calcolate dal motore; qui non si aspetta.";
    } else if (node.type === "split") {
      step.status = "unverified"; step.detail = "Sono mostrati tutti i rami possibili; nessuna assegnazione casuale viene eseguita.";
    } else if (node.type === "action") {
      const missing = campiObbligatoriMancanti(itemId, cfg);
      const invalid = actionConfigErrors(cfg);
      if (!itemId || !ACTION_MAP[itemId]) { step.status = "unverified"; step.detail = "Azione legacy o non riconosciuta: occorre il collaudo del motore."; outgoing = []; }
      else if (missing.length || invalid.length) { step.status = "blocked"; step.detail = [missing.length ? `Completa: ${missing.map(field => field.label).join(", ")}.` : "", ...invalid].filter(Boolean).join(" "); outgoing = []; }
      else {
        step.status = "unverified";
        step.detail = "Configurazione obbligatoria presente. Permessi, disponibilità dei record e servizio esterno NON verificati.";
        const text = cfg.corpo ?? cfg.email_body ?? cfg.messaggio ?? cfg.testo ?? cfg.titolo ?? cfg.nome ?? cfg.prompt;
        if (typeof text === "string") {
          step.text = resolveText(text);
          if (step.text.includes("{{")) step.detail += " Alcune variabili richiedono altri dati e restano evidenziate nel testo.";
        }
      }
      if (itemId === "end_automation") { outgoing = []; step.detail = "Termine dell’iscrizione: nessun passo successivo previsto."; }
      if (["vai_a", "wait_for_event", "drip_sequenza"].includes(itemId)) { outgoing = []; step.detail += " Salti, eventi attesi e ripetizioni richiedono il collaudo specifico del motore."; }
    } else { step.status = "unverified"; step.detail = "Tipo di passo non supportato dalla simulazione."; outgoing = []; }
    steps.push(step);
    pending.push(...outgoing.map(edge => edge.target));
  }
  return steps;
}
