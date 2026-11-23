import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { useVotiOnline } from "@/hooks/useVotiOnline";
import { MAX_VOTI_NEL_PDF, votoScritto } from "../../../supabase/functions/_shared/recensioniOnline";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Accanto alle testimonianze dei modelli: il voto su Google o Trustpilot non si
 * scrive qui, sta nel Profilo aziendale e vale per tutti i preventivi.
 */
export function VotoOnlineDelProfilo() {
  const t = useT();
  const { voti, caricato } = useVotiOnline();
  if (!caricato) return null;
  const inPdf = voti.slice(0, MAX_VOTI_NEL_PDF);
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-[11px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
      <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {inPdf.length
          ? <>{t("Nella pagina «Dicono di noi» esce anche il tuo voto: {voti}.", { voti: inPdf.map((v) => `${v.nome} ${votoScritto(v.voto)}`).join(" · ") })} </>
          : <>{t("Nella pagina «Dicono di noi» può uscire anche il tuo voto su Google o Trustpilot.")} </>}
        <Link to="/azienda/impostazioni/profilo" className="font-medium underline">
          {inPdf.length ? t("Si cambia nel Profilo aziendale") : t("Si scrive nel Profilo aziendale")}
        </Link>
        .
      </span>
    </div>
  );
}
