/**
 * Tutto quello che l'operaio ha scritto nel rapportino, dentro il popup di
 * approvazione: si decide leggendo, senza aprire altre pagine.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { PulsantePdfRapportino } from "@/components/orders/PulsantePdfRapportino";
import { CorreggiRapportino, StoricoRapportino } from "@/components/orders/CorreggiRapportino";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useNomiFasiCommessa } from "@/hooks/useRapportiniMese";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { METEO } from "@/lib/campo/rapportiniUfficio";
import { compilatoDa } from "../../../supabase/functions/genera-pdf-rapportino/model";

const ETICHETTA = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export function DettagliRapportino({ companyId, orderId, reportId }: { companyId: string; orderId: string; reportId: string }) {
  const { data: nomiFasi } = useNomiFasiCommessa(orderId);
  const [foto, setFoto] = useState<string | null>(null);
  const { data: r } = useQuery({
    queryKey: ["campo-rapportino-dettagli", reportId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campo_rapportini").select("*")
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
  const meteo = r.meteo ? METEO.find((m) => m.value === r.meteo)?.label ?? r.meteo : null;
  const autore = compilatoDa(r as unknown as Record<string, unknown>);
  return (
    <div className="space-y-2.5 text-[13px] leading-snug">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {r.data_lavoro && <p className="font-semibold capitalize text-slate-900">{format(parseISO(r.data_lavoro), "EEEE d MMMM yyyy", { locale: it })}</p>}
          {autore && <p className="text-xs text-muted-foreground">{autore}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <CorreggiRapportino rapportinoId={reportId} orderId={orderId} />
          <PulsantePdfRapportino report={r} orderId={orderId} />
        </div>
      </div>
      <section>
        <p className={ETICHETTA}>Cosa si è fatto</p>
        <p className="mt-1 whitespace-pre-wrap text-slate-900">{r.descrizione_lavori?.trim() || "Nessuna descrizione."}</p>
      </section>
      {mezzi.length > 0 && (
        <section>
          <p className={ETICHETTA}>Mezzi</p>
          <p className="mt-1 text-slate-800">{mezzi.map((m) => (m.ore ? `${m.nome} (${m.ore} h)` : m.nome)).join(", ")}</p>
        </section>
      )}
      <RapportinoBlocchi report={r} nomiFasi={nomiFasi} onFoto={(url) => { void linkFileRiservato(url).then((u) => setFoto(u)); }} />
      {(meteo || r.note?.trim()) && (
        <dl className="space-y-1 text-slate-700">
          {meteo && <div className="flex gap-2"><dt className="text-slate-500">Meteo</dt><dd>{meteo}</dd></div>}
          {r.note?.trim() && <div className="flex gap-2"><dt className="text-slate-500">Note</dt><dd className="whitespace-pre-wrap">{r.note}</dd></div>}
        </dl>
      )}
      {(r.firma_cliente_url || r.firma_operaio_url) && (
        <section>
          <p className={ETICHETTA}>Firme</p>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {r.firma_cliente_url && <div><p className="mb-1 text-xs text-muted-foreground">Cliente{r.firma_cliente_nome ? `: ${r.firma_cliente_nome}` : ""}</p><ImgRiservata loading="lazy" src={r.firma_cliente_url} alt="Firma cliente" className="h-16 rounded-md border bg-white" /></div>}
            {r.firma_operaio_url && <div><p className="mb-1 text-xs text-muted-foreground">Operaio</p><ImgRiservata loading="lazy" src={r.firma_operaio_url} alt="Firma operaio" className="h-16 rounded-md border bg-white" /></div>}
          </div>
        </section>
      )}
      <StoricoRapportino rapportinoId={reportId} />
      <Dialog open={!!foto} onOpenChange={(o) => { if (!o) setFoto(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Foto del rapportino</DialogTitle>
          {foto && <img src={foto} alt="Foto del rapportino" className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
