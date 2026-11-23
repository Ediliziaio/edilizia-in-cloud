import { AzioniRapportino } from "./AzioniRapportino";
/**
 * Tutto quello che l'operaio ha scritto nel rapportino, dentro il popup di
 * approvazione: si decide leggendo, senza aprire altre pagine.
 */
import { COLONNE_RAPPORTINO } from "@/lib/campo/colonneRapportino";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { PulsantePdfRapportino } from "@/components/orders/PulsantePdfRapportino";
import { StoricoRapportino } from "@/components/orders/CorreggiRapportino";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useNomiFasiCommessa } from "@/hooks/useRapportiniMese";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { METEO } from "@/lib/campo/rapportiniUfficio";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { compilatoDa } from "../../../supabase/functions/genera-pdf-rapportino/model";

const ETICHETTA = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export function DettagliRapportino({ companyId, orderId, reportId, onRimosso }: { companyId: string; orderId: string; reportId: string; onRimosso?: () => void }) {
  const t = useT();
  const { data: nomiFasi } = useNomiFasiCommessa(orderId);
  const [foto, setFoto] = useState<string | null>(null);
  const { data: r } = useQuery({
    queryKey: ["campo-rapportino-dettagli", reportId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campo_rapportini").select(COLONNE_RAPPORTINO)
        .eq("id", reportId).eq("order_id", orderId).eq("company_id", companyId).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
    retry: false,
  });
  if (!r) return null;
  const riga = r as typeof r & { mezzi_usati?: unknown };
  const mezzi = Array.isArray(riga.mezzi_usati)
    ? (riga.mezzi_usati as Array<{ nome?: string; ore?: number }>).filter((m) => m?.nome)
    : [];
  const meteo = r.meteo ? (() => { const l = METEO.find((m) => m.value === r.meteo)?.label; return l ? t(l) : r.meteo; })() : null;
  const autore = compilatoDa(r as unknown as Record<string, unknown>);
  return (
    <div className="space-y-2.5 text-[13px] leading-snug">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {r.data_lavoro && <p className="font-semibold capitalize text-slate-900">{format(parseISO(r.data_lavoro), "EEEE d MMMM yyyy", { locale: dateFnsCampo() })}</p>}
          {autore && <p className="text-xs text-muted-foreground">{autore}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AzioniRapportino report={r} orderId={orderId} onFatto={onRimosso} />
          <PulsantePdfRapportino report={r} orderId={orderId} />
        </div>
      </div>
      <section>
        <p className={ETICHETTA}>{t("Cosa si è fatto")}</p>
        <p className="mt-1 whitespace-pre-wrap text-slate-900">{r.descrizione_lavori?.trim() || t("Nessuna descrizione.")}</p>
      </section>
      {mezzi.length > 0 && (
        <section>
          <p className={ETICHETTA}>{t("Mezzi")}</p>
          <p className="mt-1 text-slate-800">{mezzi.map((m) => (m.ore ? `${m.nome} (${m.ore} h)` : m.nome)).join(", ")}</p>
        </section>
      )}
      <RapportinoBlocchi report={r} nomiFasi={nomiFasi} onFoto={(url) => { void linkFileRiservato(url).then((u) => setFoto(u)); }} />
      {(meteo || r.note?.trim()) && (
        <dl className="space-y-1 text-slate-700">
          {meteo && <div className="flex gap-2"><dt className="text-slate-500">{t("Meteo")}</dt><dd>{meteo}</dd></div>}
          {r.note?.trim() && <div className="flex gap-2"><dt className="text-slate-500">{t("Note")}</dt><dd className="whitespace-pre-wrap">{r.note}</dd></div>}
        </dl>
      )}
      {(r.firma_cliente_url || r.firma_operaio_url) && (
        <section>
          <p className={ETICHETTA}>{t("Firme")}</p>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {r.firma_cliente_url && <div><p className="mb-1 text-xs text-muted-foreground">{t("Cliente")}{r.firma_cliente_nome ? `: ${r.firma_cliente_nome}` : ""}</p><ImgRiservata loading="lazy" src={r.firma_cliente_url} alt={t("Firma cliente")} className="h-16 rounded-md border bg-white" /></div>}
            {r.firma_operaio_url && <div><p className="mb-1 text-xs text-muted-foreground">{t("Operaio")}</p><ImgRiservata loading="lazy" src={r.firma_operaio_url} alt={t("Firma operaio")} className="h-16 rounded-md border bg-white" /></div>}
          </div>
        </section>
      )}
      <StoricoRapportino rapportinoId={reportId} />
      <Dialog open={!!foto} onOpenChange={(o) => { if (!o) setFoto(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{t("Foto del rapportino")}</DialogTitle>
          {foto && <img src={foto} alt={t("Foto del rapportino")} className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
