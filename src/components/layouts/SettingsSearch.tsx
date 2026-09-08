/**
 * MP-IMP-001 Fase 7 — Search nei settings con Cmd+K.
 *
 * 49 pagine in 10 gruppi: trovare "dove configuro le ritenute" e' un incubo.
 * Questo componente offre un search bar in alto al layout settings:
 *   - input testuale per filtrare voci per titolo + keyword + descrizione
 *   - Cmd/Ctrl+K apre il dialog ovunque sotto /azienda/impostazioni
 *   - Enter naviga alla prima voce
 *   - Risultati cliccabili
 *
 * Source of truth: SETTINGS_INDEX qui sotto (sincronizzato con SECTION_MAP
 * di SettingsLayout + sidebarConfig).
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

interface SettingsIndexEntry {
  title: string;
  url: string;
  group: string;
  description?: string;
  keywords?: string[];
}

// Index delle 49 voci settings — keyword facilitano i sinonimi italiani.
const SETTINGS_INDEX: SettingsIndexEntry[] = [
  // ── Account / Azienda ──
  { group: "Account", title: "Il mio profilo", url: "/azienda/impostazioni/mio-profilo", keywords: ["profilo", "personale", "account", "email", "calendari", "notifiche", "password", "2fa", "sicurezza"] },
  { group: "Account", title: "Sicurezza profilo", url: "/azienda/impostazioni/mio-profilo?tab=sicurezza", keywords: ["password", "cambio password", "2fa", "autenticazione", "account"] },
  { group: "Account", title: "Profilo aziendale", url: "/azienda/impostazioni/profilo", keywords: ["azienda", "ragione sociale", "p.iva", "partita iva", "sede legale"] },
  { group: "Account", title: "Sedi operative", url: "/azienda/impostazioni/sedi", keywords: ["sede", "filiale", "negozio", "ufficio"] },
  { group: "Account", title: "Piano abbonamento", url: "/azienda/impostazioni/abbonamento", keywords: ["piano", "abbonamento", "subscription", "fattura abbonamento", "pagamento"] },
  { group: "Account", title: "Crediti & saldo", url: "/azienda/impostazioni/crediti", keywords: ["crediti", "saldo", "ricarica", "ai", "render", "sms"] },

  // ── Catalogo & Listini ──
  { group: "Catalogo", title: "Listino prodotti", url: "/azienda/impostazioni/listino", keywords: ["catalogo", "articoli", "sku", "prezzi", "famiglie"] },
  { group: "Catalogo", title: "Import listini", url: "/azienda/impostazioni/listino/import", keywords: ["import", "excel", "csv", "pdf", "carica listino"] },
  { group: "Catalogo", title: "Manodopera e Servizi", url: "/azienda/impostazioni/tariffe", keywords: ["tariffe", "manodopera", "servizi", "posa", "orario", "ricarico"] },
  { group: "Catalogo", title: "Listino Manutenzione", url: "/azienda/impostazioni/tariffe?tab=manutenzione", keywords: ["manutenzione", "abbonamenti", "contratti", "impianti", "interventi"] },
  { group: "Catalogo", title: "Bundle & Pacchetti", url: "/azienda/impostazioni/bundle", keywords: ["bundle", "pacchetti", "chiavi in mano"] },
  { group: "Catalogo", title: "Catalogo render", url: "/azienda/impostazioni/catalogo-render", keywords: ["render", "foto prodotto", "riferimento", "mobile bagno", "sanitari", "piastrelle", "catalogo render"] },

  // ── Preventivi & vendite ──
  { group: "Preventivi", title: "Margini preventivi", url: "/azienda/impostazioni/margini", keywords: ["margini", "ricarico", "markup"] },
  { group: "Preventivi", title: "Regole scontistica", url: "/azienda/impostazioni/scontistica", keywords: ["sconto", "fasce sconto", "scontistica"] },
  { group: "Preventivi", title: "Template offerte", url: "/azienda/impostazioni/template-preventivi", keywords: ["template", "offerta", "pdf preventivo"] },
  { group: "Preventivi", title: "Condizioni e firma", url: "/azienda/impostazioni/condizioni-firma", keywords: ["clausole", "vessatorie", "recesso", "privacy", "firma", "condizioni contrattuali"] },
  { group: "Preventivi", title: "Firma Elettronica FEA", url: "/azienda/impostazioni/firma-elettronica", keywords: ["firma", "fea", "otp", "elettronica"] },
  { group: "Preventivi", title: "Finanziamenti", url: "/azienda/impostazioni/finanziamenti", keywords: ["finanziamento", "rate", "finanziaria", "compass", "findomestic"] },

  // ── Ordini / Cantieri ──
  { group: "Ordini", title: "Stati ordine", url: "/azienda/impostazioni/stati-ordine", keywords: ["stato", "fasi", "kanban", "tracker"] },
  { group: "Ordini", title: "Categorie costi", url: "/azienda/impostazioni/categorie-costi", keywords: ["costi", "categoria costo", "voci spesa"] },
  { group: "Ordini", title: "Fornitori", url: "/azienda/impostazioni/fornitori", keywords: ["fornitore", "subappalto", "anagrafica fornitori"] },
  { group: "Ordini", title: "Automazioni finanza", url: "/azienda/impostazioni/automazioni-finanza", keywords: ["automazione", "ritenute", "ritenuta garanzia", "trattenuta", "fideiussione"] },

  // ── Fatturazione ──
  { group: "Fatturazione", title: "Fatturazione", url: "/azienda/impostazioni/fatturazione", keywords: ["fatturazione", "iva", "documenti"] },
  { group: "Fatturazione", title: "Fatturazione elettronica", url: "/azienda/impostazioni/fatturazione-nativa", keywords: ["fatturazione elettronica", "sdi", "aruba", "p7m", "xml"] },

  // ── Marketing & CRM ──
  { group: "Marketing", title: "Tag", url: "/azienda/impostazioni/tag", keywords: ["tag", "etichette", "categoria contatti"] },
  { group: "Marketing", title: "Campi personalizzati", url: "/azienda/impostazioni/campi-personalizzati", keywords: ["campo", "custom field", "field"] },
  { group: "Marketing", title: "Sequenze (Pipeline)", url: "/azienda/impostazioni/sequenze", keywords: ["pipeline", "sequenza", "fase opportunita", "stage"] },
  { group: "Marketing", title: "Form & UTM", url: "/azienda/impostazioni/form-builder", keywords: ["form", "utm", "lead form", "acquisizione"] },
  { group: "Marketing", title: "Calendari marketing", url: "/azienda/impostazioni/calendari", keywords: ["calendario", "google calendar", "appuntamenti"] },
  { group: "Ordini", title: "Calendari lavori", url: "/azienda/impostazioni/calendari-lavori", keywords: ["squadre", "posa", "google calendar", "calendario lavori", "cantieri"] },
  { group: "Marketing", title: "Lead Facebook", url: "/azienda/impostazioni/lead-forms", keywords: ["meta", "facebook", "instagram", "lead ads"] },

  // ── People ──
  { group: "Persone", title: "Persone & Accessi", url: "/azienda/impostazioni/persone", keywords: ["utenti", "venditori", "staff", "operai", "team", "ruoli", "permessi"] },
  { group: "Persone", title: "Template permessi", url: "/azienda/impostazioni/persone?tab=template-permessi", keywords: ["template", "permessi", "ruoli", "accessi", "utenti"] },

  // ── Sicurezza ──
  { group: "Sicurezza", title: "Sicurezza & Privacy", url: "/azienda/impostazioni/sicurezza-privacy", keywords: ["privacy", "gdpr", "log", "registro attivita", "dashboard sicurezza", "sicurezza"] },
  { group: "Sicurezza", title: "Esporta i dati", url: "/azienda/impostazioni/esporta-dati", keywords: ["esporta", "export", "backup", "csv", "zip", "portabilita", "migrazione", "commercialista"] },
  { group: "Sicurezza", title: "Integrazioni", url: "/azienda/impostazioni/integrazioni", keywords: ["integrazione", "api esterna", "stripe", "gocardless", "google"] },
  { group: "Sicurezza", title: "API Platform", url: "/azienda/impostazioni/api", keywords: ["api", "chiavi api", "token", "developer"] },
  { group: "Sicurezza", title: "Webhook", url: "/azienda/impostazioni/webhook", keywords: ["webhook", "eventi", "callback"] },

  // ── Branding & White-label ──
  { group: "Branding", title: "White-Label", url: "/azienda/impostazioni/branding", keywords: ["brand", "logo", "colori", "personalizzazione"] },
  { group: "Branding", title: "Dominio email", url: "/azienda/impostazioni/dominio-email", keywords: ["dominio", "smtp", "spf", "dkim", "email"] },
  { group: "Comunicazione", title: "Telefonia", url: "/azienda/impostazioni/numeri-telefono", keywords: ["telefono", "numero", "telefonia", "sistema telefonico", "centralino", "voce", "telnyx", "chiamate"] },

  // ── AI ──
  { group: "AI", title: "Memoria AI Personas", url: "/azienda/impostazioni/ai-memoria", keywords: ["ai", "memoria", "personas", "silvio", "ricordo", "fact", "preferenza", "decisione"] },

  // ── Notifiche ──
  { group: "Notifiche", title: "Preferenze notifiche", url: "/azienda/impostazioni/notifiche", keywords: ["notifiche", "telegram", "whatsapp", "email", "silvio chat", "canale", "fallback", "quiet hours", "silenzio"] },
];

interface SettingsSearchProps {
  /** Se true, mostra solo il dialog senza pulsante (controllato dal parent). */
  hideTrigger?: boolean;
}

export function SettingsSearch({ hideTrigger = false }: SettingsSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Filtro fuzzy semplice: title + keywords + group + description
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTINGS_INDEX;
    return SETTINGS_INDEX.filter((e) => {
      const haystack = [
        e.title,
        e.group,
        e.description ?? "",
        ...(e.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const grouped = useMemo(() => {
    const m = new Map<string, SettingsIndexEntry[]>();
    for (const r of results) {
      const arr = m.get(r.group) ?? [];
      arr.push(r);
      m.set(r.group, arr);
    }
    return [...m.entries()];
  }, [results]);

  const handleSelect = useCallback(
    (url: string) => {
      setOpen(false);
      setQuery("");
      navigate(url);
    },
    [navigate],
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
            ⌘K
          </kbd>
        </Button>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Cerca impostazioni... (es. ritenute, sconto, dominio)"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Nessun risultato.</CommandEmpty>
          {grouped.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((entry) => (
                <CommandItem
                  key={entry.url}
                  value={`${entry.title} ${entry.group} ${(entry.keywords ?? []).join(" ")}`}
                  onSelect={() => handleSelect(entry.url)}
                >
                  <ArrowRight className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span>{entry.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
