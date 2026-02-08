import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export interface StaffPermissions {
  can_view_dashboard: boolean;
  can_view_orders: boolean;
  can_edit_orders: boolean;
  can_view_warehouse: boolean;
  can_edit_warehouse: boolean;
  can_view_calendar: boolean;
  can_view_customers: boolean;
  can_edit_customers: boolean;
  can_view_employees: boolean;
  can_view_tickets: boolean;
  can_edit_tickets: boolean;
  can_view_forecast: boolean;
  can_view_settings: boolean;
}

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  currentPermissions: StaffPermissions;
  onSave: (permissions: StaffPermissions) => Promise<void>;
  isLoading?: boolean;
}

const PERMISSION_SECTIONS = [
  {
    label: "Dashboard",
    viewKey: "can_view_dashboard" as keyof StaffPermissions,
    editKey: null,
  },
  {
    label: "Ordini",
    viewKey: "can_view_orders" as keyof StaffPermissions,
    editKey: "can_edit_orders" as keyof StaffPermissions,
  },
  {
    label: "Magazzino",
    viewKey: "can_view_warehouse" as keyof StaffPermissions,
    editKey: "can_edit_warehouse" as keyof StaffPermissions,
  },
  {
    label: "Calendario",
    viewKey: "can_view_calendar" as keyof StaffPermissions,
    editKey: null,
  },
  {
    label: "Clienti",
    viewKey: "can_view_customers" as keyof StaffPermissions,
    editKey: "can_edit_customers" as keyof StaffPermissions,
  },
  {
    label: "Dipendenti",
    viewKey: "can_view_employees" as keyof StaffPermissions,
    editKey: null,
  },
  {
    label: "Assistenza",
    viewKey: "can_view_tickets" as keyof StaffPermissions,
    editKey: "can_edit_tickets" as keyof StaffPermissions,
  },
  {
    label: "Previsionale",
    viewKey: "can_view_forecast" as keyof StaffPermissions,
    editKey: null,
  },
  {
    label: "Impostazioni",
    viewKey: "can_view_settings" as keyof StaffPermissions,
    editKey: null,
  },
];

export function PermissionsDialog({
  open,
  onOpenChange,
  userName,
  currentPermissions,
  onSave,
  isLoading,
}: PermissionsDialogProps) {
  const [permissions, setPermissions] = useState<StaffPermissions>(currentPermissions);

  useEffect(() => {
    setPermissions(currentPermissions);
  }, [currentPermissions]);

  const handleToggle = (key: keyof StaffPermissions, value: boolean) => {
    setPermissions((prev) => {
      const updated = { ...prev, [key]: value };
      
      // If turning off view, also turn off edit
      const section = PERMISSION_SECTIONS.find((s) => s.viewKey === key);
      if (section?.editKey && !value) {
        updated[section.editKey] = false;
      }
      
      return updated;
    });
  };

  const handleSubmit = async () => {
    await onSave(permissions);
    onOpenChange(false);
  };

  const handleSelectAll = () => {
    setPermissions({
      can_view_dashboard: true,
      can_view_orders: true,
      can_edit_orders: true,
      can_view_warehouse: true,
      can_edit_warehouse: true,
      can_view_calendar: true,
      can_view_customers: true,
      can_edit_customers: true,
      can_view_employees: true,
      can_view_tickets: true,
      can_edit_tickets: true,
      can_view_forecast: true,
      can_view_settings: true,
    });
  };

  const handleDeselectAll = () => {
    setPermissions({
      can_view_dashboard: false,
      can_view_orders: false,
      can_edit_orders: false,
      can_view_warehouse: false,
      can_edit_warehouse: false,
      can_view_calendar: false,
      can_view_customers: false,
      can_edit_customers: false,
      can_view_employees: false,
      can_view_tickets: false,
      can_edit_tickets: false,
      can_view_forecast: false,
      can_view_settings: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permessi - {userName}</DialogTitle>
          <DialogDescription>
            Seleziona le sezioni a cui l'utente può accedere
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Seleziona tutti
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Deseleziona tutti
            </Button>
          </div>

          <Separator />

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {PERMISSION_SECTIONS.map((section) => (
              <div key={section.viewKey} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={section.viewKey}
                    checked={permissions[section.viewKey]}
                    onCheckedChange={(checked) =>
                      handleToggle(section.viewKey, checked as boolean)
                    }
                  />
                  <Label htmlFor={section.viewKey} className="font-medium">
                    {section.label}
                  </Label>
                </div>

                {section.editKey && permissions[section.viewKey] && (
                  <div className="ml-6 flex items-center space-x-2">
                    <Checkbox
                      id={section.editKey}
                      checked={permissions[section.editKey]}
                      onCheckedChange={(checked) =>
                        handleToggle(section.editKey!, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={section.editKey}
                      className="text-sm text-muted-foreground"
                    >
                      Può modificare
                    </Label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva Permessi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
