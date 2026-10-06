/**
 * Lo sconto veloce, sotto il campo dello sconto: i tasti «Nessuno / 5% / 10%» (quelli oltre il massimo consentito si
 * spengono) e «Arriva a €»: si scrive il totale che il cliente ha in testa (IVA inclusa) e si vede lo sconto che
 * serve prima di applicarlo. Le regole (massimo, approvazione) restano a chi lo usa: qui si propone, e si dice
 * quando non si può. I conti sono in `lib/preventivi/scontoRapido.ts`.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { SCONTI_VELOCI, scontoDaPercentuale, scontoPerArrivareA, totaleDaTesto } from "@/lib/preventivi/scontoRapido";

interface Props {
  /** Lo sconto in vigore, in percentuale. */
  valorePct: number;
  /** Il massimo che si può applicare (le regole di scontistica); null = nessun limite. */
  massimoPct: number | null;
  /** L'imponibile prima dello sconto, IVA esclusa. */
  imponibileLordo: number;
  /** L'aliquota IVA in vigore: serve a «Arriva a»; senza, restano solo i tasti. */
  ivaPct?: number;
  /** Si sceglie uno sconto: la percentuale e l'importo che toglie (IVA esclusa). */
  onApplica: (sconto: { pct: number; importo: number }) => void;
  disabled?: boolean;
  className?: string;
}

const percentuale = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** Due decimali bastano, tranne quando la percentuale e il massimo si assomigliano al punto da sembrare uguali. */
const percentualeAConfronto = (n: number, altro: number) =>
  percentuale(n) === percentuale(altro) ? n.toLocaleString("it-IT", { maximumFractionDigits: 6 }) : percentuale(n);

export function ScontoRapido({ valorePct, massimoPct, imponibileLordo, ivaPct, onApplica, disabled = false, className }: Props) {
  const id = useId();
  const [testo, setTesto] = useState("");

  // «Arriva a €» ha senso solo con un totale su cui lavorare: senza prezzo (computo vuoto) resta il solo tasto.
  const conTotale = ivaPct != null && imponibileLordo > 0;
  const voluto = totaleDaTesto(testo);
  const proposta = conTotale && voluto != null ? scontoPerArrivareA(imponibileLordo, ivaPct, voluto) : null;
  const oltreIlMassimo = proposta?.esito === "ok" && massimoPct != null && proposta.pct > massimoPct;
  const applicabile = proposta?.esito === "ok" && !oltreIlMassimo && !disabled;

  const messaggio = (() => {
    if (testo.trim() === "") return null;
    if (voluto == null) return "Scrivi una cifra, per esempio 24.500.";
    if (!proposta || proposta.esito === "non-valido") return "Senza un totale non c'è nessuno sconto da calcolare.";
    if (proposta.esito === "gia-sotto") {
      return `Il totale senza sconto è già ${formatCurrency(proposta.totaleSenzaSconto)} (IVA inclusa): non serve nessuno sconto.`;
    }
    if (oltreIlMassimo) {
      return `Servirebbe il ${percentualeAConfronto(proposta.pct, massimoPct ?? 0)}%: oltre il massimo consentito (${percentuale(massimoPct ?? 0)}%).`;
    }
    return `Serve uno sconto del ${percentuale(proposta.pct)}% (−${formatCurrency(proposta.importo)}, IVA esclusa).`;
  })();

  const applica = () => {
    if (proposta?.esito !== "ok" || !applicabile) return;
    onApplica({ pct: proposta.pct, importo: proposta.importo });
    setTesto("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div role="group" aria-label="Sconto veloce" className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Sconto veloce</span>
        {SCONTI_VELOCI.map((pct) => {
          const sopra = massimoPct != null && pct > massimoPct;
          const attivo = Math.abs(valorePct - pct) < 0.005;
          return (
            <button
              key={pct}
              type="button"
              disabled={disabled || sopra}
              aria-pressed={attivo}
              title={sopra ? `Oltre il massimo consentito (${percentuale(massimoPct ?? 0)}%)` : undefined}
              onClick={() => onApplica(scontoDaPercentuale(imponibileLordo, pct))}
              className={cn(
                "tap-compact rounded-full border px-3 py-1 text-xs font-medium transition-colors max-sm:py-2",
                attivo
                  ? "border-orange-400 bg-orange-50 text-orange-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50",
                (disabled || sopra) && "cursor-not-allowed opacity-40 hover:border-slate-200 hover:bg-white",
              )}
            >
              {pct === 0 ? "Nessuno" : `${pct}%`}
            </button>
          );
        })}
      </div>

      {conTotale && (
        <div className="space-y-1">
          <label htmlFor={`${id}-totale`} className="text-[11px] text-muted-foreground">
            Arriva a € (totale IVA inclusa)
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${id}-totale`}
              inputMode="decimal"
              autoComplete="off"
              value={testo}
              placeholder="es. 24.500"
              disabled={disabled}
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applica(); } }}
              className="h-8 max-w-[10rem] text-sm tabular-nums max-sm:h-11"
            />
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs max-sm:h-11" disabled={!applicabile} onClick={applica}>
              Applica
            </Button>
          </div>
          <p aria-live="polite" className={cn("text-[10px] leading-4", oltreIlMassimo ? "text-destructive" : "text-muted-foreground")}>
            {messaggio}
          </p>
        </div>
      )}
    </div>
  );
}
