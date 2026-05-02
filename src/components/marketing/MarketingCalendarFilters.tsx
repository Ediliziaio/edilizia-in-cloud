import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Users as UsersIcon,
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  X as XIcon,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarItem {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  calendars: CalendarItem[];
  users: UserItem[];
  selectedCalendarIds: string[];
  selectedUserIds: string[];
  onToggleCalendar: (id: string) => void;
  onToggleUser: (id: string) => void;
  onConfigureCalendars?: () => void;
  /** Disabilita layout sidebar (usato dentro drawer mobile) */
  inSheet?: boolean;
}

export default function MarketingCalendarFilters({
  calendars,
  users,
  selectedCalendarIds,
  selectedUserIds,
  onToggleCalendar,
  onToggleUser,
  onConfigureCalendars,
  inSheet = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [usersOpen, setUsersOpen] = useState(true);
  const [calendarsOpen, setCalendarsOpen] = useState(true);

  const filteredCalendars = useMemo(
    () =>
      calendars.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      ),
    [calendars, search]
  );

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        `${u.first_name} ${u.last_name}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [users, search]
  );

  const selectedCalendarCount = selectedCalendarIds.length;
  const selectedUserCount = selectedUserIds.length;
  const hasActiveFilters =
    (calendars.length > 0 && selectedCalendarCount < calendars.length) ||
    (users.length > 0 && selectedUserCount < users.length);

  const selectAllUsers = () => {
    users.forEach((u) => {
      if (!selectedUserIds.includes(u.id)) onToggleUser(u.id);
    });
  };
  const clearUsers = () => {
    [...selectedUserIds].forEach((id) => onToggleUser(id));
  };
  const selectAllCalendars = () => {
    calendars.forEach((c) => {
      if (!selectedCalendarIds.includes(c.id)) onToggleCalendar(c.id);
    });
  };
  const clearCalendars = () => {
    [...selectedCalendarIds].forEach((id) => onToggleCalendar(id));
  };

  const containerClass = inSheet
    ? "bg-background p-4 space-y-5"
    : "h-full min-w-0 bg-background p-4 space-y-5 overflow-y-auto";

  return (
    <div className={containerClass}>
      {!inSheet && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            Filtri
          </h3>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
              onClick={() => {
                selectAllUsers();
                selectAllCalendars();
              }}
            >
              <XIcon className="h-3 w-3 mr-0.5" />
              Reset
            </Button>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Cerca nei filtri..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Users section */}
      <Section
        open={usersOpen}
        onToggle={() => setUsersOpen(!usersOpen)}
        icon={UsersIcon}
        label="Utenti"
        total={filteredUsers.length}
        selected={selectedUserCount}
        totalAvailable={users.length}
        onSelectAll={selectAllUsers}
        onClear={clearUsers}
      >
        <div className="mt-2 space-y-1 ml-0.5 max-h-[220px] overflow-y-auto pr-1">
          {filteredUsers.map((u) => {
            const checked = selectedUserIds.includes(u.id);
            return (
              <label
                key={u.id}
                htmlFor={`user-${u.id}`}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors",
                  checked ? "bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <Checkbox
                  id={`user-${u.id}`}
                  checked={checked}
                  onCheckedChange={() => onToggleUser(u.id)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs truncate flex-1">
                  {u.first_name} {u.last_name}
                </span>
              </label>
            );
          })}
          {filteredUsers.length === 0 && (
            <p className="text-xs text-muted-foreground italic px-2 py-1">
              Nessun utente
            </p>
          )}
        </div>
      </Section>

      {/* Calendars section */}
      <Section
        open={calendarsOpen}
        onToggle={() => setCalendarsOpen(!calendarsOpen)}
        icon={CalendarDays}
        label="Calendari"
        total={filteredCalendars.length}
        selected={selectedCalendarCount}
        totalAvailable={calendars.length}
        onSelectAll={selectAllCalendars}
        onClear={clearCalendars}
      >
        <div className="mt-2 space-y-1 ml-0.5 max-h-[220px] overflow-y-auto pr-1">
          {filteredCalendars.map((c) => {
            const checked = selectedCalendarIds.includes(c.id);
            return (
              <label
                key={c.id}
                htmlFor={`cal-${c.id}`}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors",
                  checked ? "bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <Checkbox
                  id={`cal-${c.id}`}
                  checked={checked}
                  onCheckedChange={() => onToggleCalendar(c.id)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs truncate flex-1">{c.name}</span>
              </label>
            );
          })}
          {filteredCalendars.length === 0 && (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3">
              <p className="text-xs font-medium text-foreground">Nessun calendario</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Configura almeno un calendario CRM per creare appuntamenti e link di prenotazione.
              </p>
              {onConfigureCalendars && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8 w-full gap-1.5 text-xs"
                  onClick={onConfigureCalendars}
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Configura calendario
                </Button>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

interface SectionProps {
  open: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  total: number;
  selected: number;
  totalAvailable: number;
  onSelectAll: () => void;
  onClear: () => void;
  children: React.ReactNode;
}

function Section({
  open,
  onToggle,
  icon: Icon,
  label,
  total,
  selected,
  totalAvailable,
  onSelectAll,
  onClear,
  children,
}: SectionProps) {
  const allSelected = totalAvailable > 0 && selected === totalAvailable;
  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-sm font-medium text-left hover:text-primary transition-colors flex-1"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{label}</span>
          {totalAvailable > 0 && (
            <span
              className={cn(
                "ml-1 inline-flex items-center justify-center text-[10px] rounded-full px-1.5 min-w-[20px] h-[18px] tabular-nums font-semibold",
                allSelected
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/15 text-primary"
              )}
            >
              {selected}/{totalAvailable}
            </span>
          )}
        </button>
        {totalAvailable > 0 && (
          <button
            onClick={allSelected ? onClear : onSelectAll}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded"
            title={allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
          >
            {allSelected ? (
              <XIcon className="h-3 w-3" />
            ) : (
              <CheckCheck className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
      {open && children}
      {!open && selected > 0 && total !== selected && (
        <p className="text-[10px] text-muted-foreground ml-5 mt-0.5">
          {total} nel filtro · {selected} selezionat{selected === 1 ? "o" : "i"}
        </p>
      )}
    </div>
  );
}
