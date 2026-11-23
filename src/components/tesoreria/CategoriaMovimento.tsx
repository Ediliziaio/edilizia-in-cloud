/**
 * La categoria di cassa di un movimento, dove serve: nella colonna Categoria
 * dell'elenco e nel popup del movimento. Mostra la voce e da dove viene; un
 * clic apre il selettore. Una voce ricavata dalla vecchia categoria testuale è
 * una PROPOSTA: si vede come tale e si conferma con un clic. Lo stesso per la
 * voce proposta dalla fattura collegata.
 *
 * Dal 15/11/2026 un movimento si può anche RIPARTIRE su più voci («Ripartisci
 * su più voci» nel selettore); la cella mostra la voce principale e quante
 * altre ce ne sono.
 */
import { useState } from "react";
import { Check, Loader2, Split } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ORIGINE_VOCE,
  salvaCategoriaMovimento,
  salvaRipartizioneMovimento,
  useAggiornaDopoCategoria,
  useCatalogoCassa,
  type VoceMovimento,
} from "@/lib/finance/cassaVoci";
import { ScegliVoceCassa } from "./ScegliVoceCassa";
import { RipartizioneCassa } from "./RipartizioneCassa";
import { formatEuro } from "@/lib/formatEuro";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [ripartisci, setRipartisci] = useState(false);
  const catalogo = useCatalogoCassa(aperto ? company : null);
  const aggiorna = useAggiornaDopoCategoria();

  async function salva(id: string | null, nome: string | null) {
    setOccupato(true);
    try {
      const rev = await salvaCategoriaMovimento({ company, tx, voce: id, revision: revisione });
      toast.success(id ? t("Categoria salvata") : t("Categoria tolta"));
      setAperto(false);
      onSalvata?.(rev, nome);
      aggiorna();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Categoria non salvata"));
    } finally {
      setOccupato(false);
    }
  }

  async function salvaQuote(quote: { voce: string; cents: number }[]) {
    setOccupato(true);
    try {
      const rev = await salvaRipartizioneMovimento({ company, tx, quote, revision: revisione });
      toast.success(quote.length ? t("Ripartizione salvata") : t("Ripartizione tolta"));
      setAperto(false);
      setRipartisci(false);
      onSalvata?.(rev, voce?.nome ?? null);
      aggiorna();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Ripartizione non salvata"));
    } finally {
      setOccupato(false);
    }
  }

  const quote = voce?.quote && voce.quote.length > 1 ? voce.quote : null;
  const etichetta = voce ? voce.nome : testoVecchio ? testoVecchio : null;
  const daConfermare = voce && !voce.confermata;

  const contenuto = (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", compatta ? "text-sm" : "")}>
      {etichetta ? (
        <span
          className="min-w-0 truncate"
          title={quote ? quote.map((q) => `${q.nome}: ${formatEuro(q.cents / 100)}`).join(" · ") : voce?.categoria ? `${voce.categoria} · ${voce.nome}` : etichetta}
        >
          {etichetta}
        </span>
      ) : (
        <span className={puoModificare ? "text-primary" : "text-muted-foreground"}>{puoModificare ? t("Scegli") : "—"}</span>
      )}
      {quote && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800">
          <Split className="h-2.5 w-2.5" aria-hidden />+{quote.length - 1}
          <span className="sr-only"> {t("altre voci: ripartito")}</span>
        </span>
      )}
      {daConfermare && (
        <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
          {t("da confermare")}
        </span>
      )}
      {!voce && testoVecchio && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{t("testo libero")}</span>
      )}
    </span>
  );

  if (!puoModificare) return contenuto;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <Popover open={aperto} onOpenChange={(o) => { setAperto(o); if (!o) setRipartisci(false); }}>
        <PopoverTrigger asChild>
          <button type="button" className="min-w-0 max-w-full text-left hover:underline" aria-label={`Categoria: ${etichetta ?? "da scegliere"}`}>
            {contenuto}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 p-3">
          {voce && (
            <p className="text-xs text-muted-foreground">
              {t("Ora:")} <strong className="text-foreground">{quote ? quote.map((q) => q.nome).join(" + ") : voce.nome}</strong> · {ORIGINE_VOCE[voce.origine] ? t(ORIGINE_VOCE[voce.origine]) : voce.origine}
            </p>
          )}
          {!quote && !voce?.confermata && voce?.proposta_quote && voce.proposta_quote.length > 1 && !ripartisci && (
            <p className="rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-100">
              {t("La fattura collegata copre {n} voci:", { n: voce.proposta_quote.length })}{" "}
              {voce.proposta_quote.map((q) => `${q.nome} ${formatEuro(q.cents / 100)}`).join(", ")}.{" "}
              <button type="button" className="font-medium underline" onClick={() => setRipartisci(true)}>{t("Ripartisci così")}</button>
            </p>
          )}
          {ripartisci ? (
            <RipartizioneCassa
              catalogo={catalogo.data}
              importo={importo}
              voce={voce}
              occupato={occupato}
              onSalva={(q) => void salvaQuote(q)}
              onTogli={() => void salvaQuote([])}
              onAnnulla={() => setRipartisci(false)}
            />
          ) : (
            <>
              <ScegliVoceCassa catalogo={catalogo.data} importo={importo} selezionata={voce?.confermata && !quote ? voce.id : null} occupato={occupato} onScegli={(v) => void salva(v.id, v.nome)} />
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="sm" disabled={occupato} onClick={() => setRipartisci(true)}>
                  <Split className="mr-1 h-3.5 w-3.5" /> {quote ? t("Cambia la ripartizione") : t("Ripartisci su più voci")}
                </Button>
                {voce?.confermata && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={occupato} onClick={() => void salva(null, null)}>
                    {t("Togli la categoria")}
                  </Button>
                )}
              </div>
            </>
          )}
          {catalogo.isError && <p role="alert" className="text-xs text-destructive">{t("Catalogo non disponibile: {errore}", { errore: String((catalogo.error as Error).message ?? "") })}</p>}
        </PopoverContent>
      </Popover>
      {daConfermare && voce && voce.codice.includes(".") && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title={t("Conferma «{nome}»", { nome: String(voce.nome ?? "") })}
          aria-label={t("Conferma {nome}", { nome: String(voce.nome ?? "") })}
          disabled={occupato}
          onClick={() => void salva(voce.id, voce.nome)}
        >
          {occupato ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
}
