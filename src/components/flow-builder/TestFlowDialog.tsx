import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FlaskConical, CheckCircle, XCircle, User, ShieldCheck } from "lucide-react";
import type { AutomationFlow } from "@/types/automationBuilder";

interface Props {
  open: boolean;
  onClose: () => void;
  flow: AutomationFlow | null | undefined;
  companyId?: string;
  onEnrollmentCreated?: (enrollmentId: string) => void;
}

interface TestResult {
  success: boolean;
  enrolled: number;
  message?: string;
  error?: string;
}

export function TestFlowDialog({ open, onClose, flow, companyId, onEnrollmentCreated }: Props) {
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  // Load trigger event from the flow's first trigger node
  const { data: triggerNode } = useQuery({
    queryKey: ["flow-trigger-node", flow?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("automation_nodes")
        .select("config_json, label")
        .eq("flow_id", flow!.id)
        .eq("company_id", companyId!)
        .eq("node_type", "trigger")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!flow?.id && !!companyId && open,
  });

  // Il builder salva l'id catalogo in item_id (trigger_event resta vuoto):
  // senza il fallback il test era SEMPRE disabilitato sui flussi del builder.
  // Il motore normalizza gli id italiani in ingresso (TRIGGER_EVENT_MAP).
  const triggerEvent = triggerNode?.config_json?.trigger_event
    ?? triggerNode?.config_json?.item_id
    ?? triggerNode?.config_json?.trigger_type;

  // Search contacts
  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ["test-contacts", companyId, search],
    queryFn: async () => {
      let q = (supabase as any)
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, tags")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (search.trim()) {
        q = q.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
        );
      }
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!companyId && open,
  });

  const handleRun = async () => {
    if (!selectedContact || !flow?.id || !triggerEvent || !companyId) return;

    setRunning(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("process-automation", {
        body: {
          action: "trigger",
          trigger_event: triggerEvent,
          company_id: companyId,
          entity_id: selectedContact.id,
          entity_type: "contact",
          payload: {
            test_mode: true,
            dry_run: true,
            first_name: selectedContact.first_name,
            last_name: selectedContact.last_name,
            email: selectedContact.email,
          },
        },
      });

      if (error) throw error;

      setResult({
        success: true,
        enrolled: data?.enrolled ?? 0,
        message: data?.message,
      });

      if ((data?.enrolled ?? 0) > 0 && data?.enrollment_id) {
        onEnrollmentCreated?.(data.enrollment_id);
      }

      if ((data?.enrolled ?? 0) > 0) {
        toast.success(`Test avviato su ${selectedContact.first_name} ${selectedContact.last_name}`);
      } else {
        toast.warning("Nessun flusso avviato — controlla che sia pubblicato e che il trigger corrisponda");
      }
    } catch (e: any) {
      setResult({ success: false, enrolled: 0, error: e.message });
      toast.error("Errore nel test: " + e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleClose = () => {
    setSearch("");
    setSelectedContact(null);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Testa il flusso
          </DialogTitle>
          <DialogDescription>
            Seleziona un contatto per avviare un'esecuzione di test su questo flusso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Trigger info */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {triggerEvent ? (
              <>
                <span className="font-medium text-foreground">Trigger:</span>{" "}
                {triggerEvent.replace(/_/g, " ")}
              </>
            ) : (
              "Nessun trigger configurato — aggiungi un trigger al flusso prima di testare."
            )}
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Modalità test protetta: la richiesta viene inviata con flag <span className="font-mono">test_mode</span> e <span className="font-mono">dry_run</span> per evitare invii reali quando il processore li supporta.
              </p>
            </div>
          </div>

          {/* Contact search */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Scegli un contatto</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o email..."
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedContact(null);
                  setResult(null);
                }}
              />
            </div>

            {/* Contact list */}
            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Caricamento contatti...
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                  Nessun contatto trovato
                </div>
              ) : (
                contacts.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedContact(c);
                      setResult(null);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm hover:bg-muted/50 transition-colors ${
                      selectedContact?.id === c.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                    </div>
                    {selectedContact?.id === c.id && (
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg px-3 py-2.5 flex items-start gap-2 text-sm ${
                result.success && result.enrolled > 0
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : result.success
                  ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {result.success && result.enrolled > 0 ? (
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div>
                {result.error ? (
                  <p>{result.error}</p>
                ) : result.enrolled > 0 ? (
                  <p>
                    Flusso avviato. Controlla la tab <strong>Cronologia</strong> per seguire
                    l'esecuzione.
                  </p>
                ) : (
                  <p>
                    Nessuna iscrizione creata. Verifica che il flusso sia{" "}
                    <strong>pubblicato</strong> e che il trigger corrisponda all'evento.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Chiudi
            </Button>
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!selectedContact || !triggerEvent || running}
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Avvio...
                </>
              ) : (
                <>
                  <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
                  Avvia test
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
