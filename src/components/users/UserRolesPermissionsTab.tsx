import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2, Save, Search, ShieldCheck, User, Eye, EyeOff } from "lucide-react";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { cn } from "@/lib/utils";

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
    id: "internal",
    label: "Gestione Interna",
    modules: [
      { id: "dashboard", label: "Dashboard", description: "Visualizza la dashboard principale", viewKey: "can_view_dashboard" },
      { id: "orders", label: "Ordini", description: "Gestisci ordini e commesse", viewKey: "can_view_orders", editKey: "can_edit_orders" },
      { id: "warehouse", label: "Magazzino", description: "Gestisci inventario e movimenti", viewKey: "can_view_warehouse", editKey: "can_edit_warehouse" },
      { id: "calendar", label: "Calendario", description: "Visualizza e gestisci il calendario", viewKey: "can_view_calendar" },
      { id: "customers", label: "Clienti", description: "Gestisci anagrafica clienti", viewKey: "can_view_customers", editKey: "can_edit_customers" },
      { id: "employees", label: "Dipendenti", description: "Visualizza dati dipendenti", viewKey: "can_view_employees" },
      { id: "tickets", label: "Assistenza", description: "Gestisci ticket di supporto", viewKey: "can_view_tickets", editKey: "can_edit_tickets" },
      { id: "forecast", label: "Previsionale", description: "Visualizza previsioni finanziarie", viewKey: "can_view_forecast" },
      { id: "settings", label: "Impostazioni", description: "Accedi alle impostazioni aziendali", viewKey: "can_view_settings" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing e Vendita",
    modules: [
      { id: "marketing", label: "Marketing & CRM", description: "Contatti, opportunità, pipeline, email marketing, WhatsApp", viewKey: "can_view_marketing", editKey: "can_edit_marketing" },
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
  isLoading?: boolean;
}

const DEFAULT_PERMISSIONS: StaffPermissions = {
  can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
  can_view_warehouse: false, can_edit_warehouse: false, can_view_calendar: false,
  can_view_customers: false, can_edit_customers: false, can_view_employees: false,
  can_view_tickets: false, can_edit_tickets: false, can_view_forecast: false,
  can_view_settings: false, can_view_marketing: false, can_edit_marketing: false,
  only_assigned: false,
};

export function UserRolesPermissionsTab({ user, onSave, isLoading }: UserRolesPermissionsTabProps) {
  const [permissions, setPermissions] = useState<StaffPermissions>(user.permissions || DEFAULT_PERMISSIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["internal", "marketing"]);

  useEffect(() => {
    if (user.permissions) setPermissions(user.permissions);
  }, [user.permissions]);

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleToggle = (key: keyof StaffPermissions, value: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev, [key]: value };
      // If disabling view, also disable edit
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
      only_assigned: prev.only_assigned,
    }));
  };

  const handleDeselectAll = () => {
    setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  if (user.role === "company_admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Amministratore
          </CardTitle>
          <CardDescription>
            Questo utente è un Amministratore e ha accesso completo a tutte le funzionalità.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium">Accesso completo</p>
              <p className="text-sm text-muted-foreground">Gli amministratori hanno accesso a tutti i moduli e possono gestire gli altri utenti.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role badge */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ruoli & Autorizzazioni</CardTitle>
              <CardDescription>Configura i permessi di accesso per {user.first_name} {user.last_name}</CardDescription>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Operatore
            </Badge>
          </div>
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

                            {/* Granular permissions */}
                            {viewEnabled && mod.editKey && (
                              <div className="mt-2 ml-12 flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`${mod.id}-view`}
                                    checked={true}
                                    disabled
                                  />
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
    </div>
  );
}
