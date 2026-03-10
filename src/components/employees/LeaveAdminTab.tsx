import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Check, X, Loader2, Pencil, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const typeLabels: Record<string, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  congedo: "Congedo",
};

export function LeaveAdminTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [rejectDialog, setRejectDialog] = useState<{ id: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState({ ferie: 0, permessi: 0, rol: 0 });

  // Pending requests
  const { data: pendingRequests = [], isLoading: loadingPending } = useQuery({
    queryKey: ["leave-requests-pending", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(id, first_name, last_name)")
        .eq("company_id", companyId!)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // Summary via RPC
  const { data: summaries = [], isLoading: loadingSummary } = useQuery({
    queryKey: ["leave-summary", companyId, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leave_summary", {
        p_company_id: companyId!,
        p_year: selectedYear,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  // Approve/reject mutation
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, approved, note }: {
      requestId: string; approved: boolean; note?: string;
    }) => {
      const { error } = await supabase.rpc("approve_leave_request", {
        p_request_id: requestId,
        p_approved: approved,
        p_rejection_note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["leave-summary"] });
      queryClient.invalidateQueries({ queryKey: ["leave-requests-employee"] });
      toast.success(approved ? "Richiesta approvata" : "Richiesta rifiutata");
      setRejectDialog(null);
      setRejectNote("");
    },
    onError: () => toast.error("Errore nell'elaborazione"),
  });

  // Upsert balance
  const balanceMutation = useMutation({
    mutationFn: async ({ employeeId, ferie, permessi, rol }: {
      employeeId: string; ferie: number; permessi: number; rol: number;
    }) => {
      const { error } = await supabase
        .from("leave_balances")
        .upsert({
          company_id: companyId!,
          employee_id: employeeId,
          year: selectedYear,
          ferie_days_total: ferie,
          permessi_hours_total: permessi,
          rol_hours_total: rol,
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,employee_id,year" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-summary"] });
      toast.success("Saldi aggiornati");
      setEditingBalance(null);
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Richieste in attesa
            {pendingRequests.length > 0 && (
              <Badge variant="secondary">{pendingRequests.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPending ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessuna richiesta in attesa
            </p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req: any) => {
                const emp = req.employee;
                const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                return (
                  <div key={req.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm">{empName}</span>
                      <Badge variant="outline">{typeLabels[req.type] ?? req.type}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(req.start_date), "d MMM yyyy", { locale: it })}
                        {req.start_date !== req.end_date &&
                          ` – ${format(new Date(req.end_date), "d MMM yyyy", { locale: it })}`}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {req.total_days ? `${Number(req.total_days)} gg` : req.total_hours ? `${Number(req.total_hours)} ore` : ""}
                      </span>
                      {req.notes && (
                        <span className="text-xs text-muted-foreground italic truncate max-w-[150px]">
                          "{req.notes}"
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => approveMutation.mutate({ requestId: req.id, approved: true })}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Approva
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRejectDialog({ id: req.id })}
                        disabled={approveMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Rifiuta
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balances Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Saldi dipendenti</CardTitle>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun dipendente trovato
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dipendente</TableHead>
                  <TableHead className="text-center">Ferie (gg)</TableHead>
                  <TableHead className="text-center">Permessi (ore)</TableHead>
                  <TableHead className="text-center">ROL (ore)</TableHead>
                  <TableHead className="text-center">Pendenti</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s: any) => (
                  <TableRow key={s.employee_id}>
                    <TableCell className="font-medium">{s.employee_name}</TableCell>
                    <TableCell className="text-center">
                      {Number(s.ferie_days_remaining)} / {Number(s.ferie_days_total)}
                    </TableCell>
                    <TableCell className="text-center">
                      {Number(s.permessi_hours_remaining)} / {Number(s.permessi_hours_total)}
                    </TableCell>
                    <TableCell className="text-center">
                      {Number(s.rol_hours_remaining)} / {Number(s.rol_hours_total)}
                    </TableCell>
                    <TableCell className="text-center">
                      {Number(s.pending_requests) > 0 && (
                        <Badge variant="secondary">{Number(s.pending_requests)}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Popover
                        open={editingBalance === s.employee_id}
                        onOpenChange={(open) => {
                          if (open) {
                            setEditingBalance(s.employee_id);
                            setBalanceForm({
                              ferie: Number(s.ferie_days_total),
                              permessi: Number(s.permessi_hours_total),
                              rol: Number(s.rol_hours_total),
                            });
                          } else {
                            setEditingBalance(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64" align="end">
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm">Modifica saldi {selectedYear}</h4>
                            <div>
                              <Label className="text-xs">Ferie totali (gg)</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={balanceForm.ferie}
                                onChange={(e) => setBalanceForm({ ...balanceForm, ferie: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Permessi totali (ore)</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={balanceForm.permessi}
                                onChange={(e) => setBalanceForm({ ...balanceForm, permessi: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">ROL totali (ore)</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={balanceForm.rol}
                                onChange={(e) => setBalanceForm({ ...balanceForm, rol: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() =>
                                balanceMutation.mutate({
                                  employeeId: s.employee_id,
                                  ferie: balanceForm.ferie,
                                  permessi: balanceForm.permessi,
                                  rol: balanceForm.rol,
                                })
                              }
                              disabled={balanceMutation.isPending}
                            >
                              {balanceMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : null}
                              Salva
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => { if (!open) { setRejectDialog(null); setRejectNote(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rifiuta richiesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Inserisci una motivazione per il rifiuto
            </div>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Motivazione del rifiuto..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectNote(""); }}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || approveMutation.isPending}
              onClick={() => {
                if (rejectDialog) {
                  approveMutation.mutate({
                    requestId: rejectDialog.id,
                    approved: false,
                    note: rejectNote.trim(),
                  });
                }
              }}
            >
              Conferma rifiuto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
