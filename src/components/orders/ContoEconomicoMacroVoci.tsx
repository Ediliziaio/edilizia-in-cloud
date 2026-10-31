/**
 * Conto economico della commessa per macro-voci: preventivo e consuntivo uno
 * accanto all'altro, incidenza di ogni voce sui ricavi, previsto ad oggi
 * secondo l'avanzamento dei lavori, scostamento, poi margine di commessa,
 * quota di struttura e margine netto. I numeri li calcola
 * contoEconomicoCommessa (src/lib/orders), con le fonti scritte lì.
 */
import { formatCurrency } from "@/lib/formatters";
import { pctIt, type ContoEconomico, type RigaConto } from "@/lib/orders/contoEconomicoCommessa";
import { cn } from "@/lib/utils";

const eur = (v: number | null | undefined) => (v == null ? "—" : formatCurrency(v));

function Scostamento({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(v) < 0.5) return <span className="text-muted-foreground">in linea</span>;
  return <span className={v > 0 ? "font-medium text-red-700" : "font-medium text-emerald-700"}>{v > 0 ? "+" : "−"}{formatCurrency(Math.abs(v))}</span>;
}

/** Barra dell'incidenza: grigia la prevista, colorata la consuntiva. */
function Barra({ prev, cons }: { prev: number | null; cons: number | null }) {
  const max = Math.max(prev ?? 0, cons ?? 0, 1);
  const scala = Math.min(100, max) / max;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      {prev != null && <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${Math.min(100, prev * scala)}%` }} />}
      {cons != null && <div className={cn("absolute inset-y-0 left-0 rounded-full", prev != null && cons > prev ? "bg-red-500" : "bg-orange-500")} style={{ width: `${Math.min(100, cons * scala)}%`, opacity: 0.85 }} />}
    </div>
  );
}

function Riga({ r }: { r: RigaConto }) {
  return (
    <tr className="border-t align-top">
      <th scope="row" className="py-2 pr-3 text-left font-medium text-foreground">
        {r.label}
        <div className="mt-1 w-32 max-w-full"><Barra prev={r.incidenzaPreventivo} cons={r.incidenzaConsuntivo} /></div>
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{eur(r.preventivo)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pctIt(r.incidenzaPreventivo)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{eur(r.previstoAOggi)}</td>
      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{eur(r.consuntivo)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pctIt(r.incidenzaConsuntivo)}</td>
      <td className="py-2 text-right tabular-nums"><Scostamento v={r.scostamento} /></td>
    </tr>
  );
}

function Totale({ label, prev, prevPct, cons, consPct, forte, tono, nota }: {
  label: string; prev: number | null; prevPct?: number | null; cons: number | null; consPct?: number | null;
  forte?: boolean; tono?: "margine"; nota?: string;
}) {
  const colore = (v: number | null) => (tono !== "margine" || v == null ? "" : v >= 0 ? "text-emerald-700" : "text-red-700");
  return (
    <tr className={cn("border-t", forte && "border-t-2 border-slate-300 bg-slate-50/70")}>
      <th scope="row" className={cn("py-2 pr-3 text-left", forte ? "font-semibold" : "font-medium")}>
        {label}{nota && <span className="block text-[11px] font-normal text-muted-foreground">{nota}</span>}
      </th>
      <td className={cn("py-2 pr-3 text-right tabular-nums", forte && "font-semibold", colore(prev))}>{eur(prev)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{prevPct === undefined ? "" : pctIt(prevPct)}</td>
      <td />
      <td className={cn("py-2 pr-3 text-right tabular-nums", forte && "font-semibold", colore(cons))}>{eur(cons)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{consPct === undefined ? "" : pctIt(consPct)}</td>
      <td />
    </tr>
  );
}

const pctSu = (v: number | null, su: number) => (v == null || su <= 0 ? null : Math.round((v / su) * 1000) / 10);

export function ContoEconomicoMacroVoci({ conto, mostraMargini }: { conto: ContoEconomico; mostraMargini: boolean }) {
  const { avanzamento } = conto;
  const diretti = conto.righe.filter((r) => r.gruppo === "diretti");
  const commerciali = conto.righe.filter((r) => r.gruppo === "commerciali");
  const sforate = conto.righe.filter((r) => (r.scostamento ?? 0) > 0.5);
  return (
    <section aria-labelledby="ce-macro" className="rounded-xl border bg-white p-3 dark:bg-background">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ce-macro" className="text-sm font-semibold">Preventivo e consuntivo per voce</h3>
        <p className="text-[11px] text-muted-foreground">
          {avanzamento != null ? `Lavori al ${avanzamento.toLocaleString("it-IT", { maximumFractionDigits: 0 })}%: il consuntivo si confronta col previsto a questo punto` : "Avanzamento non indicato: il consuntivo si confronta col preventivo intero"}
          {" · importi senza IVA"}
        </p>
      </div>
      {!conto.haPreventivo && (
        <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Nessun costo previsto: le lavorazioni non hanno un costo preventivato (voci del preventivo, assegnazioni o costi delle righe). Il consuntivo resta completo.
        </p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs sm:text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="pb-1.5 text-left font-medium">Voce</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Preventivo</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Inc.</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Previsto a oggi</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Consuntivo</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Inc.</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Scostamento</th>
            </tr>
          </thead>
          <tbody>
            <Totale label="Ricavi" nota={avanzamento != null ? `Maturato al ${avanzamento.toLocaleString("it-IT", { maximumFractionDigits: 0 })}%: ${formatCurrency(conto.ricavoMaturato)}` : "Contratto e varianti approvate"}
              prev={conto.ricavi} prevPct={100} cons={conto.ricavoMaturato} consPct={100} forte />
            {diretti.map((r) => <Riga key={r.key} r={r} />)}
            {commerciali.length > 0 && commerciali.map((r) => <Riga key={r.key} r={r} />)}
            <Totale label="Totale costi della commessa" prev={conto.haPreventivo ? conto.costiPreventivo : null} prevPct={conto.haPreventivo ? pctSu(conto.costiPreventivo, conto.ricavi) : null}
              cons={conto.costiConsuntivo} consPct={pctSu(conto.costiConsuntivo, conto.ricavoMaturato)} />
            {mostraMargini && <>
              <Totale label="Margine di commessa" nota="Ricavi meno costi della commessa (primo margine)" tono="margine" forte
                prev={conto.haPreventivo ? conto.marginePreventivo : null} prevPct={conto.haPreventivo ? pctSu(conto.marginePreventivo, conto.ricavi) : null}
                cons={conto.margineMaturato} consPct={pctSu(conto.margineMaturato, conto.ricavoMaturato)} />
              <Totale label="Costi di struttura (quota)" nota="Costi generali e ufficio divisi sui cantieri attivi, per i mesi della commessa"
                prev={conto.struttura.preventivo} prevPct={pctSu(conto.struttura.preventivo, conto.ricavi)}
                cons={conto.struttura.consuntivo} consPct={pctSu(conto.struttura.consuntivo, conto.ricavoMaturato)} />
              <Totale label="Margine netto" tono="margine" forte
                prev={conto.margineNettoPreventivo} prevPct={pctSu(conto.margineNettoPreventivo, conto.ricavi)}
                cons={conto.margineNettoMaturato} consPct={pctSu(conto.margineNettoMaturato, conto.ricavoMaturato)} />
            </>}
          </tbody>
        </table>
      </div>
      {sforate.length > 0 && (
        <p className="mt-2 text-xs text-red-700">
          Sopra il previsto a questo punto dei lavori: {sforate.map((r) => `${r.label} (+${formatCurrency(r.scostamento ?? 0)})`).join(", ")}.
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Preventivo: costo previsto delle lavorazioni (voci del preventivo, assegnazioni, costi delle righe). Consuntivo: costi registrati, gli stessi del Controllo di Gestione. Incidenza sui ricavi totali (preventivo) e sul maturato (consuntivo). La struttura è una stima gestionale: non cambia il consuntivo contabile.
      </p>
    </section>
  );
}
