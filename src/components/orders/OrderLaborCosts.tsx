import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  HardHat, Users, Building2, Plus, Trash2, Check, Clock,
  ExternalLink, Crown, UserPlus, Loader2, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { differenceInDays, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AssignEmployeeDialog } from "@/components/employees/AssignEmployeeDialog";
import { AssignExternalTeamDialog } from "@/components/employees/AssignExternalTeamDialog";
import type { SubappaltatoreConDashboard } from "@/types/subappaltatori";

interface OrderEmployee {
  id: string;
  employee_id: string;
  hours_worked: number;
  hourly_rate: number;
  total_cost: number;
  notes: string | null;
  employee: { first_name: string; last_name: string };
}

interface OrderExternalTeam {
  id: string;
  external_team_id: string;
  total_cost: number;
  payment_date: string | null;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  external_team: { name: string };
}

interface CampoAssignment {
  id: string;
  user_id: string;
  role_type: "employee" | "subcontractor" | string;
  data_inizio: string | null;
  data_fine_prevista: string | null;
  is_capocantiere: boolean | null;
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

function DurcBadge({ scadenza }: { scadenza: string | null }) {
  if (!scadenza) return <Badge variant="outline" className="text-xs">DURC mancante</Badge>;
  const daysLeft = differenceInDays(parseISO(scadenza), new Date());
  if (daysLeft < 0) return <Badge className="text-xs bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="text-xs bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="text-xs bg-green-600 text-white">DURC OK</Badge>;
}

interface OrderLaborCostsProps {
  orderId: string;
  editable?: boolean;
}

export function OrderLaborCosts({ orderId, editable = true }: OrderLaborCostsProps) {
  const { effectiveCompany, role } = useAuth();
  const effectiveCompanyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const canEdit = editable && (role === "company_admin" || role === "company_staff" || role === "super_admin");

  const [assignEmployeeOpen, setAssignEmployeeOpen] = useState(false);
  const [assignTeamOpen, setAssignTeamOpen] = useState(false);
  const [campoDialogOpen, setCampoDialogOpen] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formRoleType, setFormRoleType] = useState<"employee" | "subcontractor">("employee");
  const [formDataInizio, setFormDataInizio] = useState("");
  const [formDataFine, setFormDataFine] = useState("");
  const [formCapocantiere, setFormCapocantiere] = useState(false);
  const [formNote, setFormNote] = useState("");

