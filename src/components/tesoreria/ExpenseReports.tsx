import { useRef, useState } from "react";
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
import { Receipt, Plus, Trash2, CheckCircle2, XCircle, Clock, Send, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { formatTreasuryCurrency, isChronologicalDateRange, parsePositiveAmount, toFiniteAmount } from "@/lib/treasury";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const formatEur = (val: unknown) => formatTreasuryCurrency(val, "€0,00");

// Data odierna in formato ISO (yyyy-MM-dd) ora locale, indipendente dal locale del browser.
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const statusConfig: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  draft: { label: "Bozza", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", icon: Clock },
  submitted: { label: "Inviata", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Send },
  approved: { label: "Approvata", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  rejected: { label: "Rifiutata", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
  reimbursed: { label: "Rimborsata", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: CheckCircle2 },
};

type Report = Tables<"expense_reports">;
type Transizione = "submitted" | "approved" | "rejected" | "reimbursed" | "draft";
const descrizioneEsito: Record<Transizione, string> = {
  submitted: "Nota spese inviata per approvazione",
  approved: "Nota spese approvata",
  rejected: "Nota spese rifiutata",
  reimbursed: "Rimborso associato al movimento",
  draft: "Nota spese riaperta",
};
const dataOra = (data: string) => new Date(data).toLocaleString(intlCampo(), { dateStyle: "short", timeStyle: "short" });

interface Props {
  companyId: string;
  refreshKey?: number;
}

export default function ExpenseReports(props: Props) {
  return <NoteSpeseAzienda key={props.companyId} {...props} />;
}

function NoteSpeseAzienda({ companyId, refreshKey = 0 }: Props) {
  const t = useT();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newReport, setNewReport] = useState({ title: "", description: "", period_from: "", period_to: "" });

  // Detail view
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportItems, setReportItems] = useState<Tables<"expense_report_items">[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", amount: "", category: "Trasferte", expense_date: todayIso() });
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const aggiuntaInCorso = useRef(false);
  const transizioneInCorso = useRef(false);
  const { isAdmin } = usePermissions();
  const [revisione, setRevisione] = useState<"approved" | "rejected" | "reimbursed" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [movimento, setMovimento] = useState("");
  const importoRimborso = toFiniteAmount(selectedReport?.total_amount);
  const valutaRimborso = selectedReport?.currency || "EUR";
  const movimenti = useQuery({
    queryKey: ["movimenti-rimborso-nota-spese", companyId, importoRimborso, valutaRimborso],
    enabled: revisione === "reimbursed" && isAdmin && !!companyId && importoRimborso > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_transactions").select("id, booking_date, description")
        .eq("company_id", companyId).eq("status", "booked").eq("currency", valutaRimborso)
        .eq("amount", -importoRimborso).not("booking_date", "is", null)
        .order("booking_date", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const autori = [selectedReport?.reviewed_by, selectedReport?.reimbursed_by].filter((id): id is string => !!id);
  const { data: profili } = useQuery({
    queryKey: ["autori-nota-spese", companyId, autori],
    enabled: autori.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name").in("id", autori);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
    },
  });
  const tentativoVoce = useRef<{ id: string; reportId: string; companyId: string } | null>(null);

  const lista = useQuery({
    queryKey: ["note-spese", companyId, refreshKey],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_reports").select("*")
        .eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const reports = lista.data ?? [];
  const loading = lista.isLoading;
  const loadError = lista.isError ? (lista.error?.message || t("Impossibile caricare le note spese")) : null;
  const loadReports = lista.refetch;

  async function handleCreate() {
    if (!newReport.title.trim()) { toast.error(t("Inserisci il titolo della nota spese")); return; }
    if (!isChronologicalDateRange(newReport.period_from, newReport.period_to)) {
      toast.error(t("L'intervallo del periodo non è valido"));
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
      toast.success(t("Nota spese creata"));
      setShowCreate(false);
      setNewReport({ title: "", description: "", period_from: "", period_to: "" });
      await loadReports();
      await openDetail(data);
    } finally {
      setIsCreating(false);
    }
  }

  async function openDetail(report: Report) {
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
    } catch (errore) {
      const descrizione = typeof errore === "object" && errore && "message" in errore ? String(errore.message) : undefined;
      toast.error(t("Errore caricamento dettaglio nota spese"), { description: descrizione });
      setReportItems([]);
    }
  }

  async function handleAddItem() {
    if (aggiuntaInCorso.current) return;
    if (!selectedReport?.id) { toast.error(t("Nota spese non disponibile")); return; }
    if (!newItem.description.trim()) { toast.error(t("Inserisci la descrizione della spesa")); return; }
    const amount = parsePositiveAmount(newItem.amount);
    if (!amount) { toast.error(t("Inserisci un importo maggiore di zero")); return; }
    if (!newItem.expense_date) { toast.error(t("Inserisci la data della spesa")); return; }

    if (tentativoVoce.current?.reportId !== selectedReport.id || tentativoVoce.current.companyId !== companyId) {
      tentativoVoce.current = { id: crypto.randomUUID(), reportId: selectedReport.id, companyId };
    }
    const riga = {
      id: tentativoVoce.current.id,
      report_id: selectedReport.id,
      company_id: companyId,
      description: newItem.description.trim(),
      amount,
      category: newItem.category,
      expense_date: newItem.expense_date,
    };

    aggiuntaInCorso.current = true;
    setIsAddingItem(true);
    try {
      const { error } = await supabase.from("expense_report_items").insert(riga);
      if (error?.code === "23505") {
        const { data: registrata, error: lettura } = await supabase.from("expense_report_items")
          .select("description, amount, category, expense_date")
          .eq("company_id", companyId).eq("report_id", selectedReport.id).eq("id", riga.id).maybeSingle();
        if (lettura || !registrata) throw lettura ?? error;
        if (registrata.description !== riga.description || Number(registrata.amount) !== riga.amount
          || registrata.category !== riga.category || registrata.expense_date !== riga.expense_date) {
          tentativoVoce.current = null;
          await openDetail(selectedReport);
          await loadReports();
          toast.error(t("Il primo invio è già registrato. Controlla la voce prima di aggiungerne un’altra."));
          return;
        }
      } else if (error) {
        throw error;
      }

      tentativoVoce.current = null;
      toast.success(t("Voce aggiunta"));
      setShowAddItem(false);
      setNewItem({ description: "", amount: "", category: "Trasferte", expense_date: todayIso() });
      await openDetail(selectedReport);
      await loadReports();
    } catch (errore) {
      toast.error(t("Impossibile confermare il salvataggio della voce"), {
        description: typeof errore === "object" && errore !== null && "message" in errore
          ? String(errore.message) : t("Riprova dallo stesso modulo."),
      });
    } finally {
      aggiuntaInCorso.current = false;
      setIsAddingItem(false);
    }
  }

  async function cambiaStato(report: Report, stato: Transizione) {
    if (transizioneInCorso.current) return;
    if (stato === "submitted" && toFiniteAmount(report.total_amount) <= 0) {
      toast.error(t("Aggiungi almeno una voce prima di inviare la nota spese"));
      return;
    }
    if (stato === "rejected" && !motivo.trim()) return;
    if (stato === "reimbursed" && !movimento) return;

    transizioneInCorso.current = true;
    setSubmittingId(report.id);
    try {
      const patch = {
        status: stato,
        ...(stato === "approved" || stato === "rejected" ? { review_reason: motivo.trim() || null } : {}),
        ...(stato === "reimbursed" ? { reimbursement_transaction_id: movimento } : {}),
      };
      const { data, error } = await supabase.from("expense_reports").update(patch)
        .eq("company_id", companyId).eq("id", report.id).eq("status", report.status)
        .eq("updated_at", report.updated_at).select("*").maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.warning(t("Nota spese aggiornata da un’altra scheda"), { description: t("Controlla lo stato corrente prima di procedere.") });
        if (selectedReport?.id === report.id) await openDetail(report);
      } else {
        toast.success(t(descrizioneEsito[stato]));
        if (selectedReport?.id === report.id) setSelectedReport(data);
      }
      setRevisione(null);
      await loadReports();
    } catch (errore) {
      const descrizione = typeof errore === "object" && errore && "message" in errore ? String(errore.message) : undefined;
      toast.error(t("Aggiornamento della nota spese non confermato"), { description: descrizione });
    } finally {
      transizioneInCorso.current = false;
      setSubmittingId(null);
    }
  }

  function apriRevisione(stato: "approved" | "rejected" | "reimbursed") {
    setMotivo("");
    setMovimento("");
    setRevisione(stato);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase
      .from("expense_reports")
      .delete()
      .eq("id", deleteId)
      .eq("company_id", companyId);
    if (error) {
      toast.error(t("Errore eliminazione: {errore}", { errore: error.message }));
      return;
    }
    toast.success(t("Nota spese eliminata"));
    setDeleteId(null);
    if (selectedReport?.id === deleteId) setSelectedReport(null);
    await loadReports();
  }

  async function handleDeleteItem(itemId: string) {
    if (!selectedReport) return;
    const { error } = await supabase
      .from("expense_report_items")
      .delete()
      .eq("id", itemId)
      .eq("company_id", companyId);
    if (error) {
      toast.error(t("Errore eliminazione voce: {errore}", { errore: error.message }));
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
          <Receipt className="h-4 w-4" /> {t("Note Spese")}
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("Nuova Nota Spese")}
        </Button>
      </div>

      {loadError && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadReports()}>{t("Riprova")}</Button>
          </CardContent>
        </Card>
      )}

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("Nessuna nota spese")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("Registra le spese aziendali per tenerle sempre sotto controllo.")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> {t("Crea prima nota spese")}
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
                        <Badge className={st.color} variant="secondary"><Icon className="h-3 w-3 mr-1" /> {t(st.label)}</Badge>
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
                          onClick={(e) => { e.stopPropagation(); cambiaStato(report, "submitted"); }}
                        >
                          {submittingId === report.id ? (
                            <span className="h-3 w-3 mr-1 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" aria-hidden="true" />
                          )}
                          {submittingId === report.id ? t("Invio...") : t("Invia")}
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
          <DialogHeader><DialogTitle>{t("Nuova Nota Spese")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>{t("Titolo")}</Label><Input placeholder={t("Es: Trasferta Milano - Marzo 2026")} value={newReport.title} onChange={(e) => setNewReport({ ...newReport, title: e.target.value })} /></div>
            <div><Label>{t("Descrizione")}</Label><Textarea placeholder={t("Note opzionali...")} value={newReport.description} onChange={(e) => setNewReport({ ...newReport, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Da")}</Label><Input type="date" value={newReport.period_from} onChange={(e) => setNewReport({ ...newReport, period_from: e.target.value })} /></div>
              <div><Label>A</Label><Input type="date" value={newReport.period_to} onChange={(e) => setNewReport({ ...newReport, period_to: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isCreating}>{t("Annulla")}</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <span className="h-3.5 w-3.5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}
              {isCreating ? t("Creazione...") : t("Crea")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => { if (!open && !submittingId) { setSelectedReport(null); setRevisione(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedReport?.title}
              {selectedReport && (
                <Badge className={statusConfig[selectedReport.status]?.color} variant="secondary">
                  {t(statusConfig[selectedReport.status]?.label ?? "")}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-lg font-bold">{formatEur(selectedReport?.total_amount || 0)}</p>
              {selectedReport?.status === "draft" && (
                <Button size="sm" onClick={() => setShowAddItem(true)}><Plus className="h-4 w-4 mr-1" /> {t("Aggiungi Voce")}</Button>
              )}
            </div>
            {selectedReport?.reviewed_at && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p>{t("Ultima revisione · {reviewed_at}", { reviewed_at: String(dataOra(selectedReport.reviewed_at) ?? "") })}</p>
                {selectedReport.reviewed_by && <p className="text-muted-foreground">{profili?.[selectedReport.reviewed_by] || selectedReport.reviewed_by}</p>}
                {selectedReport.review_reason && <p className="mt-1 whitespace-pre-wrap">{selectedReport.review_reason}</p>}
                {selectedReport.status === "rejected" && <p className="mt-2 text-muted-foreground">{t("Riapri la nota per correggere le voci e inviarla di nuovo.")}</p>}
              </div>
            )}
            {selectedReport?.reimbursed_at && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p>{t("Rimborso registrato · {reimbursed_at}", { reimbursed_at: String(dataOra(selectedReport.reimbursed_at) ?? "") })}</p>
                {selectedReport.reimbursed_by && <p className="text-muted-foreground">{profili?.[selectedReport.reimbursed_by] || selectedReport.reimbursed_by}</p>}
                <p className="break-all text-muted-foreground">{t("Movimento {reimbursement_transaction_id}", { reimbursement_transaction_id: String(selectedReport.reimbursement_transaction_id ?? "") })}</p>
              </div>
            )}
            {reportItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">{t("Nessuna voce. Aggiungi le spese alla nota.")}</p>
            ) : (
              <div className="space-y-2">
                {reportItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{t(item.category)}</Badge>
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
          {selectedReport && (
            <DialogFooter className="flex-wrap">
              {selectedReport.status === "rejected" && (
                <Button variant="outline" disabled={!!submittingId} onClick={() => void cambiaStato(selectedReport, "draft")}>{t("Riapri per correggere")}</Button>
              )}
              {isAdmin && selectedReport.status === "submitted" && (
                <>
                  <Button variant="outline" onClick={() => apriRevisione("rejected")}>{t("Rifiuta")}</Button>
                  <Button onClick={() => apriRevisione("approved")}>{t("Approva")}</Button>
                </>
              )}
              {isAdmin && selectedReport.status === "approved" && (
                <Button onClick={() => apriRevisione("reimbursed")}>{t("Registra rimborso")}</Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!revisione} onOpenChange={(open) => { if (!open && !submittingId) setRevisione(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revisione === "approved" ? t("Approva nota spese") : revisione === "rejected" ? t("Rifiuta nota spese") : t("Registra rimborso")}</DialogTitle>
          </DialogHeader>
          {revisione === "reimbursed" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("Associa l’uscita già contabilizzata per {importoRimborso}.", { importoRimborso: formatEur(importoRimborso) })}</p>
              <Label htmlFor="rimborso-nota-movimento">{t("Movimento bancario")}</Label>
              <Select value={movimento} onValueChange={setMovimento}>
                <SelectTrigger id="rimborso-nota-movimento"><SelectValue placeholder={t("Scegli il movimento")} /></SelectTrigger>
                <SelectContent>
                  {movimenti.data?.map((m) => <SelectItem key={m.id} value={m.id}>{m.booking_date} · {m.description || m.id}</SelectItem>)}
                </SelectContent>
              </Select>
              {movimenti.isLoading && <p role="status" className="text-sm">{t("Caricamento movimenti…")}</p>}
              {movimenti.isError && <Button variant="link" onClick={() => void movimenti.refetch()}>{t("Riprova lettura movimenti")}</Button>}
              {movimenti.isSuccess && movimenti.data.length === 0 && <p className="text-sm">{t("Nessuna uscita contabilizzata con lo stesso importo e valuta.")}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="nota-spese-motivo">{revisione === "rejected" ? t("Motivo del rifiuto") : t("Nota di approvazione (facoltativa)")}</Label>
              <Textarea id="nota-spese-motivo" maxLength={2000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={!!submittingId} onClick={() => setRevisione(null)}>{t("Annulla")}</Button>
            <Button disabled={!!submittingId || (revisione === "rejected" && !motivo.trim()) || (revisione === "reimbursed" && !movimento)}
              onClick={() => { if (revisione && selectedReport) void cambiaStato(selectedReport, revisione); }}>
              {t("Conferma")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Aggiungi Voce Spesa")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>{t("Descrizione")}</Label><Input placeholder={t("Es: Pranzo con cliente")} value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Importo (EUR)")}</Label><Input type="number" min="0.01" step="0.01" placeholder="0.00" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} /></div>
              <div><Label>{t("Data")}</Label><Input type="date" value={newItem.expense_date} onChange={(e) => setNewItem({ ...newItem, expense_date: e.target.value })} /></div>
            </div>
            <div>
              <Label>{t("Categoria")}</Label>
              <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Trasferte", "Ristorazione", "Trasporti", "Alloggio", "Materiali", "Altro"].map((c) => (
                    <SelectItem key={c} value={c}>{t(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)} disabled={isAddingItem}>{t("Annulla")}</Button>
            <Button onClick={handleAddItem} disabled={isAddingItem}>
              {isAddingItem && <span className="h-3.5 w-3.5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}
              {isAddingItem ? t("Aggiunta...") : t("Aggiungi")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Elimina nota spese")}</AlertDialogTitle>
            <AlertDialogDescription>{t("La nota spese e tutte le sue voci verranno eliminate.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("Elimina")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
