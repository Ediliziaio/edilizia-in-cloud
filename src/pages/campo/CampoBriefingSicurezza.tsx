/**
 * «5 minuti di sicurezza» con la squadra (26/11/2026, piano campo completo, punto 2.5).
 *
 * Il capo sceglie l'argomento, poi ognuno della squadra firma col dito sul suo telefono. Si registra con
 * campo_briefing_registra: giorno, cantiere, argomento, chi c'era con la firma. È la prova della formazione breve.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, HardHat, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FirmaDito } from "@/components/campo/FirmaDito";
import { senzaRete } from "@/lib/campo/timbra";
import { RIQUADRO } from "@/lib/campo/stileCampo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ARGOMENTI = [
  "Uso dei DPI", "Lavori in quota e ponteggi", "Attrezzi e macchine", "Ordine e pulizia del cantiere",
  "Rischio elettrico", "Movimentazione dei carichi", "Caldo e freddo", "Scavi e trincee",
] as const;

type Rpc = "campo_squadra_oggi" | "campo_briefing_registra";
const db = () => supabase as unknown as {
  rpc: (n: Rpc, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export default function CampoBriefingSicurezza() {
  const t = useT();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [argomento, setArgomento] = useState<string>(ARGOMENTI[0]);
  const [note, setNote] = useState("");
  const [firme, setFirme] = useState<Record<string, string>>({});
  const [firmaDi, setFirmaDi] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  const squadra = useQuery({
    queryKey: ["campo-briefing-squadra", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<Array<{ chiave: string; user_id: string | null; nome: string }>> => {
      const { data, error } = await db().rpc("campo_squadra_oggi", { p_order_id: orderId });
      if (error) throw error;
      return ((data ?? []) as Array<{ user_id: string | null; nome: string }>).map((p, i) => ({ chiave: p.user_id ?? `n-${i}`, ...p }));
    },
  });
  const persone = squadra.data ?? [];

  const registra = useMutation({
    mutationFn: async () => {
      if (senzaRete()) throw new Error(t("Sei senza rete: riprova quando torna il segnale."));
      const presenti = persone.filter(p => firme[p.chiave]).map(p => ({ user_id: p.user_id, nome: p.nome, firma: firme[p.chiave], firmato_il: new Date().toISOString() }));
      const { error } = await db().rpc("campo_briefing_registra", { p_order_id: orderId, p_argomento: argomento, p_note: note.trim() || null, p_presenti: presenti });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setFatto(true),
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviarlo. Riprova.")),
  });

  if (fatto) {
    return (
      <div className="mx-auto max-w-lg space-y-3 pb-24">
        <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="size-5" aria-hidden="true" />{t("5 minuti di sicurezza registrati")}</p>
        </div>
        <button type="button" onClick={() => navigate(-1)} className="min-h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground">{t("Fatto")}</button>
      </div>
    );
  }

  const nFirme = persone.filter(p => firme[p.chiave]).length;
  return (
    <div className="mx-auto max-w-lg space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><HardHat className="size-5 text-primary" aria-hidden="true" />{t("5 minuti di sicurezza")}</h1>
      <div className={`${RIQUADRO} space-y-2`}>
        <p className="text-sm font-semibold">{t("Di cosa parlate oggi")}</p>
        <div className="flex flex-wrap gap-1.5">
          {ARGOMENTI.map(a => (
            <button key={a} type="button" aria-pressed={argomento === a} onClick={() => setArgomento(a)}
              className={cn("min-h-10 rounded-full border px-3 text-sm", argomento === a && "border-primary bg-primary/10 font-semibold text-primary")}>{t(a)}</button>
          ))}
        </div>
      </div>
      <div className={`${RIQUADRO} space-y-2`}>
        <p className="text-sm font-semibold">{t("Chi c'era: ognuno firma")}</p>
        {squadra.isLoading ? <p className="text-sm text-muted-foreground">{t("Carico…")}</p>
          : squadra.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere la squadra. Riprova tra poco.")}</p>
          : persone.map(p => (
            <div key={p.chiave} className="space-y-2 border-b pb-2 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span dir="auto" className="min-w-0 truncate text-sm">{p.nome}</span>
                {firme[p.chiave]
                  ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" aria-hidden="true" />{t("Firmato")}</span>
                  : <button type="button" onClick={() => setFirmaDi(p.chiave)} className="flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-semibold"><PenLine className="size-4" aria-hidden="true" />{t("Firma")}</button>}
              </div>
              {firmaDi === p.chiave && (
                <FirmaDito onAnnulla={() => setFirmaDi(null)} onConferma={png => { setFirme(f => ({ ...f, [p.chiave]: png })); setFirmaDi(null); }} />
              )}
            </div>
          ))}
      </div>
      <label className={`${RIQUADRO} block space-y-1 text-sm font-medium`}>
        <span>{t("Note (facoltativo)")}</span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} className="w-full rounded-xl border bg-background px-3 py-2 text-base" />
      </label>
      <button type="button" disabled={nFirme === 0 || registra.isPending} onClick={() => registra.mutate()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50">
        {registra.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{t("Registra ({n} firme)", { n: nFirme })}
      </button>
    </div>
  );
}
