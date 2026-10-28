import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useF24 } from "@/hooks/useF24";
import { useLiquidazioneIVA } from "@/hooks/useLiquidazioneIVA";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { F24Generator } from "@/components/contabilita/F24Generator";
import { LiquidazioneIVA } from "@/components/contabilita/LiquidazioneIVA";
import {
  FiscalLegacyRedirect,
  FiscalStandaloneWorkspace,
} from "@/components/fatturazione/FiscalWorkspace";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { Button } from "@/components/ui/button";
import { FiscalPeriodControl } from "@/components/fatturazione/FiscalPeriodControl";
import { FiscalSectionHeader } from "@/components/fatturazione/FiscalSectionLayout";
import {
  fiscalAmountTotal,
  partitionFiscalMonths,
} from "@/lib/fatturazione/fiscalWorkspace";
import { formatCurrency } from "@/lib/formatters";
const RitenuteBonificiPanel = lazy(
  () => import("@/components/fatturazione/RitenuteBonificiPanel"),
);
export default function ContabilitaFiscale({
  embedded = false,
}: { embedded?: boolean } = {}) {
  return embedded ? (
    <Content />
  ) : (
    <FiscalLegacyRedirect
      section="contabilita"
      fallback={<FiscalStandaloneWorkspace section="contabilita" />}
    />
  );
}
function Content() {
  const p = useFiscalPeriod(),
    f = useF24(p.anno),
    iva = useLiquidazioneIVA();
  const requestedView = p.params.get("vista");
  const view =
    requestedView === "iva" || requestedView === "ritenute_bancarie"
      ? requestedView
      : "f24";
  const { selected: periodEntries, unassigned } = partitionFiscalMonths(
    f.entries,
    p,
  );
  return (
    <div className="space-y-4">
      <FiscalSectionHeader
        title="Contabilità fiscale"
        actions={
          <Link
            className="text-sm text-blue-700 underline"
            to="/azienda/prima-nota"
          >
            Apri Prima Nota →
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant={view === "f24" ? "default" : "outline"}
          onClick={() => p.set({ vista: "f24" })}
        >
          Registro F24
        </Button>
        <Button
          variant={view === "iva" ? "default" : "outline"}
          onClick={() => p.set({ vista: "iva" })}
        >
          Prospetto IVA
        </Button>
        <Button
          variant={view === "ritenute_bancarie" ? "default" : "outline"}
          onClick={() => p.set({ vista: "ritenute_bancarie" })}
        >
          Ritenute bancarie
        </Button>
      </div>
      {p.tipo === "mensile" && (
        <FiscalPeriodControl
          key={`${f.companyId}:${p.anno}:${p.mese}`}
          anno={p.anno}
          mese={p.mese}
          canManage={f.canEdit}
        />
      )}
      {view === "ritenute_bancarie" ? (
        <Suspense
          fallback={<p role="status">Caricamento registro ritenute…</p>}
        >
          <RitenuteBonificiPanel />
        </Suspense>
      ) : view === "iva" ? (
        <LiquidazioneIVA {...iva} />
      ) : (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <strong>
              Registrazioni F24, non deleghe trasmesse o pagamenti.
            </strong>
            <p className="mt-1">
              La composizione automatica è sospesa finché fonti, date fiscali e
              revisione non sono verificate. Consulta il prospetto IVA senza
              scrivere righe; registra solo importi comunicati dal consulente.
              Per i pagamenti serve una quietanza verificata.
            </p>
          </div>
          {f.isLoading || f.isError ? (
            <FiscalQueryState
              loading={f.isLoading}
              error={f.isError}
              onRetry={() => void f.refetch()}
            />
          ) : (
            <>
              {unassigned.length > 0 && (
                <details className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <summary className="cursor-pointer font-medium">
                    {unassigned.length}{" "}
                    {unassigned.length === 1
                      ? "registrazione"
                      : "registrazioni"}{" "}
                    del {p.anno} senza mese valido
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    Non incluse nei totali del periodo. Occorre verificare il
                    mese di riferimento con il consulente.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {unassigned.map((entry) => (
                      <li key={entry.id}>
                        Codice {entry.tributo_code} ·{" "}
                        {fiscalAmountTotal([entry.importo]) === null
                          ? "Importo da verificare"
                          : formatCurrency(entry.importo)}{" "}
                        ·{" "}
                        {entry.stato === "da_pagare"
                          ? "Da pagare"
                          : entry.stato === "pagato"
                            ? "Pagato"
                            : "Annullato"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <F24Generator
                key={`${f.companyId}:${p.anno}:${p.tipo}:${p.mese}:${p.trimestre}`}
                entries={periodEntries}
                isLoading={false}
                onSalva={(data, versione) => f.salva({ ...data, versione })}
                onAnteprima={f.anteprima}
                isSalvando={f.isSalvando}
                totaleAPagare={fiscalAmountTotal(
                  periodEntries
                    .filter((e) => e.stato === "da_pagare")
                    .map((e) => e.importo),
                )}
                scadentiProssimi30gg={f.scadentiProssimi30gg.filter((e) =>
                  periodEntries.some((r) => r.id === e.id),
                )}
                readOnly={!f.canEdit}
                periodMonth={p.tipo === "mensile" ? p.mese : undefined}
                periodMonths={
                  p.tipo === "mensile"
                    ? [p.mese]
                    : Array.from(
                        { length: 3 },
                        (_, i) => (p.trimestre - 1) * 3 + i + 1,
                      )
                }
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
