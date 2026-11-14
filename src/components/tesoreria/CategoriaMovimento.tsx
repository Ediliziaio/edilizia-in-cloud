/**
 * La categoria di cassa di un movimento, dove serve: nella colonna Categoria
 * dell'elenco e nel popup del movimento. Mostra la voce e da dove viene; un
 * clic apre il selettore. Una voce ricavata dalla vecchia categoria testuale è
 * una PROPOSTA: si vede come tale e si conferma con un clic.
 */
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ORIGINE_VOCE,
  salvaCategoriaMovimento,
  useAggiornaDopoCategoria,
  useCatalogoCassa,
  type VoceMovimento,
} from "@/lib/finance/cassaVoci";
import { ScegliVoceCassa } from "./ScegliVoceCassa";

export function CategoriaMovimento({
  company,
  tx,
  importo,
  revisione,
  voce,
  testoVecchio,
  puoModificare,
  compatta = false,
  onSalvata,
}: {
  company: string;
  tx: string;
  importo: number;
  revisione: number;
  voce: VoceMovimento | undefined;
  /** La vecchia categoria testuale, mostrata solo se non c'è niente di meglio. */
  testoVecchio?: string | null;
  puoModificare: boolean;
  compatta?: boolean;
  onSalvata?: (revisione: number, nome: string | null) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const catalogo = useCatalogoCassa(aperto ? company : null);
  const aggiorna = useAggiornaDopoCategoria();

  async function salva(id: string | null, nome: string | null) {
    setOccupato(true);
    try {
      const rev = await salvaCategoriaMovimento({ company, tx, voce: id, revision: revisione });
      toast.success(id ? "Categoria salvata" : "Categoria tolta");
      setAperto(false);
      onSalvata?.(rev, nome);
      aggiorna();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Categoria non salvata");
    } finally {
      setOccupato(false);
    }
  }

  const etichetta = voce ? voce.nome : testoVecchio ? testoVecchio : null;
  const daConfermare = voce && !voce.confermata;

  const contenuto = (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", compatta ? "text-sm" : "")}>
      {etichetta ? (
        <span className="min-w-0 truncate" title={voce?.categoria ? `${voce.categoria} · ${voce.nome}` : etichetta}>
          {etichetta}
        </span>
      ) : (
        <span className={puoModificare ? "text-primary" : "text-muted-foreground"}>{puoModificare ? "Scegli" : "—"}</span>
      )}
      {daConfermare && (
        <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
          da confermare
        </span>
      )}
      {!voce && testoVecchio && (
        <span className="shrink-0 text-[10px] text-muted-foreground">testo libero</span>
      )}
    </span>
  );

  if (!puoModificare) return contenuto;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <button type="button" className="min-w-0 max-w-full text-left hover:underline" aria-label={`Categoria: ${etichetta ?? "da scegliere"}`}>
            {contenuto}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 p-3">
          {voce && (
            <p className="text-xs text-muted-foreground">
              Ora: <strong className="text-foreground">{voce.nome}</strong> · {ORIGINE_VOCE[voce.origine] ?? voce.origine}
            </p>
          )}
          <ScegliVoceCassa catalogo={catalogo.data} importo={importo} selezionata={voce?.confermata ? voce.id : null} occupato={occupato} onScegli={(v) => void salva(v.id, v.nome)} />
          {catalogo.isError && <p role="alert" className="text-xs text-destructive">Catalogo non disponibile: {(catalogo.error as Error).message}</p>}
          {voce?.confermata && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={occupato} onClick={() => void salva(null, null)}>
              Togli la categoria
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {daConfermare && voce && voce.codice.includes(".") && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title={`Conferma «${voce.nome}»`}
          aria-label={`Conferma ${voce.nome}`}
          disabled={occupato}
          onClick={() => void salva(voce.id, voce.nome)}
        >
          {occupato ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
}
