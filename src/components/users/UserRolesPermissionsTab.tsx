import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  User,
  EyeOff,
  TrendingUp,
  Phone,
  HardHat,
  Building2,
  Info,
  Check,
  X,
  Sparkles,
  Lock,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { DEFAULT_PERMISSIONS, ROLE_PRESETS, ECONOMIC_LEVELS, detectEconomicLevel, type BooleanPermissionKey } from "@/components/users/permissionsDefaults";

/**
 * Each PermissionModule maps 1:1 to a unique DB column.
 * `includes` lists the UI modules that share this same DB permission.
 */
interface PermissionModule {
  id: string;
  label: string;
  description: string;
  viewKey: BooleanPermissionKey;
  editKey?: BooleanPermissionKey;
  includes?: string[];
}

interface PermissionCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  modules: PermissionModule[];
}

// ─── Categorie permessi ──────────────────────────────────────────────
import {
  LayoutDashboard,
  Hammer,
  Euro,
  Users as UsersIcon,
  Megaphone,
  Bot,
  Settings as SettingsIcon,
} from "lucide-react";

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "cruscotto",
    label: "Cruscotto",
    icon: LayoutDashboard,
    modules: [
      { id: "cruscotto", label: "Cruscotto Aziendale", description: "Centro di controllo executive unificato", viewKey: "can_view_cruscotto" },
      { id: "controllo-gestione", label: "Controllo di Gestione", description: "Direzione & bilancio: conto economico, KPI, tesoreria (CFO)", viewKey: "can_view_controllo_gestione" },
    ],
  },
  {
    id: "cantieri",
    label: "Cantieri & Lavori",
    icon: Hammer,
    modules: [
      { id: "dashboard",        label: "Dashboard",              description: "Visualizza la dashboard principale",       viewKey: "can_view_dashboard" },
      { id: "orders",           label: "Ordini e Commesse",      description: "Gestisci ordini e commesse",               viewKey: "can_view_orders",               editKey: "can_edit_orders" },
      { id: "order-amounts",    label: "Importi di vendita",     description: "Vede importi e prezzi di vendita in commesse e preventivi", viewKey: "can_view_order_amounts" },
      { id: "approve-orders",   label: "Approva Ordini",         description: "Può approvare ordini e commesse",          viewKey: "can_approve_orders" },
      { id: "delete-orders",    label: "Elimina Ordini",         description: "Può eliminare ordini e commesse",          viewKey: "can_delete_orders" },
      { id: "warehouse",        label: "Magazzino",              description: "Gestisci inventario e movimenti",          viewKey: "can_view_warehouse",            editKey: "can_edit_warehouse" },
      { id: "warehouse-items",  label: "Gestione Articoli",      description: "Gestisci articoli e listino magazzino",    viewKey: "can_manage_warehouse_items" },
      { id: "calendar",         label: "Calendario",             description: "Visualizza e gestisci il calendario",      viewKey: "can_view_calendar" },
      { id: "customers",        label: "Clienti",                description: "Gestisci anagrafica clienti",              viewKey: "can_view_customers",            editKey: "can_edit_customers" },
      { id: "export-clients",   label: "Esporta Clienti",        description: "Esporta l'anagrafica clienti in CSV",      viewKey: "can_export_clients" },
      { id: "tickets",          label: "Ticket Assistenza",      description: "Gestisci ticket di supporto",              viewKey: "can_view_tickets",              editKey: "can_edit_tickets" },
      { id: "interventi",       label: "Interventi",             description: "Gestisci interventi tecnici pianificati",  viewKey: "can_view_interventi" },
      { id: "manutenzione",     label: "Manutenzione",           description: "Gestisci piani di manutenzione programmata", viewKey: "can_view_manutenzione" },
      { id: "sicurezza",        label: "Sicurezza Cantiere",     description: "Accesso al modulo sicurezza e PSC",        viewKey: "can_view_sicurezza_cantiere" },
      { id: "subappaltatori-perm", label: "Subappaltatori",      description: "Visualizza e gestisci subappaltatori",     viewKey: "can_view_subappaltatori" },
      { id: "firma-elettronica",   label: "Firma Elettronica (FEA)", description: "Modulo firma elettronica avanzata (cantieri e CRM)", viewKey: "can_view_firma_elettronica" },
    ],
  },
  {
    id: "finanza",
    label: "Finanza",
    icon: Euro,
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
    icon: UsersIcon,
    modules: [
      { id: "persone",            label: "Personale, Chat e Messaggistica", description: "HR, chat interna e messaggistica",                 viewKey: "can_view_persone" },
      { id: "employees",          label: "Gestione Dipendenti",             description: "Anagrafica e dati dipendenti",                     viewKey: "can_view_employees" },
      { id: "users",              label: "Utenti & Team",                   description: "Gestisci utenti e team aziendali",                 viewKey: "can_view_users" },
      { id: "giornale-lavori",    label: "Giornale Lavori",                 description: "Visualizza e compila le registrazioni giornaliere di cantiere", viewKey: "can_view_giornale_lavori", editKey: "can_edit_giornale_lavori" },
      { id: "formazione",         label: "Formazione (fruizione corsi)",    description: "Accede all'area Formazione per seguire i corsi assegnati",   viewKey: "can_view_formazione" },
      { id: "portale-gestione",   label: "Portale corsi (gestione)",        description: "Gestisce il Portale corsi: crea/modifica corsi, iscrizioni, materiali", viewKey: "can_manage_portal" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Vendita",
    icon: Megaphone,
    modules: [
      { id: "mkt-dashboard",     label: "Dashboard Marketing", description: "Panoramica performance marketing",          viewKey: "can_view_marketing_dashboard" },
      { id: "mkt-contacts",      label: "Contatti CRM",        description: "Gestisci contatti marketing",              viewKey: "can_view_marketing_contacts",      editKey: "can_edit_marketing_contacts" },
      { id: "mkt-opportunities", label: "Opportunità",         description: "Gestisci pipeline e opportunità",          viewKey: "can_view_marketing_opportunities", editKey: "can_edit_marketing_opportunities", includes: ["Sales OS"] },
      { id: "mkt-preventivi",    label: "Preventivi",          description: "Crea e gestisci i preventivi",             viewKey: "can_view_preventivi",              editKey: "can_edit_preventivi" },
      { id: "mkt-approve-disc",  label: "Approva Sconti",      description: "Può approvare/impostare sconti oltre soglia (approvazione sconti)", viewKey: "can_approve_discounts" },
      { id: "mkt-sopralluoghi",  label: "Sopralluoghi",        description: "Sopralluoghi tecnici e firma cliente",     viewKey: "can_view_sopralluoghi" },
      { id: "mkt-activities",    label: "Attività",            description: "Visualizza attività marketing",            viewKey: "can_view_marketing_activities" },
      { id: "mkt-appointments",  label: "Appuntamenti",        description: "Gestisci appuntamenti commerciali",        viewKey: "can_view_marketing_appointments" },
      { id: "mkt-email",         label: "Email Marketing",     description: "Campagne e template email",                viewKey: "can_view_marketing_email" },
      { id: "mkt-sms",           label: "SMS Marketing",       description: "Campagne e automazioni SMS",               viewKey: "can_view_sms_marketing" },
      { id: "mkt-whatsapp",      label: "WhatsApp",            description: "Messaggistica WhatsApp",                   viewKey: "can_view_marketing_whatsapp" },
      { id: "mkt-sales-os",      label: "Sales OS",            description: "Dashboard e strumenti commerciali avanzati", viewKey: "can_view_sales_os" },
      { id: "mkt-reports",       label: "Reportistica",        description: "Report e analisi marketing",               viewKey: "can_view_marketing_reports" },
      { id: "mkt-reputazione",   label: "Reputazione",         description: "Gestione recensioni e reputazione online",  viewKey: "can_view_reputazione" },
    ],
  },
  {
    id: "automazioni",
    label: "Automazioni & AI",
    icon: Bot,
    modules: [
      { id: "automations", label: "Automazioni", description: "Flussi automatizzati",      viewKey: "can_view_automazioni" },
      { id: "ai-agent",    label: "Agenti AI",   description: "Agenti AI voce e chat",     viewKey: "can_view_marketing_ai_agent" },
      { id: "render-ai",   label: "Render AI",   description: "Generazione render con AI", viewKey: "can_view_render_ai" },
    ],
  },
  {
    id: "impostazioni",
    label: "Impostazioni",
    icon: SettingsIcon,
    modules: [
      { id: "settings-profile",   label: "Profilo Aziendale",     description: "Anagrafica, logo, dati fiscali e portale clienti",                                            viewKey: "can_view_settings_profile",        editKey: "can_edit_settings_profile" },
      { id: "settings-pricing",   label: "Listino & Prezzi",      description: "Listino prodotti, tariffe, bundle, scontistica, finanziamenti e materiali/template preventivi", viewKey: "can_view_settings_pricing",        editKey: "can_edit_settings_pricing" },
      { id: "settings-custom",    label: "Branding & Template",   description: "Branding, tag, campi personalizzati, sequenze, calendari, form builder e AI",                 viewKey: "can_view_settings_customization",  editKey: "can_edit_settings_customization" },
      { id: "settings-orders",    label: "Configurazione Ordini", description: "Stati ordine e codici QR",                                                                    viewKey: "can_view_settings_orders",         editKey: "can_edit_settings_orders" },
      { id: "settings-suppliers", label: "Fornitori",             description: "Anagrafica fornitori",                                                                        viewKey: "can_view_settings_suppliers",      editKey: "can_edit_settings_suppliers" },
      { id: "settings-people",    label: "Team & Utenti",         description: "Utenti, ruoli e permessi, venditori, staff e sedi",                                           viewKey: "can_view_settings_people",         editKey: "can_edit_settings_people" },
      { id: "settings-integr",    label: "Integrazioni & Canali", description: "Integrazioni, API, webhook, WhatsApp bot, firma elettronica, lead form e telefonia",          viewKey: "can_view_settings_integrations",   editKey: "can_edit_settings_integrations" },
      { id: "settings-sec",       label: "Sicurezza & Privacy",   description: "Privacy, GDPR, dashboard sicurezza e registro attività",                                      viewKey: "can_view_settings_security" },
    ],
  },
];

// ─── Visibilità dati economici — modello a 3 livelli su 3 toggle ──────────
// Operativo (niente soldi) · Commerciale (importi sì, costi/margini no) · Pieno.
const ECONOMIC_KEYS: (keyof StaffPermissions)[] = [
  "can_view_order_amounts",
  "can_view_costs",
  "can_view_margins",
];
const ECONOMIC_KEY_SET = new Set<keyof StaffPermissions>(ECONOMIC_KEYS);

// ECONOMIC_LEVELS/detectEconomicLevel vivono in permissionsDefaults,
// condivisi col CreateUserWizard (stesso selettore in creazione e gestione).

// Le 3 chiavi economiche hanno un blocco dedicato → escludile dalle categorie
// generiche per non avere doppi controlli (né doppio conteggio).
const VISIBLE_CATEGORIES: PermissionCategory[] = PERMISSION_CATEGORIES.map((c) => ({
  ...c,
  modules: c.modules.filter((m) => !ECONOMIC_KEY_SET.has(m.viewKey)),
})).filter((c) => c.modules.length > 0);

export type CompanyRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";
export type AdditionalRole = "salesperson" | "call_center";

interface UserRolesPermissionsTabProps {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    role?: CompanyRole;
    /** Ruoli aggiuntivi commerciali (salesperson, call_center) — indipendenti dal ruolo primario */
    additionalRoles?: AdditionalRole[];
    permissions: StaffPermissions | null;
  };
  onSave: (permissions: StaffPermissions) => void;
  onChangeRole?: (newRole: CompanyRole) => void;
  onToggleAdditionalRole?: (role: AdditionalRole, add: boolean) => void;
  isLoading?: boolean;
  isChangingRole?: boolean;
  isCurrentUser?: boolean;
}

