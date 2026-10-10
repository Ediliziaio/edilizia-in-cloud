/**
 * MP-IMP-001 Fase 7 — Search nelle impostazioni con Cmd+K.
 *
 * Trovare "dove configuro i prezzi a mano" in 50 pagine è un incubo. Questo componente offre una ricerca in alto
 * al layout delle impostazioni:
 *   - Cmd/Ctrl+K la apre ovunque sotto /azienda/impostazioni
 *   - ogni parola scritta deve comparire nella voce (titolo, parole chiave, gruppo, frase), senza badare ad
 *     accenti e maiuscole: «ore lavorate», «iban», «attivita» trovano la pagina giusta
 *   - Enter apre la prima voce; le voci aprono la sezione giusta della pagina (indirizzo con àncora)
 *
 * La lista delle voci, i permessi e il motore stanno in lib/impostazioni/indiceImpostazioni.ts: sono gli stessi
 * della palette dell'app e dell'elenco da telefono.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useVociImpostazioni } from "@/hooks/useVociImpostazioni";
import { PIU_CERCATE, cercaImpostazioni, type VoceRicercabile } from "@/lib/impostazioni/indiceImpostazioni";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

interface SettingsSearchProps {
  /** Se true, mostra solo il dialog senza pulsante (controllato dal parent). */
  hideTrigger?: boolean;
}

/** Il tasto che apre la ricerca: ⌘ sul Mac, Ctrl sugli altri computer. */
function tastoRicerca(): string {
  const piattaforma = typeof navigator === "undefined" ? "" : `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(piattaforma) ? "⌘K" : "Ctrl K";
}

export function SettingsSearch({ hideTrigger = false }: SettingsSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  // Le impostazioni fuori dal piano, senza permesso o assenti da telefono non si cercano.
  const { voci } = useVociImpostazioni(open);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => cercaImpostazioni(voci, query), [voci, query]);

  // Casella vuota: prima le voci che si cercano di più, poi tutto il menu.
  const piuCercate = useMemo(
    () => (query.trim() ? [] : PIU_CERCATE.map((url) => voci.find((v) => v.url === url)).filter((v): v is VoceRicercabile => Boolean(v))),
    [voci, query],
  );

  const grouped = useMemo(() => {
    const m = new Map<string, VoceRicercabile[]>();
    for (const r of results) {
      const arr = m.get(r.group) ?? [];
      arr.push(r);
      m.set(r.group, arr);
    }
    return [...m.entries()];
  }, [results]);

  const handleSelect = useCallback(
    (url: string) => {
      if (!confermaNavigazioneImpostazioni()) return;
      setOpen(false);
      setQuery("");
      navigate(url);
    },
    [navigate],
  );

  const riga = (entry: VoceRicercabile, prefisso: string) => (
    <CommandItem
      key={`${prefisso}${entry.url}`}
      // Con il filtro di cmdk spento il valore serve solo a distinguere una voce dall'altra: l'indirizzo è unico.
      value={`${prefisso}${entry.url}`}
      onSelect={() => handleSelect(entry.url)}
    >
      <ArrowRight className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate">{entry.title}</span>
        {entry.description && <span className="block truncate text-xs text-muted-foreground">{entry.description}</span>}
      </div>
    </CommandItem>
  );

  return (
    <>
      {!hideTrigger && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => setOpen(true)}
          aria-label="Cerca nelle impostazioni"
        >
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Cerca...</span>
          <kbd className="hidden md:inline pointer-events-none ml-2 select-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {tastoRicerca()}
          </kbd>
        </Button>
      )}

      {/* shouldFilter={false}: il filtro è quello dell'indice (cercaImpostazioni), non quello di cmdk. */}
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Cerca impostazioni (es. prezzo a mano, logo, firma, IBAN)"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {results.length === 0 && (
            <CommandEmpty>
              Nessun risultato. Prova con un&apos;altra parola, per esempio «prezzo», «logo», «firma» o «fattura».
            </CommandEmpty>
          )}
          {piuCercate.length > 0 && (
            <CommandGroup heading="Le più cercate">{piuCercate.map((entry) => riga(entry, "piu:"))}</CommandGroup>
          )}
          {grouped.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((entry) => riga(entry, ""))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
