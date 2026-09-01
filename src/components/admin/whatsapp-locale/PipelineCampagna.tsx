/**
 * WhatsApp Locale — pipeline della campagna.
 *
 * Il flusso automatico (in coda → messaggio 1 → follow-up → ha risposto) lo
 * traccia gia' il motore. Quello che mancava e' il DOPO: una risposta puo'
 * essere "non mi interessa" o "fissiamo un appuntamento", e senza qualificarla
 * i numeri dicono solo QUANTO si e' inviato, non se la lista e il messaggio
 * VALGONO qualcosa. Qui i contatti si trascinano fra gli esiti, e il funnel in
 * alto dice dove il flusso perde.
 *
 * La colonna "In coda" fa anche da elenco destinatari: prima del lancio si
 * vede CHI ricevera' il messaggio e si puo' togliere qualcuno — cosa prima
 * impossibile: si lanciava su una lista mai vista.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, GripVertical, MessageCircle, Target, Trash2, X } from "lucide-react";

interface Destinatario {
  id: string;
  stato: string;
  esito: string | null;
  primo_inviato_at: string | null;
  risposto_at: string | null;
  contact_id: string;
  marketing_contacts: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    phone: string | null;
  } | null;
}

/** Colonne del flusso: prima le automatiche, poi gli esiti qualificati a mano. */
const COLONNE = [
  { key: "in_coda", label: "In coda", tipo: "auto" as const },
  { key: "messaggio_1", label: "Messaggio 1", tipo: "auto" as const },
  { key: "messaggio_2", label: "Messaggio 2", tipo: "auto" as const },
  { key: "messaggio_3", label: "Messaggio 3", tipo: "auto" as const },
  { key: "messaggio_4", label: "Messaggio 4", tipo: "auto" as const },
  { key: "risposto", label: "Ha risposto", tipo: "auto" as const },
  { key: "da_ricontattare", label: "Da ricontattare", tipo: "esito" as const },
  { key: "appuntamento", label: "Appuntamento", tipo: "esito" as const },
  { key: "cliente", label: "Cliente", tipo: "esito" as const },
  { key: "non_interessato", label: "Non interessato", tipo: "esito" as const },
];

/** In quale colonna vive un destinatario: l'esito manuale vince sullo stato. */
function colonnaDi(d: Destinatario): string {
  if (d.esito) return d.esito;
  if (d.stato === "risposto") return "risposto";
  if (d.stato === "followup3_inviato") return "messaggio_4";
  if (d.stato === "followup2_inviato") return "messaggio_3";
  if (d.stato === "followup_inviato") return "messaggio_2";
  if (d.stato === "inviato") return "messaggio_1";
  if (d.stato === "da_inviare") return "in_coda";
  return "in_coda"; // saltati/falliti non compaiono: hanno gia' il dialog Problemi
}

