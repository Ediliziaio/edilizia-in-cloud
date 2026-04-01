import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Download, Loader2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const STATO_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  emesso: "bg-blue-100 text-blue-800",
  pagato: "bg-green-100 text-green-800",
};

const STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  emesso: "Emesso",
  pagato: "Pagato",
};

interface CedolinoForm {
  employee_name: string;
  mese: string;
  anno: string;
  lordo: string;
  contributi_dipendente: string;
  contributi_datore: string;
  ritenute_irpef: string;
  stato: "bozza" | "emesso" | "pagato";
  note: string;
}

const emptyForm = (): CedolinoForm => ({
  employee_name: "",
  mese: String(new Date().getMonth() + 1),
  anno: String(new Date().getFullYear()),
  lordo: "",
  contributi_dipendente: "",
  contributi_datore: "",
  ritenute_irpef: "",
  stato: "bozza",
  note: "",
});

export function TabCedolini() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CedolinoForm>(emptyForm());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [isExporting, setIsExporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState("");

  const { data: cedolini = [], isLoading } = useQuery({
    queryKey: ["cedolini", companyId, filterYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cedolini")
        .select("*")
        .eq("company_id", companyId!)
        .eq("anno", parseInt(filterYear))
        .order("mese", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const computedNetto = () => {
    const lordo = parseFloat(form.lordo) || 0;
    const contrib = parseFloat(form.contributi_dipendente) || 0;
    const irpef = parseFloat(form.ritenute_irpef) || 0;
    return lordo - contrib - irpef;
  };

  const [isFetchingOre, setIsFetchingOre] = useState(false);

  const autoFetchOre = async () => {
    if (!form.employee_name.trim()) {
      toast.error("Inserisci prima il nome del dipendente");
      return;
    }
    setIsFetchingOre(true);
    try {
      const mese = parseInt(form.mese);
      const anno = parseInt(form.anno);
      const inizioMese = `${anno}-${String(mese).padStart(2, "0")}-01`;
      const fineMese = new Date(anno, mese, 0).toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("presenze")
        .select("ore_lavorate, tipo")
        .eq("company_id", companyId!)
        .ilike("dipendente_nome", `%${form.employee_name.trim()}%`)
        .gte("data", inizioMese)
        .lte("data", fineMese);

      if (error) { toast.error("Errore nel recupero delle presenze"); return; }
      if (!data || data.length === 0) {
        toast.info(`Nessuna presenza trovata per ${form.employee_name} nel ${MESI[mese - 1]} ${anno}`);
        return;
      }

      const totalOre = data.reduce((sum: number, p: any) => sum + (p.ore_lavorate || 0), 0);
      const oreStraordinario = data
        .filter((p: any) => p.tipo === "straordinario")
        .reduce((sum: number, p: any) => sum + (p.ore_lavorate || 0), 0);

      toast.success(
        `Trovate ${totalOre.toFixed(1)} ore (di cui ${oreStraordinario.toFixed(1)} h straordinario)`
      );
    } finally {
      setIsFetchingOre(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.employee_name.trim()) throw new Error("Nome dipendente obbligatorio");
      if (!form.lordo) throw new Error("Lordo obbligatorio");
      const { error } = await supabase.from("cedolini").insert({
        company_id: companyId,
        employee_name: form.employee_name.trim(),
        mese: parseInt(form.mese),
        anno: parseInt(form.anno),
        lordo: parseFloat(form.lordo) || 0,
        contributi_dipendente: parseFloat(form.contributi_dipendente) || 0,
        contributi_datore: parseFloat(form.contributi_datore) || 0,
        ritenute_irpef: parseFloat(form.ritenute_irpef) || 0,
        stato: form.stato,
        note: form.note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cedolino creato");
      queryClient.invalidateQueries({ queryKey: ["cedolini", companyId] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase.from("cedolini").update({ stato }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cedolini", companyId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExportPdf = async (cedolino: any) => {
    setIsExporting(true);
    setExportingId(cedolino.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cedolino-pdf", {
        body: { cedolino_id: cedolino.id, company_id: companyId },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto generato");
      const mese = MESI[(cedolino.mese ?? 1) - 1] ?? "";
      setPrintTitle(`Cedolino ${mese} ${cedolino.anno ?? ""}`);
      setPrintHtml(data.html);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
    } finally {
      setIsExporting(false);
      setExportingId(null);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Cedolini Paga</h3>
          <Badge variant="secondary">{cedolini.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Nuovo cedolino
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : cedolini.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Nessun cedolino per il {filterYear}</p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Crea cedolino
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dipendente</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Lordo</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Contributi</TableHead>
                <TableHead className="text-right hidden sm:table-cell">IRPEF</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cedolini.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.employee_name}</TableCell>
                  <TableCell className="text-sm">{MESI[c.mese - 1]} {c.anno}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(c.lordo)}</TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(c.contributi_dipendente)}</TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(c.ritenute_irpef)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatCurrency(c.netto)}</TableCell>
                  <TableCell>
                    <Select value={c.stato} onValueChange={(v) => updateStatoMutation.mutate({ id: c.id, stato: v })}>
                      <SelectTrigger className="h-7 text-xs w-24 border-none p-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["bozza", "emesso", "pagato"] as const).map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{STATO_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleExportPdf(c)}
                      disabled={isExporting && exportingId === c.id}
                      aria-label="Scarica cedolino PDF"
                    >
                      {isExporting && exportingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Cedolino</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Dipendente *</Label>
              <Input
                value={form.employee_name}
                onChange={(e) => setForm((p) => ({ ...p, employee_name: e.target.value }))}
                placeholder="Nome e cognome"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mese</Label>
                <Select value={form.mese} onValueChange={(v) => setForm((p) => ({ ...p, mese: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESI.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Anno</Label>
                <Select value={form.anno} onValueChange={(v) => setForm((p) => ({ ...p, anno: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Carica ore da timbrature */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={autoFetchOre}
              disabled={isFetchingOre}
            >
              {isFetchingOre ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
              )}
              {isFetchingOre ? "Caricamento..." : "Carica ore da timbrature"}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Lordo (€) *</Label>
                <Input type="number" min="0" step="0.01" value={form.lordo} onChange={(e) => setForm((p) => ({ ...p, lordo: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Contributi dip. (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.contributi_dipendente} onChange={(e) => setForm((p) => ({ ...p, contributi_dipendente: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ritenute IRPEF (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.ritenute_irpef} onChange={(e) => setForm((p) => ({ ...p, ritenute_irpef: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Contributi datore (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.contributi_datore} onChange={(e) => setForm((p) => ({ ...p, contributi_datore: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <span className="text-sm font-medium">Netto stimato</span>
              <span className="text-primary font-bold">{formatCurrency(computedNetto())}</span>
            </div>
            <div className="space-y-1">
              <Label>Stato</Label>
              <Select value={form.stato} onValueChange={(v) => setForm((p) => ({ ...p, stato: v as CedolinoForm["stato"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["bozza", "emesso", "pagato"] as const).map((s) => (
                    <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea cedolino"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName={printTitle}
          title={printTitle}
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}
    </div>
  );
}
