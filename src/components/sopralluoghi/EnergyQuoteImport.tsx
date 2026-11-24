import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSurveyDetail } from "@/hooks/useSurveyDetail";
import { buildSurveyReport } from "@/lib/surveys/report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  energyQuoteRows,
  energyQuoteModule,
  type EnergyQuoteRow,
  type EnergyQuoteModule,
} from "@/lib/surveys/energyQuote";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { ListinoComponentiFv } from "@/lib/fotovoltaico/componentiConfigurazione";
import type { FvSurveySelection } from "@/lib/surveys/energyQuote";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function EnergyQuoteImport({
  companyId,
  module,
  onApply,
  listino,
  disabled = false,
  originId,
  imported = false,
}: {
  companyId: string | null | undefined;
  module: EnergyQuoteModule;
  disabled?: boolean;
  listino?: ListinoComponentiFv;
  originId?: string;
  imported?: boolean;
  onApply: (
    d: SurveyDetail,
    rows: EnergyQuoteRow[],
    prices: Record<string, string>,
    selection: FvSurveySelection,
  ) => void;
}) {
  const t = useT();
  const [params] = useSearchParams(),
    id = params.get("rilievo") || originId || "";
  const query = useSurveyDetail(id);
  if (!id) return null;
  if (!query.allowed)
    return (
      <p role="alert">
        {t("Non hai accesso ai sopralluoghi. Nessun dato importato.")}
      </p>
    );
  if (query.isPending)
    return <p role="status">{t("Caricamento rilievo collegato…")}</p>;
  if (query.error || !query.data)
    return (
      <p role="alert">
        {t("Rilievo non disponibile nell’azienda attiva. Nessuna voce importata.")}
      </p>
    );
  if (imported && originId === id)
    return (
      <div className="m-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-blue-50 p-3 text-sm">
        <span>{t("Voci collegate al sopralluogo {codice}. Restano modificabili nel preventivo.", { codice: String(query.data.survey.code ?? "") })}</span>
        <Link
          className="min-h-11 inline-flex items-center text-blue-700 underline"
          to={`/azienda/sopralluoghi/${id}`}
        >
          {t("Apri dossier, disegni e foto")}
        </Link>
      </div>
    );
  return (
    <EnergyQuoteReview
      key={`${id}:${companyId}`}
      detail={query.data}
      companyId={companyId || ""}
      module={module}
      listino={listino}
      disabled={disabled}
      onApply={onApply}
    />
  );
}
/** Same review used by the real wizard and the isolated simulation. It never writes to the backend. */
export function EnergyQuoteReview({
  detail,
  companyId,
  module,
  onApply,
  listino,
  disabled = false,
}: {
  detail: SurveyDetail;
  companyId: string;
  module: EnergyQuoteModule;
  disabled?: boolean;
  listino?: ListinoComponentiFv;
  onApply: (
    d: SurveyDetail,
    rows: EnergyQuoteRow[],
    prices: Record<string, string>,
    selection: FvSurveySelection,
  ) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]),
    [prices, setPrices] = useState<Record<string, string>>({}),
    [selection, setSelection] = useState<FvSurveySelection>({
      panelId: "",
      inverterId: "",
      batteryId: "",
      acknowledge: false,
    }),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false);
  let rows: EnergyQuoteRow[] = [];
  let issue = "";
  try {
    if (energyQuoteModule(detail) !== module)
      throw new Error(
        t("Il tipo di rilievo richiede un altro preventivatore. Torna al sopralluogo e apri il modulo corretto."),
      );
    rows = energyQuoteRows(detail, companyId);
  } catch (e) {
    issue = (e as Error).message;
  }
  const fv = module === "fotovoltaico",
    main = (r: EnergyQuoteRow) =>
      fv && ["roof", "inverter", "battery"].includes(r.kind),
    extras = rows.filter((r) => !main(r));
  const report = buildSurveyReport(detail);
  return (
    <section
      aria-label={t("Importazione sopralluogo nel preventivo")}
      className="m-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {t("Dal sopralluogo al preventivo")}
          </h2>
          <p className="text-xs text-slate-500">{t("{codice} · scegli le forniture e conferma i prezzi IVA esclusa. Il salvataggio resta quello del preventivo.", { codice: String(detail.survey.code ?? "") })}</p>
        </div>
        <Link
          className="text-xs text-blue-700 underline"
          to={`/azienda/sopralluoghi/${detail.survey.id}`}
        >
          {t("Apri rilievo")}
        </Link>
      </div>
      {(report.missingFields > 0 || report.missingPhotos > 0) && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">{t("Rilievo da completare: {campi} campi e {foto} foto richieste mancanti. L’importazione prepara una bozza, non approva il progetto né autorizza la fornitura.", { campi: report.missingFields, foto: report.missingPhotos })}</p>
      )}
      {issue ? (
        <p role="alert" className="text-sm text-red-700">
          {issue}
        </p>
      ) : (
        <>
          {fv && (
            <div className="space-y-3 rounded-xl border bg-white p-3">
              <p className="text-xs">
                {t("Componenti principali: {elenco}. Le falde restano separate nel dossier, non vengono fuse in una falda fittizia.", {
                  elenco: rows.filter(main).map((r) => `${r.quantity} ${r.title}`).join(" · "),
                })}
              </p>
              {(
                [
                  ["panelId", "Modulo FV", "pannelli"],
                  ["inverterId", "Inverter", "inverter"],
                  ["batteryId", "Accumulo", "accumuli"],
                ] as const
              )
                .filter(
                  ([k]) =>
                    k !== "batteryId" || rows.some((r) => r.kind === "battery"),
                )
                .map(([key, label, group]) => (
                  <label key={key} className="block space-y-1 text-xs">
                    {t("{nome} dal catalogo", { nome: t(label) })}
                    <Select
                      value={selection[key]}
                      disabled={disabled || applied}
                      onValueChange={(v) =>
                        setSelection({
                          ...selection,
                          [key]: v,
                          acknowledge: false,
                        })
                      }
                    >
                      <SelectTrigger className="min-h-11 rounded-xl">
                        <SelectValue placeholder={t("Scegli prodotto e prezzo aziendale")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(listino?.[group] || []).map((p) => (
                          <SelectItem key={String(p.id)} value={String(p.id)}>
                            {String(p.descrizione || p.modello || p.id)} ·{" "}
                            {Number(p.prezzo_vendita || 0).toLocaleString(
                              intlCampo(),
                            )}{" "}
                            €
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ))}
            </div>
          )}
          {extras.map((r) => (
            <div key={r.key} className="rounded-xl border bg-white p-3">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0"
                  disabled={disabled || applied || !!r.checks.length}
                  checked={selected.includes(r.key)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.key]
                        : selected.filter((k) => k !== r.key),
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  {r.title}
                  <span className="block text-xs text-slate-500">
                    {r.area} · {r.quantity} {r.unit} ·{" "}
                    {r.model || t("Modello da specificare")}
                  </span>
                </span>
              </label>
              {r.checks.length ? (
                <p className="text-xs text-amber-900">{t("Da completare: {campi}", { campi: r.checks.join(" ") })}</p>
              ) : (
                selected.includes(r.key) && (
                  <label className="mt-2 block text-xs">
                    {t("{voce} · prezzo per {unita} · IVA esclusa", { voce: r.title, unita: r.unit })}
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      disabled={disabled || applied}
                      value={prices[r.key] || ""}
                      onChange={(e) =>
                        setPrices({ ...prices, [r.key]: e.target.value })
                      }
                    />
                  </label>
                )
              )}
            </div>
          ))}
          {!rows.length && (
            <p className="text-sm">
              {t("Nessuna nuova fornitura rilevata: gli elementi da mantenere non vengono importati.")}
            </p>
          )}
          <label className="flex min-h-11 items-center gap-3 text-xs">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={selection.acknowledge}
              disabled={disabled || applied}
              onChange={(e) =>
                setSelection({ ...selection, acknowledge: e.target.checked })
              }
            />
            {t("Confermo voci, quantità, dimensioni da scheda tecnica, verifiche tecniche e abbinamenti di modello. I prezzi inseriti sono unitari e IVA esclusa; nessuna aliquota agevolata è dedotta dal sopralluogo.")}
          </label>
          <Button
            type="button"
            className="min-h-11 w-full rounded-xl sm:w-auto"
            disabled={
              disabled ||
              applied ||
              !selection.acknowledge ||
              (!fv && !selected.length) ||
              !rows.length
            }
            onClick={() => {
              try {
                onApply(
                  detail,
                  rows.filter((r) => selected.includes(r.key)),
                  prices,
                  selection,
                );
                setApplied(true);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {applied
              ? t("Dati inseriti · completa e salva il preventivo")
              : t("Conferma e inserisci nel preventivo")}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
