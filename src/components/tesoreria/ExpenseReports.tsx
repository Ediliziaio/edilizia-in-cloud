import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Receipt, Plus, Trash2, Eye, CheckCircle2, XCircle, Clock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const formatEur = (val: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(val);

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Bozza", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", icon: Clock },
  submitted: { label: "Inviata", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Send },
  approved: { label: "Approvata", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  rejected: { label: "Rifiutata", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
  reimbursed: { label: "Rimborsata", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: CheckCircle2 },
};

interface Props {
  companyId: string;
}

export default function ExpenseReports({ companyId }: Props) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newReport, setNewReport] = useState({ title: "", description: "", period_from: "", period_to: "" });

  // Detail view
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [reportItems, setReportItems] = useState<any[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", amount: "", category: "Trasferte", expense_date: new Date().toISOString().split("T")[0] });

  useEffect(() => {
    if (companyId) loadReports();
  }, [companyId]);

  async function loadReports() {
    setLoading(true);
    const { data } = await supabase
      .from("expense_reports")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setReports(data || []);
    setLoading(false);
  }

  async function handleCreate() {
    if (!newReport.title.trim()) { toast.error("Inserisci un titolo"); return; }
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
    loadReports();
    openDetail(data);
  }

  async function openDetail(report: any) {
    setSelectedReport(report);
    const { data } = await supabase
      .from("expense_report_items")
      .select("*")
      .eq("report_id", report.id)
      .order("expense_date", { ascending: false });
    setReportItems(data || []);
  }

  async function handleAddItem() {
    if (!newItem.description.trim() || !newItem.amount) { toast.error("Compila tutti i campi"); return; }
    const { error } = await supabase.from("expense_report_items").insert({
      report_id: selectedReport.id,
      company_id: companyId,
      description: newItem.description,
      amount: parseFloat(newItem.amount),
      category: newItem.category,
      expense_date: newItem.expense_date,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Voce aggiunta");
    setShowAddItem(false);
    setNewItem({ description: "", amount: "", category: "Trasferte", expense_date: new Date().toISOString().split("T")[0] });
    openDetail(selectedReport);
    loadReports(); // aggiorna totale
  }

  async function handleSubmit(reportId: string) {
    await supabase.from("expense_reports").update({ status: "submitted" }).eq("id", reportId);
    toast.success("Nota spese inviata per approvazione");
    loadReports();
    if (selectedReport?.id === reportId) setSelectedReport({ ...selectedReport, status: "submitted" });
  }

  async function handleDelete() {
    if (!deleteId) return;
    await supabase.from("expense_reports").delete().eq("id", deleteId);
    setDeleteId(null);
    if (selectedReport?.id === deleteId) setSelectedReport(null);
    loadReports();
  }

  async function handleDeleteItem(itemId: string) {
    await supabase.from("expense_report_items").delete().eq("id", itemId);
    openDetail(selectedReport);
    loadReports();
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

      {reports.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nessuna nota spese</CardContent></Card>
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
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleSubmit(report.id); }}>
                          <Send className="h-3 w-3 mr-1" /> Invia
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
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annulla</Button>
            <Button onClick={handleCreate}>Crea</Button>
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
              <div><Label>Importo (EUR)</Label><Input type="number" step="0.01" placeholder="0.00" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} /></div>
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
            <Button variant="outline" onClick={() => setShowAddItem(false)}>Annulla</Button>
            <Button onClick={handleAddItem}>Aggiungi</Button>
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
