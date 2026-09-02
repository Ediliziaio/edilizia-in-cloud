/**
 * WhatsApp Locale — report delle risposte di una campagna.
 *
 * "3 risposte (12%)" e' un numero muto: qui si legge COSA hanno scritto, in
 * colonna, con l'esito accanto e il salto diretto alla chat. Il pulsante AI
 * qualifica le risposte non ancora classificate negli stessi esiti della
 * pipeline — correggibili a mano come tutti gli altri. "cliente" resta fuori
 * dalla portata dell'AI: dichiarare vinto un contratto e' una decisione umana.
 *
 * Se la campagna ha una variante B, in alto ci sono i tassi a confronto CON i
 * denominatori: contare solo i rispondenti direbbe quale variante ha piu'
 * risposte, non quale rende di piu'.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readInvokeError } from "@/lib/readInvokeError";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageCircle, Sparkles, Loader2 } from "lucide-react";

interface Risposta {
  destinatario_id: string;
  contact_id: string;
  nome: string | null;
  telefono: string | null;
  variante: string | null;
  esito: string | null;
  risposto_at: string | null;
  testo_risposta: string | null;
  wa_chat_id: string | null;
}

const ESITO_BADGE: Record<string, { label: string; cls: string }> = {
  appuntamento: { label: "Appuntamento", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  da_ricontattare: { label: "Da ricontattare", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  non_interessato: { label: "Non interessato", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  cliente: { label: "Cliente", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
};

export default function RisposteCampagna({ campagnaId, nome, haVarianteB, aperta, onChiudi }: {
  campagnaId: string;
  nome: string;
  haVarianteB: boolean;
  aperta: boolean;
  onChiudi: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: risposte = [], isLoading } = useQuery({
    queryKey: ["openwa-risposte", campagnaId],
    enabled: aperta,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc("openwa_campagna_risposte", { p_campagna_id: campagnaId });
      if (error) throw error;
      return (data ?? []) as Risposta[];
    },
  });

  const { data: ab = [] } = useQuery({
    queryKey: ["openwa-ab", campagnaId],
    enabled: aperta && haVarianteB,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc("openwa_campagna_ab", { p_campagna_id: campagnaId });
      if (error) return [];
      return (data ?? []) as Array<{ variante: string; inviati: number; risposte: number }>;
    },
  });

  const classifica = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("openwa-classifica-risposte", {
        body: { campagna_id: campagnaId },
      });
      if (error) throw new Error(await readInvokeError(error));
      return data as { classificati: number; incerti: number; restanti: number };
    },
    onSuccess: (r) => {
      toast.success(`${r.classificati} risposte classificate`, {
        description: [
          r.incerti > 0 && `${r.incerti} lasciate a te (testo poco chiaro)`,
          r.restanti > 0 && `${r.restanti} ancora da fare: ripremi il pulsante`,
        ].filter(Boolean).join(" · ") || "Tutte fatte.",
      });
      qc.invalidateQueries({ queryKey: ["openwa-risposte", campagnaId] });
      qc.invalidateQueries({ queryKey: ["openwa-pipeline", campagnaId] });
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Classificazione non riuscita", { description: e.message }),
  });

  const nonQualificate = risposte.filter((r) => !r.esito).length;

  return (
    <Dialog open={aperta} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Risposte — {nome}</DialogTitle>
          <DialogDescription>
            Cosa hanno scritto, con l'esito accanto. Da qui si salta dritti in chat.
          </DialogDescription>
        </DialogHeader>

        {haVarianteB && ab.length > 0 && (
          <div className="flex shrink-0 gap-3">
            {ab.map((v) => {
              const tasso = v.inviati > 0 ? Math.round((v.risposte / v.inviati) * 100) : 0;
              return (
                <div key={v.variante} className="flex-1 rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Messaggio {v.variante}</p>
                  <p className="text-lg font-semibold tabular-nums">{tasso}%
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{v.risposte}/{v.inviati}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {nonQualificate > 0 && (
          <Button variant="outline" size="sm" className="shrink-0 self-start"
            disabled={classifica.isPending} onClick={() => classifica.mutate()}>
            {classifica.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Classifica {nonQualificate} risposte con l'AI
          </Button>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {isLoading ? (
            <><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></>
          ) : risposte.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ancora nessuna risposta.</p>
          ) : (
            risposte.map((r) => {
              const eb = r.esito ? ESITO_BADGE[r.esito] : null;
              return (
                <div key={r.destinatario_id} className="rounded-lg border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.nome ?? r.telefono ?? "—"}</span>
                    {r.variante && haVarianteB && (
                      <Badge variant="outline" className="text-[10px]">Msg {r.variante}</Badge>
                    )}
                    {eb
                      ? <Badge variant="secondary" className={`text-[10px] ${eb.cls}`}>{eb.label}</Badge>
                      : <Badge variant="outline" className="text-[10px]">da qualificare</Badge>}
                    {r.risposto_at && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(r.risposto_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  {r.testo_risposta && (
                    <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                      {r.testo_risposta}
                    </p>
                  )}
                  {r.wa_chat_id && (
                    <button type="button"
                      onClick={() => navigate(`/admin/marketing/whatsapp-locale?chat=${encodeURIComponent(r.wa_chat_id!)}`)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
                      <MessageCircle className="h-3 w-3" /> apri la conversazione
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
