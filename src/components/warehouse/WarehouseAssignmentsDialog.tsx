import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, UserPlus, UserX, Star, Loader2 } from "lucide-react";
import {
  useWarehouseAssignments,
  type CapabilityField,
  type WarehouseAssignmentRow,
} from "@/hooks/useWarehouseAssignments";

interface Props {
  warehouseId: string;
  warehouseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompanyProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

/** Label per le capability nel pannello. */
const CAP_LABELS: Record<CapabilityField, string> = {
  is_primary_manager: "Responsabile primario",
  can_receive_goods: "Può ricevere merce",
  can_ship_to_site: "Può spedire in cantiere",
  can_transfer: "Può trasferire",
  can_count_inventory: "Può inventariare",
  can_view_purchase_orders: "Vede ordini di acquisto",
  active: "Attivo",
};

const DEFAULT_CAPS: CapabilityField[] = [
  "can_receive_goods",
  "can_ship_to_site",
  "can_transfer",
  "can_count_inventory",
  "can_view_purchase_orders",
];

export function WarehouseAssignmentsDialog({
  warehouseId,
  warehouseName,
  open,
  onOpenChange,
}: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const {
    assignments,
    isLoading,
    assignUser,
    updateCapability,
    revokeAssignment,
    isAssigning,
    isRevoking,
  } = useWarehouseAssignments(open ? warehouseId : null);

  const [newUserId, setNewUserId] = useState<string>("");
  const [revokeTarget, setRevokeTarget] = useState<
    { id: string; name: string } | null
  >(null);

  // Elenco profili della company per selezione. Esclude chi è già assegnato e attivo.
  const { data: companyProfiles = [], isLoading: isLoadingProfiles } = useQuery<CompanyProfile[]>({
    queryKey: ["company-profiles", companyId],
    enabled: open && !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CompanyProfile[];
    },
  });

  const alreadyActiveUserIds = useMemo(
    () => new Set(assignments.filter((a) => a.active).map((a) => a.user_id)),
    [assignments],
  );

  const selectableProfiles = useMemo(
    () => companyProfiles.filter((p) => !alreadyActiveUserIds.has(p.id)),
    [companyProfiles, alreadyActiveUserIds],
  );

  const handleAssign = async () => {
    if (!newUserId) return;
    try {
      await assignUser({ warehouse_id: warehouseId, user_id: newUserId });
      setNewUserId("");
    } catch {
      /* toast già gestito in hook */
    }
  };

  const handleToggle = async (row: WarehouseAssignmentRow, field: CapabilityField, value: boolean) => {
    try {
      await updateCapability({ id: row.id, field, value });
    } catch {
      /* toast già gestito in hook */
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    try {
      await revokeAssignment(revokeTarget.id);
    } catch {
      /* toast già gestito in hook */
    } finally {
      setRevokeTarget(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Magazzinieri di {warehouseName}
          </DialogTitle>
          <DialogDescription>
            Gestisci chi può accedere a questo magazzino e le relative capability.
            L&apos;utente vedrà automaticamente Magazzino e Ordini in sidebar.
          </DialogDescription>
        </DialogHeader>

        {/* Add new user */}
        <div className="flex items-end gap-2 border-b pb-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="assign-user-select">Assegna utente</Label>
            <Select value={newUserId} onValueChange={setNewUserId}>
              <SelectTrigger
                id="assign-user-select"
                disabled={isLoadingProfiles}
                aria-label="Seleziona utente da assegnare a questo magazzino"
              >
                <SelectValue placeholder={isLoadingProfiles ? "Caricamento…" : "Scegli utente…"} />
              </SelectTrigger>
              <SelectContent>
                {selectableProfiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nessun utente disponibile
                  </div>
                ) : (
                  selectableProfiles.map((p) => {
                    const display = `${p.first_name} ${p.last_name}`.trim() || p.email;
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {display}
                        {p.email && display !== p.email && (
                          <span className="text-muted-foreground ml-2 text-xs">{p.email}</span>
                        )}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!newUserId || isAssigning}
          >
            {isAssigning ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4 mr-1" aria-hidden="true" />
            )}
            Aggiungi
          </Button>
        </div>

        {/* Assignments list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-3 pr-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Caricamento assegnazioni…
              </p>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessun utente assegnato a questo magazzino.
              </p>
            ) : (
              assignments.map((row) => {
                const displayName =
                  row.profile?.full_name || row.profile?.email || "Utente";
                return (
                  <div
                    key={row.id}
                    className={
                      "rounded-lg border p-3 space-y-3 " +
                      (row.active ? "" : "opacity-60 bg-muted/30")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{displayName}</span>
                          {row.is_primary_manager && (
                            <Badge variant="secondary" className="gap-1">
                              <Star
                                className="h-3 w-3 fill-amber-500 text-amber-500"
                                aria-hidden="true"
                              />
                              Responsabile
                            </Badge>
                          )}
                          {!row.active && <Badge variant="outline">Revocato</Badge>}
                        </div>
                        {row.profile?.email && (
                          <p className="text-xs text-muted-foreground truncate">
                            {row.profile.email}
                          </p>
                        )}
                      </div>
                      {row.active && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={() =>
                            setRevokeTarget({ id: row.id, name: displayName })
                          }
                          disabled={isRevoking}
                          aria-label={`Revoca ${displayName}`}
                        >
                          <UserX className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>

                    {/* Capability toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {DEFAULT_CAPS.map((cap) => {
                        const cid = `cap-${row.id}-${cap}`;
                        return (
                          <div
                            key={cap}
                            className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                          >
                            <Label htmlFor={cid} className="text-xs cursor-pointer">
                              {CAP_LABELS[cap]}
                            </Label>
                            <Switch
                              id={cid}
                              checked={row[cap]}
                              disabled={!row.active}
                              onCheckedChange={(v) => handleToggle(row, cap, v)}
                            />
                          </div>
                        );
                      })}
                      <div
                        className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 sm:col-span-2"
                      >
                        <Label
                          htmlFor={`cap-${row.id}-is_primary_manager`}
                          className="text-xs cursor-pointer"
                        >
                          {CAP_LABELS.is_primary_manager}
                        </Label>
                        <Switch
                          id={`cap-${row.id}-is_primary_manager`}
                          checked={row.is_primary_manager}
                          disabled={!row.active}
                          onCheckedChange={(v) =>
                            handleToggle(row, "is_primary_manager", v)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare l&apos;assegnazione?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per revocare l&apos;accesso di{" "}
              <strong>{revokeTarget?.name ?? "questo utente"}</strong> al
              magazzino <strong>{warehouseName}</strong>. Non potrà più ricevere
              merce, trasferire o inventariare finché non sarà riassegnato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeConfirm}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? "Revoca in corso…" : "Revoca"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
