/**
 * Il costo di una proposta di Silvio prima di salvarla (23/11/2026): quante lavorazioni
 * comporta e quanto costano, rispetto a com'era la variante prima della richiesta.
 * Stessi conti dello studio della variante: voci quotate dal listino o con prezzo indicativo.
 */
import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useFontiPrezzi } from "@/lib/planimetrie/fontiPrezzi";
import { costoDellaProposta } from "@/lib/planimetrie/costoProposta";
import { conPrezziProposti, tipiDaCercare } from "@/lib/planimetrie/prezziProposti";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const euro = () => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const delta = () => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, signDisplay: "exceptZero" });

export function CostoProposta({ documento, proposta, ambito, companyId }: { documento: Planimetria; proposta: Planimetria; ambito: string; companyId: string }) {
  const t = useT();
  const permessi = usePermissions();
  const variante = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : "";
  const grezze = useMemo(() => proposta.livelli.some((l) => l.proposte.some((p) => p.id === variante)) ? studioVariante(proposta, variante).righe : [], [proposta, variante]);
  const { fonti } = useFontiPrezzi(companyId, useMemo(() => tipiDaCercare(grezze), [grezze]), permessi.canViewPreventivi);
  const costo = useMemo(() => costoDellaProposta(documento, proposta, ambito, (r) => conPrezziProposti(r, fonti) as typeof r), [documento, proposta, ambito, fonti]);
  if (!permessi.canViewPreventivi || !costo || costo.dopo === null) return null;
  const incompleto = costo.daQuotare + costo.daMisurare;
  return <span className="text-xs text-teal-900 dark:text-teal-100" role="status" aria-label={t("Costo della proposta")}>
    {t(costo.lavorazioni === 1 ? "{n} lavorazione" : "{n} lavorazioni", { n: costo.lavorazioni })} · <strong className="font-semibold tabular-nums">{euro().format(costo.dopo)}</strong>
    {costo.prima > 0 && costo.dopo !== costo.prima && <>{" "}{t("({delta} rispetto a prima)", { delta: delta().format(costo.dopo - costo.prima) })}</>}
    {incompleto > 0 ? ` · ${t("{n} da completare", { n: incompleto })}` : costo.indicative > 0 ? ` · ${t("{n} con prezzo indicativo", { n: costo.indicative })}` : ""}
  </span>;
}
