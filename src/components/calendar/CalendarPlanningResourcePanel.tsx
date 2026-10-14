import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { CalendarColorMode } from "@/lib/calendarUtils";

export function CalendarPlanningResourcePanel({
  employees,
  teams,
  visibleEmployees,
  visibleTeams,
  onEmployee,
  onTeam,
  onAllEmployees,
  onAllTeams,
  colorMode,
  onColorMode,
  showColors,
  canManageResources,
}: {
  employees: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[];
  teams: { id: string; name: string }[];
  visibleEmployees: Set<string>;
  visibleTeams: Set<string>;
  onEmployee: (id: string) => void;
  onTeam: (id: string) => void;
  onAllEmployees: (value: boolean) => void;
  onAllTeams: (value: boolean) => void;
  colorMode: CalendarColorMode;
  onColorMode: (mode: CalendarColorMode) => void;
  showColors: boolean;
  canManageResources: boolean;
}) {
  return (
    <div className="space-y-6 text-sm">
      <p className="text-xs leading-relaxed text-muted-foreground">
        I filtri selezionano le risorse assegnate alle lavorazioni. Le date e le
        assegnazioni si aggiornano dalle commesse.
      </p>
      {[
        {
          label: "Persone",
          items: employees.map((e) => ({
            id: e.id,
            name:
              [e.first_name, e.last_name].filter(Boolean).join(" ") ||
              "Persona",
          })),
          visible: visibleEmployees,
          toggle: onEmployee,
          all: onAllEmployees,
        },
        {
          label: "Squadre",
          items: teams,
          visible: visibleTeams,
          toggle: onTeam,
          all: onAllTeams,
        },
      ].map((group) => (
        <section key={group.label} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{group.label}</h3>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                group.all(!group.items.every((i) => group.visible.has(i.id)))
              }
            >
              {group.items.every((i) => group.visible.has(i.id))
                ? "Nascondi tutte"
                : "Mostra tutte"}
            </button>
          </div>
          {group.items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5"
            >
              <Checkbox
                aria-label={item.name}
                checked={group.visible.has(item.id)}
                onCheckedChange={() => group.toggle(item.id)}
              />
              <span className="text-xs">{item.name}</span>
            </label>
          ))}
          {!group.items.length && (
            <p className="text-xs text-muted-foreground">
              Nessuna risorsa disponibile nei tuoi accessi.
            </p>
          )}
        </section>
      ))}
      {showColors && (
        <section className="space-y-3">
          <h3 className="font-semibold">Colore delle lavorazioni</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["commessa", "Commessa"],
                ["squadra", "Squadra"],
                ["tipo", "Tipo"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={colorMode === value}
                className={cn(
                  "rounded-md border p-2 text-xs",
                  colorMode === value &&
                    "border-primary bg-primary/5 text-primary",
                )}
                onClick={() => onColorMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
      {canManageResources && (
        <Link
          to="/azienda/manodopera"
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Gestisci squadre e persone →
        </Link>
      )}
    </div>
  );
}
