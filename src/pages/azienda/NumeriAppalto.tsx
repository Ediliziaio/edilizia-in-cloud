/**
 * NumeriAppalto — quale committente mi conviene davvero.
 * ──────────────────────────────────────────────────────────────────────────
 * È la domanda che prima non aveva risposta in nessuna pagina. Il rendicontato
 * da solo illude: un committente che ti passa molto lavoro a margine basso
 * riempie il calendario e non l'utile, e in cima a una classifica per fatturato
 * sembra il migliore.
 *
 * Tre cose, in quest'ordine:
 *   1. il quadro per committente, in classifica per rendicontato, con il
 *      margine accanto — così il confronto è immediato;
 *   2. il margine **mese per mese** del committente scelto: una tendenza non si
 *      vede da un totale;
 *   3. i soldi fermi: confermato ma non ancora rendicontato, ritenute
 *      trattenute, fatturato non incassato.
 *
 * Il margine è vuoto, non zero, quando il costo non si sa, e la percentuale si
 * calcola sul solo ricavo di cui il costo si conosce: la pagina dice su quanta
 * parte, perché un margine su metà delle righe non è il margine.
 *
 * Fase 6 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, TrendingDown, TrendingUp, Minus, HelpCircle, Euro, Lock, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { euro } from "@/lib/clienti/schedaCliente";
import { formatDecimalIT } from "@/lib/parseDecimalIT";
import {
  coperturaCosti, tendenzaMargine, tendenzePerCommittente, totaliConti, periodoNumeri, meseBreve,
  type ContiCommittente, type MeseMargine, type PeriodoNumeri,
} from "@/lib/appalto/numeri";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";

const PERIODI: Array<{ v: PeriodoNumeri; label: string }> = [
  { v: "anno", label: "Quest'anno" },
  { v: "dodici-mesi", label: "Ultimi 12 mesi" },
  { v: "tutto", label: "Tutto" },
];

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${formatDecimalIT(Number(n), { minDecimals: 0, maxDecimals: 1 })} %`;

export default function NumeriAppalto() {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const companyId = effectiveCompany?.id ?? null;
  const vedeImporti = permessi.canViewOrderAmounts;
  const vedeCosti = permessi.canViewCosts;
  const vedeMargini = permessi.canViewMargins;

  const [periodo, setPeriodo] = useState<PeriodoNumeri>("dodici-mesi");
  const [scelto, setScelto] = useState<string | null>(null);

  const finestra = useMemo(() => periodoNumeri(periodo), [periodo]);

  const conti = useQuery({
    queryKey: ["appalto-conti", companyId, periodo],
    enabled: !!companyId && vedeImporti,
    queryFn: async (): Promise<ContiCommittente[]> => {
      const { data, error } = await (supabase as any).rpc("appalto_conti_committente", {
        p_dal: finestra.dal,
        p_al: finestra.al,
      });
      if (error) throw error;
      return (data ?? []) as ContiCommittente[];
    },
  });

  const mesi = useQuery({
    queryKey: ["appalto-margine-mensile", companyId, scelto],
    enabled: !!companyId && vedeImporti,
    queryFn: async (): Promise<MeseMargine[]> => {
      const { data, error } = await (supabase as any).rpc("appalto_margine_mensile", {
        p_committente_id: scelto,
        p_mesi: 12,
      });
      if (error) throw error;
      return (data ?? []) as MeseMargine[];
    },
  });

  const righe = conti.data ?? [];
  const totali = useMemo(() => totaliConti(righe), [righe]);
  const serie = mesi.data ?? [];
  const andamento = useMemo(() => tendenzaMargine(serie), [serie]);
  /* Senza un committente scelto la serie contiene righe di committenti
     diversi: una tendenza sola su quel mucchio dice «stabile» mentre uno
     peggiora. Si legge uno per uno. */
  const andamenti = useMemo(() => tendenzePerCommittente(serie), [serie]);
  const peggiorano = useMemo(() => andamenti.filter((a) => a.tendenza === "peggiora"), [andamenti]);
  const nomeScelto = scelto ? righe.find((r) => r.committente_id === scelto)?.nome : null;

  if (!vedeImporti) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Questi sono gli importi concordati con i committenti: serve il permesso «Importi delle
            commesse».
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-slate-500">
            <Link to="/azienda/clienti?tipo=committenti">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Committenti
            </Link>
          </Button>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">I numeri dell'appalto</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Quale committente ti conviene davvero: non quello che ti dà più lavoro, quello che ti
            lascia più margine.
          </p>
        </div>
        {/* La scelta che decide tutto il resto, in cima. */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium shadow-sm">
          {PERIODI.map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setPeriodo(v)}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                periodo === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!vedeMargini && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Vedi gli importi verso i committenti ma non i margini: la colonna resta vuota. Serve il
            permesso «Margini»{!vedeCosti ? ", distinto da «Costi»" : ""}.
          </AlertDescription>
        </Alert>
      )}

      {/* ─── 1. Il quadro per committente ─── */}
      <QuoteCard title="Committenti a confronto" icon={<Euro className="h-4 w-4" />}
        subtitle="In classifica per rendicontato. Il margine è vuoto dove il costo non si sa, non zero.">
        {conti.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : righe.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessun lavoro in appalto in questo periodo. I numeri nascono dalle righe di rendiconto:
            si scrivono sulla commessa, nella vista Rendiconto.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Committente</TableHead>
                  <TableHead className="text-right">Rendicontato</TableHead>
                  <TableHead className="text-right">Margine</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Da rendicontare</TableHead>
                  <TableHead className="text-right">Ritenute</TableHead>
                  <TableHead className="text-right">Da incassare</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((c) => {
                  const copertura = coperturaCosti(c);
                  return (
                    <TableRow
                      key={c.committente_id}
                      className={cn("cursor-pointer", scelto === c.committente_id && "bg-slate-50")}
                      onClick={() => setScelto(scelto === c.committente_id ? null : c.committente_id)}
                    >
                      <TableCell>
                        <Link
                          to={`/azienda/committenti/${c.committente_id}`}
                          className="font-medium text-slate-900 underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.nome}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {c.cantieri} {c.cantieri === 1 ? "cantiere" : "cantieri"} · {c.righe}{" "}
                          {c.righe === 1 ? "voce" : "voci"}
                          {Number(c.in_bozza) > 0 && ` · ${euro(c.in_bozza)} ancora in bozza`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {euro(c.rendicontato, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.margine === null ? <span className="text-slate-400">—</span> : euro(c.margine, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.margine_pct === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <>
                            <span className={cn(
                              "font-semibold",
                              Number(c.margine_pct) < 15 ? "text-destructive"
                                : Number(c.margine_pct) < 25 ? "text-amber-700" : "text-emerald-700",
                            )}>
                              {pct(c.margine_pct)}
                            </span>
                            {copertura !== null && copertura < 100 && (
                              <p className="text-[10px] text-slate-500">sul {copertura}% del lavoro</p>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(c.da_rendicontare) > 0 ? (
                          <span className="text-amber-700">{euro(c.da_rendicontare, true)}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">
                        {Number(c.ritenuta_trattenuta) > 0 ? euro(c.ritenuta_trattenuta, true) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(c.da_incassare) > 0 ? euro(c.da_incassare, true) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {righe.length > 1 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Totale</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{euro(totali.rendicontato, true)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {totali.margine === null ? "—" : euro(totali.margine, true)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{pct(totali.margine_pct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro(totali.da_rendicontare, true)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro(totali.ritenuta_trattenuta, true)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro(totali.da_incassare, true)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        )}
      </QuoteCard>

      {/* ─── 2. Il margine nel tempo ─── */}
      <QuoteCard
        title={nomeScelto ? `Margine mese per mese — ${nomeScelto}` : "Margine mese per mese"}
        icon={<TrendingDown className="h-4 w-4" />}
        subtitle={
          nomeScelto
            ? "Una tendenza non si vede da un totale. Clicca un altro committente per cambiarlo."
            : "Tutti i committenti insieme. Clicca una riga sopra per guardarne uno solo."
        }
      >
        {mesi.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : serie.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna riga di rendiconto negli ultimi 12 mesi.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              {!scelto ? (
                peggiorano.length > 0 ? (
                  <>
                    {peggiorano.map((a) => (
                      <Badge key={a.committente_id} variant="destructive" className="gap-1">
                        <TrendingDown className="h-3 w-3" /> {a.nome}: il margine peggiora
                        {a.delta !== null && ` (${formatDecimalIT(a.delta, { minDecimals: 0, maxDecimals: 1 })} punti)`}
                      </Badge>
                    ))}
                    <span className="text-slate-600">Clicca il suo nome qui sopra per guardarlo da solo.</span>
                  </>
                ) : (
                  <span className="text-slate-600">
                    Nessun committente sta peggiorando negli ultimi mesi.
                  </span>
                )
              ) : <>
              {andamento.tendenza === "peggiora" && (
                <Badge variant="destructive" className="gap-1">
                  <TrendingDown className="h-3 w-3" /> Il margine peggiora
                </Badge>
              )}
              {andamento.tendenza === "migliora" && (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <TrendingUp className="h-3 w-3" /> Il margine migliora
                </Badge>
              )}
              {andamento.tendenza === "stabile" && (
                <Badge variant="secondary" className="gap-1">
                  <Minus className="h-3 w-3" /> Margine stabile
                </Badge>
              )}
              {andamento.tendenza === "non-si-sa" && (
                <Badge variant="outline" className="gap-1">
                  <HelpCircle className="h-3 w-3" /> Troppo pochi mesi per dirlo
                </Badge>
              )}
              {andamento.delta !== null && andamento.tendenza !== "stabile" && (
                <span className="text-slate-600">
                  {andamento.delta > 0 ? "+" : ""}
                  {formatDecimalIT(andamento.delta, { minDecimals: 0, maxDecimals: 1 })} punti fra la
                  prima e la seconda metà degli ultimi {andamento.mesi} mesi
                </span>
              )}
              </>}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mese</TableHead>
                    {!scelto && <TableHead>Committente</TableHead>}
                    <TableHead className="text-right">Rendicontato</TableHead>
                    <TableHead className="text-right">Margine</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serie.map((m) => (
                    <TableRow key={`${m.mese}-${m.committente_id}`}>
                      <TableCell className="whitespace-nowrap">{meseBreve(m.mese)}</TableCell>
                      {!scelto && <TableCell className="text-slate-600">{m.nome}</TableCell>}
                      <TableCell className="text-right tabular-nums">{euro(m.rendicontato, true)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.margine === null ? <span className="text-slate-400">—</span> : euro(m.margine, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.margine_pct === null ? <span className="text-slate-400">—</span> : pct(m.margine_pct)}
                        {m.righe_senza_costo > 0 && (
                          <p className="text-[10px] text-slate-500">
                            {m.righe_senza_costo} {m.righe_senza_costo === 1 ? "voce" : "voci"} senza costo
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </QuoteCard>

      {/* ─── 3. I soldi fermi ─── */}
      {righe.length > 0 && (
        <QuoteCard title="I soldi fermi" icon={<AlertTriangle className="h-4 w-4" />}
          subtitle="Lavoro fatto che non è ancora diventato soldi.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Confermato, mai rendicontato
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {euro(totali.da_rendicontare, true)}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Lavoro che il committente non ha nemmeno visto: finché non entra in un rendiconto non
                si fattura.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ritenute trattenute
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {euro(totali.ritenuta_trattenuta, true)}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Trattenute a garanzia sui rendiconti: tornano a fine lavori, se te le ricordi.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fatturato non incassato
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {euro(totali.da_incassare, true)}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Fatture emesse e agganciate a un rendiconto, ancora da pagare.
              </p>
            </div>
          </div>
        </QuoteCard>
      )}
    </div>
  );
}
