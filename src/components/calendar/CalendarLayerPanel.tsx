import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Users, UsersRound, Package, CalendarClock, Hammer, Wrench, Palmtree, AlertTriangle, Cloud, Settings, Target } from "lucide-react";
import { DEFAULT_CALENDAR_EVENT_COLORS, orderColor, type CalendarEventColorKey, type CalendarEventColors, type CalendarColorMode } from "@/lib/calendarUtils";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  area?: string;
}

const AREA_LABELS: Record<string, { label: string; emoji: string }> = {
  cantiere: { label: "Cantiere", emoji: "🏗️" },
  commerciale: { label: "Commerciale", emoji: "💼" },
  amministrazione: { label: "Amministrazione", emoji: "🏢" },
  tecnico: { label: "Tecnico", emoji: "🔧" },
};

interface ExternalTeam {
  id: string;
  name: string;
  color?: string | null;
}

interface CalendarLayerPanelProps {
  employees: Employee[];
  externalTeams: ExternalTeam[];
  visibleEmployees: Set<string>;
  visibleTeams: Set<string>;
  scope?: "full" | "work";
  showPosa: boolean;
  showLavoro: boolean;
  showAppuntamento: boolean;
  // 2026-05-27: layer per gli appuntamenti del calendario marketing
  // (appointment con calendar_id NOT NULL, niente order_id).
  // Quando il titolare fa anche vendite, ON di default per vedere tutto.
  showAppuntamentoCommerciale?: boolean;
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
  onToggleAppuntamentoCommerciale?: (v: boolean) => void;
  onToggleMerce: (v: boolean) => void;
  onToggleGoogleBusy: (v: boolean) => void;
  onToggleLeaves: (v: boolean) => void;
  showWeather: boolean;
  onToggleWeather: (v: boolean) => void;
  showInterventi: boolean;
  onToggleInterventi: (v: boolean) => void;
  showManutenzioni: boolean;
  onToggleManutenzioni: (v: boolean) => void;
  eventColors?: CalendarEventColors;
  onEventColorChange?: (key: CalendarEventColorKey, color: string) => void;
  onResetEventColors?: () => void;
  /** Come colorare le barre lavoro: per commessa, per squadra o per tipo. */
  colorMode?: CalendarColorMode;
  onColorModeChange?: (mode: CalendarColorMode) => void;
  /** Colore squadra: salvato sull'azienda, lo vedono tutti uguale. */
  onTeamColorChange?: (teamId: string, color: string) => void;
}

