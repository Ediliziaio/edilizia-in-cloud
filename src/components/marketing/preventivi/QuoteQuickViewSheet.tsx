import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink, TrendingUp, TrendingDown, Clock, User, FileText,
  Banknote, Percent, CheckCircle2, XCircle, Send, Calendar,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

interface QuoteSummary {
  id: string;
  quote_number: string;
  client_name: string | null;
  title: string | null;
  status: string;
  total: number | null;
  subtotal: number | null;
  vat_amount: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  created_at: string;
  expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  salesperson_id: string | null;
  approval_status: string | null;
  margine_pct_snapshot: number | null;
  commission_amount_snapshot: number | null;
  tipo_lavoro: string | null;
  totale_costo_interno: number | null;
  totale_overhead: number | null;
}

interface Props {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuoteQuickViewSheet({ quoteId, open, onOpenChange }: Props) {
  const companyId = useEffectiveCompanyId();
  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote-quickview", companyId, quoteId],
    enabled: !!companyId && !!quoteId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, client_name, title, status, total, subtotal, vat_amount, discount_percent, discount_amount, created_at, expires_at, sent_at, viewed_at, signed_at, signed_by_name, contact_id, opportunity_id, salesperson_id, approval_status, margine_pct_snapshot, commission_amount_snapshot, tipo_lavoro, totale_costo_interno, totale_overhead")
        .eq("id", quoteId!)
        .eq("company_id", companyId as string)
        .maybeSingle();
      if (error) throw error;
      return data as QuoteSummary | null;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["quote-quickview-items", companyId, quoteId],
    enabled: !!companyId && !!quoteId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("id, name, quantity, unit_price, discount_percent, line_total, item_category, prezzo_acquisto")
        .eq("quote_id", quoteId!)
        .order("sort_order");
      if (error) throw error;
      return data as Array<{ id: string; name: string; quantity: number; unit_price: number; discount_percent: number; line_total: number | null; item_category: string | null; prezzo_acquisto: number | null }>;
    },
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ["quote-quickview-approvals", companyId, quoteId],
    enabled: !!companyId && !!quoteId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_approvals")
        .select("id, sconto_richiesto_pct, sconto_autorizzato_pct, margine_stimato_pct, decision, note_richiesta, note_decisione, requested_at, decided_at")
        .eq("quote_id", quoteId!)
        .eq("company_id", companyId as string)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        sconto_richiesto_pct: number;
        sconto_autorizzato_pct: number | null;
        margine_stimato_pct: number | null;
        decision: string | null;
        note_richiesta: string | null;
        note_decisione: string | null;
        requested_at: string;
        decided_at: string | null;
      }>;
    },
  });

  const { data: salesperson } = useQuery({
    queryKey: ["quote-quickview-sp", quote?.salesperson_id],
    enabled: !!quote?.salesperson_id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("first_name, last_name, compensation_mode, commission_type, commission_value")
        .eq("id", quote!.salesperson_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const costoTotale = useMemo(() => {
    return items.reduce((s, it) => s + (it.prezzo_acquisto ?? 0) * (it.quantity ?? 0), 0);
  }, [items]);

  const ricavoNetto = useMemo(() => {
    return items.reduce((s, it) => s + (it.line_total ?? (it.quantity * it.unit_price * (1 - (it.discount_percent ?? 0) / 100))), 0);
  }, [items]);

  const margineEur = ricavoNetto - costoTotale - (quote?.totale_overhead ?? 0);
  const marginePct = ricavoNetto > 0 ? (margineEur / ricavoNetto) * 100 : 0;

  const status = (quote?.status as QuoteStatus) || "bozza";
  const statusCfg = QUOTE_STATUS_CONFIG[status] ?? QUOTE_STATUS_CONFIG.bozza;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Dettaglio preventivo
            <Badge variant="outline" className="text-xs font-medium">Admin</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading || !quote ? (
            <div className="p-6 text-sm text-muted-foreground">Caricamento...</div>
          ) : (
            <>
              <div className="p-4 space-y-3 border-b bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{quote.quote_number}</div>
                    <div className="font-medium text-sm mt-0.5">{quote.title || "Preventivo"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {quote.client_name || "Cliente non specificato"}
                    </div>
                  </div>
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />
                    {format(new Date(quote.created_at), "dd MMM yyyy", { locale: it })}
                  </span>
                  {quote.expires_at && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />
                      Scade {format(new Date(quote.expires_at), "dd MMM", { locale: it })}
                    </span>
                  )}
                  {quote.tipo_lavoro && (
                    <Badge variant="outline" className="text-[10px] py-0">{quote.tipo_lavoro}</Badge>
                  )}
                </div>
              </div>

              {/* KPI finanziari admin */}
              <div className="p-4 grid grid-cols-2 gap-3 border-b">
                <KpiBox
                  icon={<Banknote className="h-3.5 w-3.5" />}
                  label="Totale cliente"
                  value={formatCurrency(quote.total ?? 0)}
                  sub={`IVA ${formatCurrency(quote.vat_amount ?? 0)}`}
                />
                <KpiBox
                  icon={<Banknote className="h-3.5 w-3.5" />}
                  label="Netto pre-IVA"
                  value={formatCurrency(ricavoNetto)}
                  sub={quote.discount_percent ? `Sconto ${quote.discount_percent}%` : undefined}
                />
                <KpiBox
                  icon={<TrendingDown className="h-3.5 w-3.5 text-orange-600" />}
                  label="Costo prodotti"
                  value={formatCurrency(costoTotale)}
                  sub={quote.totale_overhead ? `+overhead ${formatCurrency(quote.totale_overhead)}` : undefined}
                  accent="orange"
                />
                <KpiBox
                  icon={<TrendingUp className={`h-3.5 w-3.5 ${marginePct >= 20 ? "text-green-600" : marginePct >= 10 ? "text-yellow-600" : "text-red-600"}`} />}
                  label="Margine"
                  value={`${marginePct.toFixed(1)}%`}
                  sub={formatCurrency(margineEur)}
                  accent={marginePct >= 20 ? "green" : marginePct >= 10 ? "yellow" : "red"}
                />
              </div>

              {/* Commerciale + provvigione */}
              {salesperson && (
                <div className="p-4 border-b space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Commerciale assegnato
                  </h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{salesperson.first_name} {salesperson.last_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {salesperson.compensation_mode === "fixed_only" ? "Solo fisso" :
                          salesperson.compensation_mode === "fixed_plus_commission" ? "Fisso + provvigioni" : "Solo provvigioni"}
                        {" · "}
                        {salesperson.commission_type === "fixed" ? `${salesperson.commission_value}€ fissi` :
                          salesperson.commission_type === "percentage_sold" ? `${salesperson.commission_value}% su venduto` :
                          `${salesperson.commission_value}% su incassato`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Provvigione teorica</div>
                      <div className="text-sm font-medium text-violet-700">
                        {quote.commission_amount_snapshot != null
                          ? formatCurrency(quote.commission_amount_snapshot)
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Workflow approvazione sconto */}
              {approvals.length > 0 && (
                <div className="p-4 border-b space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Percent className="h-3 w-3" /> Storico approvazioni sconto
                  </h4>
                  {approvals.map((a) => (
                    <div key={a.id} className="text-xs border-l-2 border-muted pl-3 py-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Send className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">
                          Richiesto sconto {a.sconto_richiesto_pct}%
                        </span>
                        <span className="text-muted-foreground">
                          · {format(new Date(a.requested_at), "dd MMM HH:mm", { locale: it })}
                        </span>
                      </div>
                      {a.note_richiesta && <p className="text-muted-foreground italic">"{a.note_richiesta}"</p>}
                      {a.decision === "approved" && (
                        <div className="flex items-center gap-1 text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Approvato{a.decided_at ? ` il ${format(new Date(a.decided_at), "dd MMM", { locale: it })}` : ""}
                        </div>
                      )}
                      {a.decision === "rejected" && (
                        <div className="flex items-center gap-1 text-red-700">
                          <XCircle className="h-3 w-3" /> Rifiutato{a.note_decisione ? ` — ${a.note_decisione}` : ""}
                        </div>
                      )}
                      {a.decision === "counter_proposed" && (
                        <div className="flex items-center gap-1 text-blue-700">
                          <Send className="h-3 w-3" /> Contro-proposta {a.sconto_autorizzato_pct}%
                        </div>
                      )}
                      {!a.decision && (
                        <div className="flex items-center gap-1 text-orange-600">
                          <Clock className="h-3 w-3" /> In attesa di decisione admin
                        </div>
                      )}
                      {a.margine_stimato_pct != null && (
                        <div className="text-[11px] text-muted-foreground">
                          Margine stimato al momento della richiesta: {a.margine_stimato_pct}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline eventi */}
              <div className="p-4 border-b space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cronologia</h4>
                <div className="space-y-1 text-xs">
                  <TimelineEvent label="Creato" date={quote.created_at} done />
                  <TimelineEvent label="Inviato" date={quote.sent_at} done={!!quote.sent_at} />
                  <TimelineEvent label="Visualizzato dal cliente" date={quote.viewed_at} done={!!quote.viewed_at} />
                  <TimelineEvent label="Firmato" date={quote.signed_at} done={!!quote.signed_at}
                    sub={quote.signed_by_name || undefined} />
                </div>
              </div>

              {/* Righe (preview) */}
              <div className="p-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Righe ({items.length})
                </h4>
                <div className="space-y-1 text-xs">
                  {items.slice(0, 8).map((it) => (
                    <div key={it.id} className="flex items-start justify-between gap-2 py-1 border-b border-muted/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {it.quantity} × {formatCurrency(it.unit_price)}
                          {it.discount_percent ? ` · -${it.discount_percent}%` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(it.line_total ?? (it.quantity * it.unit_price))}</div>
                        {it.prezzo_acquisto != null && it.prezzo_acquisto > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            costo {formatCurrency(it.prezzo_acquisto * it.quantity)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length > 8 && (
                    <div className="text-[11px] text-muted-foreground italic pt-1">
                      + altre {items.length - 8} righe
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer con azioni */}
        <div className="border-t p-3 flex gap-2">
          {quote && (
            <>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to={`/azienda/marketing/preventivi/${quote.id}`}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Apri
                </Link>
              </Button>
              {quote.contact_id && (
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link to={`/azienda/marketing/contatti/${quote.contact_id}`}>
                    Contatto
                  </Link>
                </Button>
              )}
              {quote.opportunity_id && (
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link to={`/azienda/marketing/opportunita?id=${quote.opportunity_id}`}>
                    Opportunità
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KpiBox({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: "green" | "yellow" | "red" | "orange" }) {
  const accentClass =
    accent === "green" ? "border-green-200 bg-green-50/50" :
    accent === "yellow" ? "border-yellow-200 bg-yellow-50/50" :
    accent === "red" ? "border-red-200 bg-red-50/50" :
    accent === "orange" ? "border-orange-200 bg-orange-50/50" :
    "";
  return (
    <div className={`rounded-md border p-2.5 ${accentClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function TimelineEvent({
  label, date, done, sub,
}: { label: string; date: string | null; done: boolean; sub?: string }) {
  return (
    <div className={`flex items-center justify-between ${done ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
        <span>{label}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {date ? format(new Date(date), "dd MMM yyyy", { locale: it }) : "—"}
        {sub && <span className="block text-right">{sub}</span>}
      </div>
    </div>
  );
}
