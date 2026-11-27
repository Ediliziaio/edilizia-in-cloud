/**
 * «Segnate pagate, ma i soldi non risultano usciti» (26/11/2026, Impresa Vulcano).
 *
 * Una fattura può risultare pagata mentre il calcolo del residuo dice che quei soldi si
 * devono ancora: succede quando le bandierine vengono accese senza passare da
 * `registra_pagamento_costo`, che è quello che scrive il pagamento in prima nota. Finché
 * la riga sta in quello stato il pagamento vero, quando arriva in banca, non ha più niente
 * a cui attaccarsi — ed è il muro contro cui si è fermata la riconciliazione di una
 * distinta RiBa da 94.198 €.
 *
 * Qui si vede e si corregge: «Riapri» rimette quelle rate fra quelle da pagare, e da lì
 * l'azienda sceglie — riconciliarle col movimento, oppure «Segna pagata» dalla fattura,
 * che la scrittura la registra davvero. La seconda strada vale per chi la banca non ce
 * l'ha collegata, che è il motivo per cui segnare a mano deve restare possibile.
 *
 * 27/11/2026: «Mostra l'elenco» apre le rate una per una (fattura, fornitore, scadenza,
 * residuo, collegamento alla fattura) con la casella per scegliere quali riaprire: si
 * passano a `riapri_pagamenti_segnati` come `p_rate`. Senza scelta (`p_rate` nullo)
 * si riaprono tutte, comprese le rate rimaste «pagate» col costo ancora aperto.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface RigaDaSistemare {
  costo_id: string;
  fattura_id: string | null;
  numero_fattura: string | null;
  fornitore: string | null;
  scadenza: string | null;
  residuo: number;
  rata_id?: string | null;
  rata_numero?: number | null;
}

const chiamata = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

/** Chiave della riga: la rata; il costo solo se la rata manca (risposta di una versione vecchia). */
const chiave = (r: RigaDaSistemare) => r.rata_id ?? `costo:${r.costo_id}:${r.scadenza ?? ""}`;

/** `null` = tutte; altrimenti le righe scelte. */
type Richiesta = null | RigaDaSistemare[];

