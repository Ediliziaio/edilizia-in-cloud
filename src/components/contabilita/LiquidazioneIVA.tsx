import type { LiquidazioneIVAResult } from "@/hooks/useLiquidazioneIVA";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { FiscalMetric } from "@/components/fatturazione/FiscalSectionLayout";
import { fiscalDate, fiscalReadable } from "@/lib/fatturazione/fiscalInsights";
import { fiscalCents } from "@/lib/fatturazione/fiscalWorkspace";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
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
  const t = useT();
  const p = useFiscalPeriod();
  return (
    <div className="space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h3 className="font-semibold">{t("Prospetto IVA preliminare")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("Periodo condiviso: {dal} – {al}. Calcolo di lettura, nessuna liquidazione confermata e nessun F24 generato.", { dal: String(fiscalDate(p.dal) ?? ""), al: String(fiscalDate(p.al) ?? "") })}</p>
      </div>
      <Button
        variant="outline"
        disabled={isCalcolando}
        onClick={() => void calcola()}
      >
        {isCalcolando
          ? t("Calcolo in corso…")
          : r
            ? t("Ricalcola prospetto")
            : t("Calcola prospetto")}
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
              {t("Da verificare con il commercialista, non è un importo da versare.")}
            </strong>
            <p className="mt-1">
              {t("Il server assume detraibilità piena e può collocare acquisti senza ricezione alla data fattura. Crediti precedenti, indetraibilità, incassi e regime fiscale devono essere verificati.")}
            </p>
          </div>
          {!r.calcolabile ? (
            <p role="alert">
              {r.motivo || t("Dati insufficienti per confermare un saldo.")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [t("IVA vendite (calcolo server)"), r.iva_vendite],
                [t("IVA acquisti (ipotesi server)"), r.iva_acquisti],
                [t("Differenza aritmetica (vendite − acquisti)"), r.saldo],
              ].map(([label, v]) => (
                <FiscalMetric
                  key={String(label)}
                  label={String(label)}
                  value={
                    v === null ? t("Non disponibile") : formatCurrency(Number(v))
                  }
                />
              ))}
            </div>
          )}
          {r.calcolabile && documental && (
            <div className="rounded-xl border p-4 text-sm">
              <h4 className="font-medium">
                {t("Confronto con il Registro IVA documentale")}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Stesso periodo, criteri diversi: gli scostamenti richiedono verifica di date, esclusioni e integrazioni. Non sono correzioni o importi da versare.")}
              </p>
              <dl className="mt-3 space-y-2">
                {(["vendite", "acquisti"] as const).map((side) => {
                  const server = fiscalCents(
                      side === "vendite" ? r.iva_vendite : r.iva_acquisti,
                    ),
                    doc = documental[side];
                  return (
                    <div key={side} className="rounded-lg bg-slate-50 p-3">
                      <dt className="font-medium">{side === "vendite" ? t("IVA vendite") : t("IVA acquisti")}</dt>
                      <dd>
                        {t("Documenti:")}{" "}
                        {doc === null
                          ? t("Da verificare")
                          : formatCurrency(doc / 100)}{" "}
                        · {t("Server:")}{" "}
                        {server === null
                          ? t("Da verificare")
                          : formatCurrency(server / 100)}{" "}
                        · {t("Differenza:")}{" "}
                        {server === null || doc === null
                          ? t("Non calcolabile")
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
              {t("Fonti, esclusioni e ipotesi del calcolo")}
            </summary>
            <ul className="my-3 list-disc space-y-1 pl-5">
              {r.ipotesi.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <FiscalFacts
              title={t("Documenti inclusi e date mancanti")}
              value={r.documenti}
            />
            <FiscalFacts
              title={t("Esclusioni ed esigibilità differita")}
              value={{
                escluso: r.escluso,
                esigibilita_differita: r.esigibilita_differita,
              }}
            />
            <FiscalFacts
              title={t("Dettaglio aliquote del server")}
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