function nomeDi(d: Destinatario): string {
  const c = d.marketing_contacts;
  return [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim()
    || c?.company_name || c?.phone || "Senza nome";
}

function CardDestinatario({ d, trascinabile, onRimuovi, onApriChat, onOpportunita }: {
  d: Destinatario;
  trascinabile: boolean;
  onRimuovi?: () => void;
  onApriChat?: () => void;
  onOpportunita?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: d.id,
    disabled: !trascinabile,
  });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "flex touch-none overflow-hidden rounded-lg border bg-background text-xs",
        isDragging && "opacity-40",
      )}
    >
      {trascinabile && (
        <div {...attributes} {...listeners}
          className="flex shrink-0 cursor-grab items-center bg-muted/40 px-0.5 text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Trascina per qualificare">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
      <div className="min-w-0 flex-1 px-2 py-1.5">
        <p className="truncate font-medium">{nomeDi(d)}</p>
        {d.marketing_contacts?.phone && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">{d.marketing_contacts.phone}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1">
          {onApriChat && (
            <button type="button" onClick={onApriChat}
              className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
              <MessageCircle className="h-2.5 w-2.5" /> apri chat
            </button>
          )}
          {onOpportunita && (
            <button type="button" onClick={onOpportunita}
              className="inline-flex items-center gap-0.5 text-[10px] text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
              title="Crea un'opportunità nel CRM per questo contatto">
              <Target className="h-2.5 w-2.5" /> opportunità
            </button>
          )}
          {onRimuovi && (
            <button type="button" onClick={onRimuovi}
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground underline-offset-2 hover:text-red-600 hover:underline"
              title="Togli dalla campagna (non riceverà il messaggio)">
              <Trash2 className="h-2.5 w-2.5" /> togli
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Colonna({ col, righe, children }: {
  col: (typeof COLONNE)[number];
  righe: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}`, disabled: col.tipo === "auto" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-52 shrink-0 flex-col rounded-xl border p-2 transition-colors",
        col.tipo === "esito" ? "bg-muted/30" : "bg-muted/10",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
        <Badge variant="secondary" className="text-[10px] tabular-nums">{righe}</Badge>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">{children}</div>
    </div>
  );
}

export default function PipelineCampagna({ campagnaId, nome, aperta, onChiudi }: {
  campagnaId: string;
  nome: string;
  aperta: boolean;
  onChiudi: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data: destinatari = [], isLoading } = useQuery({
    queryKey: ["openwa-pipeline", campagnaId],
    enabled: aperta,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_campagna_destinatari")
        .select("id, stato, esito, primo_inviato_at, risposto_at, contact_id, marketing_contacts(first_name, last_name, company_name, phone)")
        .eq("campagna_id", campagnaId)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Destinatario[];
    },
  });

  const perColonna = useMemo(() => {
    const m = new Map<string, Destinatario[]>(COLONNE.map((c) => [c.key, []]));
    for (const d of destinatari) m.get(colonnaDi(d))?.push(d);
    return m;
  }, [destinatari]);

  // Il funnel: dove si perde. Percentuali sul passo PRECEDENTE, non sul totale:
  // "il 40% di chi risponde fissa un appuntamento" e' cio' che giudica il flusso.
  const funnel = useMemo(() => {
    const tot = destinatari.length;
    const contattati = destinatari.filter((d) => d.stato !== "da_inviare").length;
    const risposte = destinatari.filter((d) => d.stato === "risposto" || d.esito).length;
    const appuntamenti = destinatari.filter((d) => d.esito === "appuntamento" || d.esito === "cliente").length;
    const clienti = destinatari.filter((d) => d.esito === "cliente").length;
    const pct = (n: number, su: number) => (su > 0 ? `${Math.round((n / su) * 100)}%` : "—");
    return [
      { label: "Destinatari", n: tot, pct: null as string | null },
      { label: "Contattati", n: contattati, pct: pct(contattati, tot) },
      { label: "Risposte", n: risposte, pct: pct(risposte, contattati) },
      { label: "Appuntamenti", n: appuntamenti, pct: pct(appuntamenti, risposte) },
      { label: "Clienti", n: clienti, pct: pct(clienti, appuntamenti) },
    ];
  }, [destinatari]);

  const setEsito = useMutation({
    mutationFn: async ({ id, esito }: { id: string; esito: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("openwa_campagna_destinatari")
        .update({ esito, esito_at: esito ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["openwa-pipeline", campagnaId] }),
    onError: (e: Error) => toast.error("Spostamento non riuscito", { description: e.message }),
  });

  const rimuovi = useMutation({
    mutationFn: async (id: string) => {
      // Solo chi e' ancora in coda: toglierlo DOPO l'invio falsificherebbe i
      // numeri della campagna (un contattato che sparisce dal conteggio).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("openwa_campagna_destinatari")
        .delete()
        .eq("id", id)
        .eq("stato", "da_inviare");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Tolto dalla campagna");
      qc.invalidateQueries({ queryKey: ["openwa-pipeline", campagnaId] });
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Dalla pipeline al CRM: chi fissa un appuntamento smette di essere "un
  // destinatario di campagna" e diventa una trattativa. L'opportunita' nasce
  // nella prima pipeline della piattaforma, primo stage; se per il contatto
  // ne esiste gia' una aperta NON se ne crea un doppione.
  const creaOpportunita = useMutation({
    mutationFn: async (d: Destinatario) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: gia } = await sb
        .from("marketing_opportunities")
        .select("id, name")
        .eq("contact_id", d.contact_id)
        .eq("status", "open")
        .is("deleted_at", null)
        .limit(1);
      if (gia?.[0]) return { creata: false as const, nome: gia[0].name as string };

      const { data: pipe } = await sb
        .from("marketing_pipelines")
        .select("id, name, marketing_pipeline_stages(id, position)")
        .eq("company_id", "00000000-0000-0000-0000-000000000001")
        .order("created_at", { ascending: true })
        .limit(1);
      const pipeline = pipe?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stage = (pipeline?.marketing_pipeline_stages ?? []).sort((a: any, b: any) => a.position - b.position)[0];
      if (!pipeline || !stage) throw new Error("Nessuna pipeline opportunità configurata sulla piattaforma");

      const { error } = await sb.from("marketing_opportunities").insert({
        company_id: "00000000-0000-0000-0000-000000000001",
        contact_id: d.contact_id,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        name: `${nomeDi(d)} — ${nome}`,
        value: 0,
        status: "open",
        source: "whatsapp_locale",
        tags: [],
      });
      if (error) throw new Error(error.message);
      return { creata: true as const, nome: pipeline.name as string };
    },
    onSuccess: (r) => {
      if (r.creata) toast.success("Opportunità creata", { description: `Nella pipeline "${r.nome}", primo stage. Valore da definire nel CRM.` });
      else toast.info("Esiste già un'opportunità aperta", { description: r.nome });
      qc.invalidateQueries({ queryKey: ["openwa"] });
    },
    onError: (e: Error) => toast.error("Creazione non riuscita", { description: e.message }),
  });

  /** Salta alla conversazione nell'inbox (il lavoro continua li'). */
  const apriChat = async (contactId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("openwa_messages")
      .select("wa_chat_id")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1);
    const chat = data?.[0]?.wa_chat_id;
    if (!chat) { toast.error("Nessuna conversazione trovata per questo contatto"); return; }
    navigate(`/admin/marketing/whatsapp-locale?chat=${encodeURIComponent(chat)}`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const over = String(e.over?.id ?? "");
    if (!over.startsWith("col:")) return;
    const colKey = over.slice(4);
    const col = COLONNE.find((c) => c.key === colKey);
    if (!col || col.tipo !== "esito") return;
    const d = destinatari.find((x) => x.id === e.active.id);
    if (!d || d.esito === colKey) return;
    setEsito.mutate({ id: d.id, esito: colKey });
  };

  const inDrag = dragId ? destinatari.find((d) => d.id === dragId) ?? null : null;

  return (
    <Dialog open={aperta} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="flex h-[85vh] max-w-[95vw] flex-col xl:max-w-7xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Pipeline — {nome}</DialogTitle>
          <DialogDescription>
            Trascina chi ha risposto negli esiti. La colonna "In coda" è anche l'elenco di chi
            riceverà il messaggio: da lì puoi togliere qualcuno prima che parta.
          </DialogDescription>
        </DialogHeader>

        {/* Funnel: dove si perde, passo per passo */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2">
          {funnel.map((f, i) => (
            <div key={f.label} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
              <div className="px-1.5">
                <span className="text-base font-semibold tabular-nums">{f.n}</span>
                {f.pct && <span className="ml-1 text-[11px] text-emerald-700 dark:text-emerald-400">{f.pct}</span>}
                <span className="block text-[10px] leading-tight text-muted-foreground">{f.label}</span>
              </div>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-1 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-full w-52" />)}</div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
            onDragEnd={onDragEnd}
          >
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
              {COLONNE.map((col) => {
                const righe = perColonna.get(col.key) ?? [];
                return (
                  <Colonna key={col.key} col={col} righe={righe.length}>
                    {righe.map((d) => (
                      <div key={d.id} className="relative">
                        <CardDestinatario
                          d={d}
                          // Si qualifica chi e' stato almeno contattato; chi e'
                          // in coda non ha ancora niente da qualificare.
                          trascinabile={d.stato !== "da_inviare"}
                          onRimuovi={d.stato === "da_inviare" ? () => rimuovi.mutate(d.id) : undefined}
                          onApriChat={d.stato === "risposto" || d.esito ? () => void apriChat(d.contact_id) : undefined}
                          onOpportunita={d.stato === "risposto" || d.esito ? () => creaOpportunita.mutate(d) : undefined}
                        />
                        {d.esito && (
                          <button
                            type="button"
                            onClick={() => setEsito.mutate({ id: d.id, esito: null })}
                            className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                            title="Togli la qualificazione (torna fra le risposte)"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {righe.length === 0 && (
                      <p className="px-1 py-3 text-center text-[10px] text-muted-foreground/60">
                        {col.tipo === "esito" ? "Trascina qui" : "—"}
                      </p>
                    )}
                  </Colonna>
                );
              })}
            </div>
            <DragOverlay>
              {inDrag && (
                <div className="w-48 rounded-lg border bg-background px-2 py-1.5 text-xs shadow-lg">
                  <p className="truncate font-medium">{nomeDi(inDrag)}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </DialogContent>
    </Dialog>
  );
}
