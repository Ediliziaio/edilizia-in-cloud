/**
 * Configurazione dell'agente WhatsApp dei lead (25/09/2026).
 *
 * Collega l'agente a un numero WhatsApp «lead» e sceglie dove prenota e cosa
 * sposta: calendario delle chiamate, pipeline e tre fasi (prenotato, fuori
 * zona, operatore), chi avvisare quando passa la mano. Scrive
 * ai_agents_v2.tools_config.lead_whatsapp (lo legge la edge
 * lead-agente-whatsapp) e ai_whatsapp_numbers.agent_id.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  agentId: string;
  companyId: string;
  toolsConfig: unknown;
  /** Stato dell'agente: finché non è «attivo» chi scrive al numero non riceve risposta. */
  stato: string | null;
}

interface LeadWhatsAppCfg {
  calendario_id?: string;
  pipeline_id?: string;
  fase_prenotato_id?: string;
  fase_fuori_zona_id?: string;
  fase_operatore_id?: string;
  utenti_da_avvisare?: string[];
  giorni_proposta?: number;
  tag_prenotato?: string;
  solo_feriali?: boolean;
}

const NESSUNA = "__nessuna__";
const SCOLLEGA = "__scollega__";

function leggiCfg(toolsConfig: unknown): LeadWhatsAppCfg {
  const r = toolsConfig && typeof toolsConfig === "object" ? (toolsConfig as Record<string, unknown>) : {};
  return r.lead_whatsapp && typeof r.lead_whatsapp === "object" ? (r.lead_whatsapp as LeadWhatsAppCfg) : {};
}

