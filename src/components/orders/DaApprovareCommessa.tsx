/**
 * «Da approvare» della commessa: in un posto solo quello che il cantiere aspetta
 * dall'ufficio. Rapportini (approvati più sotto, in OrdineRapportiniCampo),
 * bolle e merce presa (AcquistiCampoCard filtrata sulla commessa) e correzioni
 * delle timbrature dimenticate (approvate qui: la timbratura entra nel registro).
 * Se non c'è niente da fare il riquadro non compare.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, ClipboardList, Clock, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { AcquistiCampoCard } from "@/components/warehouse/AcquistiCampoCard";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Tabella e RPC nuove, non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Correzione {
  id: string;
  user_id: string;
  tipo: "entrata" | "uscita";
  ora_richiesta: string;
  motivo: string;
  created_at: string;
  persona: { first_name: string | null; last_name: string | null } | null;
}

export const chiaveCorrezioniCommessa = (orderId: string) => ["correzioni-timbrature-commessa", orderId] as const;

function CorrezioniTimbrature({ orderId, puoDecidere, utenteId, titolare }: { orderId: string; puoDecidere: boolean; utenteId?: string | null; titolare: boolean }) {
  const qc = useQueryClient();
  const [respingi, setRespingi] = useState<{ id: string; testo: string } | null>(null);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: chiaveCorrezioniCommessa(orderId),
    queryFn: async (): Promise<Correzione[]> => {
      const { data, error } = await db
        .from("campo_timbrature_correzioni")
        .select("id, user_id, tipo, ora_richiesta, motivo, created_at")
        .eq("order_id", orderId)
        .eq("stato", "in_attesa")
        .order("ora_richiesta", { ascending: true });
      if (error) throw error;
      const righe = (data ?? []) as Omit<Correzione, "persona">[];
      // La richiesta punta ad auth.users: i nomi si leggono a parte dai profili.
      const ids = [...new Set(righe.map(r => r.user_id))];
      const { data: persone } = ids.length
        ? await supabase.from("profiles").select("id, first_name, last_name").in("id", ids)
        : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
      const perId = new Map((persone ?? []).map(p => [p.id, p]));
      return righe.map(r => ({ ...r, persona: perId.get(r.user_id) ?? null }));
    },
    staleTime: 15_000,
  });
  const decidi = useMutation({
    mutationFn: async (v: { id: string; approva: boolean; risposta?: string }) => {
      const { error } = await db.rpc("campo_timbratura_correzione_decidi", { p_id: v.id, p_approva: v.approva, p_risposta: v.risposta ?? null });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approva ? "Approvata: la timbratura è nel registro" : "Respinta: l’operaio è avvisato");
      setRespingi(null);
      void qc.invalidateQueries({ queryKey: chiaveCorrezioniCommessa(orderId) });
      void qc.invalidateQueries({ queryKey: ["campo-da-approvare-conteggi", orderId] });
      // Le ore della commessa e del personale ripartono dalla timbratura nuova.
      for (const k of ["daily-hours", "commessa-ore-timbrate", "hr-labor-reconciliation", "hr-giornate", "campo-timbrature-storico"]) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a salvare la decisione. Riprova.")),
  });

  if (isError) return <p role="alert" className="text-sm text-destructive">Non riesco a leggere le correzioni delle timbrature. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>;
  if (isLoading || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timbrature dimenticate</p>
      {data.map((c) => {
        const nome = [c.persona?.first_name, c.persona?.last_name].filter(Boolean).join(" ") || "Operaio";
        const occupato = decidi.isPending && decidi.variables?.id === c.id;
        return (
          <div key={c.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{nome} · {c.tipo === "entrata" ? "entrata" : "uscita"} del {format(parseISO(c.ora_richiesta), "EEE d MMM 'alle' HH:mm", { locale: it })}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">«{c.motivo}»</p>
              </div>
              <Clock className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            </div>
            {/* La propria richiesta la decide un altro dell'ufficio (o il titolare). */}
            {puoDecidere && (titolare || c.user_id !== utenteId) && (respingi?.id === c.id ? (
              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); decidi.mutate({ id: c.id, approva: false, risposta: respingi.testo }); }}>
                <input autoFocus value={respingi.testo} onChange={(e) => setRespingi({ id: c.id, testo: e.target.value })} required maxLength={300}
                  placeholder="Perché la respingi (lo legge l’operaio)" aria-label="Motivo del rifiuto"
                  className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" variant="destructive" disabled={occupato || !respingi.testo.trim()}>Respingi</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRespingi(null)}>Annulla</Button>
                </div>
              </form>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="gap-1.5" disabled={occupato} onClick={() => decidi.mutate({ id: c.id, approva: true })}>
                  {occupato ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}Approva
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={occupato} onClick={() => setRespingi({ id: c.id, testo: "" })}>
                  <XCircle className="h-4 w-4" aria-hidden="true" />Respingi
                </Button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Quanti rapportini aspettano l'ufficio su questa commessa. */
