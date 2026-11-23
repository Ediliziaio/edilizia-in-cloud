import { scadenzaDaFonte, linkFonteScadenza } from "@/lib/finance/fontiScadenzario";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CreditCard, ExternalLink, Landmark, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import {
  CLASSE_TONO, giorniDaOggi, linkCommessa, linkFattura, linkFornitore, linkTesoreriaMovimento, statoScadenza,
} from "@/lib/finance/collegamentiFinanza";
import { NotaRiga } from "@/components/shared/NotaRiga";
import { notaLeggibile, tempoScadenza } from "@/lib/finance/dettaglioScadenza";
import { etichettaMetodo } from "@/lib/finance/metodoScadenza";
import { controparteScadenza, type Scadenza } from "@/hooks/useScadenzario";
import { siAnnullaIncasso } from "@/lib/finance/annulloIncassoScadenza";
import { percheScadenzaNonModificabile } from "@/lib/finance/modificaScadenza";

interface Pagamento { id: string; entry_date: string; amount: number; payment_method: string | null; description: string | null; reversal_of: string | null }
interface Abbinamento {
  id: string; matched_amount: number; matched_at: string | null; match_type: string | null;
  bank_transactions: { id: string; booking_date: string | null; amount: number; description: string | null; creditor_name: string | null; debtor_name: string | null } | null;
}

/**
 * Tutto quel che sta attorno a una scadenza: il documento da cui nasce, la
 * commessa, gli incassi o pagamenti registrati e il bonifico abbinato. Ogni
 * voce porta alla sua scheda; il bonifico si apre in Tesoreria.
 */
