/**
 * Tab unificato Subappaltatori:
 *  – Squadre esterne (external_teams) con CRUD
 *  – Account app cantiere subappaltatori (subappaltatori table) con collegamento account
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency } from "@/lib/formatters";
import {
  Plus, Pencil, Trash2, Phone, Mail, FileText, Building2,
  Link2, Link2Off, Loader2, HardHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ExternalTeamDialog, ExternalTeamFormData } from "@/components/employees/ExternalTeamDialog";
import { ExternalTeamAttachments } from "@/components/employees/ExternalTeamAttachments";
import type { ExternalTeam } from "@/types/employees";

export function SubappaltatoriTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<ExternalTeam | null>(null);
  const [attachmentsTeam, setAttachmentsTeam] = useState<ExternalTeam | null>(null);

  // ── Squadre esterne ─────────────────────────────────────────────────
  const { data: externalTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: queryKeys.externalTeams.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as ExternalTeam[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Subappaltatori campo ────────────────────────────────────────────
  const { data: subCampo = [], isLoading: loadingSub } = useQuery({
    queryKey: ["sub-campo-list", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, responsabile, user_id, user_email")
        .eq("company_id", companyId!)
        .order("ragione_sociale");
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // ── Mutations ───────────────────────────────────────────────────────
  const saveTeamMutation = useMutation({
    mutationFn: async (data: ExternalTeamFormData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase.from("external_teams").update({
          name: data.name, contact_name: data.contact_name || null,
          phone: data.phone || null, email: data.email || null,
          notes: data.notes || null, is_active: data.is_active, vat_rate: data.vat_rate,
        }).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("external_teams").insert({
          company_id: companyId!,
          name: data.name, contact_name: data.contact_name || null,
          phone: data.phone || null, email: data.email || null,
          notes: data.notes || null, is_active: data.is_active, vat_rate: data.vat_rate,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.externalTeams.all });
      toast.success(editingTeam ? "Squadra aggiornata" : "Squadra creata");
      setTeamDialogOpen(false);
      setEditingTeam(null);
    },
    onError: () => toast.error("Errore durante il salvataggio"),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.externalTeams.all });
      toast.success("Squadra eliminata");
    },
    onError: () => toast.error("Impossibile eliminare. Potrebbe essere assegnata a ordini."),
  });

  // ── Campo access ────────────────────────────────────────────────────
  const [collegaDialogId, setCollegaDialogId] = useState<string | null>(null);
  const [collegaEmail, setCollegaEmail] = useState("");

  const collegaMutation = useMutation({
    mutationFn: async ({ subId, email }: { subId: string; email: string }) => {
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("email", email).maybeSingle();
      if (profile?.id) {
        const { error } = await supabase.from("subappaltatori")
          .update({ user_id: profile.id, user_email: email }).eq("id", subId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subappaltatori")
          .update({ user_email: email }).eq("id", subId);
        if (error) throw error;
        toast.info("Email salvata. Crea l'utente con ruolo Subappaltatore per completare il collegamento.");
      }
    },
    onSuccess: () => {
      toast.success("Account campo collegato");
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
      setCollegaDialogId(null);
      setCollegaEmail("");
    },
    onError: (e: any) => toast.error(e.message ?? "Errore collegamento"),
  });

  const revocaMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase.from("subappaltatori")
        .update({ user_id: null, user_email: null }).eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account app cantiere revocato");
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
    },
    onError: () => toast.error("Errore revoca accesso"),
  });

  const activeTeams = externalTeams.filter((t) => t.is_active);
  const inactiveTeams = externalTeams.filter((t) => !t.is_active);

  return (
    <div className="space-y-6">
      {/* ── Squadre Esterne ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5" />
                Squadre Esterne
              </CardTitle>
              <CardDescription>
                {activeTeams.length} attive, {inactiveTeams.length} inattive
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditingTeam(null); setTeamDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Squadra
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingTeams ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-[140px]" />
                  <Skeleton className="h-5 w-[120px]" />
                  <Skeleton className="h-5 w-[60px]" />
                </div>
              ))}
            </div>
          ) : externalTeams.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nessuna squadra esterna. Aggiungi la prima per iniziare.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Ditta</TableHead>
                  <TableHead>Referente</TableHead>
                  <TableHead>Contatti</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externalTeams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell>{team.contact_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        {team.email && (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{team.email}</span>
                        )}
                        {team.phone && (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{team.phone}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{team.notes || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={team.is_active ? "default" : "secondary"}>
                        {team.is_active ? "Attiva" : "Inattiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => setAttachmentsTeam(team)} title="Documenti">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditingTeam(team); setTeamDialogOpen(true); }} title="Modifica">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Elimina">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare la squadra?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Azione irreversibile. Se assegnata a ordini, impostala come "Inattiva".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteTeamMutation.mutate(team.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Account app cantiere ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="h-5 w-5" />
            Account app cantiere
          </CardTitle>
          <CardDescription>
            Collega un account a ogni subappaltatore per dargli accesso all'app cantiere. Le anagrafiche create dal modulo Subappaltatori vengono agganciate qui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingSub ? (
            <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
          ) : subCampo.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <HardHat className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Nessuna anagrafica app cantiere collegata</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crea o collega un subappaltatore dalla sezione operativa per abilitarne poi l'account.
              </p>
            </div>
          ) : (
            subCampo.map((sub: any) => (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{sub.ragione_sociale}</p>
                      {sub.responsabile && <p className="text-xs text-muted-foreground">{sub.responsabile}</p>}
                      {sub.user_id ? (
                        <Badge className="mt-1 text-[10px] bg-green-100 text-green-800 border-green-200">
                          <Link2 className="h-2.5 w-2.5 mr-1" />App attiva — {sub.user_email}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">
                          <Link2Off className="h-2.5 w-2.5 mr-1" />Nessun accesso
                        </Badge>
                      )}
                    </div>
                  </div>
                  {sub.user_id ? (
                    <Button size="sm" variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => revocaMutation.mutate(sub.id)}
                      disabled={revocaMutation.isPending}>
                      <Link2Off className="h-3 w-3 mr-1" />Revoca
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline"
                      onClick={() => { setCollegaDialogId(sub.id); setCollegaEmail(sub.user_email ?? ""); }}>
                      <Link2 className="h-3 w-3 mr-1" />Collega
                    </Button>
                  )}
                </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      <ExternalTeamDialog
        open={teamDialogOpen}
        onOpenChange={(open) => { setTeamDialogOpen(open); if (!open) setEditingTeam(null); }}
        team={editingTeam}
        onSave={(data) => saveTeamMutation.mutate({ ...data, id: editingTeam?.id })}
        isSaving={saveTeamMutation.isPending}
      />

      {attachmentsTeam && (
        <ExternalTeamAttachments
          team={attachmentsTeam}
          open={!!attachmentsTeam}
          onOpenChange={(open) => { if (!open) setAttachmentsTeam(null); }}
        />
      )}

      <Dialog open={!!collegaDialogId} onOpenChange={() => { setCollegaDialogId(null); setCollegaEmail(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collega account app cantiere</DialogTitle>
            <DialogDescription>
              Inserisci l&apos;email del subappaltatore. Se esiste verrà collegato automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Email</Label>
            <Input type="email" value={collegaEmail}
              onChange={e => setCollegaEmail(e.target.value)} placeholder="email@subappaltatore.it" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollegaDialogId(null)}>Annulla</Button>
            <Button onClick={() => collegaMutation.mutate({ subId: collegaDialogId!, email: collegaEmail })}
              disabled={!collegaEmail || collegaMutation.isPending}>
              {collegaMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Collega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
