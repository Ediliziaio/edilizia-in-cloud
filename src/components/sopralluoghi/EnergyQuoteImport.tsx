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
  const [params] = useSearchParams(),
    id = params.get("rilievo") || originId || "";
  const query = useSurveyDetail(id);
  if (!id) return null;
  if (!query.allowed)
    return (
      <p role="alert">
        Non hai accesso ai sopralluoghi. Nessun dato importato.
      </p>
    );
  if (query.isPending)
    return <p role="status">Caricamento rilievo collegato…</p>;
  if (query.error || !query.data)
    return (
      <p role="alert">
        Rilievo non disponibile nell’azienda attiva. Nessuna voce importata.
      </p>
    );
  if (imported && originId === id)
    return (
      <div className="m-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-blue-50 p-3 text-sm">
        <span>
          Voci collegate al sopralluogo {query.data.survey.code}. Restano
          modificabili nel preventivo.
        </span>
        <Link
          className="min-h-11 inline-flex items-center text-blue-700 underline"
          to={`/azienda/sopralluoghi/${id}`}
        >
          Apri dossier, disegni e foto
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
        "Il tipo di rilievo richiede un altro preventivatore. Torna al sopralluogo e apri il modulo corretto.",
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
      aria-label="Importazione sopralluogo nel preventivo"
      className="m-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            Dal sopralluogo al preventivo
          </h2>
          <p className="text-xs text-slate-500">
            {detail.survey.code} · scegli le forniture e conferma i prezzi IVA
            esclusa. Il salvataggio resta quello del preventivo.
          </p>
        </div>
        <Link
          className="text-xs text-blue-700 underline"
          to={`/azienda/sopralluoghi/${detail.survey.id}`}
        >
          Apri rilievo
        </Link>
      </div>
      {(report.missingFields > 0 || report.missingPhotos > 0) && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
          Rilievo da completare: {report.missingFields} campi e{" "}
          {report.missingPhotos} foto richieste mancanti. L’importazione prepara
          una bozza, non approva il progetto né autorizza la fornitura.
        </p>
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
                Componenti principali:{" "}
                {rows
                  .filter(main)
                  .map((r) => `${r.quantity} ${r.title}`)
                  .join(" · ")}
                . Le falde restano separate nel dossier, non vengono fuse in una
                falda fittizia.
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
                    {label} dal catalogo
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
                        <SelectValue placeholder="Scegli prodotto e prezzo aziendale" />
                      </SelectTrigger>
                      <SelectContent>
                        {(listino?.[group] || []).map((p) => (
                          <SelectItem key={String(p.id)} value={String(p.id)}>
                            {String(p.descrizione || p.modello || p.id)} ·{" "}
                            {Number(p.prezzo_vendita || 0).toLocaleString(
                              "it-IT",
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
                    {r.model || "Modello da specificare"}
                  </span>
                </span>
              </label>
              {r.checks.length ? (
                <p className="text-xs text-amber-900">
                  Da completare: {r.checks.join(" ")}
                </p>
              ) : (
                selected.includes(r.key) && (
                  <label className="mt-2 block text-xs">
                    {r.title} · prezzo per {r.unit} · IVA esclusa
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
              Nessuna nuova fornitura rilevata: gli elementi da mantenere non
              vengono importati.
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
            Confermo voci, quantità, dimensioni da scheda tecnica, verifiche
            tecniche e abbinamenti di modello. I prezzi inseriti sono unitari e
            IVA esclusa; nessuna aliquota agevolata è dedotta dal sopralluogo.
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
              ? "Dati inseriti · completa e salva il preventivo"
              : "Conferma e inserisci nel preventivo"}
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
