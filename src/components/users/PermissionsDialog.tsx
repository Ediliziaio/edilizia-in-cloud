import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, HardHat, LayoutGrid, Euro, Users2, Megaphone, Zap, ChevronDown, ChevronRight, Settings, MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CRUSCOTTO_SECTIONS, CANTIERI_SECTIONS, FINANZA_SECTIONS,
  PERSONE_SECTIONS, MARKETING_SECTIONS, AUTOMAZIONI_SECTIONS, IMPOSTAZIONI_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags, syncLegacySettingsFlags,
  DEFAULT_PERMISSIONS,
  type PermissionSectionDef, type StaffRoleType,
} from "@/components/users/permissionsDefaults";

export interface StaffPermissions {
  // ── Cruscotto ──────────────────────────────────────────
  can_view_cruscotto: boolean;
  can_view_controllo_gestione: boolean;
  // ── Cantieri & Lavori ──────────────────────────────────
  can_view_dashboard: boolean;
  can_view_orders: boolean;
  can_edit_orders: boolean;
  can_view_order_amounts: boolean;
  can_approve_orders: boolean;
  can_delete_orders: boolean;
  can_view_warehouse: boolean;
  can_edit_warehouse: boolean;
  can_manage_warehouse_items: boolean;
  can_view_calendar: boolean;
  can_view_all_team_calendar: boolean;
  can_view_team_tasks: boolean;
  can_view_customers: boolean;
  can_edit_customers: boolean;
  can_export_clients: boolean;
  can_view_tickets: boolean;
  can_edit_tickets: boolean;
  can_view_interventi: boolean;
  can_view_manutenzione: boolean;
  can_view_sicurezza_cantiere: boolean;
  can_view_subappaltatori: boolean;
  can_view_firma_elettronica: boolean;
  // ── Finanza ────────────────────────────────────────────
  can_view_billing: boolean;
  can_view_scadenzario: boolean;
  can_view_tesoreria: boolean;
  can_view_prima_nota: boolean;
  can_view_costs: boolean;
  can_view_forecast: boolean;
  can_view_financial_reports: boolean;
  can_view_margins: boolean;
  can_manage_payments: boolean;
  can_manage_suppliers: boolean;
  // ── Persone ────────────────────────────────────────────
  can_view_persone: boolean;
  can_view_employees: boolean;
  can_view_users: boolean;
  can_view_giornale_lavori: boolean;
  can_edit_giornale_lavori: boolean;
  can_view_sopralluoghi: boolean;
  can_view_preventivi: boolean;
  can_edit_preventivi: boolean;
  can_approve_discounts: boolean;
  can_view_messaggi_esterni: boolean;
  /** Fruizione area Formazione */
  can_view_formazione: boolean;
  /** Gestione Portale corsi */
  can_manage_portal: boolean;
  // ── Marketing & Vendita ────────────────────────────────
  can_view_marketing: boolean;
  can_edit_marketing: boolean;
  can_view_marketing_dashboard: boolean;
  can_view_marketing_contacts: boolean;
  can_edit_marketing_contacts: boolean;
  can_view_marketing_opportunities: boolean;
  can_edit_marketing_opportunities: boolean;
  can_view_marketing_activities: boolean;
  can_view_marketing_appointments: boolean;
  can_view_marketing_email: boolean;
  can_view_marketing_whatsapp: boolean;
  can_view_marketing_reports: boolean;
  can_view_reputazione: boolean;
  // ── Automazioni & AI ───────────────────────────────────
  can_view_marketing_automations: boolean;
  can_view_marketing_ai_agent: boolean;
  can_view_automazioni: boolean;
  can_view_render_ai: boolean;
  can_view_sales_os: boolean;
  can_view_sms_marketing: boolean;
  // ── Impostazioni (legacy aggregate – auto-computed on save) ───────────
  can_view_settings: boolean;
  can_edit_settings: boolean;
  // ── Impostazioni granulari ─────────────────────────────────────────────
  can_view_settings_profile: boolean;
  can_edit_settings_profile: boolean;
  can_view_settings_orders: boolean;
  can_edit_settings_orders: boolean;
  can_view_settings_customization: boolean;
  can_edit_settings_customization: boolean;
  can_view_settings_people: boolean;
  can_edit_settings_people: boolean;
  can_view_settings_security: boolean;
  can_view_settings_pricing: boolean;
  can_edit_settings_pricing: boolean;
  can_view_settings_suppliers: boolean;
  can_edit_settings_suppliers: boolean;
  can_view_settings_integrations: boolean;
  can_edit_settings_integrations: boolean;
  // ── Speciali ───────────────────────────────────────────
  only_assigned: boolean;
  /** Aree visibili: se vuoto = tutte le aree. Valori: cantiere, commerciale, amministrazione, tecnico */
  visible_areas: string[];
  /** Flag interno: l'utente deve cambiare password al primo accesso */
  must_change_password?: boolean | null;
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
    await onSave(syncLegacySettingsFlags(syncLegacyMarketingFlags(permissions)));
    onOpenChange(false);
  };

  const handleSelectAll = () => {
    const allTrue: Partial<StaffPermissions> = {};
    ALL_PERMISSION_SECTIONS.forEach(s => {
      allTrue[s.viewKey] = true;
      if (s.editKey) allTrue[s.editKey] = true;
    });
    setPermissions(prev => ({ ...prev, ...allTrue, can_view_marketing: true, can_edit_marketing: true }));
  };

  const handleDeselectAll = () => {
    const allFalse: Partial<StaffPermissions> = {};
    ALL_PERMISSION_SECTIONS.forEach(s => {
      allFalse[s.viewKey] = false;
      if (s.editKey) allFalse[s.editKey] = false;
    });
    setPermissions(prev => ({
      ...prev,
      ...allFalse,
      can_view_marketing: false,
      can_edit_marketing: false,
      can_view_settings: false,
      can_edit_settings: false,
    }));
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
          <PermGroup label="Cruscotto" icon={LayoutGrid} iconColor="text-indigo-600"
            sections={CRUSCOTTO_SECTIONS} permissions={permissions} onToggle={handleToggle} />
          <PermGroup label="Cantieri & Lavori" icon={HardHat} iconColor="text-blue-600"
            sections={CANTIERI_SECTIONS} permissions={permissions} onToggle={handleToggle} />
          <PermGroup label="Finanza" icon={Euro} iconColor="text-emerald-600"
            sections={FINANZA_SECTIONS} permissions={permissions} onToggle={handleToggle} />
          <PermGroup label="Persone" icon={Users2} iconColor="text-amber-600"
            sections={PERSONE_SECTIONS} permissions={permissions} onToggle={handleToggle} />
          <PermGroup label="Marketing & Vendita" icon={Megaphone} iconColor="text-purple-600"
            sections={MARKETING_SECTIONS} permissions={permissions} onToggle={handleToggle} />
          <PermGroup label="Automazioni & AI" icon={Zap} iconColor="text-orange-600"
            sections={AUTOMAZIONI_SECTIONS} permissions={permissions} onToggle={handleToggle} />
          <PermGroup label="Impostazioni" icon={Settings} iconColor="text-slate-600"
            sections={IMPOSTAZIONI_SECTIONS} permissions={permissions} onToggle={handleToggle} />

          <Separator />

          {/* Visibilità sul team — trasversale a tutti i moduli, come only_assigned */}
          <div className="space-y-1 py-2">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-violet-600" />
              <Label className="font-medium">Visibilità sul team</Label>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <div>
                <Label htmlFor="can_view_team_tasks" className="text-sm cursor-pointer">Attività del team</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vede le attività (task) di tutto il team nella pagina Attività; spento vede solo le proprie
                </p>
              </div>
              <Switch
                id="can_view_team_tasks"
                checked={permissions.can_view_team_tasks || false}
                onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, can_view_team_tasks: checked }))}
              />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <div>
                <Label htmlFor="can_view_all_team_calendar" className="text-sm cursor-pointer">Calendario del team</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vede appuntamenti ed eventi di tutti nel calendario; spento vede solo i propri
                </p>
              </div>
              <Switch
                id="can_view_all_team_calendar"
                checked={permissions.can_view_all_team_calendar || false}
                onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, can_view_all_team_calendar: checked }))}
              />
            </div>
          </div>

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

          <Separator />

          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <Label className="font-medium">Aree visibili</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Seleziona le aree aziendali che l'utente può vedere nel calendario e nei dropdown di assegnazione.
              Se nessuna è selezionata, l'utente vede tutte le aree.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "cantiere", label: "🏗️ Cantiere", desc: "Operai e tecnici in cantiere" },
                { value: "commerciale", label: "💼 Commerciale", desc: "Venditori e agenti" },
                { value: "amministrazione", label: "🏢 Amministrazione", desc: "Staff ufficio" },
                { value: "tecnico", label: "🔧 Tecnico", desc: "Personale tecnico" },
              ] as const).map(area => {
                const checked = (permissions.visible_areas || []).includes(area.value);
                return (
                  <label
                    key={area.value}
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      checked ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        setPermissions(prev => {
                          const current = prev.visible_areas || [];
                          const next = c
                            ? [...current, area.value]
                            : current.filter(a => a !== area.value);
                          return { ...prev, visible_areas: next };
                        });
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">{area.label}</span>
                      <p className="text-xs text-muted-foreground">{area.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {(permissions.visible_areas || []).length === 0 && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">
                Nessuna area selezionata = accesso a tutte le aree (comportamento admin)
              </p>
            )}
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
