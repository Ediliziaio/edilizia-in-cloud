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
import {
  DEFAULT_PERMISSIONS, ROLE_PRESETS, ECONOMIC_LEVELS, detectEconomicLevel,
  CRUSCOTTO_SECTIONS, CANTIERI_SECTIONS, FINANZA_SECTIONS, PERSONE_SECTIONS,
  MARKETING_SECTIONS, AUTOMAZIONI_SECTIONS, IMPOSTAZIONI_SECTIONS,
  isBlockedBySolaLettura, SOLA_LETTURA_BLOCKED_NOTE,
  type BooleanPermissionKey, type PermissionSectionDef,
} from "@/components/users/permissionsDefaults";
import { SolaLetturaToggle } from "@/components/users/SolaLetturaToggle";
import { usePipelines } from "@/hooks/useOpportunitiesData";
import { aggiuntiviDisponibili, TESTI_RUOLO_AGGIUNTIVO, type RuoloAggiuntivo } from "@/lib/permessi/ruoliUtente";

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

// Derivato dal registro unico (permissionsDefaults.ts): prima qui c'era una
// seconda lista scritta a mano, con descrizioni e chiavi di modifica che
// divergevano da quelle del wizard e della dialog.
const CATEGORY_DEFS: { id: string; label: string; icon: PermissionCategory["icon"]; sections: PermissionSectionDef[] }[] = [
  { id: "cruscotto",    label: "Cruscotto",           icon: LayoutDashboard, sections: CRUSCOTTO_SECTIONS },
  { id: "cantieri",     label: "Cantieri & Lavori",   icon: Hammer,          sections: CANTIERI_SECTIONS },
  { id: "finanza",      label: "Finanza",             icon: Euro,            sections: FINANZA_SECTIONS },
  { id: "persone",      label: "Persone",             icon: UsersIcon,       sections: PERSONE_SECTIONS },
  { id: "marketing",    label: "Marketing & Vendita", icon: Megaphone,       sections: MARKETING_SECTIONS },
  { id: "automazioni",  label: "Automazioni & AI",    icon: Bot,             sections: AUTOMAZIONI_SECTIONS },
  { id: "impostazioni", label: "Impostazioni",        icon: SettingsIcon,    sections: IMPOSTAZIONI_SECTIONS },
];

// Moduli che aprono anche pagine con un nome diverso: aiutano la ricerca.
// (Prima: Previsionale «include Ordini Acquisto» e Opportunità «include Sales
// OS», entrambi falsi: gli ordini d'acquisto seguono le Commesse, Sales OS ha
// il suo permesso.)
const MODULE_INCLUDES: Partial<Record<BooleanPermissionKey, string[]>> = {
  can_view_orders: ["Ordini d'acquisto", "Sopralluoghi (scheda)"],
  can_view_marketing_opportunities: ["Simulatore", "Serramenti", "Bagni", "Tetti", "Fotovoltaico"],
};

export const PERMISSION_CATEGORIES: PermissionCategory[] = CATEGORY_DEFS.map((c) => ({
  id: c.id,
  label: c.label,
  icon: c.icon,
  modules: c.sections.map((s) => ({
    id: s.viewKey,
    label: s.label,
    description: s.description ?? "",
    viewKey: s.viewKey,
    ...(s.editKey ? { editKey: s.editKey } : {}),
    ...(MODULE_INCLUDES[s.viewKey] ? { includes: MODULE_INCLUDES[s.viewKey] } : {}),
  })),
}));

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
/** Venditore, Call Center, Operaio: i ruoli che una persona può avere «anche». */
export type AdditionalRole = RuoloAggiuntivo;

interface UserRolesPermissionsTabProps {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    role?: CompanyRole;
    /** Ruoli «anche …» (Venditore, Call Center, Operaio) oltre al principale */
    additionalRoles?: AdditionalRole[];
    permissions: StaffPermissions | null;
  };
  onSave: (permissions: StaffPermissions) => void;
  /** `permessiDelRuolo`: i permessi tipici del ruolo da salvare insieme al
   *  cambio, se l'utente li ha chiesti; null per tenere quelli attuali. */
  onChangeRole?: (newRole: CompanyRole, permessiDelRuolo: StaffPermissions | null) => void;
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