// ─── Preset permessi per ruolo ────────────────────────────────────────
// FONTE UNICA: ROLE_PRESETS è importato da permissionsDefaults (lo stesso usato
// da CreateUserWizard). Prima qui esisteva una copia LOCALE divergente → lo
// stesso ruolo dava permessi diversi se creato dal wizard vs applicato dal
// dettaglio. Ora c'è un solo preset per ruolo, coerente col modello 3-livelli.

const ROLE_CONFIG: Record<CompanyRole, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; description: string }> = {
  company_admin: {
    label: "Amministratore",
    icon: ShieldCheck,
    color: "text-primary",
    description: "Accesso completo a tutti i moduli. Può gestire utenti e impostazioni.",
  },
  company_staff: {
    label: "Utente",
    icon: User,
    color: "text-slate-600",
    description: "Permessi personalizzati secondo i moduli abilitati sotto.",
  },
  salesperson: {
    label: "Venditore",
    icon: TrendingUp,
    color: "text-emerald-600",
    description: "Ruolo commerciale dedicato. Compare nel CRM e nelle provvigioni.",
  },
  call_center: {
    label: "Call Center",
    icon: Phone,
    color: "text-blue-600",
    description: "Ruolo call center: gestione chiamate e appuntamenti CRM.",
  },
  employee: {
    label: "Operaio / Tecnico",
    icon: HardHat,
    color: "text-amber-600",
    description: "Accesso limitato ai moduli di cantiere. Accede via app Area Campo.",
  },
  subcontractor: {
    label: "Subappaltatore",
    icon: Building2,
    color: "text-purple-600",
    description: "Azienda esterna con accesso ai soli ordini assegnati.",
  },
};

