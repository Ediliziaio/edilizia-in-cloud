/**
 * Ordini di servizio e contestazioni a una ditta, lato ufficio (26/11/2026, piano campo completo, punto 3.4).
 * Si mandano da qui (con foto e scadenza); quando la ditta risponde si accetta la chiusura o si riapre.
 * La ditta deve avere l'accesso all'app (subappaltatori.user_id) per riceverli.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FotoOs } from "@/components/campo/FotoOs";
import { caricaFotoOs, COLONNE_OS, STATI_OS, type OrdineServizio } from "@/lib/campo/ordiniServizio";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Rpc = "ordine_servizio_crea" | "ordine_servizio_decidi";
const db = () => supabase as unknown as {
  rpc: (n: Rpc, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  from: (t: "ordini_servizio_ditte") => any;
};

export function OrdiniServizioUfficio({ companyId, dittaId }: { companyId: string; dittaId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [nuovo, setNuovo] = useState(false);
  const [tipo, setTipo] = useState<"ordine" | "contestazione">("ordine");
  const [titolo, setTitolo] = useState("");
  const [testo, setTesto] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [foto, setFoto] = useState<File[]>([]);
  const chiave = ["ufficio-ordini-servizio", dittaId];
  const q = useQuery({
    queryKey: chiave,
    queryFn: async (): Promise<OrdineServizio[]> => {
      const { data, error } = await db().from("ordini_servizio_ditte").select(COLONNE_OS).eq("subappaltatore_id", dittaId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as OrdineServizio[];
    },
  });
  const crea = useMutation({
    mutationFn: async () => {
      const percorsi = foto.length ? await caricaFotoOs(companyId, dittaId, foto) : [];
      const { error } = await db().rpc("ordine_servizio_crea", {
        p_subappaltatore_id: dittaId, p_order_id: null, p_tipo: tipo, p_titolo: titolo.trim(), p_testo: testo.trim() || null,
        p_scadenza: scadenza || null, p_foto: percorsi,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("Mandato alla ditta"));
      setNuovo(false); setTitolo(""); setTesto(""); setScadenza(""); setFoto([]);
      void qc.invalidateQueries({ queryKey: chiave });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("Non sono riuscito a inviarlo. Riprova.")),
  });
  const decidi = useMutation({
    mutationFn: async (v: { id: string; accetta: boolean; nota: string | null }) => {
      const { error } = await db().rpc("ordine_servizio_decidi", { p_id: v.id, p_accetta: v.accetta, p_nota: v.nota });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: chiave }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("Non sono riuscito a salvare: riprova.")),
  });
  const elenco = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-4 text-primary" aria-hidden="true" />{t("Ordini di servizio e contestazioni")}</CardTitle>
        {!nuovo && <Button size="sm" onClick={() => setNuovo(true)}>{t("Nuovo")}</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {nuovo && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex gap-2" role="radiogroup" aria-label={t("Tipo")}>
              {(["ordine", "contestazione"] as const).map(v => (
                <Button key={v} type="button" size="sm" role="radio" aria-checked={tipo === v} variant={tipo === v ? "secondary" : "outline"} onClick={() => setTipo(v)}>
                  {v === "ordine" ? t("Ordine di servizio") : t("Contestazione")}
                </Button>
              ))}
            </div>
            <Input value={titolo} onChange={e => setTitolo(e.target.value)} maxLength={160} placeholder={t("Di cosa si tratta")} />
            <Textarea value={testo} onChange={e => setTesto(e.target.value)} rows={3} maxLength={4000} placeholder={t("Dettagli (facoltativo)")} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">{t("Entro il")}<Input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)} className="h-9 w-40" /></label>
              <label className="cursor-pointer rounded-md border px-3 py-1.5">
                <input type="file" accept="image/*" multiple className="sr-only" onChange={e => setFoto(Array.from(e.target.files ?? []).slice(0, 6))} />
                {foto.length ? t("{n} foto pronte", { n: foto.length }) : t("Aggiungi foto")}
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setNuovo(false)}>{t("Annulla")}</Button>
              <Button disabled={titolo.trim().length < 3 || crea.isPending} onClick={() => crea.mutate()}>
                {crea.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}{t("Manda alla ditta")}
              </Button>
            </div>
          </div>
        )}
        {q.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere gli ordini. Riprova tra poco.")}</p>
          : elenco.length === 0 && !nuovo ? <p className="text-sm text-muted-foreground">{t("Nessun ordine di servizio o contestazione.")}</p>
          : (
            <ul className="divide-y text-sm">
              {elenco.map(os => {
                const st = STATI_OS[os.stato];
                return (
                  <li key={os.id} className="space-y-1 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">{os.tipo === "contestazione" ? t("Contestazione") : t("Ordine")}</span>
                      <span className="font-semibold">{os.titolo}</span>
                      <span className={cn("ms-auto rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{t(st.label)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(os.created_at), "d MMM yyyy", { locale: it })}
                      {os.scadenza ? ` · ${t("entro il {data}", { data: format(parseISO(os.scadenza), "d MMM", { locale: it }) })}` : ""}
                      {os.letto_il ? ` · ${t("letto il {data}", { data: format(parseISO(os.letto_il), "d MMM HH:mm", { locale: it }) })}` : ""}
                    </p>
                    {os.risposta && <p className="rounded bg-muted p-2"><span className="font-medium">{t("Risposta della ditta")}:</span> {os.risposta}</p>}
                    <FotoOs percorsi={[...os.foto, ...os.foto_risposta]} />
                    {os.stato === "risolto" && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={decidi.isPending} onClick={() => decidi.mutate({ id: os.id, accetta: true, nota: null })}>{t("Chiudi")}</Button>
                        <Button size="sm" variant="outline" disabled={decidi.isPending} onClick={() => {
                          const nota = window.prompt(t("Cosa va rifatto? Lo legge la ditta."));
                          if (nota?.trim()) decidi.mutate({ id: os.id, accetta: false, nota: nota.trim() });
                        }}>{t("Riapri")}</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}
