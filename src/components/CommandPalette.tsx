import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import {
  Package, User, UserCircle, MessageSquare, Loader2,
} from "lucide-react";
import { useGlobalSearch, type SearchResult } from "@/hooks/useGlobalSearch";
import { useAuth } from "@/contexts/AuthContext";
import { macroAreas } from "@/lib/sidebarConfig";

const RESULT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, User, UserCircle, MessageSquare,
};

const TYPE_LABELS: Record<string, string> = {
  order: "Ordini",
  customer: "Clienti",
  contact: "Contatti Marketing",
  ticket: "Ticket",
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Flatten macro-areas into grouped nav items
const navGroups = macroAreas.map(area => ({
  title: area.title,
  icon: area.icon,
  items: area.items.map(item => ({
    title: item.title,
    url: item.url,
    icon: item.icon,
  })),
}));

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();

  const { data: results = [], isFetching } = useGlobalSearch(query, effectiveCompany?.id);

  useEffect(() => {
    if (!open) setTimeout(() => setQuery(""), 200);
  }, [open]);

  const handleSelect = (url: string) => {
    navigate(url);
    onOpenChange(false);
  };

  const groupedResults = results.reduce((acc, r) => {
    const group = TYPE_LABELS[r.type] ?? "Risultati";
    (acc[group] = acc[group] ?? []).push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const filteredNavGroups = useMemo(() => {
    if (query.length < 2) return navGroups;
    const q = query.toLowerCase();
    return navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => item.title.toLowerCase().includes(q)),
      }))
      .filter(group => group.items.length > 0);
  }, [query]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Cerca ordini, clienti, contatti, ticket..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isFetching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {query.length >= 2 && !isFetching && results.length === 0 && filteredNavGroups.length === 0 && (
          <CommandEmpty>Nessun risultato per &quot;{query}&quot;</CommandEmpty>
        )}

        {Object.entries(groupedResults).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((result) => {
              const Icon = RESULT_ICONS[result.icon] ?? Package;
              return (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  onSelect={() => handleSelect(result.url)}
                  className="flex items-center gap-3 py-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{result.title}</span>
                    {result.subtitle && (
                      <span className="text-xs text-muted-foreground truncate">
                        {result.subtitle}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {results.length > 0 && query.length >= 2 && <CommandSeparator />}

        {filteredNavGroups.map((group) => {
          const GroupIcon = group.icon;
          return (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <CommandItem
                    key={item.url}
                    onSelect={() => handleSelect(item.url)}
                    className="flex items-center gap-3"
                  >
                    <ItemIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>

      <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>↑↓ naviga · ↵ apri · esc chiudi</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-60">
          ⌘K
        </kbd>
      </div>
    </CommandDialog>
  );
}