export function UserRolesPermissionsTab({
  user,
  onSave,
  onChangeRole,
  onToggleAdditionalRole,
  isLoading,
  isChangingRole,
  isCurrentUser = false,
}: UserRolesPermissionsTabProps) {
  const [permissions, setPermissions] = useState<StaffPermissions>(user.permissions || DEFAULT_PERMISSIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    PERMISSION_CATEGORIES.map((c) => c.id)
  );
  const [selectedRole, setSelectedRole] = useState<CompanyRole>(user.role || "company_staff");
  const [pendingRoleChange, setPendingRoleChange] = useState<CompanyRole | null>(null);

  const additionalRoles = Array.isArray(user.additionalRoles) ? user.additionalRoles : [];
  const originalPermissions = useMemo(() => user.permissions || DEFAULT_PERMISSIONS, [user.permissions]);

  // Reset state quando cambia l'utente corrente O quando i dati vengono re-fetched
  useEffect(() => {
    if (user.permissions) setPermissions(user.permissions);
  }, [user.id, user.permissions]);

  useEffect(() => {
    if (user.role) setSelectedRole(user.role);
  }, [user.id, user.role]);

  const isDirty = useMemo(() => {
    const keys = Object.keys(DEFAULT_PERMISSIONS) as (keyof StaffPermissions)[];
    return keys.some((key) => (permissions[key] ?? false) !== (originalPermissions[key] ?? false));
  }, [permissions, originalPermissions]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleRoleChange = (value: string) => {
    const newRole = value as CompanyRole;
    if (newRole === selectedRole) return;
    // Self-edit protection: non si può revocare il proprio ruolo admin dal detail
    if (isCurrentUser && selectedRole === "company_admin" && newRole !== "company_admin") {
      return; // il select è già disabled visivamente, ma doppia guardia
    }
    setPendingRoleChange(newRole);
  };

  const confirmRoleChange = (applyPreset: boolean) => {
    if (!pendingRoleChange) return;
    const newRole = pendingRoleChange;
    setSelectedRole(newRole);
    onChangeRole?.(newRole);
    if (applyPreset && ROLE_PRESETS[newRole]) {
      setPermissions((prev) => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, ...ROLE_PRESETS[newRole] }));
    }
    setPendingRoleChange(null);
  };

  const cancelRoleChange = () => setPendingRoleChange(null);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleToggle = (key: BooleanPermissionKey, value: boolean) => {
    setPermissions((prev) => {
      const updated = { ...prev, [key]: value };
      if (!value) {
        const allModules = PERMISSION_CATEGORIES.flatMap((c) => c.modules);
        allModules.forEach((mod) => {
          if (mod.viewKey === key && mod.editKey) {
            updated[mod.editKey] = false;
          }
        });
      }
      return updated;
    });
  };

  const toggleCategoryAll = (cat: PermissionCategory, enable: boolean) => {
    setPermissions((prev) => {
      const next = { ...prev };
      cat.modules.forEach((mod) => {
        next[mod.viewKey] = enable;
        if (mod.editKey) next[mod.editKey] = enable;
      });
      return next;
    });
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return VISIBLE_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return VISIBLE_CATEGORIES.map((cat) => ({
      ...cat,
      modules: cat.modules.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.includes?.some((inc) => inc.toLowerCase().includes(q))
      ),
    })).filter((cat) => cat.modules.length > 0);
  }, [searchQuery]);

  const getCategoryPermCount = (cat: PermissionCategory) => {
    const uniqueKeys = new Set(cat.modules.map((m) => m.viewKey));
    const total = uniqueKeys.size;
    const activeKeys = new Set(cat.modules.filter((m) => permissions[m.viewKey]).map((m) => m.viewKey));
    const active = activeKeys.size;
    return { active, total };
  };

  const totalPermissionsCount = useMemo(() => {
    const allKeys = new Set<keyof StaffPermissions>();
    VISIBLE_CATEGORIES.forEach((c) =>
      c.modules.forEach((m) => {
        allKeys.add(m.viewKey);
      })
    );
    const total = allKeys.size;
    let active = 0;
    allKeys.forEach((k) => {
      if (permissions[k]) active++;
    });
    return { total, active };
  }, [permissions]);

  const handleSelectAll = () => {
    setPermissions((prev) => {
      const allTrue: StaffPermissions = { ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned };
      const allModules = PERMISSION_CATEGORIES.flatMap((c) => c.modules);
      allModules.forEach((mod) => {
        allTrue[mod.viewKey] = true;
        if (mod.editKey) allTrue[mod.editKey] = true;
      });
      allTrue.can_view_marketing = true;
      allTrue.can_edit_marketing = true;
      return allTrue;
    });
  };

  const handleDeselectAll = () => {
    setPermissions((prev) => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  const handleApplyRolePreset = () => {
    const preset = ROLE_PRESETS[selectedRole];
    if (!preset) return;
    setPermissions((prev) => ({
      ...DEFAULT_PERMISSIONS,
      only_assigned: prev.only_assigned,
      ...preset,
    }));
  };

  const economicLevel = detectEconomicLevel(permissions);
  const isAdmin = selectedRole === "company_admin";
  const roleMeta = ROLE_CONFIG[selectedRole];
  const PrimaryIcon = roleMeta.icon;

  // Sticky save bar when dirty
  const saveBarRef = useRef<HTMLDivElement>(null);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 pb-24">
        {/* Hero Summary */}
        <Card className="overflow-hidden">
          <div className={cn("h-1", isAdmin ? "bg-primary" : "bg-primary/30")} aria-hidden />
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                    isAdmin ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <PrimaryIcon className={cn("h-5 w-5", roleMeta.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Ruolo attuale</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold">{roleMeta.label}</p>
                    {additionalRoles.map((r) => {
                      const m = ROLE_CONFIG[r];
                      if (!m) return null;
                      const Icon = m.icon;
                      return (
                        <Badge
                          key={r}
                          variant="outline"
                          className={cn("gap-1 border-dashed text-xs", m.color)}
                        >
                          <Icon className="h-3 w-3" />
                          anche {m.label}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {roleMeta.description}
                  </p>
                </div>
              </div>

              {/* KPI permessi */}
              {!isAdmin && (
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Permessi attivi</p>
                    <p className="text-lg font-bold tabular-nums">
                      <span className="text-primary">{totalPermissionsCount.active}</span>
                      <span className="text-muted-foreground">/{totalPermissionsCount.total}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Role selector + additional roles */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Ruolo Utente</CardTitle>
                <CardDescription className="text-xs">
                  Il ruolo <strong>primario</strong> determina come l'utente accede al sistema.
                </CardDescription>
              </div>
              {isChangingRole && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary role picker */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Ruolo primario
              </Label>
              <Select
                value={selectedRole}
                onValueChange={handleRoleChange}
                disabled={isChangingRole || (isCurrentUser && selectedRole === "company_admin")}
              >
                <SelectTrigger className="w-full md:w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor"] as CompanyRole[]).map((r) => {
                    const cfg = ROLE_CONFIG[r];
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={r} value={r}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", cfg.color)} />
                          {cfg.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {isCurrentUser && selectedRole === "company_admin" && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
                  <Lock className="h-3 w-3 mt-0.5 shrink-0" />
                  Non puoi modificare il tuo ruolo admin da qui. Chiedi a un altro
                  amministratore di farlo.
                </p>
              )}
            </div>

            {/* Additional commercial roles — visible only if onToggleAdditionalRole available and primary is not admin/salesperson/call_center */}
            {onToggleAdditionalRole && !isAdmin && selectedRole !== "salesperson" && selectedRole !== "call_center" && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">
                    Ruoli commerciali aggiuntivi
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                    Se questa persona si occupa <strong>anche</strong> di vendita,
                    attiva i ruoli sotto: comparirà nel calendario CRM, dropdown venditori e provvigioni.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(["salesperson", "call_center"] as AdditionalRole[]).map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const active = additionalRoles.includes(r);
                      return (
                        <label
                          key={r}
                          htmlFor={`add-role-${r}`}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            active
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50 border-border"
                          )}
                        >
                          <Checkbox
                            id={`add-role-${r}`}
                            checked={active}
                            onCheckedChange={(checked) =>
                              onToggleAdditionalRole?.(r, checked === true)
                            }
                            disabled={isChangingRole}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                              <span className="text-sm font-medium">
                                Anche {cfg.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {cfg.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Preset apply button */}
            {!isAdmin && ROLE_PRESETS[selectedRole] && Object.keys(ROLE_PRESETS[selectedRole]).length > 0 && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                      Preset disponibile per {roleMeta.label}
                    </p>
                    <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                      Applica i permessi tipici per questo ruolo come punto di partenza.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 bg-white dark:bg-background hover:bg-blue-100 dark:hover:bg-blue-950/40"
                  onClick={handleApplyRolePreset}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Applica preset
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role change confirmation dialog-lite */}
        {pendingRoleChange && (
          <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">
                    Cambiare il ruolo in "{ROLE_CONFIG[pendingRoleChange].label}"?
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Puoi applicare i permessi predefiniti di questo ruolo oppure mantenere quelli attuali.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => confirmRoleChange(true)}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Cambia + applica preset
                </Button>
                <Button size="sm" variant="outline" onClick={() => confirmRoleChange(false)}>
                  Cambia senza modificare i permessi
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelRoleChange}>
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isAdmin ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
                <div>
                  <p className="font-medium">Accesso completo</p>
                  <p className="text-sm text-muted-foreground">
                    Gli amministratori hanno accesso a tutti i moduli e possono gestire gli altri utenti.
                  </p>
                </div>
              </div>
              {/* only_assigned toggle rimane disponibile per admin in visual mode */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 mt-4 opacity-60">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    I toggle di visibilità non si applicano agli admin
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Autorizzazioni moduli</CardTitle>
                  <CardDescription className="text-xs">
                    Configura cosa può vedere e modificare questo utente
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Totale attivi</p>
                  <p className="text-sm font-bold tabular-nums">
                    <span className="text-primary">{totalPermissionsCount.active}</span>
                    <span className="text-muted-foreground">/{totalPermissionsCount.total}</span>
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ── Visibilità dati economici (modello a 3 livelli) ─────────── */}
              <div className="rounded-lg border bg-gradient-to-br from-emerald-50/60 to-transparent dark:from-emerald-950/20 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Euro className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">Visibilità dati economici</p>
                    <p className="text-xs text-muted-foreground">Cosa vede su commesse, lista, preventivi e PDF.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ECONOMIC_LEVELS.map((lvl) => {
                    const active = economicLevel === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setPermissions((prev) => ({ ...prev, ...lvl.values }))}
                        className={cn(
                          "text-left rounded-lg border p-2.5 transition-all",
                          active
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40"
                            : "hover:bg-muted/50 border-border"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {active && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          <span className="text-sm font-medium">{lvl.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{lvl.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {economicLevel === "custom" && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" /> Combinazione personalizzata — regola i singoli interruttori qui sotto.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    { key: "can_view_order_amounts" as const, label: "Importi di vendita" },
                    { key: "can_view_costs" as const, label: "Costi" },
                    { key: "can_view_margins" as const, label: "Margini" },
                  ]).map((t) => (
                    <label key={t.key} className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-2 cursor-pointer">
                      <Switch checked={!!permissions[t.key]} onCheckedChange={(c) => handleToggle(t.key, c)} />
                      <span className="text-xs font-medium">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Limitazione visibilità */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-0.5 min-w-0">
                  <Label className="font-medium flex items-center gap-2 text-sm">
                    <EyeOff className="h-4 w-4" />
                    Limita visibilità ai dati assegnati
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se attivo, l'utente vedrà solo ordini, attività e appuntamenti assegnati a lui
                  </p>
                </div>
                <Switch
                  checked={permissions.only_assigned || false}
                  onCheckedChange={(checked) =>
                    setPermissions((prev) => ({ ...prev, only_assigned: checked }))
                  }
                />
              </div>

              {/* Visibilità sul team — trasversale (attività e calendario riguardano
                  tutta l'azienda, non un modulo): vive qui accanto a only_assigned. */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label className="font-medium text-sm">Attività del team</Label>
                    <p className="text-xs text-muted-foreground">
                      Vede le attività (task) di tutto il team nella pagina Attività; spento vede solo le proprie
                    </p>
                  </div>
                  <Switch
                    checked={permissions.can_view_team_tasks || false}
                    onCheckedChange={(checked) =>
                      setPermissions((prev) => ({ ...prev, can_view_team_tasks: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label className="font-medium text-sm">Calendario del team</Label>
                    <p className="text-xs text-muted-foreground">
                      Vede appuntamenti ed eventi di tutti nel calendario; spento vede solo i propri
                    </p>
                  </div>
                  <Switch
                    checked={permissions.can_view_all_team_calendar || false}
                    onCheckedChange={(checked) =>
                      setPermissions((prev) => ({ ...prev, can_view_all_team_calendar: checked }))
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* Toolbar: search + bulk */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca modulo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleSelectAll}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Tutti
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Abilita tutti i permessi</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleDeselectAll}>
                        <X className="h-3.5 w-3.5 mr-1" />
                        Nessuno
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Disabilita tutti i permessi</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                {filteredCategories.map((category) => {
                  const isExpanded = expandedCategories.includes(category.id);
                  const { active, total } = getCategoryPermCount(category);
                  const CatIcon = category.icon;
                  const allActive = active === total && total > 0;
                  return (
                    <Collapsible key={category.id} open={isExpanded} onOpenChange={() => toggleCategory(category.id)}>
                      <div
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border transition-colors",
                          active > 0 ? "bg-card" : "bg-muted/20"
                        )}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-primary transition-colors">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <CatIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="font-semibold text-sm truncate">{category.label}</span>
                            <Badge
                              variant={active > 0 ? "default" : "secondary"}
                              className={cn(
                                "text-[10px] h-5 px-1.5 tabular-nums shrink-0",
                                allActive && "bg-emerald-600 hover:bg-emerald-600"
                              )}
                            >
                              {active}/{total}
                            </Badge>
                          </button>
                        </CollapsibleTrigger>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategoryAll(category, !allActive);
                              }}
                            >
                              {allActive ? (
                                <>
                                  <X className="h-3 w-3 mr-1" />
                                  Disabilita
                                </>
                              ) : (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  Tutti
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {allActive ? "Disabilita tutti in questa categoria" : "Abilita tutti in questa categoria"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <CollapsibleContent>
                        <div className="mt-1 ml-3 border-l-2 border-muted pl-3 space-y-0.5">
                          {category.modules.map((mod) => {
                            const viewEnabled = permissions[mod.viewKey] as boolean;
                            return (
                              <div
                                key={mod.id}
                                className={cn(
                                  "p-2.5 rounded-md transition-colors",
                                  viewEnabled ? "bg-muted/30" : "hover:bg-muted/20"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <Switch
                                      checked={viewEnabled}
                                      onCheckedChange={(checked) => handleToggle(mod.viewKey, checked)}
                                      className="mt-0.5"
                                    />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium leading-tight">{mod.label}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {mod.description}
                                      </p>
                                      {mod.includes && mod.includes.length > 0 && (
                                        <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                                          <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground/40" />
                                          Include: {mod.includes.join(", ")}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {viewEnabled && mod.editKey && (
                                  <div className="mt-2 ml-12 flex items-center gap-4">
                                    <div className="flex items-center gap-2 opacity-60">
                                      <Checkbox id={`${mod.id}-view`} checked disabled />
                                      <Label htmlFor={`${mod.id}-view`} className="text-xs text-muted-foreground">
                                        Visualizza
                                      </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        id={`${mod.id}-edit`}
                                        checked={permissions[mod.editKey] as boolean}
                                        onCheckedChange={(checked) =>
                                          handleToggle(mod.editKey!, checked as boolean)
                                        }
                                      />
                                      <Label htmlFor={`${mod.id}-edit`} className="text-xs font-medium">
                                        Modifica
                                      </Label>
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
                {filteredCategories.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nessun modulo trovato per "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sticky save bar */}
        {!isAdmin && (
          <div
            ref={saveBarRef}
            className={cn(
              "fixed bottom-0 left-0 right-0 lg:left-[280px] z-30 transition-transform duration-200",
              isDirty ? "translate-y-0" : "translate-y-full"
            )}
          >
            <div className="bg-background/95 backdrop-blur-md border-t shadow-lg">
              <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-medium">Modifiche non salvate</span>
                  <span className="text-muted-foreground hidden sm:inline">
                    · {totalPermissionsCount.active} permessi attivi
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPermissions(originalPermissions)}
                    disabled={isLoading}
                  >
                    Annulla
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onSave(permissions)}
                    disabled={isLoading || !isDirty}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salva Permessi
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
