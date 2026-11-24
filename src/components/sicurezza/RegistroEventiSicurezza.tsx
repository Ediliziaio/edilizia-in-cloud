/**
 * Registro infortuni, quasi-incidenti e situazioni pericolose (Sicurezza cantiere → scheda «Infortuni», 23/11/2026).
 *
 * Arrivano dall'app degli operai (/campo/sicurezza/segnala). Chi segue la sicurezza le prende in carico e le chiude
 * scrivendo le azioni correttive; l'operaio vede lo stato e cosa si è deciso. Niente si cancella: è un registro.
 * Ricorda l'obbligo INAIL per gli infortuni con prognosi oltre i tre giorni.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, HeartPulse, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SicurezzaEvento } from "@/integrations/supabase/appDatabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const TIPO: Record<SicurezzaEvento["tipo"], string> = {
  infortunio: "Infortunio",
  quasi_incidente: "Quasi incidente",
  pericolo: "Situazione pericolosa",
};
const SOCCORSO: Record<SicurezzaEvento["soccorso"], string> = {
  nessuno: "nessun soccorso",
  primo_soccorso: "primo soccorso in cantiere",
  pronto_soccorso: "pronto soccorso",
  ambulanza: "ambulanza",
};
const STATO: Record<SicurezzaEvento["stato"], string> = {
  nuova: "Da prendere in carico",
  presa_in_carico: "Presa in carico",
  chiusa: "Chiusa",
};

const quando = (iso: string) => new Date(iso).toLocaleString(intlCampo(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function FotoEvento({ percorsi }: { percorsi: string[] }) {
  const t = useT();
  const firme = useQuery({
    queryKey: ["sicurezza-eventi-foto", percorsi],
    enabled: percorsi.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("sicurezza-eventi").createSignedUrls(percorsi, 3600);
      if (error) throw error;
      return (data ?? []).map(d => d.signedUrl).filter((u): u is string => !!u);
    },
  });
  if (!percorsi.length) return null;
  if (firme.isLoading) return <p className="text-xs text-muted-foreground"><ImageIcon className="mr-1 inline size-3.5" />{t("Carico le foto…")}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {(firme.data ?? []).map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer noopener">
          <img src={url} alt={t("Foto {n}", { n: i + 1 })} className="size-20 rounded-lg border object-cover" />
        </a>
      ))}
    </div>
  );
}

function SchedaEvento({ evento, chi, cantiere, puoScrivere }: {
  evento: SicurezzaEvento; chi: string; cantiere: string | null; puoScrivere: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [azioni, setAzioni] = useState(evento.azioni_correttive ?? "");
  const [note, setNote] = useState(evento.note_ufficio ?? "");
  const aggiorna = useMutation({
    mutationFn: async (stato: SicurezzaEvento["stato"]) => {
      if (stato === "chiusa" && !azioni.trim()) throw new Error(t("Scrivi le azioni correttive prima di chiudere."));
      const { error } = await supabase.from("sicurezza_eventi")
        .update({ stato, azioni_correttive: azioni.trim() || null, note_ufficio: note.trim() || null })
        .eq("id", evento.id);
      if (error) throw error;
    },
    onSuccess: (_d, stato) => {
      toast.success(stato === "chiusa" ? t("Segnalazione chiusa") : t("Salvato"));
      void queryClient.invalidateQueries({ queryKey: ["sicurezza-eventi"] });
    },
    onError: (e: Error) => toast.error(e.message || t("Non sono riuscito a salvare. Riprova.")),
  });

  const infortunio = evento.tipo === "infortunio";
  return (
    <li className={cn("space-y-3 rounded-xl border bg-white p-4 shadow-sm dark:bg-background", evento.stato === "nuova" && infortunio && "border-red-300")}>
      <div className="flex flex-wrap items-center gap-2">
        {infortunio ? <HeartPulse className="size-4 text-red-600" aria-hidden="true" /> : <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />}
        <span className="font-semibold">{t(TIPO[evento.tipo])}</span>
        {cantiere && <Badge variant="outline">{cantiere}</Badge>}
        <Badge variant={evento.stato === "chiusa" ? "secondary" : evento.stato === "nuova" ? "destructive" : "default"} className="ms-auto">
          {t(STATO[evento.stato])}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {quando(evento.accaduto_il)}{evento.luogo ? ` · ${evento.luogo}` : ""} {t("· segnalato da")} {chi}
      </p>
      <p className="whitespace-pre-wrap text-sm">{evento.descrizione}</p>
      {infortunio && (
        <p className="text-sm">
          <span className="font-medium">{t("Ferito:")}</span> {evento.persona_coinvolta || chi}
          {evento.parte_corpo ? ` · ${evento.parte_corpo}` : ""} · {t(SOCCORSO[evento.soccorso])}
        </p>
      )}
      {evento.testimoni && <p className="text-sm"><span className="font-medium">{t("Testimoni:")}</span> {evento.testimoni}</p>}
      <FotoEvento percorsi={evento.foto} />
      {infortunio && evento.stato !== "chiusa" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("Se la prognosi supera i tre giorni, la denuncia all'INAIL va fatta entro due giorni dal certificato medico.")}
        </p>
      )}
      {puoScrivere ? (
        <div className="space-y-2">
          <Textarea value={azioni} onChange={e => setAzioni(e.target.value)} maxLength={4000} rows={2}
            placeholder={t("Azioni correttive: cosa si fa perché non succeda più (l'operaio lo vede)")} aria-label={t("Azioni correttive")} />
          <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={4000} rows={2}
            placeholder={t("Note interne dell'ufficio (l'operaio non le vede)")} aria-label={t("Note interne")} />
          <div className="flex flex-wrap gap-2">
            {evento.stato === "nuova" && (
              <Button size="sm" variant="outline" disabled={aggiorna.isPending} onClick={() => aggiorna.mutate("presa_in_carico")}>{t("Prendi in carico")}</Button>
            )}
            {evento.stato !== "chiusa" ? (
              <Button size="sm" disabled={aggiorna.isPending} onClick={() => aggiorna.mutate("chiusa")}>
                {aggiorna.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}{t("Chiudi")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={aggiorna.isPending} onClick={() => aggiorna.mutate("chiusa")}>{t("Salva modifiche")}</Button>
            )}
          </div>
        </div>
      ) : (
        evento.azioni_correttive && <p className="text-sm"><span className="font-medium">{t("Azioni correttive:")}</span> {evento.azioni_correttive}</p>
      )}
    </li>
  );
}

export function RegistroEventiSicurezza({ companyId, puoScrivere }: { companyId: string; puoScrivere: boolean }) {
  const t = useT();
  const [soloAperte, setSoloAperte] = useState(true);
  const eventi = useQuery({
    queryKey: ["sicurezza-eventi", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sicurezza_eventi").select("*")
        .eq("company_id", companyId).order("accaduto_il", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const righe = eventi.data ?? [];
  const persone = useQuery({
    queryKey: ["sicurezza-eventi-persone", [...new Set(righe.map(e => e.segnalato_da))].sort()],
    enabled: righe.length > 0,
    queryFn: async () => {
      const ids = [...new Set(righe.map(e => e.segnalato_da))];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
      return new Map((data ?? []).map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || t("Operaio")]));
    },
  });
  const cantieri = useQuery({
    queryKey: ["sicurezza-eventi-cantieri", [...new Set(righe.map(e => e.order_id).filter(Boolean))].sort()],
    enabled: righe.some(e => e.order_id),
    queryFn: async () => {
      const ids = [...new Set(righe.map(e => e.order_id).filter((x): x is string => !!x))];
      const { data } = await supabase.from("orders").select("id, order_code").in("id", ids);
      return new Map((data ?? []).map(o => [o.id, o.order_code]));
    },
  });
  const aperte = righe.filter(e => e.stato !== "chiusa").length;
  const visibili = useMemo(() => (soloAperte ? righe.filter(e => e.stato !== "chiusa") : righe), [righe, soloAperte]);

  return (
    <section className="space-y-3" aria-labelledby="titolo-registro-eventi">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titolo-registro-eventi" className="text-base font-semibold">{t("Infortuni e quasi-incidenti")}</h2>
        <span className="text-sm text-muted-foreground">{aperte === 1 ? t("1 da gestire") : t("{n} da gestire", { n: String(aperte ?? "") })}</span>
        <div className="ms-auto flex gap-1 rounded-lg border p-1">
          <Button size="sm" variant={soloAperte ? "default" : "ghost"} onClick={() => setSoloAperte(true)}>{t("Da gestire")}</Button>
          <Button size="sm" variant={soloAperte ? "ghost" : "default"} onClick={() => setSoloAperte(false)}>{t("Tutte")}</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("Le segnalano gli operai dall'app (Altro → Sicurezza: segnala). Chi segue la sicurezza riceve subito un avviso.")}
      </p>
      {eventi.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Caricamento…")}</p>
      ) : eventi.isError ? (
        <div className="rounded-xl border p-4 text-sm">
          {t("Non riesco a caricare il registro.")} <Button size="sm" variant="link" onClick={() => void eventi.refetch()}>{t("Riprova")}</Button>
        </div>
      ) : visibili.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm dark:bg-background">
          {soloAperte ? t("Nessuna segnalazione da gestire.") : t("Nessuna segnalazione finora.")}
        </p>
      ) : (
        <ul className="space-y-3">
          {visibili.map(e => (
            <SchedaEvento key={e.id} evento={e} puoScrivere={puoScrivere}
              chi={persone.data?.get(e.segnalato_da) ?? t("Operaio")}
              cantiere={e.order_id ? cantieri.data?.get(e.order_id) ?? null : null} />
          ))}
        </ul>
      )}
    </section>
  );
}
