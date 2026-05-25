/**
 * Tab "Commercialista" in /azienda/impostazioni/persone-e-utenti
 *
 * Permette al titolare/admin dell'azienda di:
 *  - Vedere lo stato delle deleghe (invitate / attive / sospese) verso
 *    studi commercialisti collegati.
 *  - Invitare un nuovo commercialista via email (con scelta di access_mode
 *    e permessi granulari).
 *  - Sospendere, riattivare o revocare un accesso esistente.
 *
 * Lato server usa 2 edge functions:
 *  - invite-accountant-to-company
 *  - update-accountant-company-access
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  Landmark,
  Loader2,
  Mail,
  MoreVertical,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type AccessStatus = "invited" | "active" | "suspended" | "revoked";
type AccessMode = "read_only" | "operational" | "approval_required";

interface AccountantPermissions {
  finance?: boolean;
  documents?: boolean;
  management_control?: boolean;
  jobs?: boolean;
  requests?: boolean;
  exports?: boolean;
  write_actions?: boolean;
}

interface AccountantAccessRow {
  access_id: string;
  firm_id: string;
  firm_name: string;
  firm_vat: string | null;
  owner_email: string | null;
  invited_email: string | null;
  status: AccessStatus;
  access_mode: AccessMode;
  permissions: AccountantPermissions;
  invited_at: string | null;
  accepted_at: string | null;
  notes: string | null;
}

const DEFAULT_PERMISSIONS: AccountantPermissions = {
  finance: true,
  documents: true,
  management_control: true,
  jobs: true,
  requests: true,
  exports: true,
  write_actions: false,
};

const PERMISSION_LABELS: Record<keyof AccountantPermissions, string> = {
  finance: "Finanza & tesoreria",
  documents: "Documenti",
  management_control: "Controllo di gestione",
  jobs: "Cantieri & commesse",
  requests: "Richieste documentali",
  exports: "Esportazioni / report",
  write_actions: "Azioni di scrittura",
};

const ACCESS_MODE_OPTIONS: Array<{ value: AccessMode; label: string; description: string }> = [
  {
    value: "read_only",
    label: "Solo lettura",
    description: "Il commercialista può consultare i dati ma non può modificare nulla.",
  },
  {
    value: "operational",
    label: "Operativo",
    description: "Può aggiornare dati e creare documenti (no azioni critiche).",
  },
  {
    value: "approval_required",
    label: "Con approvazione",
    description: "Può fare modifiche, ma alcune richiedono approvazione del titolare.",
  },
];

function getStatusBadgeProps(status: AccessStatus): {
  variant: "default" | "secondary" | "outline" | "destructive";
  label: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case "active":
      return { variant: "default", label: "Attivo", icon: CheckCircle2 };
    case "invited":
      return { variant: "secondary", label: "Invitato", icon: Clock };
    case "suspended":
      return { variant: "outline", label: "Sospeso", icon: Pause };
    case "revoked":
      return { variant: "destructive", label: "Revocato", icon: Trash2 };
  }
}

function getAccessModeLabel(mode: AccessMode): string {
  return ACCESS_MODE_OPTIONS.find((o) => o.value === mode)?.label || mode;
}

export function AccountantAccessTab() {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const companyId = effectiveCompany?.id ?? null;

  const [accesses, setAccesses] = useState<AccountantAccessRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMode, setInviteMode] = useState<AccessMode>("read_only");
  const [invitePermissions, setInvitePermissions] = useState<AccountantPermissions>(
    DEFAULT_PERMISSIONS,
  );
  const [inviteNotes, setInviteNotes] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const activeCount = useMemo(
    () => accesses.filter((a) => a.status === "active").length,
    [accesses],
  );
  const invitedCount = useMemo(
    () => accesses.filter((a) => a.status === "invited").length,
    [accesses],
  );

  async function loadAccesses() {
    if (!companyId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("list_company_accountant_invites", {
        p_company_id: companyId,
      });
      if (error) throw error;
      setAccesses((data as AccountantAccessRow[]) || []);
    } catch (err) {
      setLoadError(
        (err as Error)?.message || "Impossibile caricare le deleghe commercialista.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAccesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function resetInviteForm() {
    setInviteEmail("");
    setInviteMode("read_only");
    setInvitePermissions(DEFAULT_PERMISSIONS);
    setInviteNotes("");
    setInviteError(null);
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId) return;

    setInviteError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteError("Email non valida.");
      return;
    }

    setIsInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-accountant-to-company", {
        body: {
          company_id: companyId,
          accountant_email: inviteEmail.trim().toLowerCase(),
          access_mode: inviteMode,
          permissions: invitePermissions,
          notes: inviteNotes.trim() || null,
        },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        const msg = (data as { error?: string })?.error || "Invito non riuscito.";
        throw new Error(msg);
      }

      toast({
        title: "Invito inviato",
        description:
          (data as { message?: string })?.message ||
          "Il commercialista riceverà un'email con il link al portale.",
      });
      resetInviteForm();
      setInviteOpen(false);
      void loadAccesses();
    } catch (err) {
      setInviteError((err as Error)?.message || "Errore di rete.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleAction(
    access: AccountantAccessRow,
    action: "revoke" | "suspend" | "reactivate",
  ) {
    const confirmMessages: Record<typeof action, string> = {
      revoke: `Revocare l'accesso a "${access.firm_name}"? Il commercialista non potrà più vedere i tuoi dati.`,
      suspend: `Sospendere temporaneamente l'accesso a "${access.firm_name}"?`,
      reactivate: `Riattivare l'accesso a "${access.firm_name}"?`,
    };
    if (!window.confirm(confirmMessages[action])) return;

    try {
      const { data, error } = await supabase.functions.invoke(
        "update-accountant-company-access",
        {
          body: {
            access_id: access.access_id,
            action,
          },
        },
      );
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        throw new Error((data as { error?: string })?.error || "Operazione non riuscita.");
      }
      toast({
        title:
          action === "revoke"
            ? "Accesso revocato"
            : action === "suspend"
              ? "Accesso sospeso"
              : "Accesso riattivato",
      });
      void loadAccesses();
    } catch (err) {
      toast({
        title: "Errore",
        description: (err as Error)?.message || "Operazione non riuscita.",
        variant: "destructive",
      });
    }
  }

  if (!companyId) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
        Seleziona un'azienda per gestire l'accesso del commercialista.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Accesso del commercialista
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invita il tuo studio commercialista a vedere e operare sui dati di questa
            azienda. Scegli mode e permessi: revoca quando vuoi.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Invita commercialista
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Attivi
                </p>
                <p className="mt-1 text-2xl font-bold">{activeCount}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  In attesa
                </p>
                <p className="mt-1 text-2xl font-bold">{invitedCount}</p>
              </div>
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Studi collegati
                </p>
                <p className="mt-1 text-2xl font-bold">{accesses.length}</p>
              </div>
              <Landmark className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista accessi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deleghe attive</CardTitle>
          <CardDescription>
            Tutti gli studi commercialisti collegati o invitati a questa azienda.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Caricamento deleghe...
            </div>
          )}

          {loadError && !isLoading && (
            <div className="flex items-start gap-2 m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {!isLoading && !loadError && accesses.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Landmark className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Nessuno studio collegato</p>
                <p className="text-xs text-muted-foreground">
                  Invita il tuo commercialista per dargli accesso al portale studio
                  con i dati di questa azienda.
                </p>
              </div>
              <Button onClick={() => setInviteOpen(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Invita il primo commercialista
              </Button>
            </div>
          )}

          {!isLoading && !loadError && accesses.length > 0 && (
            <div className="divide-y">
              {accesses.map((access) => {
                const statusProps = getStatusBadgeProps(access.status);
                const StatusIcon = statusProps.icon;
                const isInvited = access.status === "invited";
                const isActive = access.status === "active";
                const isSuspended = access.status === "suspended";

                return (
                  <div
                    key={access.access_id}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{access.firm_name}</p>
                          <Badge variant={statusProps.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {statusProps.label}
                          </Badge>
                          <Badge variant="outline" className="gap-1 font-normal">
                            <Eye className="h-3 w-3" />
                            {getAccessModeLabel(access.access_mode)}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {access.owner_email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {access.owner_email}
                            </span>
                          )}
                          {access.firm_vat && <span>P.IVA {access.firm_vat}</span>}
                          {isInvited && access.invited_at && (
                            <span>
                              Invitato {new Date(access.invited_at).toLocaleDateString("it-IT")}
                            </span>
                          )}
                          {isActive && access.accepted_at && (
                            <span>
                              Attivo dal{" "}
                              {new Date(access.accepted_at).toLocaleDateString("it-IT")}
                            </span>
                          )}
                        </div>
                        {access.notes && (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            {access.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isSuspended && (
                            <DropdownMenuItem
                              onClick={() => void handleAction(access, "reactivate")}
                              className="gap-2"
                            >
                              <Play className="h-4 w-4" />
                              Riattiva
                            </DropdownMenuItem>
                          )}
                          {isActive && (
                            <DropdownMenuItem
                              onClick={() => void handleAction(access, "suspend")}
                              className="gap-2"
                            >
                              <Pause className="h-4 w-4" />
                              Sospendi
                            </DropdownMenuItem>
                          )}
                          {(isActive || isInvited || isSuspended) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => void handleAction(access, "revoke")}
                                className="gap-2 text-red-600 focus:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                                Revoca accesso
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-700" />
              Invita il tuo commercialista
            </DialogTitle>
            <DialogDescription>
              Inserisci l'email del commercialista. Riceverà un invito per accedere
              al portale studio con i permessi che selezioni qui sotto.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4">
            {inviteError && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="acc-invite-email">Email commercialista</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="acc-invite-email"
                  type="email"
                  inputMode="email"
                  placeholder="commercialista@studio.it"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="pl-10"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acc-invite-mode">Livello di accesso</Label>
              <Select
                value={inviteMode}
                onValueChange={(value: AccessMode) => setInviteMode(value)}
              >
                <SelectTrigger id="acc-invite-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {opt.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-700" />
                Permessi specifici
              </Label>
              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                {(Object.keys(PERMISSION_LABELS) as Array<keyof AccountantPermissions>).map(
                  (key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={!!invitePermissions[key]}
                        onCheckedChange={(checked) =>
                          setInvitePermissions((prev) => ({
                            ...prev,
                            [key]: !!checked,
                          }))
                        }
                      />
                      <span>{PERMISSION_LABELS[key]}</span>
                    </label>
                  ),
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                I permessi spuntati abilitano le aree corrispondenti nel portale studio.
                <span className="font-medium">Azioni di scrittura</span> è disattivato di
                default per sicurezza.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acc-invite-notes">Note (opzionale)</Label>
              <Textarea
                id="acc-invite-notes"
                placeholder="Es. studio interno, contratto in firma, ecc."
                value={inviteNotes}
                onChange={(event) => setInviteNotes(event.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setInviteOpen(false);
                  resetInviteForm();
                }}
                disabled={isInviting}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isInviting} className="gap-2">
                {isInviting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Invio in corso...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Invia invito
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
