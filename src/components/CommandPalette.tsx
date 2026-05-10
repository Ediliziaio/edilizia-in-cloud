import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import {
  Package, User, UserCircle, MessageSquare, Loader2, Settings, Sparkles, Bot,
} from "lucide-react";
import { useGlobalSearch, type SearchResult } from "@/hooks/useGlobalSearch";
import { useAuth } from "@/contexts/AuthContext";
import { macroAreas } from "@/lib/sidebarConfig";

// 🆕 GAP 1 (Discoverability): personas AI nel command palette
interface AIPersonaLite {
  persona_key: string;
  display_name: string;
  short_label: string;
  example_questions: string[];
  category: string;
}

// ─── Tutte le 33 voci impostazioni per la ricerca Command Palette ─────────────
interface SettingsItem {
  label: string;
  path: string;
}

const SETTINGS_ITEMS: SettingsItem[] = [
  { label: "Profilo aziendale",         path: "/azienda/impostazioni/profilo" },
  { label: "Sedi",                       path: "/azienda/impostazioni/sedi" },
  { label: "White-Label",                path: "/azienda/impostazioni/branding" },
  { label: "Listino prodotti",           path: "/azienda/impostazioni/listino" },
  { label: "Tariffe aziendali",          path: "/azienda/impostazioni/tariffe" },
  { label: "Preventivi & margini",       path: "/azienda/impostazioni/margini" },
  { label: "Stati ordine",               path: "/azienda/impostazioni/stati-ordine" },
  { label: "Fornitori",                  path: "/azienda/impostazioni/fornitori" },
  { label: "Categorie costi",            path: "/azienda/impostazioni/categorie-costi" },
  { label: "Automazioni finanza",        path: "/azienda/impostazioni/automazioni-finanza" },
  { label: "Tag",                        path: "/azienda/impostazioni/tag" },
  { label: "Campi personalizzati",       path: "/azienda/impostazioni/campi-personalizzati" },
  { label: "Sequenze",                   path: "/azienda/impostazioni/sequenze" },
  { label: "Form & UTM",                 path: "/azienda/impostazioni/form-builder" },
  { label: "Materiali preventivi",       path: "/azienda/impostazioni/materiali-preventivi" },
  { label: "Template offerte",           path: "/azienda/impostazioni/template-preventivi" },
  { label: "Firma Elettronica",          path: "/azienda/impostazioni/firma-elettronica" },
  { label: "Calendari marketing",        path: "/azienda/impostazioni/calendari" },
  { label: "Lead Facebook",              path: "/azienda/impostazioni/lead-forms" },
  { label: "Persone & Accessi",          path: "/azienda/impostazioni/persone" },
  { label: "Utenti",                     path: "/azienda/impostazioni/persone?tab=utenti" },
  { label: "Venditori",                  path: "/azienda/impostazioni/persone?tab=venditori" },
  { label: "Staff / Operai",             path: "/azienda/impostazioni/persone?tab=staff" },
  { label: "Team",                       path: "/azienda/impostazioni/persone?tab=team" },
  { label: "Sicurezza & Privacy",        path: "/azienda/impostazioni/sicurezza-privacy" },
  { label: "Cambio password",            path: "/azienda/impostazioni/sicurezza-privacy?tab=password" },
  { label: "Privacy & GDPR",             path: "/azienda/impostazioni/sicurezza-privacy?tab=privacy" },
  { label: "Security dashboard",         path: "/azienda/impostazioni/sicurezza-privacy?tab=dashboard" },
  { label: "Registro attività",          path: "/azienda/impostazioni/sicurezza-privacy?tab=attivita" },
  { label: "Integrazioni",               path: "/azienda/impostazioni/integrazioni" },
  { label: "Crediti & saldo",            path: "/azienda/impostazioni/crediti" },
  { label: "API platform",               path: "/azienda/impostazioni/api" },
  { label: "Webhook",                    path: "/azienda/impostazioni/webhook" },
  { label: "Numeri virtuali",            path: "/azienda/impostazioni/numeri-telefono" },
  { label: "Piano abbonamento",          path: "/azienda/impostazioni/abbonamento" },
  { label: "Fatturazione",               path: "/azienda/impostazioni/fatturazione" },
  { label: "Fatturazione elettronica",   path: "/azienda/impostazioni/fatturazione-nativa" },
];

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

  // 🆕 GAP 1: carica personas + esempi (cached, refetch ogni 5 min)
  const { data: personas = [] } = useQuery({
    queryKey: ["command-palette-personas"],
    queryFn: async (): Promise<AIPersonaLite[]> => {
      const { data, error } = await supabase
        .from("ai_personas" as never)
        .select("persona_key, display_name, short_label, example_questions, category")
        .eq("enabled", true)
        .order("category");
      if (error) return [];
      return (data ?? []) as unknown as AIPersonaLite[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open, // carica solo quando palette aperto (evita fetch su ogni mount)
  });

  useEffect(() => {
    if (!open) setTimeout(() => setQuery(""), 200);
  }, [open]);

  const handleSelect = (url: string) => {
    navigate(url);
    onOpenChange(false);
  };

  /** Apre AssistenteAIPage con persona pre-selezionata + question pre-compilata. */
  const askPersona = (personaKey: string, prefillMessage?: string) => {
    const url = prefillMessage
      ? `/azienda/assistente-ai?persona=${personaKey}&q=${encodeURIComponent(prefillMessage)}`
      : `/azienda/assistente-ai?persona=${personaKey}`;
    handleSelect(url);
  };

  // Filtra personas + esempi in base al query
  const filteredPersonaItems = useMemo(() => {
    if (!personas.length) return [];
    const q = query.toLowerCase().trim();
    type Item = { kind: "persona" | "example"; persona: AIPersonaLite; question?: string };
    const items: Item[] = [];
    for (const p of personas) {
      const personaMatch =
        !q ||
        p.display_name.toLowerCase().includes(q) ||
        p.short_label.toLowerCase().includes(q) ||
        p.persona_key.toLowerCase().includes(q);
      if (personaMatch) items.push({ kind: "persona", persona: p });
      // Esempi cliccabili: matchano sia con q sia mostrati di default (top 2 per persona) se no query
      const examplesToShow = q
        ? (p.example_questions ?? []).filter((ex) => ex.toLowerCase().includes(q))
        : (personaMatch ? [] : []);
      for (const ex of examplesToShow) {
        items.push({ kind: "example", persona: p, question: ex });
      }
    }
    // Limita a 30 per evitare listone (search più precisa)
    return items.slice(0, 30);
  }, [personas, query]);

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

  const filteredSettingsItems = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return SETTINGS_ITEMS.filter(item => item.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Cerca ordini, clienti, AI, impostazioni..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isFetching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {query.length >= 2 && !isFetching && results.length === 0 && filteredNavGroups.length === 0 && filteredSettingsItems.length === 0 && filteredPersonaItems.length === 0 && (
          <CommandEmpty>Nessun risultato per &quot;{query}&quot;</CommandEmpty>
        )}

        {/* 🆕 GAP 1: AI Personas + esempi cliccabili. Quando query vuoto mostra
            le personas in alto come "shortcut alle 18 AI persone". Quando
            query c'è, filtra anche le example_questions (così "fattura"
            mostra esempi tipo "Genera la LIPE trimestrale" da commercialista). */}
        {filteredPersonaItems.length > 0 && (
          <>
            <CommandGroup heading="AI · Personas e domande">
              {filteredPersonaItems.map((it, idx) => {
                if (it.kind === "persona") {
                  return (
                    <CommandItem
                      key={`p-${it.persona.persona_key}-${idx}`}
                      onSelect={() => askPersona(it.persona.persona_key)}
                      className="flex items-center gap-3"
                    >
                      <Bot className="h-4 w-4 text-violet-600" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          Chiedi a {it.persona.display_name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {it.persona.short_label}
                        </span>
                      </div>
                    </CommandItem>
                  );
                }
                return (
                  <CommandItem
                    key={`e-${it.persona.persona_key}-${idx}`}
                    onSelect={() => askPersona(it.persona.persona_key, it.question!)}
                    className="flex items-center gap-3 pl-7"
                  >
                    <Sparkles className="h-3 w-3 text-violet-500 flex-shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs truncate">{it.question}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        → {it.persona.display_name}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
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

        {/* Voci Impostazioni */}
        {filteredSettingsItems.length > 0 && (
          <>
            <CommandGroup heading="Impostazioni">
              {filteredSettingsItems.map((item) => (
                <CommandItem
                  key={item.path}
                  onSelect={() => handleSelect(item.path)}
                  className="flex items-center gap-3"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {filteredNavGroups.length > 0 && <CommandSeparator />}
          </>
        )}

        {filteredNavGroups.map((group) => {
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
