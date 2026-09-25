import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, isPast } from "date-fns";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { useMovimentiCassa, useCreateMovimento, useDeleteMovimento } from "@/hooks/useMovimentiCassa";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Plus, Trash2, Loader2, Link as LinkIcon, Wallet, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { METODI_INCASSO } from "@/lib/fatturazione/incassi";
import { useIsMobile } from "@/hooks/use-mobile";

// La stessa lista di «Segna pagata»: lib/fatturazione/incassi.ts.
const METODI = METODI_INCASSO;

type RegistroIncassiProps = {
  embedded?: boolean;
};

export default function RegistroIncassi({ embedded = false }: RegistroIncassiProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("incassi");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  const { data: movimenti, isLoading: movLoading } = useMovimentiCassa();
  const createMovimento = useCreateMovimento();
  const deleteMovimento = useDeleteMovimento();

  // Get unpaid invoices for selection
  const { data: invoicesData } = useDocumentiFiscali({
    // Una fattura si incassa finché ha un residuo, non finché ha una certa
    // etichetta: mandandola allo SDI lo stato diventa "inviata_sdi" e prima del
    // 20/09/2026 spariva da qui, cioè dopo il flusso normale (emetti → invia →
    // incassa) non era più incassabile.
    stato: ["emessa", "parzialmente_pagata", "inviata_sdi", "consegnata", "accettata", "rifiutata"],
    perPage: 1000, // KPI/selezione su TUTTI gli aperti, non solo i primi 50 (default paginazione)
  });
  const unpaidInvoices = useMemo(() => invoicesData?.documenti ?? [], [invoicesData?.documenti]);

  // All invoices for scadenzario
  const { data: allInvoicesData } = useDocumentiFiscali({ perPage: 1000 });
  const allInvoices = useMemo(() => allInvoicesData?.documenti ?? [], [allInvoicesData?.documenti]);

  // KPIs
  const kpis = useMemo(() => {
    const movs = movimenti ?? [];
    const incassatoMese = movs
      .filter((m) => m.data_movimento >= monthStart && m.data_movimento <= monthEnd && m.tipo === "incasso")
      .reduce((sum, m) => sum + m.importo, 0);
    const daIncassare = unpaidInvoices.reduce((sum, d) => sum + (d.totale_da_pagare - d.importo_pagato), 0);
    // scaduto = quota scaduta DELLE STESSE fatture incassabili (emessa/parz. pagata),
    // non di tutti i documenti: altrimenti preventivi/bozze gonfiano lo scaduto e "non scaduto" va negativo.
    const scaduto = unpaidInvoices
      .filter((d) => d.data_scadenza && isPast(new Date(d.data_scadenza)) && d.importo_pagato < d.totale_da_pagare)
      .reduce((sum, d) => sum + (d.totale_da_pagare - d.importo_pagato), 0);
    const nonScaduto = daIncassare - scaduto;
    return { incassatoMese, daIncassare, scaduto, saldo: nonScaduto };
  }, [movimenti, unpaidInvoices, allInvoices, monthStart, monthEnd]);

  // Form state
  const [formDocId, setFormDocId] = useState("");
  const [formImporto, setFormImporto] = useState("");
  const [formMetodo, setFormMetodo] = useState("bonifico");
  const [formData, setFormData] = useState<Date>(new Date());
  const [formRiferimento, setFormRiferimento] = useState("");
  const [formNote, setFormNote] = useState("");

  const selectedInvoice = unpaidInvoices.find((d) => d.id === formDocId);
  const maxImporto = selectedInvoice ? selectedInvoice.totale_da_pagare - selectedInvoice.importo_pagato : 0;

  const handleSelectInvoice = (id: string) => {
    setFormDocId(id);
    const inv = unpaidInvoices.find((d) => d.id === id);
    if (inv) setFormImporto((inv.totale_da_pagare - inv.importo_pagato).toFixed(2));
  };

  const handleSubmit = () => {
    if (!formDocId || !formImporto) {
      toast.error("Seleziona una fattura e inserisci l'importo");
      return;
    }
    const parsedImporto = Number(formImporto);
    if (!Number.isFinite(parsedImporto) || parsedImporto <= 0) {
      toast.error("Inserisci un importo valido maggiore di zero");
      return;
    }
    if (selectedInvoice && parsedImporto > maxImporto + 0.005) {
      toast.error("L'importo supera il residuo della fattura", {
        description: `Residuo disponibile: ${formatCurrency(maxImporto)}`,
      });
      return;
    }
    createMovimento.mutate(
      {
        documento_id: formDocId,
        importo: parsedImporto,
        metodo: formMetodo,
        data_movimento: format(formData, "yyyy-MM-dd"),
        riferimento: formRiferimento || undefined,
        note: formNote || undefined,
      },
      {
        onSuccess: () => {
          setSheetOpen(false);
          setFormDocId("");
          setFormImporto("");
          setFormRiferimento("");
          setFormNote("");
        },
      }
    );
  };

  // Scadenzario
  const scadenzario = useMemo(() => {
    return allInvoices
      .filter((d) => d.data_scadenza && d.importo_pagato < d.totale_da_pagare && d.stato !== "stornata" && d.stato !== "annullata")
      .sort((a, b) => (a.data_scadenza ?? "").localeCompare(b.data_scadenza ?? ""))
      .map((d) => {
        const scad = new Date(d.data_scadenza!);
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const diff = Math.ceil((scad.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24));
        let urgency: "scaduta" | "oggi" | "settimana" | "futuro" = "futuro";
        if (diff < 0) urgency = "scaduta";
        else if (diff === 0) urgency = "oggi";
        else if (diff <= 7) urgency = "settimana";
        return { ...d, diff, urgency };
      });
  }, [allInvoices]);

  const urgencyStyles = {
    scaduta: "bg-red-50 border-l-4 border-red-400",
    oggi: "bg-amber-50 border-l-4 border-amber-400",
    settimana: "bg-yellow-50 border-l-4 border-yellow-300",
    futuro: "bg-muted/30 border-l-4 border-muted",
  };

  return (
    // Mobile, dentro l'hub Fatturazione: «contents», i figli stanno nella colonna
    // dell'hub e il titolo (order -2) sale sopra le linguette (order -1).
    <div className={cn("space-y-6", !embedded && "p-6 max-sm:space-y-3 max-sm:p-0", embedded && "max-sm:contents max-sm:space-y-0")}>
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6 max-sm:-order-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Registro Incassi</h1>
              <p className="mt-0.5 text-sm text-slate-500">Controlla incassi, scadenze e residui cliente in modo operativo.</p>
            </div>
          </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-8 max-sm:px-3 max-sm:text-xs">
              <Plus className="h-4 w-4 mr-1" /> <span className="max-sm:hidden">Registra Incasso</span><span className="sm:hidden">Registra</span>
            </Button>
          </SheetTrigger>
          {/* Mobile: pannello dal basso, campi brevi affiancati, via le note. */}
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={cn("w-full sm:w-[480px]", isMobile && "max-h-[90dvh] overflow-y-auto rounded-t-2xl px-4 pb-6")}
          >
            <SheetHeader className="max-sm:text-left">
              <SheetTitle className="max-sm:text-base">Registra Incasso</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6 max-sm:mt-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-2 max-sm:gap-y-3 max-sm:space-y-0">
              <div className="max-sm:col-span-2">
                <Label className="text-sm">Fattura</Label>
                <Select value={formDocId} onValueChange={handleSelectInvoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona fattura..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unpaidInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.numero} — {inv.cliente_snapshot?.ragione_sociale} — {formatCurrency(inv.totale_da_pagare - inv.importo_pagato)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Importo €</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={formImporto}
                  onChange={(e) => setFormImporto(e.target.value)}
                />
                {formImporto && parseFloat(formImporto) < maxImporto && (
                  <p className="text-xs text-amber-600 mt-1 max-sm:text-[11px]">
                    <span className="max-sm:hidden">Incasso parziale — residuo: </span><span className="sm:hidden">Residuo </span>{formatCurrency(maxImporto - parseFloat(formImporto))}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-sm">Data incasso</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(formData, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData}
                      onSelect={(d) => d && setFormData(d)}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-sm">Metodo</Label>
                <Select value={formMetodo} onValueChange={setFormMetodo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODI.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm"><span className="max-sm:hidden">Riferimento (CRO, n. assegno...)</span><span className="sm:hidden">Riferimento</span></Label>
                <Input value={formRiferimento} onChange={(e) => setFormRiferimento(e.target.value)} />
              </div>

              <div className="max-sm:hidden">
                <Label className="text-sm">Note</Label>
                <Input value={formNote} onChange={(e) => setFormNote(e.target.value)} />
              </div>

              <Button
                className="w-full max-sm:col-span-2"
                onClick={handleSubmit}
                disabled={createMovimento.isPending || !formDocId}
              >
                {createMovimento.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Registra Incasso
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </div>

      {/* KPI Cards */}
      {/* Mobile: due numeri (incassato del mese e scaduto); gli altri due al desktop. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 max-sm:gap-2">
        <OperationalKpiCard icon={TrendingUp} label="Incassato mese" value={formatCurrency(kpis.incassatoMese)} hint="registrato nel mese" tone="green" />
        <OperationalKpiCard icon={Wallet} label="Da incassare" value={formatCurrency(kpis.daIncassare)} hint="fatture aperte" tone="blue" className="max-sm:hidden" />
        <OperationalKpiCard icon={AlertTriangle} label="Scaduto" value={formatCurrency(kpis.scaduto)} hint="da sollecitare" tone={kpis.scaduto > 0 ? "red" : "green"} />
        <OperationalKpiCard icon={Clock} label="Non scaduto" value={formatCurrency(kpis.saldo)} hint="ancora nei termini" tone="amber" className="max-sm:hidden" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-sm:grid max-sm:h-9 max-sm:w-full max-sm:grid-cols-2">
          <TabsTrigger value="incassi" className="tap-compact max-sm:text-xs">Incassi</TabsTrigger>
          <TabsTrigger value="scadenzario" className="tap-compact max-sm:text-xs">Scadenzario</TabsTrigger>
        </TabsList>

        <TabsContent value="incassi">
          {/* Mobile: un incasso per riga (importo, metodo e riferimento, data),
              senza tabella a sette colonne e senza cestino. */}
          {!movLoading && (
            <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
              {(movimenti ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!m.documento_id}
                  onClick={() => m.documento_id && navigate(`/azienda/documenti/${m.documento_id}/dettaglio`)}
                  className="tap-compact flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted disabled:opacity-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold capitalize leading-tight">{m.metodo ?? "Incasso"}</div>
                    <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                      {formatDateIt(m.data_movimento)}{m.riferimento ? ` · ${m.riferimento}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatCurrency(m.importo)}</span>
                </button>
              ))}
              {(movimenti ?? []).length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">Nessun incasso registrato</p>
              )}
            </div>
          )}
          {movLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="max-sm:hidden">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Data</th>
                      <th className="p-3 text-left font-medium">Fattura</th>
                      <th className="p-3 text-right font-medium">Importo</th>
                      <th className="p-3 text-left font-medium">Metodo</th>
                      <th className="p-3 text-left font-medium">Riferimento</th>
                      <th className="p-3 text-left font-medium">Note</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(movimenti ?? []).map((m) => (
                      <tr key={m.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 whitespace-nowrap">{formatDateIt(m.data_movimento)}</td>
                        <td className="p-3">
                          {m.documento_id ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={() => navigate(`/azienda/documenti/${m.documento_id}/dettaglio`)}
                            >
                              <LinkIcon className="h-3 w-3 mr-1" />
                              Vedi fattura
                            </Button>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-right font-mono">{formatCurrency(m.importo)}</td>
                        <td className="p-3 capitalize">{m.metodo ?? "—"}</td>
                        <td className="p-3">{m.riferimento ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{m.note ?? "—"}</td>
                        <td className="p-3">
                          <Button aria-label="Elimina movimento"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              if (confirm("Eliminare questo movimento?")) {
                                deleteMovimento.mutate(m.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(movimenti ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          Nessun incasso registrato
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scadenzario">
          {/* Mobile: righe da ~52px, testo 13/11px, giorni al posto del badge. */}
          <div className="space-y-2 max-sm:space-y-1">
            {scadenzario.length === 0 && (
              <div className="text-center py-12 text-muted-foreground max-sm:py-4 max-sm:text-xs">Nessuna scadenza aperta</div>
            )}
            {scadenzario.map((d) => (
              <div
                key={d.id}
                className={cn("flex items-center justify-between p-3 rounded-md cursor-pointer max-sm:gap-2 max-sm:px-3 max-sm:py-2", urgencyStyles[d.urgency])}
                onClick={() => navigate(`/azienda/documenti/${d.id}/dettaglio`)}
              >
                <div className="flex items-center gap-4 max-sm:min-w-0">
                  <div className="max-sm:min-w-0">
                    <p className="font-medium text-sm max-sm:truncate max-sm:text-[13px] max-sm:leading-tight">{d.cliente_snapshot?.ragione_sociale}</p>
                    <p className="text-xs text-muted-foreground max-sm:text-[11px]">N° {d.numero}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm max-sm:shrink-0 max-sm:gap-2">
                  <div className="text-right">
                    <p className="font-mono max-sm:font-sans max-sm:text-[13px] max-sm:font-semibold max-sm:leading-tight">{formatCurrency(d.totale_da_pagare - d.importo_pagato)}</p>
                    <p className="text-xs text-muted-foreground max-sm:text-[11px]">Scad. {formatDateIt(d.data_scadenza)}</p>
                  </div>
                  <Badge className="max-sm:hidden" variant={d.urgency === "scaduta" ? "destructive" : d.urgency === "oggi" ? "outline" : "secondary"}>
                    {d.urgency === "scaduta" ? `${Math.abs(d.diff)} gg fa` : d.urgency === "oggi" ? "Oggi" : `tra ${d.diff} gg`}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