export function ScadenzaDettaglio({ scadenza: s, onClose, onMarkPaid, onAnnullaIncasso, onNota, onModifica, onAnnullaScadenza, pagaSulPosto }: {
  scadenza: Scadenza;
  onClose: () => void;
  onMarkPaid: (s: Scadenza) => void;
  onAnnullaIncasso?: (s: Scadenza) => void;
  /** Scrive la nota dal dettaglio (16/11/2026): prima si poteva solo dall'elenco. */
  onNota?: (s: Scadenza, nota: string | null) => Promise<unknown>;
  onModifica?: (s: Scadenza) => void;
  onAnnullaScadenza?: (s: Scadenza) => void;
  /** La rata si paga qui anche se viene da un documento (23/11/2026: le rate dei fornitori). */
  pagaSulPosto?: (s: Scadenza) => boolean;
}) {
  const daFonte = scadenzaDaFonte(s);
  const entrata = s.direction === "entrata";
  const stato = statoScadenza(s);
  const residuo = Math.max(0, Math.round((s.amount - s.paid_amount) * 100) / 100);

  // Documento nativo o importato: stesso id in due tabelle, conta dove esiste.
  const nativa = useQuery({
    queryKey: ["scadenza-dettaglio", "nativa", s.invoice_id],
    enabled: !!s.invoice_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("documenti_fiscali").select("id").eq("id", s.invoice_id!).maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  const pagamenti = useQuery({
    queryKey: ["scadenza-dettaglio", "pagamenti", s.id],
    enabled: !daFonte,
    queryFn: async () => {
      const ors = [`scadenza_id.eq.${s.id}`];
      if (s.prima_nota_entry_id) ors.push(`id.eq.${s.prima_nota_entry_id}`);
      const { data, error } = await supabase.from("prima_nota_entries")
        .select("id, entry_date, amount, payment_method, description, reversal_of")
        .eq("company_id", s.company_id).or(ors.join(",")).order("entry_date", { ascending: true }).limit(50);
      if (error) throw error;
      return (data ?? []) as Pagamento[];
    },
  });
  const bonifici = useQuery({
    queryKey: ["scadenza-dettaglio", "bonifici", s.id, s.invoice_id],
    enabled: !daFonte,
    queryFn: async () => {
      const ors = [`scadenza_id.eq.${s.id}`];
      if (s.invoice_id) ors.push(`invoice_id.eq.${s.invoice_id}`, `documento_id.eq.${s.invoice_id}`);
      const { data, error } = await supabase.from("bank_reconciliations")
        .select("id, matched_amount, matched_at, match_type, bank_transactions(id, booking_date, amount, description, creditor_name, debtor_name)")
        .eq("company_id", s.company_id).is("unmatched_at", null).or(ors.join(",")).limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Abbinamento[];
    },
  });

  // Le altre rate dello stesso documento (stessa fattura o stesso costo): si vede subito il quadro.
  const altre = useQuery({
    queryKey: ["scadenza-dettaglio", "altre", s.id, s.invoice_id, s.cost_id],
    enabled: !daFonte && !!(s.invoice_id || s.cost_id),
    queryFn: async () => {
      let q = supabase.from("scadenze").select("id, due_date, amount, paid_amount, status, direction")
        .eq("company_id", s.company_id).neq("id", s.id).neq("status", "annullata");
      q = s.invoice_id ? q.eq("invoice_id", s.invoice_id) : q.eq("cost_id", s.cost_id!);
      const { data, error } = await q.order("due_date", { ascending: true }).limit(24);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; due_date: string; amount: number; paid_amount: number; status: Scadenza["status"]; direction: Scadenza["direction"] }>;
    },
  });
  const tempo = tempoScadenza(s);
  const pct = s.amount > 0 ? Math.min(100, Math.max(0, (Number(s.paid_amount || 0) / s.amount) * 100)) : 0;
  const nota = notaLeggibile(s.notes);

  const controparte = controparteScadenza(s);
  const voci: [string, React.ReactNode][] = [
    [entrata ? "Cliente" : "Fornitore", s.supplier_id && controparte
      ? <Link to={linkFornitore(s.supplier_id)} className="text-primary hover:underline">{controparte}</Link>
      : controparte ?? "—"],
    ["Documento", s.invoice_id && s.invoices
      ? (nativa.isPending ? `Fatt. ${s.invoices.invoice_number}` : <Link to={linkFattura(s.invoice_id, !!nativa.data)} className="text-primary hover:underline">Fatt. {s.invoices.invoice_number}</Link>)
      : s.company_costs?.name ? <Link to={linkFonteScadenza(s) ?? "/azienda/costi"} className="text-primary hover:underline">Costo · {s.company_costs.name}</Link> : "—"],
    ["Data documento", s.invoices?.issue_date ? formatDateIt(s.invoices.issue_date) : "—"],
    ["Commessa", s.order_id && s.orders
      ? <Link to={linkCommessa(s.order_id)} className="text-primary hover:underline">{s.orders.order_code}</Link> : "—"],
    ["Scadenza", (s.due_date ? formatDateIt(s.due_date) : "Senza data")],
    ["Modalità", etichettaMetodo(s.payment_method) ?? "—"],
    // Incassato e residuo stanno nella barra qui sopra: non si ripetono.
    [entrata ? "Incassata il" : "Pagata il", s.paid_date ? formatDateIt(s.paid_date) : "—"],
  ];
  const aperta = s.status !== "pagata" && s.status !== "annullata" && residuo > 0;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent struttura="scorrevole" className="w-[calc(100%-2rem)] max-w-3xl rounded-xl max-sm:w-full max-sm:rounded-none">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            {entrata ? <ArrowDownLeft className="h-5 w-5 text-emerald-600" /> : <ArrowUpRight className="h-5 w-5 text-red-600" />}
            <span className="truncate">{s.description}</span>
          </DialogTitle>
          <DialogDescription>{s.due_date ? `${entrata ? "Incasso" : "Pagamento"} in scadenza il ${formatDateIt(s.due_date)}` : "Data da definire nella commessa o nel costo"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`text-2xl font-semibold tabular-nums ${entrata ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {entrata ? "+" : "−"}{formatCurrency(s.amount)}
                </p>
                <p className={`text-sm ${tempo.tono === "cattivo" ? "font-medium text-destructive" : tempo.tono === "attenzione" ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{tempo.testo}</p>
              </div>
              <Badge variant="outline" className={CLASSE_TONO[stato.tono]}>{stato.label}</Badge>
            </div>
            {s.status !== "annullata" && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={entrata ? "Quanto è incassato" : "Quanto è pagato"}>
                  <div className={`h-full rounded-full ${entrata ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                  <span>{entrata ? "Incassati" : "Pagati"} {formatCurrency(s.paid_amount)}</span>
                  <span>{residuo > 0 ? `restano ${formatCurrency(residuo)}` : "saldata"}</span>
                </p>
              </div>
            )}
          </section>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {voci.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {(nota || (onNota && !daFonte)) && (
            <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <p className="min-w-0 flex-1 whitespace-pre-wrap">
                <span className="text-xs text-muted-foreground">Nota · </span>
                {nota || <span className="text-muted-foreground">nessuna</span>}
              </p>
              {onNota && !daFonte && <NotaRiga nota={s.notes} titolo={`Scadenza ${(s.due_date ? formatDateIt(s.due_date) : "Senza data")} · ${s.description}`} onSalva={(n) => onNota(s, n)} />}
            </div>
          )}

          {altre.data && altre.data.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Altre rate dello stesso documento</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {altre.data.map((r) => {
                  const st = statoScadenza(r);
                  const ritardo = st.tono === "scaduta" ? -giorniDaOggi(r.due_date) : 0;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2 whitespace-nowrap">
                      <span className="tabular-nums">{formatDateIt(r.due_date)}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{ritardo > 0 ? `scaduta da ${ritardo} gg` : ""}</span>
                      <span className="font-medium tabular-nums">{formatCurrency(r.amount)}</span>
                      <Badge variant="outline" className={`px-1.5 text-[11px] ${CLASSE_TONO[st.tono]}`}>{st.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!daFonte && <><section className="space-y-2">
            <h3 className="text-sm font-semibold">{entrata ? "Incassi registrati" : "Pagamenti registrati"}</h3>
            {pagamenti.isPending ? <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
              : pagamenti.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere i pagamenti.</p>
              : !pagamenti.data.length ? <p className="text-sm text-muted-foreground">Nessun {entrata ? "incasso" : "pagamento"} registrato in Prima nota.</p>
              : <ul className="divide-y rounded-lg border text-sm">
                  {pagamenti.data.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2 whitespace-nowrap">
                      <span className="tabular-nums">{formatDateIt(p.entry_date)}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.description}{p.payment_method ? ` · ${p.payment_method}` : ""}</span>
                      {p.reversal_of && <Badge variant="outline">Storno</Badge>}
                      <span className="font-medium tabular-nums">{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Movimento bancario abbinato</h3>
            {bonifici.isPending ? <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
              : bonifici.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere gli abbinamenti bancari.</p>
              : !bonifici.data.length ? <p className="text-sm text-muted-foreground">Nessun bonifico abbinato. Si abbina da Tesoreria → Movimenti bancari.</p>
              : <ul className="divide-y rounded-lg border text-sm">
                  {bonifici.data.map((b) => {
                    const t = b.bank_transactions;
                    return (
                      <li key={b.id} className="flex items-center gap-3 px-3 py-2 whitespace-nowrap">
                        <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="tabular-nums">{formatDateIt(t?.booking_date ?? b.matched_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{t?.description ?? "Movimento"}</span>
                        <span className="font-medium tabular-nums">{formatCurrency(b.matched_amount)}</span>
                        {t && <Link to={linkTesoreriaMovimento(t.id)} className="inline-flex items-center gap-1 text-primary hover:underline">Apri<ExternalLink className="h-3 w-3" /></Link>}
                      </li>
                    );
                  })}
                </ul>}
          </section>

          </>}
          {daFonte && <p className="text-sm text-muted-foreground">Importo aggiornato dalla fonte. Aprila per completare la data e gestire lo storico dei pagamenti.</p>}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {onModifica && !percheScadenzaNonModificabile(s) && <Button variant="outline" onClick={() => onModifica(s)}>Modifica scadenza</Button>}
            {onAnnullaScadenza && !percheScadenzaNonModificabile(s) && <Button variant="outline" onClick={() => onAnnullaScadenza(s)}>Annulla scadenza</Button>}
            {/* Per le scadenze da fonte la frase sopra dice già dove si modifica: niente doppione. */}
            {percheScadenzaNonModificabile(s) && !daFonte && <p className="w-full text-xs text-muted-foreground">{percheScadenzaNonModificabile(s)}</p>}
            {(aperta || daFonte) && <Button onClick={() => onMarkPaid(s)}><CreditCard className="mr-1 h-4 w-4" />{pagaSulPosto?.(s) ? "Paga" : daFonte ? "Apri fonte" : entrata ? "Incassa" : "Paga"}</Button>}
            {onAnnullaIncasso && siAnnullaIncasso(s) && <Button variant="outline" onClick={() => onAnnullaIncasso(s)}><Undo2 className="mr-1 h-4 w-4" />Annulla incasso</Button>}
            {s.invoice_id && !nativa.isPending && <Button variant="outline" asChild><Link to={linkFattura(s.invoice_id, !!nativa.data)}>Apri la fattura</Link></Button>}
            {s.order_id && <Button variant="outline" asChild><Link to={linkCommessa(s.order_id)}>Apri la commessa</Link></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
