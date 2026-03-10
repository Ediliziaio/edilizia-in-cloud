import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Users, UsersRound, Package, CalendarClock, Hammer, Wrench, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface ExternalTeam {
  id: string;
  name: string;
}

interface CalendarLayerPanelProps {
  employees: Employee[];
  externalTeams: ExternalTeam[];
  visibleEmployees: Set<string>;
  visibleTeams: Set<string>;
  showPosa: boolean;
  showLavoro: boolean;
  showAppuntamento: boolean;
  showMerce: boolean;
  showGoogleBusy: boolean;
  showLeaves: boolean;
  onToggleEmployee: (id: string) => void;
  onToggleTeam: (id: string) => void;
  onToggleAllEmployees: (visible: boolean) => void;
  onToggleAllTeams: (visible: boolean) => void;
  onTogglePosa: (v: boolean) => void;
  onToggleLavoro: (v: boolean) => void;
  onToggleAppuntamento: (v: boolean) => void;
  onToggleMerce: (v: boolean) => void;
  onToggleGoogleBusy: (v: boolean) => void;
  onToggleLeaves: (v: boolean) => void;
}

export function CalendarLayerPanel({
  employees,
  externalTeams,
  visibleEmployees,
  visibleTeams,
  showPosa,
  showLavoro,
  showAppuntamento,
  showMerce,
  showGoogleBusy,
  showLeaves,
  onToggleEmployee,
  onToggleTeam,
  onToggleAllEmployees,
  onToggleAllTeams,
  onTogglePosa,
  onToggleLavoro,
  onToggleAppuntamento,
  onToggleMerce,
  onToggleGoogleBusy,
  onToggleLeaves,
}: CalendarLayerPanelProps) {
  const [search, setSearch] = useState("");

  const filteredEmployees = employees.filter(
    (e) =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredTeams = externalTeams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const allEmployeesVisible = employees.length > 0 && employees.every((e) => visibleEmployees.has(e.id));
  const allTeamsVisible = externalTeams.length > 0 && externalTeams.every((t) => visibleTeams.has(t.id));

  return (
    <div className="w-64 shrink-0 border rounded-lg bg-card p-3 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Gestisci visualizzazione</h3>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Cerca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <ScrollArea className="max-h-[calc(100vh-300px)]">
        <div className="space-y-1">
          {/* Calendario Lavori */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-1 text-xs font-semibold text-foreground hover:bg-muted/50 rounded">
              <div className="flex items-center gap-1.5">
                <Hammer className="h-3.5 w-3.5 text-blue-500" />
                <span>Calendario Lavori</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-2 space-y-1 pt-1">
              {/* Event type toggles */}
              <LayerCheckbox
                checked={showPosa}
                onCheckedChange={onTogglePosa}
                icon={<Hammer className="h-3 w-3 text-blue-500" />}
                label="Data Posa"
                colorDot="bg-blue-500"
              />
              <LayerCheckbox
                checked={showLavoro}
                onCheckedChange={onToggleLavoro}
                icon={<Wrench className="h-3 w-3 text-green-500" />}
                label="Lavori in corso"
                colorDot="bg-green-500"
              />
              <LayerCheckbox
                checked={showAppuntamento}
                onCheckedChange={onToggleAppuntamento}
                icon={<CalendarClock className="h-3 w-3 text-indigo-500" />}
                label="Appuntamenti"
                colorDot="bg-indigo-500"
              />

              {/* Employees */}
              {employees.length > 0 && (
                <div className="pt-1.5 border-t border-border/50 mt-1.5">
                  <div className="flex items-center gap-1.5 py-0.5">
                    <Checkbox
                      checked={allEmployeesVisible}
                      onCheckedChange={(c) => onToggleAllEmployees(!!c)}
                      className="h-3.5 w-3.5"
                    />
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">Operai interni</span>
                  </div>
                  {filteredEmployees.map((emp) => (
                    <div key={emp.id} className="flex items-center gap-1.5 py-0.5 pl-4">
                      <Checkbox
                        checked={visibleEmployees.has(emp.id)}
                        onCheckedChange={() => onToggleEmployee(emp.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-[11px] truncate">
                        {emp.first_name} {emp.last_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* External teams */}
              {externalTeams.length > 0 && (
                <div className="pt-1.5 border-t border-border/50 mt-1.5">
                  <div className="flex items-center gap-1.5 py-0.5">
                    <Checkbox
                      checked={allTeamsVisible}
                      onCheckedChange={(c) => onToggleAllTeams(!!c)}
                      className="h-3.5 w-3.5"
                    />
                    <UsersRound className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">Squadre esterne</span>
                  </div>
                  {filteredTeams.map((team) => (
                    <div key={team.id} className="flex items-center gap-1.5 py-0.5 pl-4">
                      <Checkbox
                        checked={visibleTeams.has(team.id)}
                        onCheckedChange={() => onToggleTeam(team.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-[11px] truncate">{team.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Calendario Magazzino */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-1 text-xs font-semibold text-foreground hover:bg-muted/50 rounded">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-orange-500" />
                <span>Calendario Magazzino</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-2 space-y-1 pt-1">
              <LayerCheckbox
                checked={showMerce}
                onCheckedChange={onToggleMerce}
                icon={<Package className="h-3 w-3 text-orange-500" />}
                label="Arrivo Merce"
                colorDot="bg-orange-500"
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Ferie */}
          <div className="pt-1">
            <LayerCheckbox
              checked={showLeaves}
              onCheckedChange={onToggleLeaves}
              icon={<Palmtree className="h-3 w-3 text-amber-500" />}
              label="Ferie & Permessi"
              colorDot="bg-amber-500"
            />
          </div>

          {/* Google Calendar */}
          <div className="pt-1">
            <LayerCheckbox
              checked={showGoogleBusy}
              onCheckedChange={onToggleGoogleBusy}
              icon={<CalendarClock className="h-3 w-3 text-muted-foreground" />}
              label="Google Calendar"
              colorDot="bg-muted-foreground"
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function LayerCheckbox({
  checked,
  onCheckedChange,
  icon,
  label,
  colorDot,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  colorDot: string;
}) {
  return (
    <label className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(!!c)}
        className="h-3.5 w-3.5"
      />
      <div className={cn("w-2 h-2 rounded-full", colorDot)} />
      {icon}
      <span className="text-[11px]">{label}</span>
    </label>
  );
}
