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
  DEFAULT_PERMISSIONS, isBlockedBySolaLettura, SOLA_LETTURA_BLOCKED_NOTE,
  type PermissionSectionDef, type StaffRoleType, type BooleanPermissionKey,
} from "@/components/users/permissionsDefaults";
import { SolaLetturaToggle } from "@/components/users/SolaLetturaToggle";

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
  can_view_settings_scontistica: boolean;
  can_edit_settings_scontistica: boolean;
  can_view_settings_finanziamenti: boolean;
  can_edit_settings_finanziamenti: boolean;
  can_view_settings_bundle: boolean;
  can_edit_settings_bundle: boolean;
  can_view_settings_suppliers: boolean;
  can_edit_settings_suppliers: boolean;
  can_view_settings_integrations: boolean;
  can_edit_settings_integrations: boolean;
  // ── Speciali ───────────────────────────────────────────
  only_assigned: boolean;
  /** Vede tutte e sole le commesse dei magazzini a cui è assegnato. Ignorato se only_assigned è attivo (più stretto). */
  only_my_warehouse: boolean;
  /** Vede le sue aree ma non crea e non modifica nulla. Le can_edit_* operative
   *  seguono la visibilità (trigger permessi_modifica_segue_visibilita). */
  sola_lettura: boolean;
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
  onToggle: (key: BooleanPermissionKey, value: boolean) => void;
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

  // In sola lettura le azioni speciali e le modifiche delle impostazioni
  // restano spente: gli interruttori sono disabilitati e «attiva tutto» li salta.
  const bloccato = (key: BooleanPermissionKey) => !!permissions.sola_lettura && isBlockedBySolaLettura(key);

  const handleToggleAll = (checked: boolean) => {
    sections.forEach(s => {
      if (!(checked && bloccato(s.viewKey))) onToggle(s.viewKey, checked);
      if (s.editKey && !(checked && bloccato(s.editKey))) onToggle(s.editKey, checked);
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Lo switch "attiva tutto" NON può stare dentro il bottone che apre il
          gruppo: un <button> dentro un <button> è HTML non valido — la
          tastiera non raggiunge lo switch e lo screen reader legge un solo
          comando. Ora la riga è un contenitore, e i due comandi (apri/chiudi
          e attiva-tutto) sono fratelli. Aspetto invariato. */}
      <div className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex flex-1 min-w-0 items-center gap-2 text-left">
            <Icon className={`h-4 w-4 ${iconColor}`} />
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeCount}/{totalCount}</Badge>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2 pl-2">
          <Switch checked={allActive} onCheckedChange={handleToggleAll} aria-label={`Attiva tutti i permessi di ${label}`} />
          <CollapsibleTrigger asChild>
            <button type="button" aria-label={open ? `Comprimi ${label}` : `Espandi ${label}`} className="text-muted-foreground">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className="px-3 pt-2 pb-1 space-y-2">
        {sections.map(section => (
          <div key={section.viewKey} className="flex items-start justify-between gap-3 py-1">
            <div className="flex items-start gap-2 min-w-0">
              <Switch
                id={section.viewKey}
                checked={permissions[section.viewKey]}
                disabled={bloccato(section.viewKey)}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <div className="min-w-0">
                <Label htmlFor={section.viewKey} className="text-sm cursor-pointer">{section.label}</Label>
                {/* La riga di spiegazione c'è da sempre nei dati e la mostrava
                    solo la creazione utente: qui, dove si modificano i permessi
                    di chi lavora già, restavano due interruttori senza contesto. */}
                {section.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{section.description}</p>
                )}
                {(bloccato(section.viewKey) || (section.editKey && bloccato(section.editKey))) && (
                  <p className="text-[11px] text-amber-600 mt-0.5">{SOLA_LETTURA_BLOCKED_NOTE}</p>
                )}
              </div>
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  id={section.editKey}
                  checked={permissions[section.editKey]}
                  disabled={bloccato(section.editKey)}
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

  const handleToggle = (key: BooleanPermissionKey, value: boolean) => {
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
    // La sola lettura resta com'è: syncLegacyMarketingFlags (applyEditFollowsView)
    // rispegne le modifiche bloccate.
    setPermissions(prev => syncLegacyMarketingFlags({ ...prev, ...allTrue, can_view_marketing: true }));
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
      only_my_warehouse: prev.only_my_warehouse,
      sola_lettura: prev.sola_lettura,
      ...preset,
    }));
  };

  const totalActive = useMemo(() => {
    const excluded = new Set(["only_assigned", "only_my_warehouse", "sola_lettura", "can_view_marketing", "can_edit_marketing"]);
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

          <SolaLetturaToggle
            id="sola_lettura"
            className="my-1"
            checked={permissions.sola_lettura || false}
            onCheckedChange={(checked) => setPermissions(prev => syncLegacyMarketingFlags({ ...prev, sola_lettura: checked }))}
          />

          {/* Terza modalità, per chi manda avanti una filiale: tutte le commesse
              del suo magazzino, comprese quelle dei colleghi di quel magazzino,
              e nessuna delle altre. "Solo elementi assegnati" è più stretta e,
              se accesa, ha la precedenza. */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label
                htmlFor="only_my_warehouse"
                className={`font-medium cursor-pointer ${permissions.only_assigned ? "text-muted-foreground" : ""}`}
              >
                Solo commesse del suo magazzino
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {permissions.only_assigned
                  ? "Ignorato: “Solo elementi assegnati” è più stretto e ha la precedenza."
                  : "Vede tutte le commesse dei magazzini che gli hai assegnato — anche quelle dei colleghi di quel magazzino — più le proprie. Serve un magazzino assegnato, altrimenti non vedrà nulla."}
              </p>
            </div>
            <Switch
              id="only_my_warehouse"
              checked={permissions.only_my_warehouse || false}
              disabled={permissions.only_assigned || false}
              onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, only_my_warehouse: checked }))}
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
