import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2, Save, Search, ShieldCheck, User, EyeOff, TrendingUp, Phone, HardHat, Building2 } from "lucide-react";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";

/**
 * Each PermissionModule maps 1:1 to a unique DB column.
 * `includes` lists the UI modules that share this same DB permission.
 */
interface PermissionModule {
  id: string;
  label: string;
  description: string;
  viewKey: keyof StaffPermissions;
  editKey?: keyof StaffPermissions;
  includes?: string[];
}

interface PermissionCategory {
  id: string;
  label: string;
  modules: PermissionModule[];
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "cruscotto",
    label: "Cruscotto",
    modules: [
      { id: "cruscotto", label: "Cruscotto Aziendale", description: "Centro di controllo executive unificato", viewKey: "can_view_cruscotto" },
    ],
  },
  {
    id: "cantieri",
    label: "Cantieri & Lavori",
    modules: [
      { id: "dashboard",        label: "Dashboard",              description: "Visualizza la dashboard principale",       viewKey: "can_view_dashboard" },
      { id: "orders",           label: "Ordini e Commesse",      description: "Gestisci ordini e commesse",               viewKey: "can_view_orders",               editKey: "can_edit_orders" },
      { id: "approve-orders",   label: "Approva Ordini",         description: "Può approvare ordini e commesse",          viewKey: "can_approve_orders" },
      { id: "delete-orders",    label: "Elimina Ordini",         description: "Può eliminare ordini e commesse",          viewKey: "can_delete_orders" },
      { id: "warehouse",        label: "Magazzino",              description: "Gestisci inventario e movimenti",          viewKey: "can_view_warehouse",            editKey: "can_edit_warehouse" },
      { id: "warehouse-items",  label: "Gestione Articoli",      description: "Gestisci articoli e listino magazzino",    viewKey: "can_manage_warehouse_items" },
      { id: "calendar",         label: "Calendario",             description: "Visualizza e gestisci il calendario",      viewKey: "can_view_calendar" },
      { id: "team-calendar",    label: "Calendario del team",    description: "Visualizza il calendario di tutto il team", viewKey: "can_view_all_team_calendar" },
      { id: "customers",        label: "Clienti",                description: "Gestisci anagrafica clienti",              viewKey: "can_view_customers",            editKey: "can_edit_customers" },
      { id: "export-clients",   label: "Esporta Clienti",        description: "Esporta l'anagrafica clienti in CSV",      viewKey: "can_export_clients" },
      { id: "tickets",          label: "Ticket Assistenza",      description: "Gestisci ticket di supporto",              viewKey: "can_view_tickets",              editKey: "can_edit_tickets" },
      { id: "interventi",       label: "Interventi",             description: "Gestisci interventi tecnici pianificati",  viewKey: "can_view_interventi" },
      { id: "manutenzione",     label: "Manutenzione",           description: "Gestisci piani di manutenzione programmata", viewKey: "can_view_manutenzione" },
      { id: "sicurezza",        label: "Sicurezza Cantiere",     description: "Accesso al modulo sicurezza e PSC",        viewKey: "can_view_sicurezza_cantiere" },
      { id: "subappaltatori-perm", label: "Subappaltatori",      description: "Visualizza e gestisci subappaltatori",     viewKey: "can_view_subappaltatori" },
    ],
  },
  {
    id: "finanza",
    label: "Finanza",
    modules: [
      { id: "billing",          label: "Fatturazione e Scadenzario", description: "Fatture, scadenzario e tesoreria",        viewKey: "can_view_billing",           includes: ["Scadenzario", "Tesoreria"] },
      { id: "prima-nota",       label: "Prima Nota e Contabilità",   description: "Registrazioni contabili",                 viewKey: "can_view_prima_nota" },
      { id: "costs",            label: "Costi",                      description: "Gestione e analisi costi",                viewKey: "can_view_costs" },
      { id: "forecast",         label: "Previsionale",               description: "Previsioni finanziarie e ordini acquisto", viewKey: "can_view_forecast",          includes: ["Ordini Acquisto"] },
      { id: "financial-reports",label: "Report Finanziari",          description: "Visualizza report e analisi finanziarie", viewKey: "can_view_financial_reports" },
      { id: "margins",          label: "Visualizza Margini",         description: "Visualizza i margini per ordine",         viewKey: "can_view_margins" },
      { id: "payments",         label: "Gestione Pagamenti",         description: "Gestisci e registra i pagamenti",         viewKey: "can_manage_payments" },
      { id: "suppliers",        label: "Gestione Fornitori",         description: "Gestisci l'anagrafica fornitori",         viewKey: "can_manage_suppliers" },
    ],
  },
  {
    id: "persone",
    label: "Persone",
    modules: [
      { id: "persone",            label: "Personale, Chat e Messaggistica", description: "HR, chat interna e messaggistica",                 viewKey: "can_view_persone" },
      { id: "employees",          label: "Gestione Dipendenti",             description: "Anagrafica e dati dipendenti",                     viewKey: "can_view_employees" },
      { id: "users",              label: "Utenti & Team",                   description: "Gestisci utenti e team aziendali",                 viewKey: "can_view_users" },
      { id: "giornale-lavori",    label: "Giornale Lavori",                 description: "Visualizza le registrazioni giornaliere di cantiere", viewKey: "can_view_giornale_lavori" },
      { id: "messaggi-esterni",   label: "Messaggi Esterni",                description: "Accesso alla messaggistica esterna",               viewKey: "can_view_messaggi_esterni" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Vendita",
    modules: [
      { id: "mkt-dashboard",     label: "Dashboard Marketing", description: "Panoramica performance marketing",          viewKey: "can_view_marketing_dashboard" },
      { id: "mkt-contacts",      label: "Contatti CRM",        description: "Gestisci contatti marketing",              viewKey: "can_view_marketing_contacts",      editKey: "can_edit_marketing_contacts" },
      { id: "mkt-opportunities", label: "Opportunità",         description: "Gestisci pipeline e opportunità",          viewKey: "can_view_marketing_opportunities", editKey: "can_edit_marketing_opportunities", includes: ["Preventivi", "Sales OS"] },
      { id: "mkt-activities",    label: "Attività",            description: "Visualizza attività marketing",            viewKey: "can_view_marketing_activities" },
      { id: "mkt-appointments",  label: "Appuntamenti",        description: "Gestisci appuntamenti commerciali",        viewKey: "can_view_marketing_appointments" },
      { id: "mkt-email",         label: "Email Marketing",     description: "Campagne e template email",                viewKey: "can_view_marketing_email" },
      { id: "mkt-sms",           label: "SMS Marketing",       description: "Campagne e automazioni SMS",               viewKey: "can_view_sms_marketing" },
      { id: "mkt-whatsapp",      label: "WhatsApp",            description: "Messaggistica WhatsApp",                   viewKey: "can_view_marketing_whatsapp" },
      { id: "mkt-sales-os",      label: "Sales OS",            description: "Dashboard e strumenti commerciali avanzati", viewKey: "can_view_sales_os" },
      { id: "mkt-reports",       label: "Reportistica",        description: "Report e analisi marketing",               viewKey: "can_view_marketing_reports" },
    ],
  },
  {
    id: "automazioni",
    label: "Automazioni & AI",
    modules: [
      { id: "automations", label: "Automazioni", description: "Flussi automatizzati",      viewKey: "can_view_automazioni" },
      { id: "ai-agent",    label: "Agenti AI",   description: "Agenti AI voce e chat",     viewKey: "can_view_marketing_ai_agent" },
      { id: "render-ai",   label: "Render AI",   description: "Generazione render con AI", viewKey: "can_view_render_ai" },
    ],
  },
  {
    id: "impostazioni",
    label: "Impostazioni",
    modules: [
      { id: "settings-profile", label: "Profilo Aziendale",   description: "Visualizza e modifica il profilo e i dati aziendali",           viewKey: "can_view_settings_profile",       editKey: "can_edit_settings_profile" },
      { id: "settings-orders",  label: "Gestione Ordini",    description: "Listino prodotti, tariffe, stati ordine, fornitori e categorie",  viewKey: "can_view_settings_orders",         editKey: "can_edit_settings_orders" },
      { id: "settings-custom",  label: "Personalizzazione",  description: "Tag, campi personalizzati, sequenze, calendari e template",       viewKey: "can_view_settings_customization",  editKey: "can_edit_settings_customization" },
      { id: "settings-people",  label: "Team & Persone",     description: "Gestisci venditori, staff operai e team aziendali",              viewKey: "can_view_settings_people",         editKey: "can_edit_settings_people" },
      { id: "settings-sec",     label: "Sicurezza & Privacy",description: "Privacy, GDPR e impostazioni di sicurezza",                      viewKey: "can_view_settings_security" },
    ],
  },
];

export type CompanyRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

interface UserRolesPermissionsTabProps {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    role?: CompanyRole;
    permissions: StaffPermissions | null;
  };
  onSave: (permissions: StaffPermissions) => void;
  onChangeRole?: (newRole: CompanyRole) => void;
  isLoading?: boolean;
  isChangingRole?: boolean;
}

