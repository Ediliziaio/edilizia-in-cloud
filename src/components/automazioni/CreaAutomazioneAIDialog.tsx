/**
 * CreaAutomazioneAIDialog — genera una bozza di automazione da una descrizione
 * in linguaggio naturale (audit AI 2026-06: prima il bottone "Crea tramite AI"
 * apriva solo un pannello guidato).
 *
 * Flusso: descrizione → edge function ai-genera-automazione (vincolata al
 * catalogo trigger/azioni passato dal client) → bozza flow + nodi + connessioni
 * (stesso pattern di AutomazioniTemplateGallery, con rollback su errore).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { TRIGGER_CATALOG_ITEMS, ACTION_CATALOG_ITEMS } from "@/lib/flow-node-catalog";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GeneratedNode {
  id: string;
  nodeType: "trigger" | "action";
  configJson: Record<string, unknown>;
  label: string;
  posX: number;
  posY: number;
}
interface GeneratedConnection {
  fromId: string;
  toId: string;
}

const ESEMPI = [
  "Quando arriva un nuovo lead, assegnalo a un agente e crea un task di chiamata urgente",
  "Quando un preventivo viene accettato, crea l'ordine e invia email di conferma al cliente",
  "Quando una fattura scade, manda un sollecito email e crea un task di recupero crediti",
];

export function CreaAutomazioneAIDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [descrizione, setDescrizione] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenera = async () => {
    if (!companyId || !user?.id) {
      toast.error("Devi essere autenticato");
      return;
    }
    const desc = descrizione.trim();
    if (desc.length < 10) {
      toast.error("Descrivi l'automazione in modo più completo");
      return;
    }

    setLoading(true);
    let createdFlowId: string | null = null;
    try {
      // Catalogo compatto (id+label+description) passato all'edge function:
      // l'AI può scegliere SOLO tra questi → nessuna azione inventata.
      // Gli item 'piattaforma' sono esclusi fuori dal contesto platform-admin:
      // il motore li rifiuterebbe a runtime (flusso rotto in silenzio).
      const isPlatformCtx = companyId === PLATFORM_ADMIN_COMPANY_ID;
      const triggers = TRIGGER_CATALOG_ITEMS
        .filter((t) => isPlatformCtx || t.category !== "piattaforma")
        .map((t) => ({ id: t.id, label: t.label, description: t.description }));
      const actions = ACTION_CATALOG_ITEMS
        .filter((a) => isPlatformCtx || a.category !== "piattaforma")
        .map((a) => ({ id: a.id, label: a.label, description: a.description }));

      const { data, error } = await supabase.functions.invoke("ai-genera-automazione", {
        body: { company_id: companyId, descrizione: desc, triggers, actions },
      });
      if (error) throw error;
      const result = data as { success?: boolean; name?: string; nodes?: GeneratedNode[]; connections?: GeneratedConnection[]; error?: string };
      if (!result?.success || !result.nodes?.length) {
        throw new Error(result?.error || "Generazione non riuscita");
      }

      // Validazione difensiva dei nodi generati dall'AI (non bloccante: la
      // bozza si rifinisce nel builder e validateForPublish blocca comunque la
      // pubblicazione). Segnala: azioni senza action_type/item_id, email senza
      // oggetto/corpo, SMS senza testo. Campi = id italiani del catalogo
      // (oggetto/corpo/testo) con alias inglesi legacy normalizzati dall'engine.
      const hasText = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
      const azioniDaCompletare = result.nodes.some((n) => {
        if (n.nodeType !== "action") return false;
        const cfg = n.configJson ?? {};
        const actionId = String(cfg.action_type ?? cfg.item_id ?? cfg.itemId ?? "");
        if (!actionId) return true; // azione senza tipo: da configurare nel builder
        if (actionId.includes("email")) {
          const hasSubject = hasText(cfg.oggetto) || hasText(cfg.email_subject) || hasText(cfg.subject);
          const hasBody = hasText(cfg.corpo) || hasText(cfg.email_body) || hasText(cfg.body);
          if (!hasSubject || !hasBody) return true;
        }
        if (actionId.includes("sms")) {
          const hasMessage = hasText(cfg.testo) || hasText(cfg.sms_body) || hasText(cfg.message);
          if (!hasMessage) return true;
        }
        return false;
      });

      // Crea bozza flow (stesso pattern dei template, con rollback su errore).
      // NB: lo status è SEMPRE "draft" — un'automazione generata dall'AI non
      // deve mai nascere già pubblicata.
      const { data: flow, error: flowErr } = await supabase
        .from("automation_flows")
        .insert({
          name: result.name || "Automazione AI",
          company_id: companyId,
          status: "draft",
          description: desc.slice(0, 280),
          created_by: user.id,
          // Categoria dal trigger scelto dall'AI (prima finiva sempre in
          // "Generale" e il filtro categoria della lista non lo trovava).
          category: TRIGGER_CATALOG_ITEMS.find((t) =>
            result.nodes?.some((n) => n.nodeType === "trigger" && (n.configJson?.item_id === t.id || n.configJson?.trigger_type === t.id)),
          )?.category ?? "generale",
          config_json: { generated_by: "ai", prompt: desc.slice(0, 500) },
        } as never)
        .select("id")
        .single();
      if (flowErr || !flow) throw flowErr ?? new Error("Impossibile creare il flusso");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flowId = (flow as any).id as string;
      createdFlowId = flowId;

      const nodeInserts = result.nodes.map((n) => ({
        id: crypto.randomUUID(),
        flow_id: flowId,
        company_id: companyId,
        node_type: n.nodeType,
        position_x: n.posX,
        position_y: n.posY,
        config_json: n.configJson,
        label: n.label,
      }));
      const idMap: Record<string, string> = {};
      result.nodes.forEach((n, i) => { idMap[n.id] = nodeInserts[i].id; });

      const { error: nodesErr } = await supabase.from("automation_nodes").insert(nodeInserts as never[]);
      if (nodesErr) throw nodesErr;

      if (result.connections?.length) {
        const connInserts = result.connections
          .map((c) => ({
            id: crypto.randomUUID(),
            flow_id: flowId,
            company_id: companyId,
            from_node_id: idMap[c.fromId],
            to_node_id: idMap[c.toId],
            label: null as string | null,
          }))
          .filter((c) => c.from_node_id && c.to_node_id);
        if (connInserts.length) {
          const { error: connErr } = await supabase.from("automation_connections").insert(connInserts as never[]);
          if (connErr) throw connErr;
        }
      }

      void queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-overview-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-node-summaries"] });

      toast.success("Bozza generata! Apro il builder per rifinirla…");
      if (azioniDaCompletare) {
        toast.warning("Alcune azioni vanno completate nel builder prima di pubblicare");
      }
      onOpenChange(false);
      setDescrizione("");
      navigate(`${routePrefix}/automazioni/${flowId}`);
    } catch (err: unknown) {
      console.error("[CreaAutomazioneAIDialog]", err);
      if (createdFlowId) {
        try {
          await supabase.from("automation_connections").delete().eq("flow_id", createdFlowId);
          await supabase.from("automation_nodes").delete().eq("flow_id", createdFlowId);
          await supabase.from("automation_flows").delete().eq("id", createdFlowId);
        } catch { /* best-effort */ }
      }
      // Il messaggio dell'edge function (es. carta mancante, descrizione vaga)
      // è già parlante: mostralo quando presente.
      const msg = (err as { message?: string })?.message;
      toast.error(msg && msg.length < 160 ? msg : "Non sono riuscito a generare l'automazione. Riprova con una descrizione più precisa.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Crea automazione con l'AI
          </DialogTitle>
          <DialogDescription>
            Descrivi cosa deve fare l'automazione. L'AI sceglie trigger e azioni dal catalogo
            e prepara una bozza che potrai rifinire nel builder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="Es: quando arriva un nuovo lead dal sito, assegnalo a un agente e crea un task di chiamata entro un'ora"
            rows={4}
            maxLength={2000}
            disabled={loading}
            className="resize-none"
          />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Esempi:</p>
            <div className="flex flex-col gap-1">
              {ESEMPI.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={loading}
                  onClick={() => setDescrizione(ex)}
                  className="text-left text-xs text-muted-foreground hover:text-foreground rounded border bg-muted/40 px-2 py-1 transition-colors disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Annulla
          </Button>
          <Button onClick={handleGenera} disabled={loading || descrizione.trim().length < 10}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            {loading ? "Genero…" : "Genera bozza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
