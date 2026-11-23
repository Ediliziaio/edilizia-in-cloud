import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Images, Ruler } from "lucide-react";
import { FotoCantiereRiservata } from "@/components/campo/FotoCantiereRiservata";
import { RegistraVisitaCampo } from "@/components/campo/RegistraVisitaCampo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { validWorkDay } from "@/lib/campo/workDay";
import { FOTO_RILIEVO_BUCKET, type TipoVisitaCampo } from "@/lib/campo/schedaCantiere";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const etichette = { rilievo: "Rilievo", sopralluogo: "Sopralluogo" } as const;

export function RilieviSchedaCantiere({ orderId, companyId, userId, cantiere }: {
  orderId: string; companyId: string; userId: string; cantiere: string;
}) {
  const t = useT();
  const dataVisitaCampo = new Intl.DateTimeFormat(intlCampo(), { dateStyle: "medium", timeZone: "Europe/Rome" });
  const [nuova, setNuova] = useState<TipoVisitaCampo | null>(null);
  const [fotoAttiva, setFotoAttiva] = useState<string | null>(null);
  const visite = useQuery({
    queryKey: ["campo-rilievi-scheda", orderId, companyId, userId],
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("campo_rilievi_cantiere", {
        p_azienda: companyId, p_ordine: orderId,
      }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (visite.isError && "code" in visite.error && visite.error.code === "42501") {
    return <p role="alert" className="rounded-xl border bg-card p-3 text-sm">{t("La registrazione delle visite non è autorizzata per questo cantiere.")}</p>;
  }
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" className="min-h-11 gap-1.5 px-1.5 text-xs sm:text-sm" onClick={() => setNuova("rilievo")}>
        <Ruler className="size-4 shrink-0" aria-hidden="true" /> {t("Nuovo rilievo")}
      </Button>
      <Button type="button" variant="outline" className="min-h-11 gap-1.5 px-1.5 text-xs sm:text-sm"
        onClick={() => setNuova("sopralluogo")}>
        <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" /> {t("Sopralluogo")}
      </Button>
    </div>
    {visite.isError ? <div role="alert" className="rounded-xl border bg-card p-3 text-sm">
      {t("Le visite non sono disponibili.")}{" "}
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => void visite.refetch()}>{t("Riprova")}</Button>
    </div> : visite.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("Carico le visite…")}</p>
      : visite.data.length ? <ul className="divide-y rounded-xl border bg-card" aria-label={t("Le mie visite in questo cantiere")}>
        {visite.data.map(v => <li key={v.id} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <p className="text-sm font-semibold">{etichette[v.tipo] ? t(etichette[v.tipo]) : t("Visita")}{v.codice && <span className="ml-1 text-xs font-normal text-muted-foreground">{v.codice}</span>}</p>
            {v.giorno && validWorkDay(v.giorno) &&
              <time dateTime={v.giorno} className="text-xs text-muted-foreground">{dataVisitaCampo.format(new Date(`${v.giorno}T12:00:00Z`))}</time>}
          </div>
          {v.misure && <p className="whitespace-pre-wrap break-words text-sm" dir="auto">{v.misure}</p>}
          {v.note && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground" dir="auto">{v.note}</p>}
          {!!v.foto?.length && <div className="flex flex-wrap gap-1">
            {v.foto.map((percorso, i) => <Button key={percorso} type="button" size="sm" variant="outline" className="min-h-11 gap-1.5"
              onClick={() => setFotoAttiva(percorso)}><Images className="size-4" aria-hidden="true" /> {t("Foto {n}", { n: i + 1 })}</Button>)}
          </div>}
        </li>)}
      </ul> : <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">{t("Qui trovi i rilievi e i sopralluoghi che registri.")}</p>}
    {nuova && <RegistraVisitaCampo key={nuova} tipo={nuova} orderId={orderId} companyId={companyId} userId={userId} cantiere={cantiere}
      onClose={() => setNuova(null)} onSaved={() => setNuova(null)} />}
    {fotoAttiva && <FotoCantiereRiservata key={fotoAttiva} bucket={FOTO_RILIEVO_BUCKET} percorso={fotoAttiva}
      titolo={t("Foto della visita")} chiudi={() => setFotoAttiva(null)} />}
  </div>;
}
