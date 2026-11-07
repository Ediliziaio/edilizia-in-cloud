/**
 * Previsione di cassa sui materiali (01/11/2026): prima era «Stima di cassa sui materiali · apri dettaglio»,
 * una tendina in fondo agli incassi con quattro righe di testo. Ora sta in Margini e costi, accanto a «Chi
 * finanzia il cantiere», e si legge a gradini: quanto è entrato, quanto escono i materiali, dove tocca il
 * fondo la cassa, quanto rientra col saldo. Stima: manodopera e altre spese escluse.
 */
import { format } from "date-fns";
import { PackageOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function PrevisioneCassaMateriali({ incassato, materiali, saldoResiduo, rate }: {
  /** Incassato dal cliente, IVA inclusa. */
  incassato: number;
  /** Costo dei materiali dai fornitori, IVA inclusa. */
  materiali: number;
  /** Quanto resta da incassare, IVA inclusa. */
  saldoResiduo: number;
  saldoData: string | null;
  rate?: Array<{ label: string; amount: number; is_paid: boolean; expected_date?: string | null }>;
}) {
  if (incassato <= 0 && materiali <= 0) return null;
  const minimo = incassato - materiali;
  const finale = minimo + saldoResiduo;
  const copre = minimo >= 0;
  const scala = Math.max(1, incassato, materiali, Math.abs(minimo), finale);
  const aperte = rate?.filter(r => !r.is_paid && r.amount > 0).sort((a, b) => (a.expected_date || "9999").localeCompare(b.expected_date || "9999"));
  const pianoCoerente = aperte && Math.abs(aperte.reduce((s, r) => s + r.amount, 0) - saldoResiduo) <= 0.02;
  const incassiPrevisti = pianoCoerente ? aperte.map(r => ({
    etichetta: `${r.label}${r.expected_date ? ` · ${format(new Date(r.expected_date), "dd/MM/yyyy")}` : " · data da definire"}`,
    valore: r.amount, segno: "+", colore: "bg-emerald-400", testo: "text-emerald-700",
  })) : [{ etichetta: "Residuo complessivo da incassare", valore: saldoResiduo, segno: "+", colore: "bg-emerald-400", testo: "text-emerald-700" }];
  const gradini: Array<{ etichetta: string; valore: number; segno: string; colore: string; testo: string; forte?: boolean }> = [
    { etichetta: "Incassato", valore: incassato, segno: "+", colore: "bg-emerald-500", testo: "text-emerald-700" },
    { etichetta: "Materiali dai fornitori", valore: -materiali, segno: "−", colore: "bg-rose-500", testo: "text-rose-700" },
    { etichetta: "Punto più basso della cassa", valore: minimo, segno: minimo < 0 ? "−" : "", colore: minimo < 0 ? "bg-red-600" : "bg-slate-700", testo: minimo < 0 ? "text-red-700" : "text-slate-900", forte: true },
    ...incassiPrevisti,
    { etichetta: "Cassa a lavori finiti", valore: finale, segno: finale < 0 ? "−" : "", colore: finale < 0 ? "bg-red-600" : "bg-slate-700", testo: finale < 0 ? "text-red-700" : "text-slate-900", forte: true },
  ];
  return (
    <Card className={cn("border-l-4", copre ? "border-l-emerald-500" : "border-l-red-500")}>
      <CardHeader className="pb-2 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageOpen className={cn("h-4 w-4", copre ? "text-emerald-600" : "text-red-600")} aria-hidden="true" />
          Previsione di cassa sui materiali
        </CardTitle>
        <p className={cn("text-sm", copre ? "text-emerald-800" : "text-red-700")}>
          {copre
            ? "Quello che hai incassato copre i materiali: non serve anticipare."
            : <>Se paghi tutti i materiali prima dei prossimi incassi, anticipi <strong>{formatCurrency(Math.abs(minimo))}</strong> prima degli incassi previsti.</>}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 max-sm:p-3 max-sm:pt-0">
        {!pianoCoerente && <p className="text-xs text-muted-foreground">Residuo aggregato: il piano rate non è disponibile o non coincide con il residuo. Verifica gli Incassi prima di usarlo come previsione delle scadenze.</p>}
        <ul className="space-y-2" aria-label="Cassa a gradini">
          {gradini.map((g, indice) => (
            <li key={`${indice}-${g.etichetta}`} className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]">
              <span className={cn(g.forte ? "font-semibold" : "text-muted-foreground")}>{g.etichetta}</span>
              <span className="h-3 overflow-hidden rounded-full bg-muted max-sm:hidden" aria-hidden="true">
                <span className={cn("block h-full rounded-full", g.colore)} style={{ width: `${Math.max(2, Math.round((Math.abs(g.valore) / scala) * 100))}%` }} />
              </span>
              <span className={cn("text-right tabular-nums", g.testo, g.forte && "font-semibold")}>{g.segno}{formatCurrency(Math.abs(g.valore))}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">Scenario con tutti i materiali pagati prima dei prossimi incassi, importi IVA inclusa: contano solo incassi e materiali. Manodopera, ditte e altre spese escluse; i movimenti veri sono in «Chi finanzia il cantiere».</p>
      </CardContent>
    </Card>
  );
}
