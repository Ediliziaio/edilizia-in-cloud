import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import {
  rateDaModello,
  quandoRata,
  sommaPercentuali,
  type ModelloPagamento,
} from "@/lib/orders/modelliPagamento";
import { totaleAnteprimaPagamento } from "@/lib/orders/totaleAnteprimaPagamento";

export default function AnteprimaModelloPagamento({
  modello,
  bozza = false,
}: {
  modello: Pick<ModelloPagamento, "nome" | "descrizione" | "righe">;
  bozza?: boolean;
}) {
  const id = useId();
  const [totale, setTotale] = useState("10000");
  const importo = totaleAnteprimaPagamento(totale);
  const percentualiValide =
    modello.righe.length > 0 &&
    modello.righe.every((r) => r.percent > 0 && r.percent <= 100) &&
    Math.abs(sommaPercentuali(modello.righe) - 100) <= 0.01;
  const rate =
    importo !== null && percentualiValide
      ? rateDaModello(modello, importo)
      : [];
  return (
    <section
      aria-label={bozza ? "Anteprima della bozza" : "Anteprima del modello"}
      className="min-w-0 space-y-4 rounded-xl border bg-muted/20 p-4"
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="h-4 w-4 text-primary" />
          Anteprima del piano
        </h3>
        <p className="mt-2 break-words text-sm font-medium">
          {modello.nome || "Modello da completare"} · {modello.righe.length}{" "}
          {modello.righe.length === 1 ? "rata" : "rate"}
        </p>
        {modello.descrizione && (
          <p className="mt-1 text-xs text-muted-foreground">
            {modello.descrizione}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id}>Totale di esempio IVA inclusa</Label>
        <div className="relative">
          <Input
            id={id}
            inputMode="decimal"
            value={totale}
            onChange={(e) => setTotale(e.target.value)}
            className="pr-8"
          />
          <span
            className="absolute right-3 top-2.5 text-sm text-muted-foreground"
            aria-hidden
          >
            €
          </span>
        </div>
      </div>
      {importo === null ? (
        <p role="status" className="text-xs text-amber-800">
          Inserisci un importo positivo, con al massimo due decimali.
        </p>
      ) : !percentualiValide ? (
        <p role="status" className="text-xs text-amber-800">
          Completa le percentuali fino al 100% per vedere gli importi.
        </p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`Ripartizione del totale: ${modello.righe.map((r) => `${r.percent}%`).join(", ")}`}
            className="flex h-2 overflow-hidden rounded-full bg-muted"
          >
            {modello.righe.map((r, i) => (
              <span
                key={i}
                style={{ width: `${r.percent}%` }}
                className={
                  i === modello.righe.length - 1
                    ? "bg-emerald-500"
                    : i % 2
                      ? "bg-primary/50"
                      : "bg-primary"
                }
              />
            ))}
          </div>
          <ol className="space-y-3">
            {rate.map((r, i) => (
              <li
                key={i}
                className="flex gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-medium">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <span className="break-words font-medium">{r.label}</span>
                    <strong className="shrink-0 tabular-nums">
                      {formatCurrency(r.amount)}
                    </strong>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.percent}% ·{" "}
                    {quandoRata(
                      modello.righe[i].evento,
                      modello.righe[i].numero,
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preavviso:{" "}
                    {r.giorni_preavviso === 0
                      ? "alla scadenza"
                      : `${r.giorni_preavviso} giorni prima`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="flex justify-between gap-3 border-t pt-3 text-sm">
            <span>Totale IVA inclusa</span>
            <strong className="tabular-nums">
              {formatCurrency(rate.reduce((s, r) => s + r.amount, 0))}
            </strong>
          </p>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Importi di esempio. Le date effettive si definiscono nella commessa; il
        saldo include gli eventuali arrotondamenti.
      </p>
    </section>
  );
}