function useRapportiniInviati(orderId: string) {
  return useQuery({
    queryKey: ["campo-rapportini-ordine", orderId, "da-approvare"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("campo_rapportini")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .eq("stato", "inviato");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000,
  });
}

export function DaApprovareCommessa({ orderId, onApriRapportini }: { orderId: string; onApriRapportini?: () => void }) {
  const { role, user } = useAuth();
  const permissions = usePermissions();
  const puoDecidere = role === "company_admin" || role === "super_admin" || !!permissions.canEditOrders;
  const titolare = role === "company_admin" || role === "super_admin";
  const rapportini = useRapportiniInviati(orderId);
  const n = rapportini.data ?? 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
          Da approvare dal cantiere
          {n > 0 && <Badge className="bg-amber-100 text-amber-800">{n} rapportin{n === 1 ? "o" : "i"}</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">Rapportini, bolle e timbrature dimenticate arrivano qui. Niente entra nei costi o nelle ore finché non lo approvi.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {n > 0 && (
          <button type="button" onClick={onApriRapportini}
            className="flex w-full items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-sm font-semibold text-amber-900">
            <span>{n === 1 ? "1 rapportino aspetta l’approvazione" : `${n} rapportini aspettano l’approvazione`}</span>
            <span className="text-xs font-normal underline">Vai ai rapportini</span>
          </button>
        )}
        <CorrezioniTimbrature orderId={orderId} puoDecidere={puoDecidere} utenteId={user?.id} titolare={titolare} />
        <AcquistiCampoCard orderId={orderId} />
        {n === 0 && !rapportini.isLoading && (
          <p className="text-xs text-muted-foreground">Se qui sopra non c’è niente, dal cantiere non aspetta nulla.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Avviso in Panoramica: quante cose il cantiere aspetta dall'ufficio. Sparisce quando non c'è niente. */
export function DaApprovareAvviso({ orderId, onOpen }: { orderId: string; onOpen: () => void }) {
  const rapportini = useRapportiniInviati(orderId);
  const altri = useQuery({
    queryKey: ["campo-da-approvare-conteggi", orderId],
    staleTime: 30_000,
    queryFn: async () => {
      const [corr, acq] = await Promise.all([
        db.from("campo_timbrature_correzioni").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("stato", "in_attesa"),
        db.from("campo_acquisti").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("stato", "da_verificare"),
      ]);
      return { correzioni: corr.error ? 0 : corr.count ?? 0, bolle: acq.error ? 0 : acq.count ?? 0 };
    },
  });
  const r = rapportini.data ?? 0;
  const c = altri.data?.correzioni ?? 0;
  const b = altri.data?.bolle ?? 0;
  if (r + c + b === 0) return null;
  const parti = [
    r > 0 && `${r} rapportin${r === 1 ? "o" : "i"}`,
    b > 0 && `${b} boll${b === 1 ? "a" : "e"}`,
    c > 0 && `${c} timbratur${c === 1 ? "a dimenticata" : "e dimenticate"}`,
  ].filter(Boolean).join(" · ");
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center" aria-label="Da approvare dal cantiere">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-amber-950">Il cantiere aspetta l’ufficio</h3>
        <p className="mt-1 text-sm text-amber-900">{parti}</p>
      </div>
      <Button variant="outline" className="min-h-11 shrink-0 border-amber-300 font-semibold" onClick={onOpen}>Approva</Button>
    </section>
  );
}
