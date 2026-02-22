import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
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
}

export default function MarketingCalendarFilters({
  calendars,
  users,
  selectedCalendarIds,
  selectedUserIds,
  onToggleCalendar,
  onToggleUser,
}: Props) {
  const [search, setSearch] = useState("");
  const [usersOpen, setUsersOpen] = useState(true);
  const [calendarsOpen, setCalendarsOpen] = useState(true);

  const filteredCalendars = calendars.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredUsers = users.filter((u) =>
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-64 border-l bg-background p-4 space-y-4 overflow-y-auto">
      <h3 className="font-semibold text-sm">Gestisci visualizzazione</h3>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Cerca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Users section */}
      <div>
        <button
          onClick={() => setUsersOpen(!usersOpen)}
          className="flex items-center gap-1 text-sm font-medium w-full text-left hover:text-primary transition-colors"
        >
          {usersOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Utenti ({filteredUsers.length})
        </button>
        {usersOpen && (
          <div className="mt-2 space-y-1.5 ml-1">
            {filteredUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-2">
                <Checkbox
                  id={`user-${u.id}`}
                  checked={selectedUserIds.includes(u.id)}
                  onCheckedChange={() => onToggleUser(u.id)}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor={`user-${u.id}`} className="text-xs cursor-pointer">
                  {u.first_name} {u.last_name}
                </Label>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-xs text-muted-foreground">Nessun utente</p>
            )}
          </div>
        )}
      </div>

      {/* Calendars section */}
      <div>
        <button
          onClick={() => setCalendarsOpen(!calendarsOpen)}
          className="flex items-center gap-1 text-sm font-medium w-full text-left hover:text-primary transition-colors"
        >
          {calendarsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Calendari ({filteredCalendars.length})
        </button>
        {calendarsOpen && (
          <div className="mt-2 space-y-1.5 ml-1">
            {filteredCalendars.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Checkbox
                  id={`cal-${c.id}`}
                  checked={selectedCalendarIds.includes(c.id)}
                  onCheckedChange={() => onToggleCalendar(c.id)}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor={`cal-${c.id}`} className="text-xs cursor-pointer">
                  {c.name}
                </Label>
              </div>
            ))}
            {filteredCalendars.length === 0 && (
              <p className="text-xs text-muted-foreground">Nessun calendario</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