export function CalendarLayerPanel({
  employees,
  externalTeams,
  visibleEmployees,
  visibleTeams,
  scope = "full",
  showPosa,
  showLavoro,
  showAppuntamento,
  showAppuntamentoCommerciale = true,
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
  onToggleAppuntamentoCommerciale,
  onToggleMerce,
  onToggleGoogleBusy,
  onToggleLeaves,
  showWeather,
  onToggleWeather,
  showInterventi,
  onToggleInterventi,
  showManutenzioni,
  onToggleManutenzioni,
  eventColors = DEFAULT_CALENDAR_EVENT_COLORS,
  onEventColorChange,
  onResetEventColors,
  colorMode,
  onColorModeChange,
  onTeamColorChange,
}: CalendarLayerPanelProps) {
  const [search, setSearch] = useState("");
  const isWorkScope = scope === "work";

  const filteredEmployees = employees.filter(
    (e) =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredTeams = externalTeams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const allEmployeesVisible = employees.length > 0 && employees.every((e) => visibleEmployees.has(e.id));
  const allTeamsVisible = externalTeams.length > 0 && externalTeams.every((t) => visibleTeams.has(t.id));

  const allLayersHidden = isWorkScope
    ? !showPosa && !showLavoro && !showAppuntamento && !showLeaves
    : !showPosa && !showLavoro && !showAppuntamento && !showMerce && !showGoogleBusy && !showLeaves && !showInterventi && !showManutenzioni;

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
                icon={<Hammer className="h-3 w-3" style={{ color: eventColors.posa }} />}
                label="Data Posa"
                color={eventColors.posa}
              />
              <LayerCheckbox
                checked={showLavoro}
                onCheckedChange={onToggleLavoro}
                icon={<Wrench className="h-3 w-3" style={{ color: eventColors.lavoro }} />}
                label="Lavori in corso"
                color={eventColors.lavoro}
              />
              <LayerCheckbox
                checked={showAppuntamento}
                onCheckedChange={onToggleAppuntamento}
                icon={<CalendarClock className="h-3 w-3" style={{ color: eventColors.appuntamento }} />}
                label="Appuntamenti operativi"
                color={eventColors.appuntamento}
              />
              {/* 2026-05-27: layer "Commerciale" = appuntamenti del calendario
                  marketing (lead, sopralluoghi pre-vendita) — visibili anche
                  qui per single-titolare che fa vendite + pose. */}
              {onToggleAppuntamentoCommerciale && (
                <LayerCheckbox
                  checked={showAppuntamentoCommerciale}
                  onCheckedChange={onToggleAppuntamentoCommerciale}
                  icon={<Target className="h-3 w-3 text-violet-600" />}
                  label="Appuntamenti commerciali (Marketing)"
                  color="#7c3aed"
                />
              )}

              {/* Employees grouped by area */}
              {employees.length > 0 && (
                <div className="pt-1.5 border-t border-border/50 mt-1.5">
                  <div className="flex items-center gap-1.5 py-0.5">
                    <Checkbox
                      checked={allEmployeesVisible}
                      onCheckedChange={(c) => onToggleAllEmployees(!!c)}
                      className="h-3.5 w-3.5"
                    />
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">Squadra lavori</span>
                  </div>
                  {(() => {
                    const grouped = new Map<string, Employee[]>();
                    for (const emp of filteredEmployees) {
                      const area = emp.area || "cantiere";
                      if (!grouped.has(area)) grouped.set(area, []);
                      grouped.get(area)!.push(emp);
                    }
                    const areaOrder = isWorkScope ? ["cantiere", "tecnico"] : ["cantiere", "commerciale", "tecnico", "amministrazione"];
                    return areaOrder
                      .filter(a => grouped.has(a))
                      .map(area => {
                        const emps = grouped.get(area)!;
                        const info = AREA_LABELS[area] || { label: area, emoji: "👤" };
                        return (
                          <div key={area} className="pl-2 mt-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 py-0.5">
                              <span>{info.emoji}</span> {info.label}
                              <span className="text-[9px] font-normal ml-auto">{emps.length}</span>
                            </p>
                            {emps.map((emp) => (
                              <div key={emp.id} className="flex items-center gap-1.5 py-0.5 pl-2">
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
                        );
                      });
                  })()}
                  {search && filteredEmployees.length === 0 && (
                    <p className="text-[11px] text-muted-foreground pl-4 py-0.5">Nessun risultato</p>
                  )}
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
                      <span className="text-[11px] truncate flex-1">{team.name}</span>
                      {onTeamColorChange && (
                        <input
                          type="color"
                          value={team.color || orderColor(team.id)}
                          onChange={(e) => onTeamColorChange(team.id, e.target.value)}
                          className="h-4 w-5 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                          title={`Colore squadra ${team.name}`}
                          aria-label={`Colore squadra ${team.name}`}
                        />
                      )}
                    </div>
                  ))}
                  {search && filteredTeams.length === 0 && (
                    <p className="text-[11px] text-muted-foreground pl-4 py-0.5">Nessun risultato</p>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Ferie & Permessi: visibile anche nel Calendario Lavori (scope work) —
              pianificare i lavori senza vedere chi e' assente era il buco, non la feature. */}
          <div className="pt-1">
            <LayerCheckbox
              checked={showLeaves}
              onCheckedChange={onToggleLeaves}
              icon={<Palmtree className="h-3 w-3 text-amber-500" />}
              label="Ferie & Permessi"
              color={eventColors.leave}
            />
          </div>

          {!isWorkScope && (
            <>
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
                    icon={<Package className="h-3 w-3" style={{ color: eventColors.merce }} />}
                    label="Arrivo Merce"
                    color={eventColors.merce}
                  />
                </CollapsibleContent>
              </Collapsible>

              <div className="pt-1">
                <LayerCheckbox
                  checked={showGoogleBusy}
                  onCheckedChange={onToggleGoogleBusy}
                  icon={<CalendarClock className="h-3 w-3 text-muted-foreground" />}
                  label="Google Calendar"
                  color={eventColors.google_busy}
                />
              </div>

              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-1 text-xs font-semibold text-foreground hover:bg-muted/50 rounded">
                  <div className="flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-orange-500" />
                    <span>Assistenza</span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-2 space-y-1 pt-1">
                  <LayerCheckbox
                    checked={showInterventi}
                    onCheckedChange={onToggleInterventi}
                    icon={<Wrench className="h-3 w-3" style={{ color: eventColors.intervento }} />}
                    label="Interventi"
                    color={eventColors.intervento}
                  />
                  <LayerCheckbox
                    checked={showManutenzioni}
                    onCheckedChange={onToggleManutenzioni}
                    icon={<Settings className="h-3 w-3" style={{ color: eventColors.manutenzione }} />}
                    label="Manutenzioni"
                    color={eventColors.manutenzione}
                  />
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {/* Meteo */}
          <div className="pt-1">
            <LayerCheckbox
              checked={showWeather}
              onCheckedChange={onToggleWeather}
              icon={<Cloud className="h-3 w-3 text-sky-500" />}
              label="Previsioni Meteo"
              color={eventColors.weather}
            />
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-1 text-xs font-semibold text-foreground hover:bg-muted/50 rounded">
              <span>Colori calendario</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-1">
              {colorMode && onColorModeChange && (
                <div className="space-y-1 pb-1">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Colora le barre per</p>
                  <div className="grid grid-cols-3 gap-1 px-1">
                    {([["commessa", "Commessa"], ["squadra", "Squadra"], ["tipo", "Tipo"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onColorModeChange(value)}
                        className={`rounded border px-1 py-1 text-[10px] font-medium transition-colors ${colorMode === value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="px-1 text-[10px] text-muted-foreground">
                    {colorMode === "commessa" ? "Ogni cantiere ha la sua tinta fissa." : colorMode === "squadra" ? "Il colore della squadra assegnata; grigio = senza squadra." : "I colori per tipo di evento qui sotto."}
                  </p>
                </div>
              )}
              <ColorRow label="Data posa" value={eventColors.posa} onChange={(color) => onEventColorChange?.("posa", color)} />
              <ColorRow label="Lavori" value={eventColors.lavoro} onChange={(color) => onEventColorChange?.("lavoro", color)} />
              <ColorRow label="Appuntamenti" value={eventColors.appuntamento} onChange={(color) => onEventColorChange?.("appuntamento", color)} />
              {!isWorkScope && (
                <>
                  <ColorRow label="Arrivo merce" value={eventColors.merce} onChange={(color) => onEventColorChange?.("merce", color)} />
                  <ColorRow label="Interventi" value={eventColors.intervento} onChange={(color) => onEventColorChange?.("intervento", color)} />
                  <ColorRow label="Manutenzioni" value={eventColors.manutenzione} onChange={(color) => onEventColorChange?.("manutenzione", color)} />
                </>
              )}
              <button
                type="button"
                onClick={onResetEventColors}
                className="mt-1 w-full rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                Ripristina colori standard
              </button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* Warning: all layers hidden */}
      {allLayersHidden && (
        <p className="text-xs text-amber-600 font-medium px-1">⚠️ Tutti i layer sono nascosti</p>
      )}

      {/* Legenda colori */}
      <div className="pt-2 border-t border-border/50 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">Legenda</p>
        {(() => {
          // Quando le barre sono colorate per commessa/squadra la tinta non
          // identifica più il tipo: qui campioni NEUTRI che mostrano lo STILE
          // (piena / bordata / tratteggiata). In modalità "tipo" i campioni
          // riprendono i colori configurati sopra.
          const perTipo = (colorMode ?? "tipo") === "tipo";
          const cLavoro = perTipo ? eventColors.lavoro : "#475569";
          const cPosa = perTipo ? eventColors.posa : "#475569";
          const cMerce = perTipo ? eventColors.merce : "#475569";
          return (
            <>
              <div className="flex items-center gap-1.5 px-1">
                <div className="h-3 w-6 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: cLavoro }}>
                  <Wrench className="h-2 w-2 text-white" />
                </div>
                <span className="text-[10px] text-muted-foreground">Lavori in corso — barra piena</span>
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <div className="h-3 w-6 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${cPosa}1F`, boxShadow: `inset 0 0 0 1.5px ${cPosa}` }}>
                  <Hammer className="h-2 w-2" style={{ color: cPosa }} />
                </div>
                <span className="text-[10px] text-muted-foreground">Data posa — chiara bordata</span>
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <div className="h-3 w-6 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${cMerce}14`, border: `1.5px dashed ${cMerce}` }}>
                  <Package className="h-2 w-2" style={{ color: cMerce }} />
                </div>
                <span className="text-[10px] text-muted-foreground">Arrivo merce — tratteggiata</span>
              </div>
              {!perTipo && (
                <p className="px-1 text-[10px] text-muted-foreground/70">La tinta è {colorMode === "squadra" ? "della squadra" : "della commessa"}.</p>
              )}
            </>
          );
        })()}
        <div className="flex items-center gap-1.5 px-1">
          <div className="w-3 h-3 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: eventColors.appuntamento }}>
            <CalendarClock className="h-2 w-2 text-white" />
          </div>
          <span className="text-[10px] text-muted-foreground">Appuntamenti</span>
        </div>
        {!isWorkScope && (
          <>
            <div className="flex items-center gap-1.5 px-1">
              <div className="w-3 h-3 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: eventColors.intervento }}>
                <Wrench className="h-2 w-2 text-white" />
              </div>
              <span className="text-[10px] text-muted-foreground">Interventi</span>
            </div>
            <div className="flex items-center gap-1.5 px-1">
              <div className="w-3 h-3 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: eventColors.manutenzione }}>
                <Settings className="h-2 w-2 text-white" />
              </div>
              <span className="text-[10px] text-muted-foreground">Manutenzioni</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1.5 px-1">
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="text-[10px] text-muted-foreground">Rischio logistico</span>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <span className="shrink-0 rounded bg-red-600 px-1 text-[9px] font-bold text-white">€</span>
          <span className="text-[10px] text-muted-foreground">Acconto non incassato</span>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <span className="shrink-0 rounded bg-amber-500 px-1 text-[9px] font-bold text-white">€</span>
          <span className="text-[10px] text-muted-foreground">Saldo da incassare (lavori chiusi)</span>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <span className="shrink-0 rounded bg-red-500/80 px-1 text-[9px] font-bold text-white">!</span>
          <span className="text-[10px] text-muted-foreground">Nessun operaio assegnato</span>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <span className="shrink-0 rounded bg-slate-400 px-1 text-[9px] font-semibold text-white">2op</span>
          <span className="text-[10px] text-muted-foreground">Operai assegnati</span>
        </div>
        {!isWorkScope && (
          <div className="flex items-center gap-1.5 px-1">
            <div className="w-3 h-3 rounded border border-dashed border-muted-foreground/40 bg-muted/60 shrink-0" />
            <span className="text-[10px] text-muted-foreground">Google Calendar</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LayerCheckbox({
  checked,
  onCheckedChange,
  icon,
  label,
  color,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <label className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(!!c)}
        className="h-3.5 w-3.5"
      />
      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {icon}
      <span className="text-[11px]">{label}</span>
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted/30">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0.5"
        aria-label={`Colore ${label}`}
      />
    </label>
  );
}
