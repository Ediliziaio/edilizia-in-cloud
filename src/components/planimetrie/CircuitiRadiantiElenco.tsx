import { nomeCircuito, type CircuitoRadiante } from "../../../shared/planimetrie/circuitiRadianti.ts";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const metri = () => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });

export function CircuitiRadiantiElenco({ circuiti }: { circuiti: CircuitoRadiante[] }) {
  const t = useT();
  return <ul className="space-y-2" aria-label={t("Metri per circuito radiante")}>
    {circuiti.map(c => (
      <li className="rounded-md border p-2 text-xs" key={`${c.localeId}-${c.numero}`}>
        <div className="flex justify-between gap-2 font-semibold">
          <span>{nomeCircuito(c)}</span><strong className="shrink-0 tabular-nums">{metri().format(c.totaleM)} m</strong>
        </div>
        <dl className="mt-1.5 grid grid-cols-3 gap-1 tabular-nums">
          <div><dt className="text-orange-800">{t("Mandata")}</dt><dd>{metri().format(c.mandataM)} m</dd></div>
          <div><dt className="text-muted-foreground">{t("Serpentina")}</dt><dd>{metri().format(c.tuboAttivoM)} m</dd></div>
          <div><dt className="text-blue-700">{t("Ritorno")}</dt><dd>{metri().format(c.ritornoM)} m</dd></div>
        </dl>
        {(c.superaObiettivo || c.attraversamenti.length > 0) && <p className="mt-1 text-amber-800">
          {[c.superaObiettivo && t("Supera la lunghezza obiettivo"), c.attraversamenti.length > 0 &&
            t(c.attraversamenti.length === 1 ? "{n} attraversamento da verificare" : "{n} attraversamenti da verificare", { n: c.attraversamenti.length })].filter(Boolean).join(" · ")}
        </p>}
      </li>
    ))}
  </ul>;
}
