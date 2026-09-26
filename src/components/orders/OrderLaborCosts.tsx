import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  HardHat, Trash2, Building2,
  ExternalLink, Crown, UserPlus, Loader2, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { campoRoles, campoAssignmentError } from "@/lib/orders/campoAssignmentForm";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { costoOrarioDipendente } from "@/lib/costoOrarioDipendente";
import { differenceInDays, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { SubappaltatoreConDashboard } from "@/types/subappaltatori";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

interface CampoAssignment {
  id: string;
  user_id: string;
  role_type: "employee" | "subcontractor" | string;
  data_inizio: string | null;
  data_fine_prevista: string | null;
  is_capocantiere: boolean | null;
  note?: string | null;
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

// Giorni mancanti alla data indicata; null se assente o NON valida. Evita che un
// DURC con data corrotta nel DB risulti silenziosamente "OK" (NaN <= 30 = false).
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return differenceInDays(d, new Date());
}

function DurcBadge({ scadenza }: { scadenza: string | null }) {
  const daysLeft = daysUntil(scadenza);
  if (daysLeft === null) return <Badge variant="outline" className="text-xs">DURC mancante</Badge>;
  if (daysLeft < 0) return <Badge className="text-xs bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="text-xs bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="text-xs bg-green-600 text-white">DURC OK</Badge>;
}

interface OrderLaborCostsProps {
  orderId: string;
  editable?: boolean;
  /** Se true, rende solo il contenuto senza Card/header (per incorporarlo dentro un'altra sezione, es. Lavorazioni per fase). */
  embedded?: boolean;
}

export function OrderLaborCosts({ orderId, editable = true, embedded = false }: OrderLaborCostsProps) {
  const { effectiveCompany, role } = useAuth();
  const effectiveCompanyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  // Visibilità costi: chi non ha canViewCosts vede l'operativo (chi è assegnato,
  // DURC, stato pagamenti) ma NON i valori € di manodopera/subappalto.
  const { canViewCosts, canEditOrders } = usePermissions();
  const canEdit = editable && canEditOrders && (role === "company_admin" || role === "company_staff" || role === "super_admin");

  const [campoDialogOpen, setCampoDialogOpen] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formRoleType, setFormRoleType] = useState<"employee" | "subcontractor">("employee");
  const [formDataInizio, setFormDataInizio] = useState("");
  const [formDataFine, setFormDataFine] = useState("");
  const [formCapocantiere, setFormCapocantiere] = useState(false);
  const [formNote, setFormNote] = useState("");
  const [removeTarget, setRemoveTarget] = useState<CampoAssignment | null>(null);

  // ── Queries ──────────────────────────────────────────────────
  const { data: subappaltatori = [], isError: subError, isLoading: loadingSub, refetch: retrySub } = useQuery({
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

  // Alert DURC aggregato: subappaltatori di QUESTA commessa con DURC
  // scaduto / in scadenza (≤30gg) / mancante — per non lavorare con DURC irregolare.
  const durcAlerts = subappaltatori
    .map((s) => {
      const sc = s.durc_scadenza ?? null;
      const days = daysUntil(sc);
      const level: "scaduto" | "scadenza" | "mancante" | null =
        days === null ? "mancante" : days < 0 ? "scaduto" : days <= 30 ? "scadenza" : null;
      return level ? { id: s.id, nome: s.ragione_sociale, level, days } : null;
    })
    .filter(
      (x): x is { id: string; nome: string; level: "scaduto" | "scadenza" | "mancante"; days: number | null } =>
        x !== null,
    )
    .sort((a, b) => ({ scaduto: 0, scadenza: 1, mancante: 2 })[a.level] - ({ scaduto: 0, scadenza: 1, mancante: 2 })[b.level]);

  const { data: assegnazioni = [], isLoading: loadingAssegnazioni, isError: assignmentsError, refetch: retryAssignments } = useQuery<CampoAssignment[]>({
    queryKey: ["order-campo-assignments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        // Hint obbligatorio: order_campo_assignments ha DUE FK verso profiles
        // (user_id e assigned_by) → senza hint PostgREST risponde 400 PGRST201
        // e i costi manodopera restavano vuoti.
        .select("*, profile:profiles!order_campo_assignments_user_id_fkey(id, first_name, last_name, email)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampoAssignment[];
    },
    enabled: !!orderId,
  });

  const { data: utentiCampoRaw = [], isLoading: loadingUsers, isError: usersError } = useCompanyStaffUsers(campoDialogOpen ? effectiveCompanyId : null, "all");
  const utentiCampo = utentiCampoRaw.filter((u) =>
    u.roles?.includes("employee") || u.roles?.includes("worker") || u.roles?.includes("subcontractor")
  );
  const selectedUser = utentiCampo.find(u => u.id === formUserId);
  const allowedRoles = campoRoles(selectedUser?.roles);
  const existingAssignment = assegnazioni.find(a => a.user_id === formUserId);
  const capocantiere = assegnazioni.find(a => a.is_capocantiere);
  const formError = campoAssignmentError({ userId: formUserId, role: formRoleType,
    roles: selectedUser?.roles ?? [], start: formDataInizio, end: formDataFine,
    isCapo: formCapocantiere, existing: !!existingAssignment,
    otherCapo: !!capocantiere && capocantiere.user_id !== formUserId });
  const openCampoDialog = (asCapo: boolean) => {
    setFormUserId(""); setFormRoleType("employee"); setFormDataInizio(""); setFormDataFine("");
    setFormNote(""); setFormCapocantiere(asCapo); setCampoDialogOpen(true);
  };

  // ── Mutations ────────────────────────────────────────────────
  const assegnaCampoMutation = useMutation({
    mutationFn: async () => {
      if (!canEdit || !effectiveCompanyId || assignmentsError || loadingAssegnazioni) throw new Error("Assegnazioni non disponibili");
      if (formError) throw new Error(formError);
      const row = {
        company_id: effectiveCompanyId,
        order_id: orderId,
        user_id: formUserId,
        role_type: formRoleType,
        data_inizio: formDataInizio || null,
        data_fine_prevista: formDataFine || null,
        is_capocantiere: formCapocantiere,
        note: formNote || null,
      };
      const { data: updated, error } = existingAssignment
        ? await supabase.from("order_campo_assignments").update(row).eq("id", existingAssignment.id).eq("order_id", orderId).select("id").maybeSingle()
        : await supabase.from("order_campo_assignments").insert(row);
      if (error) throw error;
      if (existingAssignment && !updated) throw new Error("Nomina non aggiornata: verifica i permessi e ricarica");

      // UNIFICAZIONE delle due porte: il dipendente che entra nel cantiere deve esistere
      // anche sul lato costi. Se l'utente assegnato ha una scheda dipendente
      // (employees.user_id), si crea la riga order_employees mancante — così
      // i rapportini approvati trovano subito dove accumulare ore e costo.
      let avvisoCosti: string | null = null;
      try {
        if (formRoleType === "employee") {
          const { data: emp, error: employeeError } = await supabase
            .from("employees")
            .select("id, costo_orario, gross_salary, inps_rate, monthly_hours, ore_settimana")
            .eq("company_id", effectiveCompanyId!)
            .eq("user_id", formUserId)
            .maybeSingle();
          if (employeeError) throw employeeError;
          if (emp?.id) {
            const { data: giaPresente, error: laborError } = await supabase
              .from("order_employees")
              .select("id")
              .eq("order_id", orderId)
              .eq("employee_id", emp.id)
              .limit(1)
              .maybeSingle();
            if (laborError) throw laborError;
            if (!giaPresente) {
              const { error: eIns } = await supabase.from("order_employees").insert({
                order_id: orderId,
                employee_id: emp.id,
                phase_id: null,
                // Stessa formula del database: tariffa scritta a mano, oppure
                // lordo più contributi sulle ore del mese (prima: 0 se vuota).
                hourly_rate: costoOrarioDipendente(emp),
                hours_worked: 0,
                total_cost: 0,
              });
              if (eIns) avvisoCosti = eIns.message;
            }
          } else {
            avvisoCosti = "Account senza scheda dipendente collegata: verifica l'anagrafica per registrare correttamente ore e costi.";
          }
        }
      } catch (e) {
        avvisoCosti = e instanceof Error ? e.message : String(e);
      }
      return { avvisoCosti };
    },
    onSuccess: ({ avvisoCosti }) => {
      toast.success("Assegnato al cantiere");
      if (avvisoCosti) {
        toast.warning("Assegnato, ma la riga costi non è stata creata", { description: avvisoCosti });
      }
      refreshWorkQueries(queryClient, orderId);
      setCampoDialogOpen(false);
      setFormUserId(""); setFormDataInizio(""); setFormDataFine("");
      setFormCapocantiere(false); setFormNote("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore assegnazione"),
  });

  const rimuoviCampoMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canEdit) throw new Error("Non hai il permesso di gestire le assegnazioni");
      const { data: removed, error } = await supabase.from("order_campo_assignments").delete().eq("id", id).eq("order_id", orderId).select("id").maybeSingle();
      if (error) throw error;
      if (!removed) throw new Error("Assegnazione non rimossa: verifica i permessi e ricarica");
    },
    onSuccess: () => {
      toast.success("Assegnazione esplicita rimossa", { description: "Eventuali accessi da lavorazioni o contratti restano invariati." });
      refreshWorkQueries(queryClient, orderId); setRemoveTarget(null);
    },
    onError: () => toast.error("Errore rimozione"),
  });

  // ── Derived data ─────────────────────────────────────────────
  const assegnazioniOperai = assegnazioni.filter((a) => a.role_type === "employee");
  const assegnazioniSub = assegnazioni.filter((a) => a.role_type === "subcontractor");

  const body = (
    <div className="space-y-4">
        {/* ── Capocantiere Responsabile ─────────────────────────── */}
        <div className="rounded-lg border p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Capocantiere</span>
            </div>
            {!capocantiere && canEdit && !assignmentsError && !loadingAssegnazioni && (
              <Button
                size="sm" variant="outline"
                className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={() => openCampoDialog(true)}
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
                  aria-label="Rimuovi assegnazione esplicita del capocantiere"
                  onClick={() => setRemoveTarget(capocantiere)}
                  disabled={rimuoviCampoMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            // Testo rivisto: quello di prima ("nominalo per attivare il diario")
            // si leggeva come "senza capocantiere niente rapportini" — falso.
            // I rapportini si fanno comunque, ognuno il suo (verificato in
            // CampoRapportino: nessun blocco). Il capocantiere aggiunge il
            // rapportino UNICO di squadra e, una volta nominato, riserva a lui
            // la dichiarazione di avanzamento delle fasi.
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
              {assignmentsError ? "Nomina non verificabile: ricarica gli accessi qui sotto." : loadingAssegnazioni ? "Verifica della nomina in corso…" : <>Facoltativo. Ogni operaio può inviare il proprio rapportino. Con un referente puoi raccogliere presenze e avanzamento in un <strong>rapportino di squadra</strong>.</>}
            </p>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <Tabs defaultValue="cantiere" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="teams" className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              Affidamenti ({subError ? "—" : loadingSub ? "…" : subappaltatori.length})
            </TabsTrigger>
            <TabsTrigger value="cantiere" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              App Campo ({assignmentsError ? "—" : loadingAssegnazioni ? "…" : assegnazioni.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Subappaltatori ──────────────────────────────────── */}
          <TabsContent value="teams" className="space-y-3 mt-4">
            {subError && <div role="alert" className="text-sm text-destructive">Affidamenti non disponibili. <Button variant="outline" size="sm" onClick={() => retrySub()}>Riprova affidamenti</Button></div>}
            {loadingSub && <p className="text-sm text-muted-foreground">Caricamento affidamenti…</p>}
            {durcAlerts.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Attenzione DURC subappaltatori in commessa
                </div>
                <ul className="space-y-0.5 text-xs text-amber-800">
                  {durcAlerts.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.nome}</span>:{" "}
                      {a.level === "scaduto"
                        ? `DURC SCADUTO${a.days != null ? ` da ${Math.abs(a.days)}gg` : ""}`
                        : a.level === "scadenza"
                          ? `DURC in scadenza tra ${a.days}gg`
                          : "DURC non presente in scheda"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                          {canViewCosts && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatCurrency(lordo)} / {formatCurrency(contr)}</span>
                            {(sub.ritenute_in_corso ?? 0) > 0 && (
                              <span className="text-amber-600 font-medium">{formatCurrency(sub.ritenute_in_corso)} ritenuta</span>
                            )}
                          </div>
                          )}
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

            {!subError && !loadingSub && subappaltatori.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">Nessun affidamento con scheda DURC/SAL collegato. Le squadre operative e i relativi costi sono nelle lavorazioni qui sopra.</p>
            )}
          </TabsContent>

          {/* ── Assegnazioni Cantiere ───────────────────────────── */}
          <TabsContent value="cantiere" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Il numero indica le assegnazioni esplicite, non tutti gli utenti abilitati. Un dipendente può accedere anche dal lavoro assegnato, un subappaltatore dal contratto attivo. Le date sono organizzative: non garantiscono la revoca dell'accesso.
            </p>

            {assignmentsError ? (
              <div role="alert" className="text-sm text-destructive">Impossibile verificare gli accessi. <Button variant="outline" size="sm" onClick={() => retryAssignments()}>Riprova accessi</Button></div>
            ) : loadingAssegnazioni ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>
            ) : assegnazioni.filter((a) => !a.is_capocantiere).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nessun altro accesso esplicito registrato.</p>
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
                            aria-label={`Rimuovi assegnazione esplicita ${a.profile?.first_name ?? ""} ${a.profile?.last_name ?? ""}`}
                            onClick={() => setRemoveTarget(a)} disabled={rimuoviCampoMutation.isPending}>
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
                            aria-label={`Rimuovi assegnazione esplicita ${a.profile?.first_name ?? ""} ${a.profile?.last_name ?? ""}`}
                            onClick={() => setRemoveTarget(a)} disabled={rimuoviCampoMutation.isPending}>
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
              <Button variant="outline" size="sm" className="w-full" disabled={loadingAssegnazioni || assignmentsError} onClick={() => openCampoDialog(false)}>
                <UserPlus className="h-4 w-4 mr-2" /> Assegna accesso app Campo
              </Button>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Dialogs ──────────────────────────────────────────── */}
        {/* Dialog assegnazione campo */}
        <Dialog open={campoDialogOpen} onOpenChange={open => { if (!assegnaCampoMutation.isPending) setCampoDialogOpen(open); }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{formCapocantiere ? "Nomina il capocantiere" : "Assegna accesso app Campo"}</DialogTitle>
              <DialogDescription>
                Collega un account esistente a questo cantiere. La squadra esterna, il suo contratto e il referente Campo rimangono informazioni distinte.
              </DialogDescription>
            </DialogHeader>
            <fieldset disabled={assegnaCampoMutation.isPending} className="min-w-0 space-y-4">
              {usersError && <p role="alert" className="text-sm text-destructive">Impossibile caricare gli utenti Campo. Chiudi e riprova.</p>}
              {!usersError && !loadingUsers && utentiCampo.length === 0 && <p className="text-sm text-muted-foreground">Nessun account operaio o subappaltatore disponibile. Configura prima l'account nella relativa anagrafica.</p>}
              <div>
                <Label htmlFor="campo-user">Utente</Label>
                <Select value={formUserId} onValueChange={id => {
                  setFormUserId(id);
                  const existing = assegnazioni.find(a => a.user_id === id);
                  const roles = campoRoles(utentiCampo.find(u => u.id === id)?.roles);
                  const previousRole = existing?.role_type;
                  setFormRoleType((previousRole === "employee" || previousRole === "subcontractor") && roles.includes(previousRole) ? previousRole : roles[0] ?? "employee");
                  setFormDataInizio(existing?.data_inizio ?? ""); setFormDataFine(existing?.data_fine_prevista ?? ""); setFormNote(existing?.note ?? "");
                }}>
                  <SelectTrigger id="campo-user" disabled={loadingUsers || usersError}><SelectValue placeholder={loadingUsers ? "Caricamento utenti…" : "Seleziona operaio o subappaltatore"} /></SelectTrigger>
                  <SelectContent>
                    {utentiCampo.map((u) => {
                      const roleLabel = u.roles?.includes("subcontractor") ? "Sub" : "Operaio";
                      return (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.first_name, u.last_name].filter(Boolean).join(" ")}
                        <span className="ml-2 text-muted-foreground text-xs">({roleLabel})</span>
                        {assegnazioni.some(a => a.user_id === u.id) && <span className="ml-1 text-xs">· già assegnato</span>}
                      </SelectItem>
                    )})}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="campo-role">Ruolo nell'app</Label>
                <Select value={formUserId ? formRoleType : ""} onValueChange={(v: "employee" | "subcontractor") => setFormRoleType(v)}>
                  <SelectTrigger id="campo-role" disabled={allowedRoles.length < 2}><SelectValue placeholder="Seleziona prima l'utente" /></SelectTrigger>
                  <SelectContent>
                    {allowedRoles.includes("employee") && <SelectItem value="employee">Operaio / Dipendente</SelectItem>}
                    {allowedRoles.includes("subcontractor") && <SelectItem value="subcontractor">Subappaltatore</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="campo-start">Data inizio</Label>
                  <Input id="campo-start" type="date" value={formDataInizio} onChange={e => setFormDataInizio(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="campo-end">Data fine prevista</Label>
                  <Input id="campo-end" type="date" value={formDataFine} onChange={e => setFormDataFine(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="campo-capo" checked={formCapocantiere} onCheckedChange={setFormCapocantiere} disabled={!!capocantiere && capocantiere.user_id !== formUserId} />
                <Label htmlFor="campo-capo" className="cursor-pointer">Capocantiere responsabile</Label>
              </div>
              <div>
                <Label htmlFor="campo-note">Note (opzionale)</Label>
                <Input id="campo-note" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Es: Responsabile posa serramenti" />
              </div>
              {formUserId && formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
              {existingAssignment && formCapocantiere && !formError && <p className="text-xs text-muted-foreground">Verrà aggiornata la nomina sull'assegnazione esistente, senza creare una seconda riga.</p>}
            </fieldset>
            <DialogFooter>
              <Button variant="outline" disabled={assegnaCampoMutation.isPending} onClick={() => setCampoDialogOpen(false)}>Annulla</Button>
              <Button onClick={() => assegnaCampoMutation.mutate()} disabled={!!formError || usersError || assignmentsError || loadingUsers || loadingAssegnazioni || assegnaCampoMutation.isPending}>
                {assegnaCampoMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Assegna"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={!!removeTarget} onOpenChange={open => { if (!open && !rimuoviCampoMutation.isPending) setRemoveTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rimuovere l'assegnazione esplicita?</AlertDialogTitle>
              <AlertDialogDescription>
                {removeTarget?.profile?.first_name} {removeTarget?.profile?.last_name}: verrà rimossa solo questa assegnazione{removeTarget?.is_capocantiere ? " e la nomina di capocantiere" : ""}.
                {" "}L'accesso tramite lavorazioni o contratti attivi può restare disponibile. Ore, costi e rapportini non vengono cancellati. Questa azione non è una revoca completa dell'accesso.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rimuoviCampoMutation.isPending}>Annulla</AlertDialogCancel>
              <Button variant="destructive" disabled={rimuoviCampoMutation.isPending} onClick={() => removeTarget && rimuoviCampoMutation.mutate(removeTarget.id)}>Rimuovi assegnazione</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HardHat className="h-5 w-5" />
          Manodopera
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
