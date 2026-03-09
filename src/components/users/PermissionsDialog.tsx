import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, LayoutDashboard, Megaphone, ChevronDown, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  STANDALONE_SECTIONS, INTERNAL_SECTIONS, MARKETING_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags,
  DEFAULT_PERMISSIONS,
  type PermissionSectionDef, type StaffRoleType,
} from "@/components/users/permissionsDefaults";

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
  can_edit_settings: boolean;
  can_view_marketing: boolean;
  can_edit_marketing: boolean;
  can_view_marketing_dashboard: boolean;
  can_view_marketing_contacts: boolean;
  can_edit_marketing_contacts: boolean;
  can_view_marketing_opportunities: boolean;
  can_edit_marketing_opportunities: boolean;
  can_view_marketing_activities: boolean;
  can_view_marketing_appointments: boolean;
  can_view_marketing_automations: boolean;
  can_view_marketing_ai_agent: boolean;
  can_view_marketing_email: boolean;
  can_view_marketing_whatsapp: boolean;
  can_view_marketing_reports: boolean;
  can_view_cruscotto: boolean;
  only_assigned: boolean;
}

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  currentPermissions: StaffPermissions;
  onSave: (permissions: StaffPermissions) => Promise<void>;
  isLoading?: boolean;
  userRole?: StaffRoleType;
}

interface PermGroupProps {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  sections: PermissionSectionDef[];
  permissions: StaffPermissions;
  onToggle: (key: keyof StaffPermissions, value: boolean) => void;
}

function PermGroup({ label, icon: Icon, iconColor, sections, permissions, onToggle }: PermGroupProps) {
  const [open, setOpen] = useState(true);

  const activeCount = sections.reduce((count, s) => {
    let c = permissions[s.viewKey] ? 1 : 0;
    if (s.editKey && permissions[s.editKey]) c++;
    return count + c;
  }, 0);

  const totalCount = sections.reduce((count, s) => count + 1 + (s.editKey ? 1 : 0), 0);

  const allActive = activeCount === totalCount;

  const handleToggleAll = (checked: boolean) => {
    sections.forEach(s => {
      onToggle(s.viewKey, checked);
      if (s.editKey) onToggle(s.editKey, checked);
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColor}`} />
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeCount}/{totalCount}</Badge>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Switch checked={allActive} onCheckedChange={handleToggleAll} />
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pt-2 pb-1 space-y-2">
        {sections.map(section => (
          <div key={section.viewKey} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Switch
                id={section.viewKey}
                checked={permissions[section.viewKey]}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <Label htmlFor={section.viewKey} className="text-sm cursor-pointer">{section.label}</Label>
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id={section.editKey}
                  checked={permissions[section.editKey]}
                  onCheckedChange={(checked) => onToggle(section.editKey!, checked)}
                />
                <Label htmlFor={section.editKey} className="text-xs text-muted-foreground cursor-pointer">Modifica</Label>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PermissionsDialog({
  open, onOpenChange, userName, currentPermissions, onSave, isLoading, userRole,
}: PermissionsDialogProps) {
  const [permissions, setPermissions] = useState<StaffPermissions>(currentPermissions);

  useEffect(() => {
    setPermissions(currentPermissions);
  }, [currentPermissions]);

  const handleToggle = (key: keyof StaffPermissions, value: boolean) => {
    setPermissions((prev) => {
      const updated = { ...prev, [key]: value };
      const section = ALL_PERMISSION_SECTIONS.find((s) => s.viewKey === key);
      if (section?.editKey && !value) {
        updated[section.editKey] = false;
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    await onSave(syncLegacyMarketingFlags(permissions));
    onOpenChange(false);
  };

  const handleSelectAll = () => {
    const allTrue: Partial<StaffPermissions> = {};
    ALL_PERMISSION_SECTIONS.forEach(s => {
      (allTrue as any)[s.viewKey] = true;
      if (s.editKey) (allTrue as any)[s.editKey] = true;
    });
    setPermissions(prev => ({ ...prev, ...allTrue, can_view_marketing: true, can_edit_marketing: true }));
  };

  const handleDeselectAll = () => {
    const allFalse: Partial<StaffPermissions> = {};
    ALL_PERMISSION_SECTIONS.forEach(s => {
      (allFalse as any)[s.viewKey] = false;
      if (s.editKey) (allFalse as any)[s.editKey] = false;
    });
    setPermissions(prev => ({ ...prev, ...allFalse, can_view_marketing: false, can_edit_marketing: false }));
  };

  const handleResetPreset = () => {
    if (!userRole || userRole === "company_admin") return;
    const preset = ROLE_PRESETS[userRole];
    setPermissions(prev => ({
      ...DEFAULT_PERMISSIONS,
      only_assigned: prev.only_assigned,
      ...preset,
    }));
  };

  const totalActive = useMemo(() => {
    const excluded = new Set(["only_assigned", "can_view_marketing", "can_edit_marketing"]);
    return Object.entries(permissions).filter(([k, v]) => v === true && !excluded.has(k)).length;
  }, [permissions]);

  const roleLabel: Record<string, string> = {
    company_staff: "Operatore",
    salesperson: "Venditore",
    call_center: "Call Center",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Permessi — {userName}</span>
            <Badge variant="outline">{totalActive} attivi</Badge>
          </DialogTitle>
          <DialogDescription>Seleziona le sezioni a cui l'utente può accedere</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>Seleziona tutti</Button>
          <Button variant="outline" size="sm" onClick={handleDeselectAll}>Deseleziona tutti</Button>
          {userRole && userRole !== "company_admin" && (
            <Button variant="outline" size="sm" onClick={handleResetPreset}>
              Ripristina preset {roleLabel[userRole] || ""}
            </Button>
          )}
        </div>

        <Separator />

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
          <PermGroup
            label="Cruscotto Aziendale"
            icon={Building2}
            iconColor="text-indigo-600"
            sections={STANDALONE_SECTIONS}
            permissions={permissions}
            onToggle={handleToggle}
          />
          <PermGroup
            label="Gestione Interna"
            icon={LayoutDashboard}
            iconColor="text-blue-600"
            sections={INTERNAL_SECTIONS}
            permissions={permissions}
            onToggle={handleToggle}
          />
          <PermGroup
            label="Marketing e Vendite"
            icon={Megaphone}
            iconColor="text-purple-600"
            sections={MARKETING_SECTIONS}
            permissions={permissions}
            onToggle={handleToggle}
          />

          <Separator />

          <div className="flex items-center justify-between py-2">
            <div>
              <Label htmlFor="only_assigned" className="font-medium cursor-pointer">Solo elementi assegnati</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se attivo, l'utente vedrà SOLO ordini, attività e appuntamenti assegnati a lui
              </p>
            </div>
            <Switch
              id="only_assigned"
              checked={permissions.only_assigned || false}
              onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva Permessi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