/** Sotto la conferma di un cambio di ruolo: cosa succede ai ruoli «anche …». */
function notaAggiuntivi(nuovo: CompanyRole, aggiuntivi: AdditionalRole[]): string {
  if (aggiuntivi.length === 0) return "";
  const nomi = (ruoli: AdditionalRole[]) => ruoli.map((r) => TESTI_RUOLO_AGGIUNTIVO[r].nome).join(" e ");
  if (nuovo === "subcontractor") return `I ruoli aggiuntivi (${nomi(aggiuntivi)}) vengono tolti: un subappaltatore non ne ha. `;
  const restano = aggiuntivi.filter((r) => r !== nuovo);
  return restano.length > 0 ? `Resta anche ${nomi(restano)}. ` : "";
}

/** Per il «ci sono modifiche»: gli elenchi (aree, pipeline) si confrontano per
 *  contenuto, non per riferimento — spuntare e rispuntare non è una modifica. */
function stessoValore(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = (Array.isArray(a) ? a : []).map(String).sort();
    const y = (Array.isArray(b) ? b : []).map(String).sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? false) === (b ?? false);
}

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

  // Pipeline visibili. Contano solo quelle che esistono ancora: una pipeline
  // cancellata non deve restare «spuntata» di nascosto.
  const { data: pipelines = [] } = usePipelines();
  const pipelineAzienda = pipelines as { id: string; name: string }[];
  const idPipeline = useMemo(() => new Set(pipelineAzienda.map((p) => p.id)), [pipelineAzienda]);
  const pipelineScelte = (permissions.pipeline_visibili ?? []).filter((id) => idPipeline.has(id));
  const togglePipeline = (id: string, attiva: boolean) =>
    setPermissions((prev) => {
      const altre = (prev.pipeline_visibili ?? []).filter((x) => idPipeline.has(x) && x !== id);
      return { ...prev, pipeline_visibili: attiva ? [...altre, id] : altre };
    });
  const originalPermissions = useMemo(() => user.permissions || DEFAULT_PERMISSIONS, [user.permissions]);

  // Reset state quando cambia l'utente corrente O quando i dati vengono re-fetched
  useEffect(() => {
    if (user.permissions) setPermissions(user.permissions);
  }, [user.id, user.permissions]);

  useEffect(() => {
    if (user.role) setSelectedRole(user.role);
    // Il ruolo salvato è cambiato (o è un altro utente): la scelta in sospeso
    // non vale più.
    setPendingRoleChange(null);
  }, [user.id, user.role]);

  const isDirty = useMemo(() => {
    const keys = Object.keys(DEFAULT_PERMISSIONS) as (keyof StaffPermissions)[];
    return keys.some((key) => !stessoValore(permissions[key], originalPermissions[key]));
  }, [permissions, originalPermissions]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleRoleChange = (value: string) => {
    const newRole = value as CompanyRole;
    // Riscegliere il ruolo attuale annulla la scelta in sospeso.
    if (newRole === selectedRole) {
      setPendingRoleChange(null);
      return;
    }
    // Self-edit protection: non si può revocare il proprio ruolo admin dal detail
    if (isCurrentUser && selectedRole === "company_admin" && newRole !== "company_admin") {
      return; // il select è già disabled visivamente, ma doppia guardia
    }
    setPendingRoleChange(newRole);
  };

  /**
   * Il cambio parte da qui e lo conferma il database: la scheda mostra il
   * ruolo nuovo solo quando è salvato davvero (la pagina la ricarica).
   * Prima il ruolo cambiava subito sullo schermo, anche se poi il database
   * lo respingeva; e i permessi del ruolo restavano solo sullo schermo, persi
   * alla ricarica.
   */
  const confirmRoleChange = (applyPreset: boolean) => {
    if (!pendingRoleChange) return;
    const newRole = pendingRoleChange;
    const preset = ROLE_PRESETS[newRole];
    const permessiDelRuolo =
      applyPreset && newRole !== "company_admin" && preset && Object.keys(preset).length > 0
        ? {
            ...DEFAULT_PERMISSIONS,
            only_assigned: permissions.only_assigned,
            only_my_warehouse: permissions.only_my_warehouse,
            sola_lettura: permissions.sola_lettura,
            pipeline_visibili: permissions.pipeline_visibili,
            ...preset,
          }
        : null;
    onChangeRole?.(newRole, permessiDelRuolo);
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
        // In sola lettura le azioni speciali e le modifiche restano spente.
        const bloccato = (k: BooleanPermissionKey) => enable && !!prev.sola_lettura && isBlockedBySolaLettura(k);
        if (!bloccato(mod.viewKey)) next[mod.viewKey] = enable;
        if (mod.editKey && !bloccato(mod.editKey)) next[mod.editKey] = enable;
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
      // Le restrizioni e le aree visibili non sono moduli: «Tutti» non le tocca.
      const allTrue: StaffPermissions = { ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, only_my_warehouse: prev.only_my_warehouse, sola_lettura: prev.sola_lettura, pipeline_visibili: prev.pipeline_visibili, visible_areas: prev.visible_areas };
      const allModules = PERMISSION_CATEGORIES.flatMap((c) => c.modules);
      const bloccato = (k: BooleanPermissionKey) => !!prev.sola_lettura && isBlockedBySolaLettura(k);
      allModules.forEach((mod) => {
        if (!bloccato(mod.viewKey)) allTrue[mod.viewKey] = true;
        if (mod.editKey && !bloccato(mod.editKey)) allTrue[mod.editKey] = true;
      });
      allTrue.can_view_marketing = true;
      allTrue.can_edit_marketing = true;
      return allTrue;
    });
  };

  const handleDeselectAll = () => {
    setPermissions((prev) => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, only_my_warehouse: prev.only_my_warehouse, sola_lettura: prev.sola_lettura, pipeline_visibili: prev.pipeline_visibili, visible_areas: prev.visible_areas }));
  };

  const handleApplyRolePreset = () => {
    const preset = ROLE_PRESETS[selectedRole];
    if (!preset) return;
    setPermissions((prev) => ({
      ...DEFAULT_PERMISSIONS,
      only_assigned: prev.only_assigned,
      only_my_warehouse: prev.only_my_warehouse,
      sola_lettura: prev.sola_lettura,
      pipeline_visibili: prev.pipeline_visibili,
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
              {/* Il menu mostra subito il ruolo scelto, e la conferma sta sulla
                  STESSA riga, a destra (21/09/2026). Prima il menu restava sul
                  ruolo vecchio e la conferma compariva in un riquadro più in
                  basso: sembrava che la scelta non fosse presa, si riapriva il
                  menu, e il menu aperto copriva la conferma — un clic lì chiude
                  soltanto il menu. Il cambio di ruolo non partiva mai. */}
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <Select
                  value={pendingRoleChange ?? selectedRole}
                  onValueChange={handleRoleChange}
                  disabled={isChangingRole || (isCurrentUser && selectedRole === "company_admin")}
                >
                  <SelectTrigger
                    className={cn("w-full md:w-[320px]", pendingRoleChange && "border-amber-400 ring-1 ring-amber-300")}
                  >
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

                {pendingRoleChange && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {pendingRoleChange === "company_admin" ||
                    Object.keys(ROLE_PRESETS[pendingRoleChange] ?? {}).length === 0 ? (
                      <Button size="sm" onClick={() => confirmRoleChange(false)} disabled={isChangingRole}>
                        {isChangingRole ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                        Conferma
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => confirmRoleChange(true)} disabled={isChangingRole}>
                          {isChangingRole ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                          Conferma con i permessi del ruolo
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => confirmRoleChange(false)} disabled={isChangingRole}>
                          Conferma, tieni i permessi attuali
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={cancelRoleChange} disabled={isChangingRole}>
                      Annulla
                    </Button>
                  </div>
                )}
              </div>
              {pendingRoleChange && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    {`${user.first_name} ${user.last_name}`.trim() || "L'utente"} diventa{" "}
                    <strong>{ROLE_CONFIG[pendingRoleChange].label}</strong>
                    {pendingRoleChange === "company_admin"
                      ? ": vede tutti i moduli e può gestire gli utenti."
                      : "."}{" "}
                    {notaAggiuntivi(pendingRoleChange, additionalRoles)}
                    Non è ancora salvato: conferma per applicarlo.
                  </span>
                </p>
              )}
              {isCurrentUser && selectedRole === "company_admin" && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
                  <Lock className="h-3 w-3 mt-0.5 shrink-0" />
                  Non puoi modificare il tuo ruolo admin da qui. Chiedi a un altro
                  amministratore di farlo.
                </p>
              )}
            </div>

            {/* Ruoli aggiuntivi (21/09/2026): per qualunque ruolo principale,
                amministratore compreso, tranne il Subappaltatore. Nascosti
                mentre un cambio di ruolo aspetta la conferma. */}
            {onToggleAdditionalRole && !pendingRoleChange && aggiuntiviDisponibili(selectedRole).length > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">
                    Ruoli aggiuntivi
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                    Se questa persona fa <strong>anche</strong> altro, attivalo qui: tiene il suo ruolo
                    e in più compare dove serve.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {aggiuntiviDisponibili(selectedRole).map((r) => {
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
                              {TESTI_RUOLO_AGGIUNTIVO[r].cosaFa}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Preset apply button — nascosto mentre si sta cambiando ruolo:
                parla del ruolo di adesso, e accanto alla conferma confonde. */}
            {!isAdmin && !pendingRoleChange && ROLE_PRESETS[selectedRole] && Object.keys(ROLE_PRESETS[selectedRole]).length > 0 && (
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

              {/* Sola lettura: accanto alla limitazione di visibilità, perché come
                  quella vale per tutte le aree insieme. Spegnerla (o accenderla)
                  qui non tocca gli interruttori: la modifica la ricalcola il
                  salvataggio (applyEditFollowsView + trigger). */}
              <SolaLetturaToggle
                id="tab-sola_lettura"
                checked={permissions.sola_lettura || false}
                onCheckedChange={(checked) =>
                  setPermissions((prev) => {
                    const next = { ...prev, sola_lettura: checked };
                    if (checked) {
                      Object.keys(next).forEach((k) => {
                        if (isBlockedBySolaLettura(k as BooleanPermissionKey)) next[k as BooleanPermissionKey] = false;
                      });
                    }
                    return next;
                  })
                }
              />

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

              {/* Pipeline visibili — come «Aree visibili»: nessuna spuntata =
                  tutte. La applica il database (policy pipeline_visibili_utente),
                  quindi vale su kanban, elenco, ricerca e scheda contatto. */}
              {permissions.can_view_marketing_opportunities && pipelineAzienda.length > 1 && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="space-y-0.5">
                    <Label className="font-medium text-sm">Pipeline visibili</Label>
                    <p className="text-xs text-muted-foreground">
                      {pipelineScelte.length === 0
                        ? "Vede tutte le pipeline. Spunta quelle a cui limitarlo."
                        : "Vede solo le pipeline spuntate: le opportunità delle altre gli restano nascoste ovunque."}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {pipelineAzienda.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 cursor-pointer"
                      >
                        <Checkbox
                          checked={pipelineScelte.includes(p.id)}
                          onCheckedChange={(c) => togglePipeline(p.id, c === true)}
                        />
                        <span className="text-sm truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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
                            const viewBloccato = !!permissions.sola_lettura && isBlockedBySolaLettura(mod.viewKey);
                            const editBloccato = !!permissions.sola_lettura && !!mod.editKey && isBlockedBySolaLettura(mod.editKey);
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
                                      disabled={viewBloccato}
                                      onCheckedChange={(checked) => handleToggle(mod.viewKey, checked)}
                                      className="mt-0.5"
                                    />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium leading-tight">{mod.label}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {mod.description}
                                      </p>
                                      {viewBloccato && (
                                        <p className="text-[11px] text-amber-600 mt-0.5">{SOLA_LETTURA_BLOCKED_NOTE}</p>
                                      )}
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
                                        disabled={editBloccato}
                                        onCheckedChange={(checked) =>
                                          handleToggle(mod.editKey!, checked as boolean)
                                        }
                                      />
                                      <Label htmlFor={`${mod.id}-edit`} className="text-xs font-medium">
                                        Modifica
                                      </Label>
                                      {editBloccato && (
                                        <span className="text-[11px] text-amber-600">{SOLA_LETTURA_BLOCKED_NOTE}</span>
                                      )}
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
