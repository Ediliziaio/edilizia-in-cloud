import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, CheckCircle, XCircle } from "lucide-react";
import type { AutomationFlow } from "@/types/automationBuilder";
import { filterErrors, matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";

interface Props {
  open: boolean;
  onClose: () => void;
  flow: AutomationFlow | null | undefined;
  companyId?: string;
  nodes: Array<{ id: string; type?: string; data: Record<string, any> }>;
}

export function TestFlowDialog({ open, onClose, flow, companyId, nodes }: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState(false);
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
    enabled: open && !!companyId,
  });
  const contact = contacts.find(c => c.id === selectedId);
  const triggers = nodes.filter(n => n.type === "trigger" && !n.data.isEmpty);
  const timeZone = flow?.timezone || "Europe/Rome";
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
  const close = () => { setSearch(""); setSelectedId(""); setChecked(false); onClose(); };
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verifica il flusso</DialogTitle>
          <DialogDescription>Anteprima dei filtri sulla bozza aperta. Non è un’esecuzione delle azioni.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <p>Nessun messaggio inviato, nessun dato modificato e nessuna iscrizione creata. Le azioni e i servizi esterni non vengono eseguiti.</p>
        </div>
        <Input aria-label="Cerca contatto per anteprima" placeholder="Cerca un contatto per nome o email…"
          value={search} onChange={e => { setSearch(e.target.value); setSelectedId(""); setChecked(false); }} />
        {error && <p role="alert" className="text-sm text-destructive">Impossibile leggere i contatti. Riprova.</p>}
        <div className="max-h-52 overflow-y-auto divide-y rounded-lg border">
          {isLoading ? <p className="p-3 text-sm">Caricamento…</p> : contacts.map(c => (
            <button key={c.id} type="button" aria-pressed={selectedId === c.id}
              className={"w-full p-3 text-left text-sm hover:bg-muted " + (selectedId === c.id ? "bg-primary/10" : "")}
              onClick={() => { setSelectedId(c.id); setChecked(false); }}>
              <span className="font-medium">{c.first_name} {c.last_name}</span>
              <span className="block text-xs text-muted-foreground">{c.email || "Senza email"}</span>
            </button>
          ))}
          {!isLoading && !error && !contacts.length && <p className="p-3 text-sm text-muted-foreground">Nessun contatto trovato.</p>}
        </div>
        {!triggers.length && <p className="text-xs text-muted-foreground">Il flusso non ha trigger: può ricevere iscrizioni da un’altra automazione.</p>}
        {results.length > 0 && <div className="max-h-48 space-y-2 overflow-y-auto" aria-live="polite">
          {results.map(r => <div key={r.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">{r.matched ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}{r.label}</div>
            <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
          </div>)}
        </div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>Chiudi</Button>
          <Button disabled={!contact || !triggers.length} onClick={() => setChecked(true)}>Verifica filtri</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