  // ── Queries ──────────────────────────────────────────────────
  const { data: orderEmployees = [] } = useQuery({
    queryKey: ["order-employees", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_employees")
        .select("*, employee:employees(first_name, last_name)")
        .eq("order_id", orderId);
      if (error) throw error;
      return data as OrderEmployee[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: orderExternalTeams = [] } = useQuery({
    queryKey: ["order-external-teams", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("*, external_team:external_teams(name)")
        .eq("order_id", orderId);
      if (error) throw error;
      return data as OrderExternalTeam[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: subappaltatori = [] } = useQuery({
    queryKey: ["subappaltatori-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_subappaltatori_dashboard")
        .select("*")
        .eq("order_id", orderId)
        .eq("company_id", effectiveCompanyId);
      if (error) throw error;
      return (data ?? []) as SubappaltatoreConDashboard[];
    },
    enabled: !!orderId && !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: assegnazioni = [], isLoading: loadingAssegnazioni } = useQuery<CampoAssignment[]>({
    queryKey: ["order-campo-assignments", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("*, profile:profiles(id, first_name, last_name, email)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      return (data ?? []) as CampoAssignment[];
    },
    enabled: !!orderId,
  });

  const { data: utentiCampoRaw = [] } = useCompanyStaffUsers(campoDialogOpen ? effectiveCompanyId : null, "all");
  const utentiCampo = utentiCampoRaw.filter((u) =>
    u.roles?.includes("employee") || u.roles?.includes("worker") || u.roles?.includes("subcontractor")
  );

  // ── Mutations ────────────────────────────────────────────────
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order-employees", orderId] }); toast.success("Assegnazione rimossa"); },
    onError: () => { toast.error("Impossibile rimuovere l'assegnazione."); },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] }); toast.success("Subappaltatore rimosso"); },
    onError: () => { toast.error("Impossibile rimuovere il subappaltatore."); },
  });

  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, isPaid }: { id: string; isPaid: boolean }) => {
      const { error } = await supabase
        .from("order_external_teams")
        .update({ is_paid: isPaid, paid_date: isPaid ? new Date().toISOString().split("T")[0] : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] }); toast.success("Stato pagamento aggiornato"); },
  });

  const assegnaCampoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_campo_assignments").insert({
        company_id: effectiveCompanyId,
        order_id: orderId,
        user_id: formUserId,
        role_type: formRoleType,
        data_inizio: formDataInizio || null,
        data_fine_prevista: formDataFine || null,
        is_capocantiere: formCapocantiere,
        note: formNote || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assegnato al cantiere");
      queryClient.invalidateQueries({ queryKey: ["order-campo-assignments", orderId] });
      setCampoDialogOpen(false);
      setFormUserId(""); setFormDataInizio(""); setFormDataFine("");
      setFormCapocantiere(false); setFormNote("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore assegnazione"),
  });

  const rimuoviCampoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_campo_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assegnazione rimossa"); queryClient.invalidateQueries({ queryKey: ["order-campo-assignments", orderId] }); },
    onError: () => toast.error("Errore rimozione"),
  });

  // ── Derived data ─────────────────────────────────────────────
  const totalEmployeeCost = orderEmployees.reduce((sum, e) => sum + e.total_cost, 0);
  const totalTeamCost = orderExternalTeams.reduce((sum, t) => sum + t.total_cost, 0);
  const totalSubappCost = subappaltatori.reduce((s, sub) => s + (sub.totale_sal_lordo ?? 0), 0);
  const totalLaborCost = totalEmployeeCost + totalTeamCost + totalSubappCost;

  const capocantiere = assegnazioni.find((a) => a.is_capocantiere);
  const assegnazioniOperai = assegnazioni.filter((a) => a.role_type === "employee");
  const assegnazioniSub = assegnazioni.filter((a) => a.role_type === "subcontractor");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HardHat className="h-5 w-5" />
          Manodopera
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Capocantiere Responsabile ─────────────────────────── */}
        <div className="rounded-lg border p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Capocantiere</span>
            </div>
            {!capocantiere && canEdit && (
              <Button
                size="sm" variant="outline"
                className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={() => { setFormCapocantiere(true); setCampoDialogOpen(true); }}
              >
                <UserPlus className="h-3 w-3 mr-1" /> Assegna
              </Button>
            )}
          </div>
          {capocantiere ? (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-xs font-bold text-amber-800 dark:text-amber-200">
                  {capocantiere.profile?.first_name?.[0]}{capocantiere.profile?.last_name?.[0]}
                </div>
                <div>
                  <p className="text-sm font-medium">{capocantiere.profile?.first_name} {capocantiere.profile?.last_name}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] py-0 border-amber-300">
                      {capocantiere.role_type === "employee" ? "Dipendente" : "Subappaltatore"}
                    </Badge>
                    {capocantiere.data_inizio && (
                      <span className="text-[10px] text-muted-foreground">
                        Dal {capocantiere.data_inizio}{capocantiere.data_fine_prevista ? ` al ${capocantiere.data_fine_prevista}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {canEdit && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                  onClick={() => rimuoviCampoMutation.mutate(capocantiere.id)}
                  disabled={rimuoviCampoMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-600/70 mt-1">Nessun capocantiere assegnato</p>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <Tabs defaultValue="employees" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="employees" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Dipendenti ({orderEmployees.length})
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              Subappaltatori ({orderExternalTeams.length + subappaltatori.length})
            </TabsTrigger>
            <TabsTrigger value="cantiere" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              Cantiere ({assegnazioni.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Dipendenti ──────────────────────────────────────── */}
          <TabsContent value="employees" className="space-y-3 mt-4">
            {orderEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nessun dipendente assegnato</p>
            ) : (
              <div className="space-y-2">
                {orderEmployees.map((oe) => (
                  <div key={oe.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{oe.employee.first_name} {oe.employee.last_name}</p>
                      <p className="text-xs text-muted-foreground">{oe.hours_worked}h × {formatCurrency(oe.hourly_rate)}/h</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{formatCurrency(oe.total_cost)}</span>
                      {canEdit && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Rimuovere assegnazione?</AlertDialogTitle>
                              <AlertDialogDescription>Il dipendente verrà rimosso da questa commessa.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteEmployeeMutation.mutate(oe.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Rimuovi</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium text-sm">Totale Dipendenti</span>
                  <span className="font-semibold text-sm">{formatCurrency(totalEmployeeCost)}</span>
                </div>
              </div>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setAssignEmployeeOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Assegna Dipendente
              </Button>
            )}
          </TabsContent>

          {/* ── Subappaltatori ──────────────────────────────────── */}
          <TabsContent value="teams" className="space-y-3 mt-4">
            {subappaltatori.length > 0 && (
              <div className="space-y-2">
                {subappaltatori.map((sub) => {
                  const lordo = sub.totale_sal_lordo ?? 0;
                  const contr = sub.importo_contrattuale ?? 0;
                  const pct = contr > 0 ? Math.min(100, Math.round((lordo / contr) * 100)) : 0;
                  return (
                    <div key={sub.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{sub.ragione_sociale}</p>
                          {sub.tipo_lavori && <p className="text-xs text-muted-foreground">{sub.tipo_lavori}</p>}
                        </div>
                        <DurcBadge scadenza={sub.durc_scadenza} />
                      </div>
                      {contr > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Contratto eseguito</span>
                            <span className="font-medium">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatCurrency(lordo)} / {formatCurrency(contr)}</span>
                            {sub.ritenute_in_corso > 0 && (
                              <span className="text-amber-600 font-medium">{formatCurrency(sub.ritenute_in_corso)} ritenuta</span>
                            )}
                          </div>
                        </div>
                      )}
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs w-full">
                        <Link to={`/azienda/subappaltatori/${sub.id}`}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Gestisci
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {orderExternalTeams.length > 0 && (
              <div className="space-y-2">
                {subappaltatori.length > 0 && <Separator />}
                {orderExternalTeams.map((ot) => (
                  <div key={ot.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{ot.external_team.name}</p>
                      <div className="flex items-center gap-2 text-sm">
                        {ot.is_paid ? (
                          <Badge variant="default" className="gap-1"><Check className="h-3 w-3" /> Pagato {ot.paid_date && `il ${formatDate(ot.paid_date)}`}</Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> {ot.payment_date ? `Scadenza ${formatDate(ot.payment_date)}` : "Non pagato"}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{formatCurrency(ot.total_cost)}</span>
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePaidMutation.mutate({ id: ot.id, isPaid: !ot.is_paid })}>
                            <Check className={`h-4 w-4 ${ot.is_paid ? "text-green-600" : "text-muted-foreground"}`} />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Rimuovere subappaltatore?</AlertDialogTitle>
                                <AlertDialogDescription>Il subappaltatore verrà rimosso da questa commessa.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteTeamMutation.mutate(ot.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Rimuovi</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium text-sm">Totale Squadre Esterne</span>
                  <span className="font-semibold text-sm">{formatCurrency(totalTeamCost)}</span>
                </div>
              </div>
            )}

            {orderExternalTeams.length === 0 && subappaltatori.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">Nessun subappaltatore assegnato</p>
            )}

            {canEdit && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setAssignTeamOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Aggiungi Subappaltatore
              </Button>
            )}
          </TabsContent>

          {/* ── Assegnazioni Cantiere ───────────────────────────── */}
          <TabsContent value="cantiere" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Persone che possono accedere a questo cantiere nell&apos;app campo.
            </p>

            {loadingAssegnazioni ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>
            ) : assegnazioni.filter((a) => !a.is_capocantiere).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nessun operaio assegnato al cantiere</p>
            ) : (
              <div className="space-y-2">
                {/* Operai */}
                {assegnazioniOperai.filter((a) => !a.is_capocantiere).length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Operai</p>
                    {assegnazioniOperai.filter((a) => !a.is_capocantiere).map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {a.profile?.first_name?.[0]}{a.profile?.last_name?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{a.profile?.first_name} {a.profile?.last_name}</p>
                            {a.data_inizio && (
                              <span className="text-[10px] text-muted-foreground">
                                Dal {a.data_inizio}{a.data_fine_prevista ? ` al ${a.data_fine_prevista}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={() => rimuoviCampoMutation.mutate(a.id)} disabled={rimuoviCampoMutation.isPending}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {/* Subappaltatori campo */}
                {assegnazioniSub.filter((a) => !a.is_capocantiere).length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-2">Subappaltatori</p>
                    {assegnazioniSub.filter((a) => !a.is_capocantiere).map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-[10px] font-bold text-orange-700 dark:text-orange-300">
                            {a.profile?.first_name?.[0]}{a.profile?.last_name?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{a.profile?.first_name} {a.profile?.last_name}</p>
                            {a.data_inizio && (
                              <span className="text-[10px] text-muted-foreground">
                                Dal {a.data_inizio}{a.data_fine_prevista ? ` al ${a.data_fine_prevista}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={() => rimuoviCampoMutation.mutate(a.id)} disabled={rimuoviCampoMutation.isPending}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {canEdit && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setFormCapocantiere(false); setCampoDialogOpen(true); }}>
                <UserPlus className="h-4 w-4 mr-2" /> Assegna al Cantiere
              </Button>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Totale ───────────────────────────────────────────── */}
        <Separator />
        <div className="flex justify-between items-center pt-1">
          <span className="font-semibold text-sm">TOTALE MANODOPERA</span>
          <span className="text-lg font-bold text-primary">{formatCurrency(totalLaborCost)}</span>
        </div>

        {/* ── Dialogs ──────────────────────────────────────────── */}
        <AssignEmployeeDialog
          open={assignEmployeeOpen}
          onOpenChange={setAssignEmployeeOpen}
          orderId={orderId}
          existingEmployeeIds={orderEmployees.map((e) => e.employee_id)}
        />
        <AssignExternalTeamDialog
          open={assignTeamOpen}
          onOpenChange={setAssignTeamOpen}
          orderId={orderId}
          existingTeamIds={orderExternalTeams.map((t) => t.external_team_id)}
        />

        {/* Dialog assegnazione campo */}
        <Dialog open={campoDialogOpen} onOpenChange={setCampoDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assegna al cantiere</DialogTitle>
              <DialogDescription>
                L&apos;utente assegnato vedrà questo cantiere nell&apos;app campo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Utente</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona operaio o subappaltatore" /></SelectTrigger>
                  <SelectContent>
                    {utentiCampo.map((u) => {
                      const roleLabel = u.roles?.includes("subcontractor") ? "Sub" : "Operaio";
                      return (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.first_name, u.last_name].filter(Boolean).join(" ")}
                        <span className="ml-2 text-muted-foreground text-xs">({roleLabel})</span>
                      </SelectItem>
                    )})}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ruolo</Label>
                <Select value={formRoleType} onValueChange={(v: "employee" | "subcontractor") => setFormRoleType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Operaio / Dipendente</SelectItem>
                    <SelectItem value="subcontractor">Subappaltatore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data inizio</Label>
                  <Input type="date" value={formDataInizio} onChange={e => setFormDataInizio(e.target.value)} />
                </div>
                <div>
                  <Label>Data fine prevista</Label>
                  <Input type="date" value={formDataFine} onChange={e => setFormDataFine(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formCapocantiere} onCheckedChange={setFormCapocantiere} />
                <Label className="cursor-pointer">Capocantiere responsabile</Label>
              </div>
              <div>
                <Label>Note (opzionale)</Label>
                <Input value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Es: Responsabile posa serramenti" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCampoDialogOpen(false)}>Annulla</Button>
              <Button onClick={() => assegnaCampoMutation.mutate()} disabled={!formUserId || assegnaCampoMutation.isPending}>
                {assegnaCampoMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Assegna"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
