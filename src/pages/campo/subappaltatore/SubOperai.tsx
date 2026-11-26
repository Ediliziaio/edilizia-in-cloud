/**
 * «I miei operai» della ditta (26/11/2026, piano campo completo, punto 3.2, prima parte).
 * L'elenco degli operai della ditta per ogni cantiere, nella stessa tabella che vede l'ufficio
 * (subappaltatori_operai). Si aggiungono, si correggono, si tolgono dal cantiere (non si cancellano).
 * In cantiere il capo li trova nel controllo ingressi.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UniformSelect } from "@/components/ui/uniform-select";
import { RIQUADRO } from "@/lib/campo/stileCampo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Scheda { scheda_id: string; order_id: string | null; cantiere: string }
interface Operaio { id: string; scheda_id: string; nome: string; cognome: string; mansione: string | null; telefono: string | null; attivo: boolean; cantiere: string }
type Rpc = "campo_ditta_schede" | "campo_ditta_operai" | "campo_ditta_operaio_salva";
const db = () => supabase as unknown as {
  rpc: (n: Rpc, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export default function SubOperai() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const schede = useQuery({
    queryKey: ["ditta-schede", user?.id], enabled: !!user?.id,
    queryFn: async () => { const { data, error } = await db().rpc("campo_ditta_schede"); if (error) throw error; return (data ?? []) as Scheda[]; },
  });
  const operai = useQuery({
    queryKey: ["ditta-operai", user?.id], enabled: !!user?.id,
    queryFn: async () => { const { data, error } = await db().rpc("campo_ditta_operai"); if (error) throw error; return (data ?? []) as Operaio[]; },
  });
  const [scheda, setScheda] = useState("");
  const schedaScelta = scheda || schede.data?.[0]?.scheda_id || "";
  const [nome, setNome] = useState(""); const [cognome, setCognome] = useState(""); const [mansione, setMansione] = useState("");
  const delCantiere = useMemo(() => (operai.data ?? []).filter(o => o.scheda_id === schedaScelta), [operai.data, schedaScelta]);

  const salva = useMutation({
    mutationFn: async (v: { id: string | null; nome: string; cognome: string; mansione: string | null; telefono: string | null; attivo: boolean }) => {
      const { error } = await db().rpc("campo_ditta_operaio_salva", { p_id: v.id, p_scheda_id: schedaScelta, p_nome: v.nome, p_cognome: v.cognome, p_mansione: v.mansione, p_telefono: v.telefono, p_attivo: v.attivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setNome(""); setCognome(""); setMansione(""); void qc.invalidateQueries({ queryKey: ["ditta-operai"] }); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("Non sono riuscito a salvare: riprova.")),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><Users className="size-5 text-primary" aria-hidden="true" />{t("I miei operai")}</h1>
      {schede.isError || operai.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere i dati. Riprova tra poco.")}</p>
        : schede.isLoading ? <p className="text-sm text-muted-foreground">{t("Carico…")}</p>
        : !schede.data?.length ? <p className={cn(RIQUADRO, "text-sm text-muted-foreground")}>{t("La tua ditta non ha ancora cantieri con questa impresa.")}</p> : (
        <>
          <label className={cn(RIQUADRO, "block space-y-1 text-sm font-medium")}>
            <span>{t("Cantiere")}</span>
            <UniformSelect value={schedaScelta} onChange={e => setScheda(e.target.value)} className="h-12 w-full rounded-xl border bg-background px-3 text-base">
              {schede.data.map(s => <option key={s.scheda_id} value={s.scheda_id}>{s.cantiere || t("Cantiere")}</option>)}
            </UniformSelect>
          </label>
          <section className={RIQUADRO}>
            {delCantiere.length === 0 ? <p className="text-sm text-muted-foreground">{t("Nessun operaio su questo cantiere.")}</p> : (
              <ul className="divide-y text-sm">
                {delCantiere.map(o => (
                  <li key={o.id} className="flex items-center gap-2 py-2">
                    <span className={cn("min-w-0 flex-1", !o.attivo && "text-muted-foreground line-through")} dir="auto">{o.nome} {o.cognome}{o.mansione ? ` · ${o.mansione}` : ""}</span>
                    <button type="button" disabled={salva.isPending} onClick={() => salva.mutate({ ...o, attivo: !o.attivo })} className="min-h-10 rounded-full border px-3 text-xs font-semibold">
                      {o.attivo ? t("Togli dal cantiere") : t("Rimetti")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={cn(RIQUADRO, "space-y-2")}>
            <p className="text-sm font-semibold">{t("Aggiungi un operaio")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={nome} onChange={e => setNome(e.target.value)} maxLength={80} placeholder={t("Nome")} className="h-12 rounded-xl border bg-background px-3 text-base" />
              <input value={cognome} onChange={e => setCognome(e.target.value)} maxLength={80} placeholder={t("Cognome")} className="h-12 rounded-xl border bg-background px-3 text-base" />
            </div>
            <input value={mansione} onChange={e => setMansione(e.target.value)} maxLength={80} placeholder={t("Mansione (facoltativo)")} className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
            <button type="button" disabled={!nome.trim() || !cognome.trim() || salva.isPending}
              onClick={() => salva.mutate({ id: null, nome: nome.trim(), cognome: cognome.trim(), mansione: mansione.trim() || null, telefono: null, attivo: true })}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50">
              {salva.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{t("Aggiungi")}
            </button>
            <p className="text-xs text-muted-foreground">{t("Idoneità e corsi degli operai caricali nei Documenti della ditta: l'impresa li verifica.")}</p>
          </section>
        </>
      )}
    </div>
  );
}
