/**
 * AddVocePicker — command-palette (cmdk) per aggiungere voci al computo.
 *
 * Cerca live in 3 sorgenti aziendali, ognuna con la sua sezione:
 *   • Lavorazioni → `rst_listino_voci`     (voce completa: mat + mano + prezzo)
 *   • Prodotti    → `article_templates`     (materiali: costo → costo_materiali)
 *   • Manodopera  → `tariffe_aziendali`     (manodopera: costo → costo_manodopera)
 * + una entry sempre presente "Voce libera" (riga vuota da compilare a mano).
 *
 * Keyboard-first: il Dialog di cmdk dà ↑/↓/invio/esc nativi; `shouldFilter={false}`
 * perché la ricerca è server-side (typeahead debounced). `onPick` ritorna una
 * `PickedVoce` neutra: la materializzazione in `RstComputoVoce` la fa il padre.
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
import { Hammer, Package, HardHat, PlusCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useListinoVociSearch,
  usePrefillFromArticolo,
  usePrefillFromTariffa,
  mapUnitaMisura,
} from "@/hooks/useListinoLavorazioni";
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
};

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
  const debounced = useDebounce(term, 250);

  // Le query partono solo a picker aperto (enabled), così non scaldiamo la cache
  // mentre il dialog è chiuso. Ogni sorgente ha il suo hook già esistente.
  const lavorazioni = useListinoVociSearch(open ? debounced : "");
  const prodotti = usePrefillFromArticolo(open ? debounced : "");
  const manodopera = usePrefillFromTariffa(open ? debounced : "");

  const isFetching =
    lavorazioni.isFetching || prodotti.isFetching || manodopera.isFetching;

  const handlePick = (voce: PickedVoce) => {
    onPick(voce);
    setTerm("");
    onOpenChange(false);
  };

  // "Voce libera": descrizione = termine digitato (o placeholder), prezzi a 0.
  const liberaLabel = useMemo(
    () => (term.trim() ? `Voce libera: "${term.trim()}"` : "Aggiungi voce libera"),
    [term],
  );

  const nLav = lavorazioni.data?.length ?? 0;
  const nProd = prodotti.data?.length ?? 0;
  const nMano = manodopera.data?.length ?? 0;
  const nessunRisultato = !isFetching && nLav + nProd + nMano === 0 && debounced.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) setTerm(""); onOpenChange(v); }}
    >
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-2xl">
        <VisuallyHidden><DialogTitle>Aggiungi voce al computo</DialogTitle></VisuallyHidden>
        {/* shouldFilter=false: la ricerca è server-side (typeahead), cmdk gestisce
            solo navigazione tastiera e selezione, NON il filtro dei risultati. */}
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          Cerca nei listini ·{" "}
          <span className="text-slate-700">Lavorazioni · Prodotti · Manodopera</span>
        </p>
        {targetCapitolo && (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            in {targetCapitolo}
          </Badge>
        )}
      </div>
      <CommandInput
        placeholder="Cerca una voce, un prodotto o una manodopera…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList className="max-h-[60vh]">
        {nessunRisultato ? (
          <CommandEmpty className="py-8 text-sm text-muted-foreground">
            Nessuna corrispondenza nei listini.
            <br />
            <span className="text-xs">Usa "Voce libera" qui sotto per inserirla a mano.</span>
          </CommandEmpty>
        ) : null}

        {/* Voce libera — sempre disponibile, in cima per accesso rapido */}
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

        {/* Lavorazioni */}
        {nLav > 0 && (
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
                  })
                }
              />
            ))}
          </CommandGroup>
        )}

        {/* Prodotti */}
        {nProd > 0 && (
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
        {nMano > 0 && (
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

        {isFetching && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ricerca nei listini…
          </div>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