export function AgenteWhatsAppLeadPanel({ agentId, companyId, toolsConfig, stato }: Props) {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: dati, isLoading } = useQuery({
    queryKey: ["agente-whatsapp-lead-opzioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [numeri, calendari, pipeline, fasi, utenti] = await Promise.all([
        db.from("ai_whatsapp_numbers").select("id, numero, display_name, purpose, agent_id").eq("company_id", companyId).is("deleted_at", null),
        db.from("marketing_calendars").select("id, name").eq("company_id", companyId).eq("is_active", true).order("name"),
        db.from("marketing_pipelines").select("id, name").eq("company_id", companyId).order("position"),
        db.from("marketing_pipeline_stages").select("id, name, pipeline_id, position").eq("company_id", companyId).order("position"),
        db.from("profiles").select("id, first_name, last_name, email").eq("company_id", companyId).order("first_name"),
      ]);
      return {
        numeri: (numeri.data ?? []) as Array<{ id: string; numero: string | null; display_name: string | null; purpose: string | null; agent_id: string | null }>,
        calendari: (calendari.data ?? []) as Array<{ id: string; name: string }>,
        pipeline: (pipeline.data ?? []) as Array<{ id: string; name: string }>,
        fasi: (fasi.data ?? []) as Array<{ id: string; name: string; pipeline_id: string }>,
        utenti: (utenti.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>,
      };
    },
  });

  const iniziale = useMemo(() => leggiCfg(toolsConfig), [toolsConfig]);
  // "" finché l'utente non sceglie: vale il numero già collegato all'agente.
  const [numeroScritto, setNumeroId] = useState<string>("");
  const [calendarioId, setCalendarioId] = useState<string>(iniziale.calendario_id ?? "");
  const [pipelineId, setPipelineId] = useState<string>(iniziale.pipeline_id ?? "");
  const [fasePrenotato, setFasePrenotato] = useState<string>(iniziale.fase_prenotato_id ?? "");
  const [faseFuoriZona, setFaseFuoriZona] = useState<string>(iniziale.fase_fuori_zona_id ?? "");
  const [faseOperatore, setFaseOperatore] = useState<string>(iniziale.fase_operatore_id ?? "");
  const [utenti, setUtenti] = useState<string[]>(iniziale.utenti_da_avvisare ?? []);
  const [giorni, setGiorni] = useState<number>(iniziale.giorni_proposta ?? 7);
  const [tag, setTag] = useState<string>(iniziale.tag_prenotato ?? "");
  const [soloFeriali, setSoloFeriali] = useState<boolean>(iniziale.solo_feriali === true);

  const numeroCollegato = dati?.numeri.find((n) => n.agent_id === agentId)?.id || "";
  // SCOLLEGA = l'utente ha scelto di togliere il numero dall'agente.
  const numeroId = numeroScritto === SCOLLEGA ? "" : (numeroScritto || numeroCollegato);

  const fasiPipeline = (dati?.fasi ?? []).filter((f) => f.pipeline_id === pipelineId);
  const numeroScelto = dati?.numeri.find((n) => n.id === numeroId);

  const attiva = useMutation({
    mutationFn: async () => {
      const { data: agg, error } = await db.from("ai_agents_v2").update({ stato: "attivo" })
        .eq("id", agentId).eq("company_id", companyId).select("id");
      if (error) throw new Error(error.message);
      if (!agg?.length) throw new Error("Non hai il permesso di attivare questo agente.");
    },
    onSuccess: () => {
      toast.success("Agente attivo: risponde ai messaggi WhatsApp");
      qc.invalidateQueries({ queryKey: ["agent-detail", companyId, agentId] });
      qc.invalidateQueries({ queryKey: ["unified-ai-agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salva = useMutation({
    mutationFn: async () => {
      if (!numeroId && numeroScritto !== SCOLLEGA) throw new Error("Scegli il numero WhatsApp su cui risponde l'agente.");
      if (numeroId && !calendarioId) throw new Error("Scegli il calendario su cui l'agente fissa le chiamate.");
      if (numeroScelto?.agent_id && numeroScelto.agent_id !== agentId) {
        throw new Error("Questo numero è già collegato a un altro agente: scollegalo prima da quello.");
      }
      // tools_config fresco dal database: gli altri rami (voce, strumenti) restano com'erano.
      const { data: attuale, error: e1 } = await db.from("ai_agents_v2").select("tools_config").eq("id", agentId).eq("company_id", companyId).single();
      if (e1) throw new Error(e1.message);
      const lead_whatsapp: LeadWhatsAppCfg = {
        calendario_id: calendarioId,
        pipeline_id: pipelineId || undefined,
        fase_prenotato_id: fasePrenotato || undefined,
        fase_fuori_zona_id: faseFuoriZona || undefined,
        fase_operatore_id: faseOperatore || undefined,
        utenti_da_avvisare: utenti,
        giorni_proposta: Math.min(21, Math.max(1, Math.round(giorni || 7))),
        tag_prenotato: tag.trim() || undefined,
        solo_feriali: soloFeriali,
      };
      // .select("id"): senza permesso l'update non dà errore ma non tocca righe,
      // e il messaggio «salvato» sarebbe falso.
      const { data: agg, error: e2 } = await db.from("ai_agents_v2")
        .update({ tools_config: { ...(attuale?.tools_config ?? {}), lead_whatsapp } })
        .eq("id", agentId).eq("company_id", companyId).select("id");
      if (e2) throw new Error(e2.message);
      if (!agg?.length) throw new Error("Non hai il permesso di modificare questo agente.");

      // Un agente, un numero: si scollega da eventuali altri numeri e si collega a quello scelto.
      let scollega = db.from("ai_whatsapp_numbers").update({ agent_id: null })
        .eq("company_id", companyId).eq("agent_id", agentId);
      if (numeroId) scollega = scollega.neq("id", numeroId);
      const { error: e3 } = await scollega;
      if (e3) throw new Error(e3.message);
      if (numeroId) {
        const { data: collegati, error: e4 } = await db.from("ai_whatsapp_numbers").update({ agent_id: agentId })
          .eq("company_id", companyId).eq("id", numeroId).select("id");
        if (e4) throw new Error(e4.message);
        if (!collegati?.length) throw new Error("Numero non collegato: serve il permesso di gestire i numeri WhatsApp.");
      }
    },
    onSuccess: () => {
      toast.success("Agente WhatsApp configurato");
      qc.invalidateQueries({ queryKey: ["agente-whatsapp-lead-opzioni", companyId] });
      qc.invalidateQueries({ queryKey: ["agent-detail", companyId, agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sceltaFase = (valore: string, cambia: (v: string) => void, etichetta: string) => (
    <div>
      <label className="text-xs font-medium mb-1 block">{etichetta}</label>
      <Select value={valore || NESSUNA} onValueChange={(v) => cambia(v === NESSUNA ? "" : v)} disabled={!pipelineId}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Nessuna" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NESSUNA}>Non spostare</SelectItem>
          {fasiPipeline.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" /> Risposte su WhatsApp ai lead
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Chi scrive al numero scelto parla con questo agente: fa le domande del prompt, propone gli orari liberi del
          calendario, fissa la chiamata e sposta l'opportunità. Se un collega mette in pausa la conversazione, l'agente tace.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {stato !== "attivo" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>L'agente è in bozza: finché non lo attivi, chi scrive al numero collegato non riceve risposta.</span>
            <Button size="sm" variant="outline" onClick={() => attiva.mutate()} disabled={attiva.isPending}>
              {attiva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attiva l'agente"}
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium mb-1 block">Numero WhatsApp</label>
              <Select value={numeroScritto === SCOLLEGA ? SCOLLEGA : (numeroId || NESSUNA)} onValueChange={(v) => setNumeroId(v === NESSUNA ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Scegli il numero" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Scegli il numero</SelectItem>
                  {numeroCollegato && <SelectItem value={SCOLLEGA}>Nessun numero (scollega l'agente)</SelectItem>}
                  {(dati?.numeri ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {(n.display_name || "Numero").trim()} · {n.numero ?? ""}{n.agent_id && n.agent_id !== agentId ? " (collegato a un altro agente)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {numeroScelto && numeroScelto.purpose !== "lead" && (
                <p className="text-xs text-amber-700 mt-1">
                  Questo numero non è impostato come «Lead»: l'agente risponde solo sui numeri lead.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Calendario delle chiamate</label>
              <Select value={calendarioId || NESSUNA} onValueChange={(v) => setCalendarioId(v === NESSUNA ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Scegli il calendario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Scegli il calendario</SelectItem>
                  {(dati?.calendari ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">L'agente propone solo gli orari liberi di questo calendario: fasce, margini, preavviso e impegni su Google.</p>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Pipeline</label>
              <Select value={pipelineId || NESSUNA} onValueChange={(v) => { setPipelineId(v === NESSUNA ? "" : v); setFasePrenotato(""); setFaseFuoriZona(""); setFaseOperatore(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Nessuna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Nessuna</SelectItem>
                  {(dati?.pipeline ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {sceltaFase(fasePrenotato, setFasePrenotato, "Quando fissa la chiamata")}
              {sceltaFase(faseFuoriZona, setFaseFuoriZona, "Se è fuori zona")}
              {sceltaFase(faseOperatore, setFaseOperatore, "Se passa a una persona")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Tag quando prenota (facoltativo)</label>
                <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="es. appuntamento fissato" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Giorni in cui cercare orari</label>
                <Input type="number" min={1} max={21} value={giorni} onChange={(e) => setGiorni(Number(e.target.value))} className="h-9 w-24" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={soloFeriali} onCheckedChange={(v) => setSoloFeriali(v === true)} />
              Proponi solo orari dal lunedì al venerdì
            </label>
            <div>
              <label className="text-xs font-medium mb-1 block">Chi avvisare quando passa la mano</label>
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                {(dati?.utenti ?? []).map((u) => {
                  const nome = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Utente";
                  const scelto = utenti.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={scelto}
                        onCheckedChange={(v) => setUtenti((prev) => v ? [...prev, u.id] : prev.filter((x) => x !== u.id))}
                      />
                      {nome}
                    </label>
                  );
                })}
              </div>
            </div>
            <Button onClick={() => salva.mutate()} disabled={salva.isPending}>
              {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Salva il collegamento WhatsApp
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
