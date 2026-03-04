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
import { ChevronDown, ChevronRight, Loader2, Save, Search, ShieldCheck, User, EyeOff } from "lucide-react";
import { StaffPermissions } from "@/components/users/PermissionsDialog";

interface PermissionModule {
  id: string;
  label: string;
  description: string;
  viewKey: keyof StaffPermissions;
  editKey?: keyof StaffPermissions;
}

interface PermissionCategory {
  id: string;
  label: string;
  modules: PermissionModule[];
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "cruscotto",
    label: "Cruscotto Aziendale",
    modules: [
      { id: "cruscotto", label: "Cruscotto Aziendale", description: "Centro di controllo executive unificato", viewKey: "can_view_cruscotto" },
    ],
  },
  {
    id: "internal",
    label: "Gestione Interna",
    modules: [
      { id: "dashboard", label: "Dashboard", description: "Visualizza la dashboard principale", viewKey: "can_view_dashboard" },
      { id: "orders", label: "Ordini", description: "Gestisci ordini e commesse", viewKey: "can_view_orders", editKey: "can_edit_orders" },
      { id: "warehouse", label: "Magazzino", description: "Gestisci inventario e movimenti", viewKey: "can_view_warehouse", editKey: "can_edit_warehouse" },
      { id: "calendar", label: "Calendario", description: "Visualizza e gestisci il calendario", viewKey: "can_view_calendar" },
      { id: "customers", label: "Clienti", description: "Gestisci anagrafica clienti", viewKey: "can_view_customers", editKey: "can_edit_customers" },
      { id: "employees", label: "Dipendenti", description: "Visualizza dati dipendenti", viewKey: "can_view_employees" },
      { id: "tickets", label: "Ticket Clienti", description: "Gestisci ticket di supporto", viewKey: "can_view_tickets", editKey: "can_edit_tickets" },
      { id: "forecast", label: "Previsionale", description: "Visualizza previsioni finanziarie", viewKey: "can_view_forecast" },
      { id: "costs", label: "Costi", description: "Gestisci costi aziendali", viewKey: "can_view_forecast" },
      { id: "activities", label: "Attività", description: "Gestisci attività e task", viewKey: "can_view_orders" },
      { id: "errors", label: "Errori", description: "Visualizza e gestisci errori", viewKey: "can_view_orders" },
      { id: "messaging", label: "Messaggistica", description: "Chat e comunicazioni interne", viewKey: "can_view_orders" },
      { id: "automations_int", label: "Automazioni", description: "Automazioni gestione interna", viewKey: "can_view_settings" },
      { id: "settings", label: "Impostazioni", description: "Accedi alle impostazioni aziendali", viewKey: "can_view_settings" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing e Vendita",
    modules: [
      { id: "mkt_dashboard", label: "Dashboard", description: "Dashboard marketing e vendite", viewKey: "can_view_marketing" },
      { id: "mkt_contacts", label: "Contatti", description: "Gestisci contatti marketing", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_opportunities", label: "Opportunità", description: "Pipeline e opportunità di vendita", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_activities", label: "Attività", description: "Attività marketing e vendita", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_appointments", label: "Appuntamenti", description: "Gestisci appuntamenti commerciali", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_automations", label: "Automazioni", description: "Workflow e automazioni marketing", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_ai_agent", label: "Agente AI", description: "Assistente intelligente vendite", viewKey: "can_view_marketing" },
      { id: "mkt_email", label: "Email Marketing", description: "Campagne email e template", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_whatsapp", label: "WhatsApp", description: "Messaggistica WhatsApp Business", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
      { id: "mkt_reports", label: "Reportistica", description: "Report e analytics marketing", viewKey: "can_view_marketing" },
    ],
  },
];

interface UserRolesPermissionsTabProps {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    role?: "company_admin" | "company_staff";
    permissions: StaffPermissions | null;
  };
  onSave: (permissions: StaffPermissions) => void;
  onChangeRole?: (newRole: "company_admin" | "company_staff") => void;
  isLoading?: boolean;
  isChangingRole?: boolean;
}

const DEFAULT_PERMISSIONS: StaffPermissions = {
  can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
  can_view_warehouse: false, can_edit_warehouse: false, can_view_calendar: false,
  can_view_customers: false, can_edit_customers: false, can_view_employees: false,
  can_view_tickets: false, can_edit_tickets: false, can_view_forecast: false,
  can_view_settings: false, can_view_marketing: false, can_edit_marketing: false,
  can_view_cruscotto: false, only_assigned: false,
};

export function UserRolesPermissionsTab({ user, onSave, onChangeRole, isLoading, isChangingRole }: UserRolesPermissionsTabProps) {
  const [permissions, setPermissions] = useState<StaffPermissions>(user.permissions || DEFAULT_PERMISSIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["cruscotto", "internal", "marketing"]);
  const [selectedRole, setSelectedRole] = useState<"company_admin" | "company_staff">(user.role || "company_staff");

  useEffect(() => {
    if (user.permissions) setPermissions(user.permissions);
  }, [user.permissions]);

  useEffect(() => {
    if (user.role) setSelectedRole(user.role);
  }, [user.role]);

  const handleRoleChange = (value: string) => {
    const newRole = value as "company_admin" | "company_staff";
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
      const mod = PERMISSION_CATEGORIES.flatMap(c => c.modules).find(m => m.viewKey === key);
      if (mod?.editKey && !value) {
        updated[mod.editKey] = false;
      }
      return updated;
    });
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return PERMISSION_CATEGORIES;
    return PERMISSION_CATEGORIES.map(cat => ({
      ...cat,
      modules: cat.modules.filter(m =>
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    })).filter(cat => cat.modules.length > 0);
  }, [searchQuery]);

  const getCategoryPermCount = (cat: PermissionCategory) => {
    const total = cat.modules.length;
    const active = cat.modules.filter(m => permissions[m.viewKey]).length;
    return { active, total };
  };

  const handleSelectAll = () => {
    setPermissions(prev => ({
      ...DEFAULT_PERMISSIONS,
      can_view_dashboard: true, can_view_orders: true, can_edit_orders: true,
      can_view_warehouse: true, can_edit_warehouse: true, can_view_calendar: true,
      can_view_customers: true, can_edit_customers: true, can_view_employees: true,
      can_view_tickets: true, can_edit_tickets: true, can_view_forecast: true,
      can_view_settings: true, can_view_marketing: true, can_edit_marketing: true,
      can_view_cruscotto: true, only_assigned: prev.only_assigned,
    }));
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
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Amministratore
                  </div>
                </SelectItem>
                <SelectItem value="company_staff">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Utente
                  </div>
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
          {/* Permissions card */}
          <Card>
            <CardHeader>
              <CardTitle>Autorizzazioni</CardTitle>
              <CardDescription>Configura i permessi di accesso ai moduli</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Only assigned toggle */}
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

              {/* Search + bulk actions */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca modulo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>Seleziona tutti</Button>
                <Button type="button" variant="outline" size="sm" onClick={handleDeselectAll}>Deseleziona tutti</Button>
              </div>

              {/* Permission categories */}
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
                        <Badge variant={active > 0 ? "default" : "secondary"} className="text-xs">
                          {active}/{total}
                        </Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 ml-2 border-l-2 border-muted pl-4 space-y-1">
                          {category.modules.map((mod) => {
                            const viewEnabled = permissions[mod.viewKey] as boolean;
                            return (
                              <div key={mod.id} className="p-3 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Switch
                                      checked={viewEnabled}
                                      onCheckedChange={(checked) => handleToggle(mod.viewKey, checked)}
                                    />
                                    <div>
                                      <p className="text-sm font-medium">{mod.label}</p>
                                      <p className="text-xs text-muted-foreground">{mod.description}</p>
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

          <div className="flex justify-end">
            <Button onClick={() => onSave(permissions)} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salva Permessi
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
