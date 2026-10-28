import type { LiquidazioneIVAResult } from "@/hooks/useLiquidazioneIVA";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { FiscalMetric } from "@/components/fatturazione/FiscalSectionLayout";
import { fiscalDate, fiscalReadable } from "@/lib/fatturazione/fiscalInsights";
import { fiscalCents } from "@/lib/fatturazione/fiscalWorkspace";
interface Props {
  calcola: () => Promise<void>;
  isCalcolando: boolean;
  risultato: LiquidazioneIVAResult | null;
  reset: () => void;
  error?: string | null;
  documental?: { vendite: number | null; acquisti: number | null };
}
export function LiquidazioneIVA({
  calcola,
  isCalcolando,
  risultato: r,
  error,
  documental,
}: Props) {
  const p = useFiscalPeriod();
  return (
    <div className="space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h3 className="font-semibold">Prospetto IVA preliminare</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Periodo condiviso: {fiscalDate(p.dal)} – {fiscalDate(p.al)}. Calcolo
          di lettura, nessuna liquidazione confermata e nessun F24 generato.
        </p>
      </div>
      <Button
        variant="outline"
        disabled={isCalcolando}
        onClick={() => void calcola()}
      >
        {isCalcolando
          ? "Calcolo in corso…"
          : r
            ? "Ricalcola prospetto"
            : "Calcola prospetto"}
      </Button>
      {error && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">
          {error}
        </p>
      )}
      {r && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <strong>
              Da verificare con il commercialista, non è un importo da versare.
            </strong>
            <p className="mt-1">
              Il server assume detraibilità piena e può collocare acquisti senza
              ricezione alla data fattura. Crediti precedenti, indetraibilità,
              incassi e regime fiscale devono essere verificati.
            </p>
          </div>
          {!r.calcolabile ? (
            <p role="alert">
              {r.motivo || "Dati insufficienti per confermare un saldo."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["IVA vendite (calcolo server)", r.iva_vendite],
                ["IVA acquisti (ipotesi server)", r.iva_acquisti],
                ["Differenza aritmetica (vendite − acquisti)", r.saldo],
              ].map(([label, v]) => (
                <FiscalMetric
                  key={String(label)}
                  label={String(label)}
                  value={
                    v === null ? "Non disponibile" : formatCurrency(Number(v))
                  }
                />
              ))}
            </div>
          )}
          {r.calcolabile && documental && (
            <div className="rounded-xl border p-4 text-sm">
              <h4 className="font-medium">
                Confronto con il Registro IVA documentale
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Stesso periodo, criteri diversi: gli scostamenti richiedono
                verifica di date, esclusioni e integrazioni. Non sono correzioni
                o importi da versare.
              </p>
              <dl className="mt-3 space-y-2">
                {(["vendite", "acquisti"] as const).map((side) => {
                  const server = fiscalCents(
                      side === "vendite" ? r.iva_vendite : r.iva_acquisti,
                    ),
                    doc = documental[side];
                  return (
                    <div key={side} className="rounded-lg bg-slate-50 p-3">
                      <dt className="font-medium">IVA {side}</dt>
                      <dd>
                        Documenti:{" "}
                        {doc === null
                          ? "Da verificare"
                          : formatCurrency(doc / 100)}{" "}
                        · Server:{" "}
                        {server === null
                          ? "Da verificare"
                          : formatCurrency(server / 100)}{" "}
                        · Differenza:{" "}
                        {server === null || doc === null
                          ? "Non calcolabile"
                          : formatCurrency((server - doc) / 100)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              Fonti, esclusioni e ipotesi del calcolo
            </summary>
            <ul className="my-3 list-disc space-y-1 pl-5">
              {r.ipotesi.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <FiscalFacts
              title="Documenti inclusi e date mancanti"
              value={r.documenti}
            />
            <FiscalFacts
              title="Esclusioni ed esigibilità differita"
              value={{
                escluso: r.escluso,
                esigibilita_differita: r.esigibilita_differita,
              }}
            />
            <FiscalFacts
              title="Dettaglio aliquote del server"
              value={r.dettaglio_aliquote}
            />
          </details>
        </>
      )}
    </div>
  );
}

function FiscalFacts({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="my-3">
      <h4 className="font-medium">{title}</h4>
      <dl className="mt-2 divide-y rounded-lg border px-3">
        {fiscalReadable(value).map((entry, index) => (
          <div
            key={`${entry.label}:${index}`}
            className="flex flex-wrap justify-between gap-2 py-2"
          >
            <dt className="text-muted-foreground">{entry.label}</dt>
            <dd className="break-words font-medium">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
