/**
 * I rapportini di questo cantiere ancora sul telefono: messi in coda e non ancora arrivati all'ufficio.
 *
 * Collaudo 23/11/2026: dopo «Invia» con il campo debole l'operaio tornava sul cantiere e non trovava il suo
 * rapportino da nessuna parte (lo storico lo legge dal database, dove non c'era ancora). Qui lo vede subito,
 * con ore e foto, e sa che parte da solo; se l'invio ha bisogno di lui, lo dice e porta al modulo.
 */
import { format, parseISO } from "date-fns";
import { AlertCircle, CloudUpload } from "lucide-react";
import { Link } from "react-router-dom";
import { useCodaCampo } from "@/hooks/campo/useCodaCampo";
import { oreInTesto } from "@/lib/campo/regoleCampo";
import { campoReportUrl } from "@/lib/campo/reportKind";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function RapportiniInCoda({ companyId, userId, orderId, online }: {
  companyId: string | null;
  userId: string | undefined;
  orderId: string;
  online: boolean;
}) {
  const t = useT();
  const voci = useCodaCampo(companyId, userId, "rapportino").filter(voce => voce.payload.order_id === orderId);
  if (!voci.length) return null;
  return (
    <section aria-label={t("Rapportini da inviare")} className="space-y-2">
      {voci.map(voce => {
        const { giorno, campi } = voce.payload;
        const fallito = voce.status === "failed";
        const ore = Number(campi.ore_lavorate);
        const foto = campi.foto_urls?.length ?? 0;
        const data = parseISO(giorno);
        return (
          <div key={voce.id} role="status"
            className={fallito ? "rounded-2xl border border-red-300 bg-red-50 p-3" : "rounded-2xl border border-emerald-300 bg-emerald-50 p-3"}>
            <div className="flex items-start gap-2">
              {fallito
                ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden="true" />
                : <CloudUpload className="mt-0.5 size-4 shrink-0 text-emerald-700 motion-safe:animate-pulse" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className={fallito ? "text-sm font-semibold text-red-900" : "text-sm font-semibold text-emerald-900"}>
                  {t("Rapportino del {data}", { data: Number.isNaN(data.getTime()) ? giorno : format(data, "d MMM", { locale: dateFnsCampo() }) })}
                  {" · "}{t(fallito ? "da controllare" : "sul telefono, da inviare")}
                </p>
                <p className="text-xs text-foreground/80">
                  {[Number.isFinite(ore) && ore > 0 ? oreInTesto(ore) : null, foto ? t("{n} foto", { n: foto }) : null].filter(Boolean).join(" · ") || t("Senza ore")}
                </p>
                <p className="mt-1 text-xs text-foreground/80">
                  {fallito
                    ? voce.lastError || t("L’ufficio non l’ha ricevuto. Aprilo per correggerlo o riprovare.")
                    : t(online
                      ? "Lo sto inviando. Se la rete è debole riprovo da solo: non serve rifarlo."
                      : "Parte da solo quando torna la rete: non serve rifarlo.")}
                </p>
                {fallito && (
                  <Link to={campoReportUrl(orderId, "daily", giorno)}
                    className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-red-800 underline">
                    {t("Apri il rapportino")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
