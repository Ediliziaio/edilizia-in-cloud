/**
 * AddVocePicker — command-palette (cmdk) per aggiungere voci al computo.
 *
 * Un toggle in testata sceglie la SORGENTE di ricerca:
 *  • "Listino aziendale" → 3 sezioni aziendali + entry "Voce libera":
 *      - Lavorazioni → `pav_listino_voci`   (voce completa: mat + mano + prezzo)
 *      - Prodotti    → `article_templates`  (materiali: costo → costo_materiali)
 *      - Manodopera  → `tariffe_aziendali`  (manodopera: costo → costo_manodopera)
 *  • "Prezzario regionale" → `prezzario_voce` (fonti pubblicate, cross-regione):
 *      prezzo scorporato in mat/mano via `incidenza_manodopera_pct`, dritto nel
 *      computo (NON passa da `pav_listino`).
 *
 * Keyboard-first: il Dialog di cmdk dà ↑/↓/invio/esc nativi; `shouldFilter={false}`
 * perché la ricerca è server-side (typeahead debounced). `onPick` ritorna una
 * `PickedVoce` neutra: la materializzazione in `PavComputoVoce` la fa il padre.
 *
 * Purezza React: nessun setState in effect/render; il termine digitato è stato
 * locale, il debounce è un hook dedicato, le query sono react-query.
 */
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Hammer, Package, HardHat, PlusCircle, Loader2, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useListinoVociSearch,
  usePrefillFromArticolo,
  usePrefillFromTariffa,
  mapUnitaMisura,
} from "@/hooks/usePavimentiListino";
import { usePrezzarioVociGlobalSearch } from "@/lib/prezzario/queries";
import type { PickedVoce, VoceSource } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (voce: PickedVoce) => void;
  /** Capitolo a cui pre-assegnare la voce (mostrato nell'header del picker). */
  targetCapitolo?: string;
}

/** Meta di presentazione per ciascuna sorgente (icona + colore badge). */
const SOURCE_META: Record<VoceSource, { label: string; badge: string; Icon: typeof Hammer }> = {
  lavorazione: { label: "Lavorazione", badge: "border-orange-200 bg-orange-50 text-orange-700", Icon: Hammer },
  prodotto: { label: "Prodotto", badge: "border-sky-200 bg-sky-50 text-sky-700", Icon: Package },
  manodopera: { label: "Manodopera", badge: "border-violet-200 bg-violet-50 text-violet-700", Icon: HardHat },
  libera: { label: "Libera", badge: "border-slate-200 bg-slate-50 text-slate-600", Icon: PlusCircle },
  prezzario: { label: "Prezzario", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: Library },
};

/** Sorgente di ricerca attiva nel picker (toggle in testata). */
type SearchMode = "azienda" | "prezzario";

/** Riga di risultato del picker, uniforme tra le sorgenti. */
function ResultRow({
  source, descrizione, meta, prezzo, prezzoLabel, onSelect,
}: {
  source: VoceSource;
  descrizione: string;
  meta?: string;
  prezzo: number;
  prezzoLabel: string;
  onSelect: () => void;
}) {
  const S = SOURCE_META[source];
  return (
    <CommandItem
      onSelect={onSelect}
      // value univoco: cmdk lo usa per la selezione tastiera (filtro disattivo).
      value={`${source}-${descrizione}-${meta ?? ""}`}
      className="gap-3 rounded-lg data-[selected=true]:bg-orange-50/70"
    >
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", S.badge)}>
        <S.Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{descrizione}</p>
        {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(prezzo)}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{prezzoLabel}</p>
      </div>
    </CommandItem>
  );
}