export function UserRolesPermissionsTab({ user, onSave, onChangeRole, isLoading, isChangingRole }: UserRolesPermissionsTabProps) {
  const [permissions, setPermissions] = useState<StaffPermissions>(user.permissions || DEFAULT_PERMISSIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    PERMISSION_CATEGORIES.map(c => c.id)
  );
  const [selectedRole, setSelectedRole] = useState<CompanyRole>(user.role || "company_staff");

  const originalPermissions = useMemo(() => user.permissions || DEFAULT_PERMISSIONS, [user.permissions]);

  useEffect(() => {
    if (user.permissions) setPermissions(user.permissions);
  }, [user.permissions]);

  const isDirty = useMemo(() => {
    const keys = Object.keys(DEFAULT_PERMISSIONS) as (keyof StaffPermissions)[];
    return keys.some(key => (permissions[key] ?? false) !== (originalPermissions[key] ?? false));
  }, [permissions, originalPermissions]);

  useEffect(() => {
    if (user.role) setSelectedRole(user.role);
  }, [user.role]);

  const handleRoleChange = (value: string) => {
    const newRole = value as CompanyRole;
    setSelectedRole(newRole);
    onChangeRole?.(newRole);
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleToggle = (key: keyof StaffPermissions, value: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev, [key]: value };
      if (!value) {
        const allModules = PERMISSION_CATEGORIES.flatMap(c => c.modules);
        allModules.forEach(mod => {
          if (mod.viewKey === key && mod.editKey) {
            updated[mod.editKey] = false;
          }
        });
      }
      return updated;
    });
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return PERMISSION_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return PERMISSION_CATEGORIES.map(cat => ({
      ...cat,
      modules: cat.modules.filter(m =>
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.includes?.some(inc => inc.toLowerCase().includes(q))
      ),
    })).filter(cat => cat.modules.length > 0);
  }, [searchQuery]);

  const getCategoryPermCount = (cat: PermissionCategory) => {
    const uniqueKeys = new Set(cat.modules.map(m => m.viewKey));
    const total = uniqueKeys.size;
    const activeKeys = new Set(cat.modules.filter(m => permissions[m.viewKey]).map(m => m.viewKey));
    const active = activeKeys.size;
    return { active, total };
  };

  const handleSelectAll = () => {
    setPermissions(prev => {
      const allTrue: StaffPermissions = { ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned };
      const allModules = PERMISSION_CATEGORIES.flatMap(c => c.modules);
      allModules.forEach(mod => {
        allTrue[mod.viewKey] = true;
        if (mod.editKey) allTrue[mod.editKey] = true;
      });
      allTrue.can_view_marketing = true;
      allTrue.can_edit_marketing = true;
      return allTrue;
    });
  };

  const handleDeselectAll = () => {
    setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  const isAdmin = selectedRole === "company_admin";

  return (
    <div className="space-y-6">
      {/* Role selector */}
      <Card>
        <CardHeader>
          <CardTitle>Ruolo Utente</CardTitle>
          <CardDescription>Seleziona il tipo di ruolo per {user.first_name} {user.last_name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={selectedRole} onValueChange={handleRoleChange} disabled={isChangingRole}>
              <SelectTrigger className="w-[250px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company_admin">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Amministratore</div>
                </SelectItem>
                <SelectItem value="company_staff">
                  <div className="flex items-center gap-2"><User className="h-4 w-4" />Utente</div>
                </SelectItem>
                <SelectItem value="salesperson">
                  <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Venditore</div>
                </SelectItem>
                <SelectItem value="call_center">
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4" />Call Center</div>
                </SelectItem>
                <SelectItem value="employee">
                  <div className="flex items-center gap-2"><HardHat className="h-4 w-4 text-amber-600" />Operaio / Tecnico</div>
                </SelectItem>
                <SelectItem value="subcontractor">
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-purple-600" />Subappaltatore</div>
                </SelectItem>
              </SelectContent>
            </Select>
            {isChangingRole && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Accesso completo</p>
                <p className="text-sm text-muted-foreground">Gli amministratori hanno accesso a tutti i moduli e possono gestire gli altri utenti.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Autorizzazioni</CardTitle>
              <CardDescription>Configura i permessi di accesso ai moduli</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="font-medium flex items-center gap-2">
                    <EyeOff className="h-4 w-4" />
                    Limita visibilità ai dati assegnati
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se attivo, l'utente vedrà solo ordini, attività e appuntamenti assegnati a lui
                  </p>
                </div>
                <Switch
                  checked={permissions.only_assigned || false}
                  onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
                />
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cerca modulo..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>Seleziona tutti</Button>
                <Button type="button" variant="outline" size="sm" onClick={handleDeselectAll}>Deseleziona tutti</Button>
              </div>

              <div className="space-y-3">
                {filteredCategories.map((category) => {
                  const isExpanded = expandedCategories.includes(category.id);
                  const { active, total } = getCategoryPermCount(category);
                  return (
                    <Collapsible key={category.id} open={isExpanded} onOpenChange={() => toggleCategory(category.id)}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="font-semibold text-sm">{category.label}</span>
                        </div>
                        <Badge variant={active > 0 ? "default" : "secondary"} className="text-xs">{active}/{total}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 ml-2 border-l-2 border-muted pl-4 space-y-1">
                          {category.modules.map((mod) => {
                            const viewEnabled = permissions[mod.viewKey] as boolean;
                            return (
                              <div key={mod.id} className="p-3 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Switch checked={viewEnabled} onCheckedChange={(checked) => handleToggle(mod.viewKey, checked)} />
                                    <div>
                                      <p className="text-sm font-medium">{mod.label}</p>
                                      <p className="text-xs text-muted-foreground">{mod.description}</p>
                                      {mod.includes && mod.includes.length > 0 && (
                                        <p className="text-xs text-muted-foreground/70 mt-0.5">Include: {mod.includes.join(", ")}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {viewEnabled && mod.editKey && (
                                  <div className="mt-2 ml-12 flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                      <Checkbox id={`${mod.id}-view`} checked={true} disabled />
                                      <Label htmlFor={`${mod.id}-view`} className="text-xs text-muted-foreground">Visualizza</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        id={`${mod.id}-edit`}
                                        checked={permissions[mod.editKey] as boolean}
                                        onCheckedChange={(checked) => handleToggle(mod.editKey!, checked as boolean)}
                                      />
                                      <Label htmlFor={`${mod.id}-edit`} className="text-xs text-muted-foreground">Modifica</Label>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            {isDirty ? (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                Modifiche non salvate
              </span>
            ) : <span />}
            <Button onClick={() => onSave(permissions)} disabled={isLoading || !isDirty}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salva Permessi
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