export function PagamentiSegnatiDaSistemare({ companyId }: { companyId?: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [conferma, setConferma] = useState<{ righe: Richiesta } | null>(null);
  const [aperto, setAperto] = useState(false);
  const [scelte, setScelte] = useState<Set<string>>(() => new Set());

  const elenco = useQuery({
    queryKey: ["pagamenti-segnati-da-sistemare", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () =>
      ((await chiamata("pagamenti_segnati_da_sistemare", { p_company: companyId })) ??
        []) as RigaDaSistemare[],
  });

  const riapri = useMutation({
    mutationFn: async (richiesta: Richiesta) => {
      const rate = richiesta?.map((r) => r.rata_id).filter((x): x is string => !!x) ?? [];
      const costi = richiesta?.filter((r) => !r.rata_id).map((r) => r.costo_id) ?? [];
      return (await chiamata("riapri_pagamenti_segnati", {
        p_company: companyId,
        p_costi: richiesta && costi.length > 0 ? costi : null,
        ...(richiesta && rate.length > 0 ? { p_rate: rate } : {}),
      })) as number;
    },
    onSuccess: (quanti) => {
      toast.success(
        quanti === 1
          ? t("Un pagamento riaperto: la rata è tornata fra quelle da pagare")
          : t("{n} pagamenti riaperti: le rate sono tornate fra quelle da pagare", { n: quanti }),
      );
      refreshFinancialQueries(qc);
      void qc.invalidateQueries({ queryKey: ["pagamenti-segnati-da-sistemare"] });
      setConferma(null);
      setScelte(new Set());
    },
    onError: (e: Error) => toast.error(t("Non sono riuscito a riaprirli"), { description: e.message }),
  });

  const righe = useMemo(() => elenco.data ?? [], [elenco.data]);
  const selezionate = useMemo(() => righe.filter((r) => scelte.has(chiave(r))), [righe, scelte]);
  if (!companyId || elenco.isLoading || righe.length === 0) return null;
  const somma = (rr: RigaDaSistemare[]) => rr.reduce((n, r) => n + Number(r.residuo || 0), 0);
  const totale = somma(righe);
  const primi = righe.slice(0, 3);
  // Le righe sono rate: una fattura a due rate segnate conta una volta sola nel titolo.
  const fatture = new Set(righe.map((r) => r.fattura_id ?? `costo:${r.costo_id}`)).size;
  const tutteScelte = selezionate.length === righe.length;
  const daConfermare = conferma ? (conferma.righe ?? righe) : [];

  const cambia = (r: RigaDaSistemare, si: boolean) =>
    setScelte((prima) => {
      const dopo = new Set(prima);
      if (si) dopo.add(chiave(r)); else dopo.delete(chiave(r));
      return dopo;
    });

  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {fatture === 1
              ? t("Una fattura risulta pagata, ma il pagamento non è registrato")
              : t("{n} fatture risultano pagate, ma il pagamento non è registrato", { n: fatture })}
            {" · "}
            {formatCurrency(totale)}
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
            {t("Finché restano così non si possono riconciliare con il movimento della banca. Riaprendole tornano fra quelle da pagare: poi le abbini al pagamento, oppure usi «Segna pagata» dalla fattura, che registra la scrittura.")}
          </p>
          {!aperto && (
            <p className="mt-1 truncate text-xs text-amber-900/70 dark:text-amber-200/70">
              {primi.map((r) => `${r.numero_fattura ?? "—"} · ${r.fornitore ?? "—"}`).join(" · ")}
              {righe.length > primi.length ? ` · ${t("e altre {n}", { n: righe.length - primi.length })}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" aria-expanded={aperto} onClick={() => setAperto((x) => !x)}>
            {aperto ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            {aperto ? t("Nascondi") : t("Mostra l'elenco")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConferma({ righe: null })}>
            {t("Riapri")}
          </Button>
        </div>
      </div>

      {aperto && (
        <div className="mt-2 overflow-hidden rounded-md border border-amber-200 bg-background dark:border-amber-900">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="sticky top-0 bg-muted/80 text-left text-[11px] text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-8 px-2 py-1">
                    <Checkbox
                      aria-label={t("Seleziona tutto")}
                      checked={tutteScelte ? true : selezionate.length > 0 ? "indeterminate" : false}
                      onCheckedChange={(v) => setScelte(v === true ? new Set(righe.map(chiave)) : new Set())}
                    />
                  </th>
                  <th className="px-2 py-1 font-medium">{t("Fattura")}</th>
                  <th className="px-2 py-1 font-medium">{t("Fornitore")}</th>
                  <th className="px-2 py-1 font-medium">{t("Scadenza")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("Residuo")}</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => {
                  const k = chiave(r);
                  const numero = r.numero_fattura ?? "—";
                  return (
                    <tr key={k} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-2 py-0.5">
                        <Checkbox
                          aria-label={t("Seleziona {numero}", { numero })}
                          checked={scelte.has(k)}
                          onCheckedChange={(v) => cambia(r, v === true)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-0.5">
                        {r.fattura_id ? (
                          <Link
                            to={`/azienda/documenti/fatture-ricevute?fattura=${r.fattura_id}`}
                            className="font-medium text-primary hover:underline"
                            title={t("Apri la fattura")}
                          >
                            {numero}
                          </Link>
                        ) : numero}
                        {r.rata_numero && r.rata_numero > 1 ? (
                          <span className="ml-1 text-muted-foreground">· {t("Rata {n}", { n: r.rata_numero })}</span>
                        ) : null}
                      </td>
                      <td className="max-w-[14rem] truncate px-2 py-0.5" title={r.fornitore ?? undefined}>{r.fornitore ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-0.5">{formatDateIt(r.scadenza)}</td>
                      <td className="whitespace-nowrap px-2 py-0.5 text-right">{formatCurrency(Number(r.residuo || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 bg-muted/30 px-2 py-1.5">
            {selezionate.length > 0 && (
              <span className="mr-auto text-xs text-muted-foreground tabular-nums">
                {formatCurrency(somma(selezionate))}
              </span>
            )}
            <Button
              size="sm" variant="outline" className="h-7"
              disabled={selezionate.length === 0}
              onClick={() => setConferma({ righe: selezionate })}
            >
              {t("Riapri")} {t("({n} selezionati)", { n: selezionate.length })}
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setConferma({ righe: null })}>
              {t("Riapri")} · {t("Tutte ({n})", { n: righe.length })}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!conferma} onOpenChange={(o) => { if (!o) setConferma(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Riaprire {n} pagamenti?", { n: daConfermare.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("Le rate tornano fra quelle da pagare, per {importo} in tutto. Non si cancella niente: le fatture restano dove sono, e chi ha pagato davvero può risegnarle pagate in un clic. Si toccano solo quelle dove il pagamento non risulta registrato.", { importo: formatCurrency(somma(daConfermare)) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={riapri.isPending}
              onClick={(e) => { e.preventDefault(); if (conferma) riapri.mutate(conferma.righe); }}
            >
              {riapri.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {t("Riapri")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
