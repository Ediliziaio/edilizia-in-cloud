/**
 * FvDimensionamentoStringhe — progettazione elettrica base: mostra quante
 * stringhe / moduli-per-stringa servono e se rientrano nella finestra di
 * tensione dell'inverter (a freddo/caldo). Gap vs Reonic/Autarc (string
 * planning) — qui versione minima con specifiche standard.
 */
import { Cable, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  dimensionaStringhe,
  INVERTER_DEFAULT,
  type SpecModulo,
  type SpecInverter,
} from "@/lib/fotovoltaico/stringhe";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="text-[9px] text-slate-400">{hint}</div>}
    </div>
  );
}

export function FvDimensionamentoStringhe({
  numeroModuli,
  modulo,
  inverter,
  className,
}: {
  numeroModuli: number;
  /** Specifiche modulo reali (dal pannello scelto). Default: modulo standard ~540 Wp. */
  modulo?: SpecModulo;
  /** Specifiche inverter reali. Default: inverter residenziale generico. */
  inverter?: SpecInverter;
  className?: string;
}) {
  const t = useT();
  if (!numeroModuli || numeroModuli < 1) return null;
  const r = dimensionaStringhe(numeroModuli, modulo, inverter);

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 max-md:p-3",
        r.valido ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/40",
        className,
      )}
    >
      {/* Telefono: basta sapere se la configurazione regge (e gli avvisi); tensioni e range al computer. */}
      <div className="flex items-center justify-between mb-2 max-md:mb-0">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Cable className="h-4 w-4 text-orange-500" />
          <span className="max-md:hidden">{t("Dimensionamento stringhe")}</span>
          <span className="md:hidden">{t("Stringhe")}</span>
        </h4>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border",
            r.valido
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200",
          )}
        >
          {r.valido ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {r.valido ? t("Configurazione valida") : t("Da rivedere")}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-md:hidden">
        <Cell
          label={t("Moduli per stringa")}
          value={r.moduli_per_stringa > 0 ? String(r.moduli_per_stringa) : "—"}
          hint={t("{numero_stringhe} stringa/he", { numero_stringhe: String(r.numero_stringhe ?? "") })}
        />
        <Cell label={t("Range ammesso")} value={`${r.moduli_min_stringa}–${r.moduli_max_stringa}`} hint={t("moduli/stringa")} />
        <Cell
          label={t("Tensione a freddo")}
          value={`${Math.round(r.voc_stringa_freddo_v)} V`}
          hint={t("max {vMaxDc} V", { vMaxDc: String(INVERTER_DEFAULT.vMaxDc ?? "") })}
        />
        <Cell
          label={t("Tensione a caldo")}
          value={`${Math.round(r.vmp_stringa_caldo_v)} V`}
          hint={t("min MPPT {vMpptMin} V", { vMpptMin: String(INVERTER_DEFAULT.vMpptMin ?? "") })}
        />
      </div>

      {r.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-slate-400 mt-2 leading-snug max-md:hidden">
        {t("Stima con modulo ~540 Wp e inverter residenziale standard. I valori esatti verranno dalle specifiche reali di modulo e inverter (catalogo prodotti in arrivo).")}
      </p>
    </div>
  );
}
