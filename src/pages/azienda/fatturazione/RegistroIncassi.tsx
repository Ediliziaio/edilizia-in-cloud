import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, isPast, isToday, addDays } from "date-fns";
import { it } from "date-fns/locale";
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
import { CalendarIcon, Plus, Trash2, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const METODI = [
  { value: "bonifico", label: "Bonifico" },
  { value: "contanti", label: "Contanti" },
  { value: "assegno", label: "Assegno" },
  { value: "carta", label: "Carta" },
  { value: "riba", label: "RiBa" },
  { value: "sdd", label: "SDD" },
];

export default function RegistroIncassi() {
  const navigate = useNavigate();
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
    stato: ["emessa", "parzialmente_pagata"],
  });
  const unpaidInvoices = invoicesData?.documenti ?? [];

  // All invoices for scadenzario
  const { data: allInvoicesData } = useDocumentiFiscali({});
  const allInvoices = allInvoicesData?.documenti ?? [];

  // KPIs
  const kpis = useMemo(() => {
    const movs = movimenti ?? [];
    const incassatoMese = movs
      .filter((m) => m.data_movimento >= monthStart && m.data_movimento <= monthEnd && m.tipo === "incasso")
      .reduce((sum, m) => sum + m.importo, 0);
    const daIncassare = unpaidInvoices.reduce((sum, d) => sum + (d.totale_da_pagare - d.importo_pagato), 0);
    const scaduto = allInvoices
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
    createMovimento.mutate(
      {
        documento_id: formDocId,
        importo: parseFloat(formImporto),
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Registro Incassi</h1>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Registra Incasso
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[480px] sm:w-[480px]">
            <SheetHeader>
              <SheetTitle>Registra Incasso</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div>
                <Label className="text-sm">Fattura</Label>
                <Select value={formDocId} onValueChange={handleSelectInvoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona fattura..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unpaidInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.numero} — {inv.cliente_snapshot?.ragione_sociale} — € {(inv.totale_da_pagare - inv.importo_pagato).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Importo €</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formImporto}
                  onChange={(e) => setFormImporto(e.target.value)}
                />
                {formImporto && parseFloat(formImporto) < maxImporto && (
                  <p className="text-xs text-amber-600 mt-1">
                    Incasso parziale — residuo: € {(maxImporto - parseFloat(formImporto)).toFixed(2)}
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
                <Label className="text-sm">Riferimento (CRO, n. assegno...)</Label>
                <Input value={formRiferimento} onChange={(e) => setFormRiferimento(e.target.value)} />
              </div>

              <div>
                <Label className="text-sm">Note</Label>
                <Input value={formNote} onChange={(e) => setFormNote(e.target.value)} />
              </div>

              <Button
                className="w-full"
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

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Incassato (mese)</p>
            <p className="text-lg font-semibold text-emerald-600">€ {kpis.incassatoMese.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Da incassare</p>
            <p className="text-lg font-semibold">€ {kpis.daIncassare.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Scaduto</p>
            <p className="text-lg font-semibold text-destructive">€ {kpis.scaduto.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Saldo netto</p>
            <p className="text-lg font-semibold">€ {kpis.saldo.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="incassi">Incassi</TabsTrigger>
          <TabsTrigger value="scadenzario">Scadenzario</TabsTrigger>
        </TabsList>

        <TabsContent value="incassi">
          {movLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
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
                        <td className="p-3">{m.data_movimento}</td>
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
                        <td className="p-3 text-right font-mono">€ {m.importo.toFixed(2)}</td>
                        <td className="p-3 capitalize">{m.metodo ?? "—"}</td>
                        <td className="p-3">{m.riferimento ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{m.note ?? "—"}</td>
                        <td className="p-3">
                          <Button
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
          <div className="space-y-2">
            {scadenzario.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">Nessuna scadenza aperta</div>
            )}
            {scadenzario.map((d) => (
              <div
                key={d.id}
                className={cn("flex items-center justify-between p-3 rounded-md cursor-pointer", urgencyStyles[d.urgency])}
                onClick={() => navigate(`/azienda/documenti/${d.id}/dettaglio`)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-sm">{d.cliente_snapshot?.ragione_sociale}</p>
                    <p className="text-xs text-muted-foreground">N° {d.numero}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <p className="font-mono">€ {(d.totale_da_pagare - d.importo_pagato).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Scad. {d.data_scadenza}</p>
                  </div>
                  <Badge variant={d.urgency === "scaduta" ? "destructive" : d.urgency === "oggi" ? "outline" : "secondary"}>
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