export default function AddVocePicker({ open, onOpenChange, onPick, targetCapitolo }: Props) {
  const [term, setTerm] = useState("");
  const [mode, setMode] = useState<SearchMode>("azienda");
  const debounced = useDebounce(term, 250);

  // Le query partono solo a picker aperto + nella modalità attiva (enabled), così
  // non scaldiamo cache inutili. Le sorgenti aziendali condividono un hook ciascuna.
  const azOn = open && mode === "azienda";
  const lavorazioni = useListinoVociSearch(azOn ? debounced : "");
  const prodotti = usePrefillFromArticolo(azOn ? debounced : "");
  const manodopera = usePrefillFromTariffa(azOn ? debounced : "");
  // Prezzario regionale centrale (cross-fonte, solo pubblicate): hook gated a 2+ char.
  const prezzario = usePrezzarioVociGlobalSearch(
    open && mode === "prezzario" ? debounced : "",
  );

  const isFetching =
    mode === "azienda"
      ? lavorazioni.isFetching || prodotti.isFetching || manodopera.isFetching
      : prezzario.isFetching;

  const resetAndClose = () => {
    setTerm("");
    setMode("azienda");
    onOpenChange(false);
  };

  const handlePick = (voce: PickedVoce) => {
    onPick(voce);
    resetAndClose();
  };

  // "Voce libera": descrizione = termine digitato (o placeholder), prezzi a 0.
  const liberaLabel = useMemo(
    () => (term.trim() ? `Voce libera: "${term.trim()}"` : "Aggiungi voce libera"),
    [term],
  );

  const nLav = lavorazioni.data?.length ?? 0;
  const nProd = prodotti.data?.length ?? 0;
  const nMano = manodopera.data?.length ?? 0;
  const nPrez = prezzario.data?.length ?? 0;
  const nTot = mode === "azienda" ? nLav + nProd + nMano : nPrez;
  const nessunRisultato = !isFetching && nTot === 0 && debounced.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { setTerm(""); setMode("azienda"); }
        onOpenChange(v);
      }}
    >
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-2xl">
        <VisuallyHidden><DialogTitle>Aggiungi voce al computo</DialogTitle></VisuallyHidden>
        {/* shouldFilter=false: la ricerca è server-side (typeahead), cmdk gestisce
            solo navigazione tastiera e selezione, NON il filtro dei risultati. */}
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        {/* Toggle sorgente: listino aziendale vs. prezzario regionale centrale. */}
        <ToggleGroup
          type="single"
          size="sm"
          value={mode}
          // single-toggle: ignora il deseleziona (value === ""), resta sempre una sorgente attiva.
          onValueChange={(v) => { if (v) setMode(v as SearchMode); }}
          className="justify-start gap-1"
        >
          <ToggleGroupItem value="azienda" className="h-7 gap-1.5 px-2.5 text-[11px] data-[state=on]:bg-orange-50 data-[state=on]:text-orange-700">
            <Hammer className="h-3 w-3" /> Listino aziendale
          </ToggleGroupItem>
          <ToggleGroupItem value="prezzario" className="h-7 gap-1.5 px-2.5 text-[11px] data-[state=on]:bg-emerald-50 data-[state=on]:text-emerald-700">
            <Library className="h-3 w-3" /> Prezzario regionale
          </ToggleGroupItem>
        </ToggleGroup>
        {targetCapitolo && (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            in {targetCapitolo}
          </Badge>
        )}
      </div>
      <CommandInput
        placeholder={
          mode === "azienda"
            ? "Cerca una voce, un prodotto o una manodopera…"
            : "Cerca nel prezzario regionale (min. 2 caratteri)…"
        }
        value={term}
        onValueChange={setTerm}
      />
      <CommandList className="max-h-[60vh]">
        {nessunRisultato ? (
          <CommandEmpty className="py-8 text-sm text-muted-foreground">
            {mode === "azienda" ? (
              <>
                Nessuna corrispondenza nei listini.
                <br />
                <span className="text-xs">Usa "Voce libera" qui sotto per inserirla a mano.</span>
              </>
            ) : (
              <>
                Nessuna corrispondenza nel prezzario regionale.
                <br />
                <span className="text-xs">Prova un altro termine o passa al listino aziendale.</span>
              </>
            )}
          </CommandEmpty>
        ) : null}

        {/* Voce libera — solo in modalità azienda, in cima per accesso rapido */}
        {mode === "azienda" && (
        <CommandGroup heading="Crea">
          <ResultRow
            source="libera"
            descrizione={liberaLabel}
            meta="Riga vuota da compilare (quantità, prezzo, UdM)"
            prezzo={0}
            prezzoLabel="da definire"
            onSelect={() =>
              handlePick({
                descrizione: term.trim() || "Nuova voce",
                unita_misura: "cad",
                prezzo_unitario: 0,
                costo_materiali: 0,
                costo_manodopera: 0,
                capitolo_nome: targetCapitolo,
              })
            }
          />
        </CommandGroup>
        )}

        {/* Lavorazioni */}
        {mode === "azienda" && nLav > 0 && (
          <CommandGroup heading={`Lavorazioni (${nLav})`}>
            {lavorazioni.data!.map((v) => (
              <ResultRow
                key={`lav-${v.id}`}
                source="lavorazione"
                descrizione={v.descrizione}
                meta={[v.codice, v.capitolo_nome, `/${v.unita_misura}`].filter(Boolean).join(" · ")}
                prezzo={v.prezzo_unitario}
                prezzoLabel={`/ ${v.unita_misura}`}
                onSelect={() =>
                  handlePick({
                    descrizione: v.descrizione,
                    unita_misura: v.unita_misura,
                    prezzo_unitario: v.prezzo_unitario,
                    costo_materiali: v.costo_materiali,
                    costo_manodopera: v.costo_manodopera,
                    capitolo_nome: v.capitolo_nome ?? targetCapitolo,
                    listino_voce_id: v.id,
                    // Porta avanti la citazione fonte se la voce di listino l'aveva.
                    fonte: v.fonte,
                  })
                }
              />
            ))}
          </CommandGroup>
        )}

        {/* Prodotti */}
        {mode === "azienda" && nProd > 0 && (
          <CommandGroup heading={`Prodotti (${nProd})`}>
            {prodotti.data!.map((p) => (
              <ResultRow
                key={`prod-${p.id}`}
                source="prodotto"
                descrizione={p.name}
                meta={[p.marca, p.sku].filter(Boolean).join(" · ") || undefined}
                prezzo={p.prezzo_vendita || p.costo}
                prezzoLabel={p.unita ? `/ ${p.unita}` : "vendita"}
                onSelect={() =>
                  handlePick({
                    descrizione: p.name,
                    unita_misura: mapUnitaMisura(p.unita),
                    // Prezzo di partenza = vendita listino (fallback costo).
                    prezzo_unitario: p.prezzo_vendita || p.costo,
                    costo_materiali: p.costo,
                    costo_manodopera: 0,
                    capitolo_nome: targetCapitolo,
                  })
                }
              />
            ))}
          </CommandGroup>
        )}

        {/* Manodopera */}
        {mode === "azienda" && nMano > 0 && (
          <CommandGroup heading={`Manodopera (${nMano})`}>
            {manodopera.data!.map((m) => (
              <ResultRow
                key={`mano-${m.id}`}
                source="manodopera"
                descrizione={m.nome}
                meta={[m.tipo].filter(Boolean).join(" · ") || undefined}
                prezzo={m.prezzo_vendita || m.costo}
                prezzoLabel={m.unita ? `/ ${m.unita}` : "vendita"}
                onSelect={() =>
                  handlePick({
                    descrizione: m.nome,
                    unita_misura: mapUnitaMisura(m.unita),
                    prezzo_unitario: m.prezzo_vendita || m.costo,
                    costo_materiali: 0,
                    costo_manodopera: m.costo,
                    capitolo_nome: targetCapitolo,
                  })
                }
              />
            ))}
          </CommandGroup>
        )}

        {/* Prezzario regionale (cross-fonte, solo pubblicate) */}
        {mode === "prezzario" && nPrez > 0 && (
          <CommandGroup heading={`Prezzario regionale (${nPrez})`}>
            {prezzario.data!.map((v) => {
              const prezzo = Number(v.prezzo) || 0;
              const incid = v.incidenza_manodopera_pct ?? 0; // frazione 0..1
              const costoMano = Math.round(prezzo * incid * 100) / 100;
              const costoMat = Math.round((prezzo - costoMano) * 100) / 100;
              return (
                <ResultRow
                  key={`prez-${v.id}`}
                  source="prezzario"
                  descrizione={v.descrizione}
                  meta={[
                    v.codice,
                    v.fonteLabel,
                    v.unita_misura ? `/${v.unita_misura}` : null,
                    incid > 0 ? `manodopera ${Math.round(incid * 100)}%` : null,
                  ].filter(Boolean).join(" · ")}
                  prezzo={prezzo}
                  prezzoLabel={v.unita_misura ? `/ ${v.unita_misura}` : "prezzo"}
                  onSelect={() =>
                    handlePick({
                      descrizione: v.descrizione,
                      unita_misura: mapUnitaMisura(v.unita_misura),
                      prezzo_unitario: prezzo,
                      costo_materiali: costoMat,
                      costo_manodopera: costoMano,
                      capitolo_nome: targetCapitolo,
                      // Citazione fonte per riga: "Regione Anno" della fonte del prezzario.
                      fonte: v.fonteLabel,
                    })
                  }
                />
              );
            })}
          </CommandGroup>
        )}

        {isFetching && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
            {mode === "azienda" ? "Ricerca nei listini…" : "Ricerca nel prezzario…"}
          </div>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
