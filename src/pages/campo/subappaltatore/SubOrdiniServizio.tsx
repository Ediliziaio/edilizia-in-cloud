/**
 * Ordini di servizio e contestazioni ricevuti dalla ditta (26/11/2026, piano campo completo, punto 3.4).
 * Aprendo uno da leggere risulta «letto» per l'impresa. «Fatto» chiede cosa avete fatto e, se serve, una foto.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FotoOs } from "@/components/campo/FotoOs";
import { caricaFotoOs, COLONNE_OS, STATI_OS, type OrdineServizio } from "@/lib/campo/ordiniServizio";
import { compressImage } from "@/lib/campo/compressImage";
import { CHIP, RIQUADRO } from "@/lib/campo/stileCampo";
import { cn } from "@/lib/utils";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

type Rpc = "ordine_servizio_ditta";
const db = () => supabase as unknown as {
  rpc: (n: Rpc, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  from: (t: "ordini_servizio_ditte") => any;
};

export default function SubOrdiniServizio() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aperto, setAperto] = useState<string | null>(null);
  const [risposta, setRisposta] = useState("");
  const [foto, setFoto] = useState<File[]>([]);
  const q = useQuery({
    queryKey: ["sub-ordini-servizio", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<OrdineServizio[]> => {
      const { data, error } = await db().from("ordini_servizio_ditte").select(COLONNE_OS).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as OrdineServizio[];
    },
  });
  const azione = useMutation({
    mutationFn: async (v: { os: OrdineServizio; azione: "letto" | "risolto" }) => {
      let percorsi: string[] = [];
      if (v.azione === "risolto" && foto.length) {
        const ridotte = await Promise.all(foto.map(async f => {
          try { const b = await compressImage(f, 1600, 0.8); return new File([b], "foto.jpg", { type: "image/jpeg" }); } catch { return f; }
        }));
        percorsi = await caricaFotoOs(v.os.company_id, v.os.subappaltatore_id, ridotte);
      }
      const { error } = await db().rpc("ordine_servizio_ditta", { p_id: v.os.id, p_azione: v.azione, p_risposta: v.azione === "risolto" ? risposta : null, p_foto: percorsi });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      if (v.azione === "risolto") { toast.success(t("Mandato all'impresa")); setRisposta(""); setFoto([]); setAperto(null); }
      void qc.invalidateQueries({ queryKey: ["sub-ordini-servizio"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviarlo. Riprova.")),
  });
  const apri = (os: OrdineServizio) => {
    const nuovo = aperto === os.id ? null : os.id;
    setAperto(nuovo); setRisposta(""); setFoto([]);
    if (nuovo && os.stato === "inviato") azione.mutate({ os, azione: "letto" });
  };
  const elenco = q.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="size-5 text-primary" aria-hidden="true" />{t("Ordini dall'impresa")}</h1>
      {q.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere gli ordini. Riprova tra poco.")}</p>
        : q.isLoading ? <p className="text-sm text-muted-foreground">{t("Carico…")}</p>
        : elenco.length === 0 ? <p className={cn(RIQUADRO, "text-sm text-muted-foreground")}>{t("Nessun ordine di servizio o contestazione.")}</p>
        : elenco.map(os => {
          const st = STATI_OS[os.stato];
          const espanso = aperto === os.id;
          const daFare = ["inviato", "letto", "riaperto"].includes(os.stato);
          return (
            <section key={os.id} className={RIQUADRO}>
              <button type="button" aria-expanded={espanso} onClick={() => apri(os)} className="flex w-full items-start gap-2 text-start">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase text-muted-foreground">{os.tipo === "contestazione" ? t("Contestazione") : t("Ordine di servizio")}</span>
                  <span dir="auto" className="block text-sm font-semibold">{os.titolo}</span>
                  {os.scadenza && <span className="block text-xs text-muted-foreground">{t("Entro il {data}", { data: format(parseISO(os.scadenza), "d MMM", { locale: dateFnsCampo() }) })}</span>}
                </span>
                <span className={cn(CHIP, st.cls)}>{t(st.label)}</span>
              </button>
              {espanso && (
                <div className="mt-2 space-y-2 border-t pt-2 text-sm">
                  {os.testo && <p dir="auto" className="whitespace-pre-line">{os.testo}</p>}
                  <FotoOs percorsi={os.foto} />
                  {os.stato === "riaperto" && os.nota_chiusura && <p dir="auto" className="rounded-lg bg-red-50 p-2 text-red-900">{t("Riaperto")}: {os.nota_chiusura}</p>}
                  {os.risposta && <p dir="auto" className="rounded-lg bg-muted p-2"><span className="font-semibold">{t("Vostra risposta")}:</span> {os.risposta}</p>}
                  {daFare && (
                    <div className="space-y-2">
                      <textarea value={risposta} onChange={e => setRisposta(e.target.value)} rows={3} maxLength={2000} placeholder={t("Cosa avete fatto")}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-base" />
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold">
                        <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
                          onChange={e => setFoto(Array.from(e.target.files ?? []).slice(0, 6))} />
                        {foto.length ? t("{n} foto pronte", { n: foto.length }) : t("Aggiungi una foto")}
                      </label>
                      <button type="button" disabled={risposta.trim().length < 2 || azione.isPending} onClick={() => azione.mutate({ os, azione: "risolto" })}
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50">
                        {azione.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{t("Fatto: manda all'impresa")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
