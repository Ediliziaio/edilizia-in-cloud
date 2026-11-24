/**
 * Ciambella condivisa (14/11/2026): fette con il totale al centro e, accanto,
 * la legenda in euro (o nel formato dato) e percentuale. Stessa veste dei
 * grafici di comune.tsx: colori del tema, tooltip a scheda, comparsa ferma con
 * «riduci movimento». Una fetta cliccabile se c'è `onFetta`.
 *
 * Le fette oltre `massimo` finiscono insieme in «Altro», così una ciambella
 * resta leggibile anche con venti categorie.
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { COLORI_GRAFICO, TooltipScheda, euroAsse } from "./comune";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface FettaCiambella {
  nome: string;
  valore: number;
  colore?: string;
  /** testo piccolo accanto al nome nella legenda (es. «3 incassi») */
  nota?: string;
}

export const COLORI_CIAMBELLA = [
  COLORI_GRAFICO.blu,
  COLORI_GRAFICO.verde,
  COLORI_GRAFICO.arancio,
  COLORI_GRAFICO.viola,
  COLORI_GRAFICO.rosso,
  "hsl(var(--muted-foreground))",
];

export function Ciambella({
  fette, titolo, etichettaCentro = "Totale", valoreCentro, formato = formatCurrency, formatoCentro = euroAsse,
  massimo = 6, dimensione = 150, onFetta, className, legenda = true,
}: {
  fette: FettaCiambella[];
  titolo?: string;
  etichettaCentro?: string;
  /** al centro al posto del totale (es. «14 critiche») */
  valoreCentro?: string;
  formato?: (v: number) => string;
  formatoCentro?: (v: number) => string;
  massimo?: number;
  dimensione?: number;
  onFetta?: (nome: string) => void;
  className?: string;
  legenda?: boolean;
}) {
  const t = useT();
  const fermo = usePreferisceMenoMovimento();
  const positive = fette.filter((f) => f.valore > 0);
  const tenute = positive.length > massimo ? positive.slice(0, massimo - 1) : positive;
  const resto = positive.slice(tenute.length).reduce((s, f) => s + f.valore, 0);
  const dati = tenute.map((f, i) => ({ ...f, colore: f.colore ?? COLORI_CIAMBELLA[i % COLORI_CIAMBELLA.length] }));
  if (resto > 0) dati.push({ nome: "Altro", valore: resto, colore: "hsl(var(--muted-foreground))" });
  const tot = dati.reduce((s, f) => s + f.valore, 0);
  if (dati.length === 0 || tot <= 0) return null;
  const esterno = dimensione / 2 - 4;
  const interno = Math.round(esterno * 0.66);
  const cliccabile = (nome: string) => !!onFetta && nome !== "Altro";

  return (
    <div
      className={cn(
        "grid items-center gap-4",
        legenda && (dimensione <= 130 ? "grid-cols-[auto_minmax(0,1fr)]" : "sm:grid-cols-[auto_minmax(0,1fr)]"),
        className,
      )}
    >
      <div className="relative mx-auto" style={{ width: dimensione, height: dimensione }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dati} dataKey="valore" nameKey="nome" innerRadius={interno} outerRadius={esterno}
              paddingAngle={dati.length > 1 ? 2 : 0} cornerRadius={3} stroke="hsl(var(--card))" strokeWidth={2}
              isAnimationActive={!fermo} animationDuration={800}
              onClick={onFetta ? (d: unknown) => {
                const nome = (d as { nome?: string } | null)?.nome;
                if (nome && cliccabile(nome)) onFetta(nome);
              } : undefined}
              className={onFetta ? "cursor-pointer" : undefined}
            >
              {dati.map((f) => <Cell key={f.nome} fill={f.colore} />)}
            </Pie>
            <RechartsTooltip
              content={(p) => (
                <TooltipScheda
                  active={p.active}
                  payload={(p.payload ?? []).map((x) => ({ ...x, color: (x.payload as { colore?: string } | undefined)?.colore })) as never}
                  label={titolo}
                  formato={(v) => `${formato(v)} · ${Math.round((v / tot) * 100)}%`}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">{t(etichettaCentro)}</span>
          <span className="text-sm font-bold tabular-nums leading-tight text-foreground">{valoreCentro ?? formatoCentro(tot)}</span>
        </div>
      </div>
      {legenda && (
        <ul className="min-w-0 space-y-1.5 text-xs">
          {dati.map((f) => {
            const contenuto = (
              <>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.colore }} />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {f.nome === "Altro" ? t("Altro") : f.nome}
                  {f.nota && <span className="ml-1.5 text-muted-foreground">{f.nota}</span>}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">{formato(f.valore)}</span>
                <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{Math.round((f.valore / tot) * 100)}%</span>
              </>
            );
            return (
              <li key={f.nome}>
                {cliccabile(f.nome) ? (
                  <button type="button" onClick={() => onFetta!(f.nome)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted/60">
                    {contenuto}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-1 py-0.5">{contenuto}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
