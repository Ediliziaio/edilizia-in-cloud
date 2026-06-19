import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Receipt, Plus, Trash2, CheckCircle2, XCircle, Clock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatTreasuryCurrency, isChronologicalDateRange, parsePositiveAmount, toFiniteAmount } from "@/lib/treasury";

const formatEur = (val: unknown) => formatTreasuryCurrency(val, "€0,00");

// Data odierna in formato ISO (yyyy-MM-dd) ora locale, indipendente dal locale del browser.
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Bozza", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", icon: Clock },
  submitted: { label: "Inviata", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Send },
  approved: { label: "Approvata", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  rejected: { label: "Rifiutata", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
  reimbursed: { label: "Rimborsata", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: CheckCircle2 },
};

interface Props {
  companyId: string;
  refreshKey?: number;
}

export default function ExpenseReports({ companyId, refreshKey = 0 }: Props) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newReport, setNewReport] = useState({ title: "", description: "", period_from: "", period_to: "" });

  // Detail view
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [reportItems, setReportItems] = useState<any[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", amount: "", category: "Trasferte", expense_date: todayIso() });
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);

  useEffect(() => {
    if (companyId) void loadReports();
    else {
      setReports([]);
      setLoading(false);
    }
  }, [companyId, refreshKey]);

  async function loadReports() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("expense_reports")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReports(data || []);
    } catch (e: any) {
      setLoadError(e.message || "Impossibile caricare le note spese");
      toast.error("Errore caricamento note spese");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newReport.title.trim()) { toast.error("Inserisci il titolo della nota spese"); return; }
    if (!isChronologicalDateRange(newReport.period_from, newReport.period_to)) {
      toast.error("L'intervallo del periodo non è valido");
      return;
    }
    setIsCreating(true);
    try {
      const { data, error } = await supabase.from("expense_reports").insert({
        company_id: companyId,
        title: newReport.title,
        description: newReport.description || null,
        period_from: newReport.period_from || null,
        period_to: newReport.period_to || null,
      }).select("*").single();
      if (error) { toast.error(error.message); return; }
      toast.success("Nota spese creata");
      setShowCreate(false);
      setNewReport({ title: "", description: "", period_from: "", period_to: "" });
      await loadReports();
      await openDetail(data);
    } finally {
      setIsCreating(false);
    }
  }

  async function openDetail(report: any) {
    setSelectedReport(report);
    try {
      const [{ data: itemsData, error: itemsError }, { data: freshReport, error: reportError }] = await Promise.all([
        supabase
          .from("expense_report_items")
          .select("*")
          .eq("company_id", companyId)
          .eq("report_id", report.id)
          .order("expense_date", { ascending: false }),
        supabase
          .from("expense_reports")
          .select("*")
          .eq("company_id", companyId)
          .eq("id", report.id)
          .maybeSingle(),
      ]);
      if (itemsError) throw itemsError;
      if (reportError) throw reportError;
      if (freshReport) setSelectedReport(freshReport);
      setReportItems(itemsData || []);
    } catch (e: any) {
      toast.error("Errore caricamento dettaglio nota spese: " + e.message);
      setReportItems([]);
    }
  }

  async function handleAddItem() {
    if (!selectedReport?.id) { toast.error("Nota spese non disponibile"); return; }
    if (!newItem.description.trim()) { toast.error("Inserisci la descrizione della spesa"); return; }
    const amount = parsePositiveAmount(newItem.amount);
    if (!amount) { toast.error("Inserisci un importo maggiore di zero"); return; }
    if (!newItem.expense_date) { toast.error("Inserisci la data della spesa"); return; }
    setIsAddingItem(true);
    try {
      const { error } = await supabase.from("expense_report_items").insert({
        report_id: selectedReport.id,
        company_id: companyId,
        description: newItem.description,
        amount,
        category: newItem.category,
        expense_date: newItem.expense_date,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Voce aggiunta");
      setShowAddItem(false);
      setNewItem({ description: "", amount: "", category: "Trasferte", expense_date: todayIso() });
      await openDetail(selectedReport);
      await loadReports();
    } finally {
      setIsAddingItem(false);
    }
  }

  async function handleSubmit(reportId: string) {
    const targetReport = reports.find((report) => report.id === reportId) || selectedReport;
    if (toFiniteAmount(targetReport?.total_amount) <= 0) {
      toast.error("Aggiungi almeno una voce prima di inviare la nota spese");
      return;
    }

    setSubmittingId(reportId);
    try {
      const { error } = await supabase
        .from("expense_reports")
        .update({ status: "submitted" })
        .eq("id", reportId)
        .eq("company_id", companyId);
      if (error) { toast.error("Errore nell'invio: " + error.message); return; }
      toast.success("Nota spese inviata per approvazione");
      await loadReports();
      if (selectedReport?.id === reportId) setSelectedReport({ ...selectedReport, status: "submitted" });
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase
      .from("expense_reports")
      .delete()
      .eq("id", deleteId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Errore eliminazione: " + error.message);
      return;
    }
    toast.success("Nota spese eliminata");
    setDeleteId(null);
    if (selectedReport?.id === deleteId) setSelectedReport(null);
    await loadReports();
  }

  async function handleDeleteItem(itemId: string) {
    const { error } = await supabase
      .from("expense_report_items")
      .delete()
      .eq("id", itemId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Errore eliminazione voce: " + error.message);
      return;
    }
    await openDetail(selectedReport);
    await loadReports();
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Note Spese
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Nota Spese
        </Button>
      </div>

      {loadError && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadReports()}>Riprova</Button>
          </CardContent>
        </Card>
      )}

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Nessuna nota spese</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Registra le spese aziendali per tenerle sempre sotto controllo.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Crea prima nota spese
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const st = statusConfig[report.status] || statusConfig.draft;
            const Icon = st.icon;
            return (
              <Card key={report.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openDetail(report)}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{report.title}</p>
                      <div className="flex gap-2 mt-1 items-center">
                        <Badge className={st.color} variant="secondary"><Icon className="h-3 w-3 mr-1" /> {st.label}</Badge>
                        <span className="text-sm font-semibold">{formatEur(report.total_amount || 0)}</span>
                        {report.period_from && (
                          <span className="text-xs text-muted-foreground">{report.period_from} — {report.period_to || "..."}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {report.status === "draft" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={submittingId === report.id}
                          onClick={(e) => { e.stopPropagation(); handleSubmit(report.id); }}
                        >
                          {submittingId === report.id ? (
                            <span className="h-3 w-3 mr-1 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" aria-hidden="true" />
                          )}
                          {submittingId === report.id ? "Invio..." : "Invia"}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteId(report.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuova Nota Spese</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Titolo</Label><Input placeholder="Es: Trasferta Milano - Marzo 2026" value={newReport.title} onChange={(e) => setNewReport({ ...newReport, title: e.target.value })} /></div>
            <div><Label>Descrizione</Label><Textarea placeholder="Note opzionali..." value={newReport.description} onChange={(e) => setNewReport({ ...newReport, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Da</Label><Input type="date" value={newReport.period_from} onChange={(e) => setNewReport({ ...newReport, period_from: e.target.value })} /></div>
              <div><Label>A</Label><Input type="date" value={newReport.period_to} onChange={(e) => setNewReport({ ...newReport, period_to: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isCreating}>Annulla</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <span className="h-3.5 w-3.5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}
              {isCreating ? "Creazione..." : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedReport?.title}
              {selectedReport && (
                <Badge className={statusConfig[selectedReport.status]?.color} variant="secondary">
                  {statusConfig[selectedReport.status]?.label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-lg font-bold">{formatEur(selectedReport?.total_amount || 0)}</p>
              {selectedReport?.status === "draft" && (
                <Button size="sm" onClick={() => setShowAddItem(true)}><Plus className="h-4 w-4 mr-1" /> Aggiungi Voce</Button>
              )}
            </div>
            {reportItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">Nessuna voce. Aggiungi le spese alla nota.</p>
            ) : (
              <div className="space-y-2">
                {reportItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                        <span className="text-xs text-muted-foreground">{item.expense_date}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{formatEur(item.amount)}</span>
                      {selectedReport?.status === "draft" && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aggiungi Voce Spesa</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Descrizione</Label><Input placeholder="Es: Pranzo con cliente" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Importo (EUR)</Label><Input type="number" min="0.01" step="0.01" placeholder="0.00" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} /></div>
              <div><Label>Data</Label><Input type="date" value={newItem.expense_date} onChange={(e) => setNewItem({ ...newItem, expense_date: e.target.value })} /></div>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Trasferte", "Ristorazione", "Trasporti", "Alloggio", "Materiali", "Altro"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)} disabled={isAddingItem}>Annulla</Button>
            <Button onClick={handleAddItem} disabled={isAddingItem}>
              {isAddingItem && <span className="h-3.5 w-3.5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}
              {isAddingItem ? "Aggiunta..." : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina nota spese</AlertDialogTitle>
            <AlertDialogDescription>La nota spese e tutte le sue voci verranno eliminate.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
