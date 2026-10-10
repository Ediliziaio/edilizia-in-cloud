import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { TRIGGER_MAP } from "@/lib/flow-node-catalog";
import { ShieldCheck, CheckCircle, XCircle } from "lucide-react";
import type { AutomationFlow } from "@/types/automationBuilder";
import { filterErrors, matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";
import { previewAutomationConfiguration, previewAutomationPath, type PreviewEdge } from "@/lib/automationPreview";

interface Props {
  open: boolean;
  onClose: () => void;
  flow: AutomationFlow | null | undefined;
  companyId?: string;
  nodes: Array<{ id: string; type?: string; data: Record<string, any> }>;
  edges?: PreviewEdge[];
}

export function TestFlowDialog({ open, onClose, flow, companyId, nodes, edges = [] }: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState(false);
  const platform = companyId === PLATFORM_ADMIN_COMPANY_ID && nodes.some(n => n.type === "trigger" && TRIGGER_MAP[String(n.data.itemId ?? n.data.item_id ?? n.data.trigger_type)]?.categoria === "piattaforma");
  const [scenarioTriggerId, setScenarioTriggerId] = useState("");
  const [scenarioJson, setScenarioJson] = useState("{}");
  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: ["automation-preview-contacts", companyId, search],
    queryFn: async () => {
      let query = supabase.from("marketing_contacts").select("*")
        .eq("company_id", companyId!).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(10);
      for (const filter of filtriRicercaContatti(search)) query = query.or(filter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!companyId && !platform,
  });
  const { data: companies = [], isLoading: loadingCompanies, error: companyError } = useQuery({
    queryKey: ["automation-preview-companies", companyId, search],
    enabled: open && platform,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name, email, status, trial_ends_at")
        .neq("id", PLATFORM_ADMIN_COMPANY_ID).ilike("name", `%${search.replace(/[%_]/g, "")}%`).order("name").limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const contact = contacts.find(c => c.id === selectedId);
  const company = companies.find(c => c.id === selectedId);
  const triggers = nodes.filter(n => n.type === "trigger" && !n.data.isEmpty);
  const timeZone = flow?.timezone || "Europe/Rome";
  let scenarioPayload: Record<string, unknown> | undefined;
  let scenarioError = "";
  try {
    const parsed = JSON.parse(scenarioJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    scenarioPayload = parsed;
  } catch { scenarioError = "I dati dell’evento devono essere un oggetto JSON valido."; }
  const selectedRecord = platform ? company : contact;
  const selectedTrigger = triggers.find(n => n.id === scenarioTriggerId);
  const eventId = String(selectedTrigger?.data.itemId ?? selectedTrigger?.data.item_id ?? selectedTrigger?.data.trigger_type ?? "");
  const setScenarioValue = (key: string, value: unknown) => {
    setScenarioJson(JSON.stringify({ ...scenarioPayload, [key]: value }, null, 2));
    setChecked(false);
  };
  const results = checked && contact ? triggers.map(n => {
    const cfg = n.data;
    const id = String(cfg.itemId ?? cfg.item_id ?? cfg.trigger_event ?? "");
    // A contact is not an invoice, appointment or stock movement. Do not present
    // missing event data as a successfully tested business trigger.
    const contactEvent = /^(contatto_|tag_|contact_|contact_tag|compleanno_contatto)/.test(id);
    const errors = filterErrors(cfg.trigger_filters ?? cfg.filters);
    const needsCustomFields = JSON.stringify(cfg.trigger_filters ?? cfg.filters ?? {}).includes("custom_field.");
    return {
      id: n.id, label: cfg.label || id || "Trigger",
      detail: errors[0] || (!contactEvent || needsCustomFields
        ? "Serve il record e il contesto dell’evento: questa anteprima verifica solo i campi standard del contatto."
        : matchesAutomationTriggerConfig(cfg, contact, timeZone)
          ? "Il contatto soddisfa i filtri di questo trigger."
          : "Il contatto non soddisfa i filtri: non entrerebbe da questo trigger."),
      matched: errors.length === 0 && contactEvent && !needsCustomFields && matchesAutomationTriggerConfig(cfg, contact, timeZone),
    };
  }) : [];
  const path = checked && selectedRecord && !scenarioError ? previewAutomationPath(nodes, edges, selectedRecord, timeZone,
    platform && scenarioPayload ? { triggerId: scenarioTriggerId, payload: scenarioPayload } : undefined) : [];
  const configuration = checked ? previewAutomationConfiguration(nodes) : [];
  const close = () => { setSearch(""); setSelectedId(""); setChecked(false); setScenarioTriggerId(""); setScenarioJson("{}"); onClose(); };
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verifica il flusso</DialogTitle>
          <DialogDescription>Filtri, percorso e testi della bozza aperta. Non è una prova di consegna né un’esecuzione delle azioni.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <p>Nessun messaggio inviato, nessun dato modificato e nessuna iscrizione creata. Le azioni e i servizi esterni non vengono eseguiti.</p>
        </div>
        <Input aria-label={platform ? "Cerca azienda per anteprima" : "Cerca contatto per anteprima"} placeholder={platform ? "Cerca un’azienda per nome…" : "Cerca un contatto per nome o email…"}
          value={search} onChange={e => { setSearch(e.target.value); setSelectedId(""); setChecked(false); }} />
        {(platform ? companyError : error) && <p role="alert" className="text-sm text-destructive">Impossibile leggere i dati per l’anteprima. Riprova.</p>}
        <div className="max-h-52 overflow-y-auto divide-y rounded-lg border">
          {platform && (loadingCompanies ? <p className="p-3 text-sm">Caricamento aziende…</p> : companies.map(c => (
            <button key={c.id} type="button" aria-pressed={selectedId === c.id} className={"w-full p-3 text-left text-sm hover:bg-muted " + (selectedId === c.id ? "bg-primary/10" : "")}
              onClick={() => {
                setSelectedId(c.id); setChecked(false);
                setScenarioJson(JSON.stringify({ "azienda.id": c.id, "azienda.name": c.name, "azienda.email": c.email, "azienda.status": c.status,
                  "trial.giorni_rimasti": c.trial_ends_at ? Math.max(0, Math.ceil((Date.parse(c.trial_ends_at) - Date.now()) / 86400000)) : null,
                  "crediti.saldo": null, "fattura.giorni_ritardo": null, "piano.tipo_cambio": null, "ticket.priorita": null }, null, 2));
              }}>
              <span className="font-medium">{c.name}</span><span className="block text-xs text-muted-foreground">{c.status}</span>
            </button>
          )))}
          {!platform && (isLoading ? <p className="p-3 text-sm">Caricamento…</p> : contacts.map(c => (
            <button key={c.id} type="button" aria-pressed={selectedId === c.id}
              className={"w-full p-3 text-left text-sm hover:bg-muted " + (selectedId === c.id ? "bg-primary/10" : "")}
              onClick={() => { setSelectedId(c.id); setChecked(false); }}>
              <span className="font-medium">{c.first_name} {c.last_name}</span>
              <span className="block text-xs text-muted-foreground">{c.email || "Senza email"}</span>
            </button>
          )))}
          {!(platform ? loadingCompanies : isLoading) && !(platform ? companyError : error) && !(platform ? companies.length : contacts.length) && <p className="p-3 text-sm text-muted-foreground">Nessun risultato trovato.</p>}
        </div>
        {platform && <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="platform-preview-trigger">Evento da simulare</label>
          <select id="platform-preview-trigger" className="w-full rounded border bg-background p-2 text-sm" value={scenarioTriggerId} onChange={e => { setScenarioTriggerId(e.target.value); setChecked(false); }}>
            <option value="">Scegli un ingresso del flusso</option>
            {triggers.map(n => <option key={n.id} value={n.id}>{n.data.label || n.data.itemId || n.data.item_id || n.data.trigger_type || "Trigger"}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Nome e stato vengono dall’azienda scelta. Completa i valori null per la prova: crediti, ritardi e cambio piano non sono letti dai servizi esterni e non attestano un evento reale.</p>
          {[["trial_in_scadenza", "trial.giorni_rimasti", "Giorni rimasti nel trial"], ["crediti_ai_bassi", "crediti.saldo", "Crediti disponibili (€)"], ["fattura_piattaforma_scaduta", "fattura.giorni_ritardo", "Giorni di ritardo"]].filter(([trigger]) => trigger === eventId).map(([, key, label]) => (
            <label key={key} className="block space-y-1 text-sm">{label}<Input aria-label={label} type="number" step={key === "crediti.saldo" ? "0.01" : "1"} value={scenarioPayload?.[key] == null ? "" : String(scenarioPayload[key])} onChange={e => setScenarioValue(key, e.target.value === "" ? null : Number(e.target.value))} /></label>
          ))}
          {eventId === "piano_cambiato" && <label className="block space-y-1 text-sm">Tipo cambio piano<select aria-label="Tipo cambio piano" className="w-full rounded border bg-background p-2" value={String(scenarioPayload?.["piano.tipo_cambio"] ?? "")} onChange={e => setScenarioValue("piano.tipo_cambio", e.target.value || null)}>
            <option value="">Scegli il caso da provare</option><option value="upgrade">Upgrade</option><option value="downgrade">Downgrade</option><option value="change">Cambio senza differenza di prezzo</option>
          </select></label>}
          {eventId === "ticket_piattaforma_aperto" && <label className="block space-y-1 text-sm">Priorità ticket<select aria-label="Priorità ticket" className="w-full rounded border bg-background p-2" value={String(scenarioPayload?.["ticket.priorita"] ?? "")} onChange={e => setScenarioValue("ticket.priorita", e.target.value || null)}>
            <option value="">Scegli il caso da provare</option><option value="urgente">Urgente</option><option value="alta">Alta</option><option value="normale">Normale</option>
          </select></label>}
          <details className="text-sm"><summary className="cursor-pointer">Dati avanzati dell’evento (JSON)</summary>
            <label className="block pt-2 font-medium" htmlFor="platform-preview-payload">Dati dell’evento simulato</label>
            <Textarea id="platform-preview-payload" value={scenarioJson} rows={8} className="font-mono text-xs" onChange={e => { setScenarioJson(e.target.value); setChecked(false); }} />
          </details>
          {scenarioError && <p role="alert" className="text-xs text-destructive">{scenarioError}</p>}
        </div>}
        {!triggers.length && <p className="text-xs text-muted-foreground">Il flusso non ha trigger: può ricevere iscrizioni da un’altra automazione.</p>}
        {results.length > 0 && <div className="max-h-48 space-y-2 overflow-y-auto" aria-live="polite">
          {results.map(r => <div key={r.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">{r.matched ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}{r.label}</div>
            <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
          </div>)}
        </div>}
        {configuration.length > 0 && <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Controlli base di tutti i {configuration.length} passi</summary>
          <p className="mt-2 text-xs text-muted-foreground">Campi obbligatori e valori di configurazione, inclusi i passi non percorsi. Non verifica i servizi esterni.</p>
          <ul className="mt-2 space-y-2">
            {configuration.map(step => <li key={step.nodeId} className="text-xs">
              <span className="font-medium">{step.label}: </span>
              <span className={step.errors.length ? "text-destructive" : "text-muted-foreground"}>
                {step.errors.length ? step.errors.join(" ") : "nessun errore nei controlli base"}
              </span>
            </li>)}
          </ul>
        </details>}
        {path.length > 0 && <section className="space-y-2" aria-label="Anteprima percorso">
          <h3 className="text-sm font-medium">Percorso previsto</h3>
          <p className="text-xs text-muted-foreground">“Da verificare” non significa riuscito: per le azioni servono anche record, permessi e servizi disponibili.</p>
          <ol className="max-h-64 space-y-2 overflow-y-auto">
            {path.map((step, index) => <li key={step.nodeId} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{index + 1}. {step.label}</span>
                <span className={step.status === "blocked" ? "text-destructive" : "text-muted-foreground"}>
                  {{ planned: "Previsto", blocked: "Da correggere", skipped: "Non attivato", unverified: "Da verificare" }[step.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
              {step.text && <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs font-sans">{step.text}</pre>}
            </li>)}
          </ol>
        </section>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>Chiudi</Button>
          <Button disabled={!selectedRecord || (platform && (!!scenarioError || (!!triggers.length && !scenarioTriggerId)))} onClick={() => setChecked(true)}>Verifica percorso e testi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
