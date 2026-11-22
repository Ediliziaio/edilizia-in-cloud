import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, HardHat, Loader2, MapPin, MessageSquare, Minus, Plus, Search, ShoppingCart, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import {
  PrelievoNonRegistrato, useCampoCantieriPrelievo, useCampoInventario, usePrelievoRegistra,
  type StockCampo,
} from "@/hooks/campo/useCampoPrelievo";
import { useDebounce } from "@/hooks/useDebounce";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  BOZZA_PRELIEVO_VUOTA, chiaveBozzaPrelievo, leggiBozzaPrelievo, salvaBozzaPrelievo, type BozzaPrelievo,
} from "@/lib/campo/bozzaPrelievo";
import { formatoQuantitaMagazzino, nomeCantierePrelievo, quantitaPrelievo } from "@/lib/campo/magazzino";
import { cn } from "@/lib/utils";

const formatoInputQuantita = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 20, useGrouping: false });
const erroreSalvataggioBozza = "Non riesco a salvare il prelievo su questo dispositivo. Riprova.";

export function CampoInventario({ companyId, userId, attivo, puoPrelevare, richiedeConferma, cantiereIniziale, apriBozza, onRegistrato }: {
  companyId: string;
  userId: string;
  attivo: boolean;
  puoPrelevare: boolean;
  richiedeConferma: boolean;
  cantiereIniziale?: string;
  apriBozza?: boolean;
  onRegistrato: () => void;
}) {
  const chiaveBozza = chiaveBozzaPrelievo(companyId, userId, cantiereIniziale);
  const [bozza, setBozza] = useState(() => puoPrelevare ? leggiBozzaPrelievo(chiaveBozza) : BOZZA_PRELIEVO_VUOTA);
  const { righe, orderId, note, inVerifica } = bozza;
  const [erroreBozza, setErroreBozza] = useState<string | null>(null);
  const [ripristinata, setRipristinata] = useState(righe.length > 0);
  const [ricerca, setRicerca] = useState("");
  const [soloDisponibili, setSoloDisponibili] = useState(true);
  const inputRicerca = useRef<HTMLInputElement>(null);
  const cerca = useDebounce(ricerca.trim(), 250);
  const [aperto, setAperto] = useState(() => !!apriBozza && righe.length > 0);
  const inInvio = useRef(false);
  const online = useOnlineStatus();
  const inventario = useCampoInventario(companyId, cerca, soloDisponibili, attivo);
  const cantieri = useCampoCantieriPrelievo(companyId, attivo && puoPrelevare && (aperto || !!cantiereIniziale || !!orderId));
  const prelievo = usePrelievoRegistra(companyId);

  useEffect(() => {
    if (!puoPrelevare) return;
    const leggiAggiornamento = (evento: StorageEvent) => {
      if (evento.key !== chiaveBozza || inInvio.current) return;
      const corrente = leggiBozzaPrelievo(chiaveBozza);
      setBozza(corrente);
      setRipristinata(corrente.righe.length > 0);
      if (!corrente.righe.length) setAperto(false);
    };
    window.addEventListener("storage", leggiAggiornamento);
    return () => window.removeEventListener("storage", leggiAggiornamento);
  }, [chiaveBozza, puoPrelevare]);

  const articoli = inventario.data?.pages.flat() ?? [];
  const articoliVisibili = new Map(articoli.map((articolo) => [articolo.id, articolo]));
  const carrello = new Map(righe.map((riga) => [riga.articolo.id, riga]));
  const primaRiga = righe[0];
  const warehouseId = primaRiga?.articolo.warehouse_id ?? null;
  const magazzino = primaRiga?.articolo.magazzino ?? "Senza ubicazione";
  const soloCantiere = cantieri.data?.length === 1 ? cantieri.data[0].id : "";
  const destinazione = orderId || cantiereIniziale || soloCantiere;
  const cantiere = cantieri.isError ? undefined : cantieri.data?.find(item => item.id === destinazione);
  const nomeDestinazione = cantiere ? nomeCantierePrelievo(cantiere) : (!online || inVerifica ? bozza.nomeCantiere || null : null);
  const erroriQuantita = new Map<string, string>();
  for (const { articolo, quantita } of righe) {
    const qta = quantitaPrelievo(quantita);
    const disponibile = articoliVisibili.get(articolo.id)?.disponibile ?? articolo.disponibile;
    if (!(qta > 0)) erroriQuantita.set(articolo.id, "Inserisci una quantità maggiore di zero.");
    else if (!inVerifica && !(qta <= disponibile)) {
      const unita = articolo.unita_misura ? ` ${articolo.unita_misura}` : "";
      erroriQuantita.set(articolo.id, `Disponibili ${formatoQuantitaMagazzino.format(disponibile)}${unita}.`);
    }
  }
  const righeValide = righe.length > 0 && erroriQuantita.size === 0;
  const destinazioneInvio = inVerifica ? orderId : cantiere?.id;
  const puoInviare = online && puoPrelevare && righeValide && !!destinazioneInvio && !prelievo.isPending;

  const aggiornaBozza = (prossima: BozzaPrelievo) => {
    const scelto = cantieri.data?.find(item => item.id === (prossima.orderId || cantiereIniziale));
    const daSalvare = prossima.righe.length ? {
      ...prossima,
      id: prossima.id || crypto.randomUUID(),
      nomeCantiere: scelto ? nomeCantierePrelievo(scelto) : prossima.nomeCantiere,
    } : BOZZA_PRELIEVO_VUOTA;
    const esito = salvaBozzaPrelievo(chiaveBozza, bozza, daSalvare);
    if (esito.stato === "cambiata") {
      setBozza(esito.bozza);
      setErroreBozza("La bozza è cambiata in un’altra scheda. Controlla il prelievo aggiornato.");
      return null;
    }
    if (esito.stato === "errore") {
      setErroreBozza(erroreSalvataggioBozza);
      return null;
    }
    setErroreBozza(null);
    setBozza(daSalvare);
    return daSalvare;
  };

  const rimuovi = (id: string) => aggiornaBozza({ ...bozza, righe: righe.filter((riga) => riga.articolo.id !== id) });
  const aggiorna = (id: string, quantita: string) => aggiornaBozza({
    ...bozza, righe: righe.map((riga) => riga.articolo.id === id ? { ...riga, quantita } : riga),
  });

  const aggiungi = ({ id, name, warehouse_id, magazzino, ubicazione, unita_misura, disponibile }: StockCampo) => {
    if (inVerifica || righe.length >= 100 || carrello.has(id) || (primaRiga && warehouse_id !== warehouseId)) return;
    aggiornaBozza({ ...bozza, orderId: orderId || cantiere?.id || "", righe: [...righe, {
      articolo: { id, name, warehouse_id, magazzino, ubicazione, unita_misura, disponibile },
      quantita: formatoInputQuantita.format(Math.min(1, disponibile)),
    }] });
  };

  const apriRiepilogo = () => {
    prelievo.reset();
    setRipristinata(false);
    setAperto(true);
  };

  const registra = async () => {
    if (inInvio.current || !puoInviare || !destinazioneInvio) return;
    const materiale = righe.map((riga) => ({ stock_item_id: riga.articolo.id, quantita: quantitaPrelievo(riga.quantita) }));
    // La bozza e il suo identificativo devono sopravvivere alla chiusura prima che parta la scrittura remota.
    const tentativo = aggiornaBozza({ ...bozza, orderId: destinazioneInvio, inVerifica: true });
    if (!tentativo) return;
    const chiudiTentativo = (prossima: BozzaPrelievo) => {
      const esito = salvaBozzaPrelievo(chiaveBozza, tentativo, prossima);
      if (esito.stato === "errore") {
        setErroreBozza(erroreSalvataggioBozza);
        return;
      }
      setBozza(esito.stato === "cambiata" ? esito.bozza : prossima);
    };
    inInvio.current = true;
    try {
      const esito = await prelievo.mutateAsync({
        orderId: destinazioneInvio, warehouseId, righe: materiale, note: note.trim(), requestId: tentativo.id,
      });
      const messaggio = esito.stato === "consegnato"
        ? "Prelievo registrato. Giacenze aggiornate."
        : esito.stato === "rifiutato" ? "Questo prelievo è stato rifiutato." : "Richiesta inviata al magazzino.";
      if (esito.stato === "rifiutato") toast.info(messaggio);
      else toast.success(messaggio);
      chiudiTentativo(BOZZA_PRELIEVO_VUOTA);
      setAperto(false);
      onRegistrato();
    } catch (error) {
      if (error instanceof PrelievoNonRegistrato) {
        chiudiTentativo({ ...tentativo, inVerifica: false });
        void inventario.refetch();
        void cantieri.refetch();
      }
    } finally {
      inInvio.current = false;
    }
  };

  return (
    <div className={cn("space-y-2 sm:space-y-3", puoPrelevare && righe.length > 0 && "pb-10 md:pb-14")}>
      {!aperto && erroreBozza && <p role="alert" className="text-sm text-destructive">{erroreBozza}</p>}
      {puoPrelevare && (cantiereIniziale || nomeDestinazione) && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 sm:px-3 sm:py-2">
          <HardHat aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-snug">
            <span className="text-xs text-muted-foreground">Cantiere</span>
            <span className="min-w-0 break-words text-sm font-semibold">
              {nomeDestinazione ?? (cantieri.isLoading ? "Verifico il cantiere…" : "Scegli il cantiere nel riepilogo")}
            </span>
          </div>
        </div>
      )}
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={inputRicerca} type="search" aria-label="Cerca nell’inventario" value={ricerca}
            title="Cerca per materiale, codice o ubicazione" placeholder="Cerca materiale"
            onChange={(e) => setRicerca(e.target.value)}
            className={cn("h-11 rounded-lg pl-8 text-base [&::-webkit-search-cancel-button]:hidden", ricerca && "pr-11")} />
          {ricerca && (
            <Button type="button" variant="ghost" size="icon" aria-label="Cancella la ricerca"
              className="absolute right-0 top-0 h-11 w-11" onClick={() => {
                setRicerca("");
                inputRicerca.current?.focus();
              }}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
        <UniformSelect aria-label="Disponibilità dei materiali" value={soloDisponibili ? "disponibili" : "tutti"}
          onChange={(e) => setSoloDisponibili(e.target.value === "disponibili")}
          className="h-11 w-[7.25rem] shrink-0 rounded-lg px-2.5 text-sm sm:w-32">
          <option value="disponibili">Disponibili</option>
          <option value="tutti">Tutti</option>
        </UniformSelect>
      </div>

      {inventario.isLoading ? (
        <div role="status" className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Carico l’inventario</span></div>
      ) : inventario.isError && !inventario.isFetchNextPageError ? (
        <div role="alert" className="space-y-2 rounded-xl border p-4 text-sm">
          <p>Non riesco a caricare l’inventario.</p>
          <Button variant="outline" size="sm" onClick={() => void inventario.refetch()}>Riprova</Button>
        </div>
      ) : articoli.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Warehouse aria-hidden="true" className="mx-auto mb-2 h-7 w-7" />
          <p className="text-sm">{soloDisponibili ? "Nessun materiale disponibile." : "Nessun materiale trovato."}</p>
          {soloDisponibili && (
            <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => setSoloDisponibili(false)}>
              Mostra tutti i materiali
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2 sm:space-y-2.5">
          {articoli.map((articolo) => {
            const riga = carrello.get(articolo.id);
            const errore = erroriQuantita.get(articolo.id);
            const stessaUbicazione = !primaRiga || articolo.warehouse_id === warehouseId;
            const puoAggiungere = puoPrelevare && !inVerifica && articolo.disponibile > 0 && stessaUbicazione;
            return (
              <li key={articolo.id} className={cn("rounded-xl border bg-card px-2.5 py-2 sm:p-3.5", riga && "border-primary")}>
                <div className="flex justify-between gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-snug sm:text-base">{articolo.name}</p>
                    {articolo.internal_code && <p className="mt-0.5 break-words text-xs leading-tight text-muted-foreground">{articolo.internal_code}</p>}
                    <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-muted-foreground sm:text-sm">
                      <MapPin aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">
                        {articolo.magazzino ?? "Magazzino non indicato"}
                        {articolo.ubicazione && <span className="block font-medium text-foreground">{articolo.ubicazione}</span>}
                      </span>
                    </p>
                  </div>
                  <div className="flex max-w-[44%] shrink-0 flex-col items-end gap-1">
                    <div className="max-w-full text-right">
                      <p className="break-words font-bold leading-tight tabular-nums">{formatoQuantitaMagazzino.format(articolo.disponibile)} {articolo.unita_misura}</p>
                      <p className="text-xs text-muted-foreground">{articolo.disponibile > 0 ? "Disponibili" : "Esaurito"}</p>
                    </div>
                    {puoAggiungere && !riga && (
                      <Button type="button" variant="outline" className="min-h-11 gap-1 px-2.5" disabled={righe.length >= 100}
                        onClick={() => aggiungi(articolo)} aria-label={`Aggiungi ${articolo.name} al prelievo`}>
                        <Plus aria-hidden="true" className="h-4 w-4" /> Aggiungi
                      </Button>
                    )}
                  </div>
                </div>
                {puoPrelevare && riga && (
                  <div className="mt-2 rounded-xl bg-primary/5 px-2.5 py-1.5">
                    <Label htmlFor={`qta-${articolo.id}`} className="mb-1 block text-xs">Da prelevare</Label>
                    <QuantitaMateriale id={`qta-${articolo.id}`} articolo={articolo} valore={riga.quantita}
                      disponibile={articolo.disponibile} errore={errore} bloccata={inVerifica}
                      onChange={(valore) => aggiorna(articolo.id, valore)} onRemove={() => rimuovi(articolo.id)} />
                  </div>
                )}
                {puoPrelevare && !stessaUbicazione && articolo.disponibile > 0 &&
                  <p className="mt-2 text-xs text-muted-foreground">Per questo articolo apri un prelievo da {articolo.magazzino ?? "un’altra ubicazione"}.</p>}
              </li>
            );
          })}
        </ul>
      )}
      {inventario.hasNextPage && (
        <Button type="button" variant="outline" className="min-h-11 w-full" disabled={inventario.isFetchingNextPage}
          onClick={() => void inventario.fetchNextPage()}>
          {inventario.isFetchingNextPage ? "Carico…" : inventario.isFetchNextPageError ? "Riprova a caricare" : "Altri articoli"}
        </Button>
      )}

      {attivo && puoPrelevare && righe.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl px-3 sm:px-4 md:bottom-4">
          <Button type="button" className="h-12 w-full gap-2 rounded-xl text-sm font-semibold shadow-lg" onClick={apriRiepilogo}>
            <ShoppingCart className="h-4 w-4 shrink-0" />
            {inVerifica ? "Verifica prelievo" : ripristinata ? "Riprendi prelievo" : "Preleva"} · {righe.length} {righe.length === 1 ? "materiale" : "materiali"}
          </Button>
        </div>
      )}

      <Sheet open={attivo && puoPrelevare && aperto} onOpenChange={(value) => {
        if (!inInvio.current) setAperto(value);
      }}>
        <SheetContent side="bottom" className="mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-t-2xl px-0 pb-0 pt-3.5 sm:max-h-[88dvh] sm:pt-4">
          <SheetHeader className="shrink-0 space-y-0.5 px-3 pb-2 pr-12 text-left sm:px-4">
            <SheetTitle className="text-base sm:text-lg">Materiale per il cantiere</SheetTitle>
            <SheetDescription className={cn("text-xs leading-snug sm:text-sm", !inVerifica && !richiedeConferma && "sr-only")}>
              {inVerifica && !prelievo.isPending
                ? "Verifica l’invio prima di modificare il prelievo."
                : richiedeConferma ? "Il magazzino conferma la richiesta prima di scalare le giacenze." : "La registrazione aggiorna subito le giacenze."}
            </SheetDescription>
          </SheetHeader>
          <div className="shrink-0 space-y-1 border-b px-3 pb-2 sm:px-4">
            <Label htmlFor="prelievo-cantiere" className="text-xs sm:text-sm">Cantiere di destinazione</Label>
            {cantieri.isError ? (
              <div role="alert" className="flex items-center justify-between gap-2 text-sm">
                <span>Non riesco a caricare i cantieri.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void cantieri.refetch()}>Riprova</Button>
              </div>
            ) : (
              <>
                <UniformSelect id="prelievo-cantiere" value={cantiere?.id ?? ""} required
                  disabled={inVerifica || cantieri.isLoading || !cantieri.data?.length}
                  onChange={(event) => aggiornaBozza({ ...bozza, orderId: event.target.value })}
                  className="min-h-11 w-full rounded-lg border bg-background px-3 text-base">
                  <option value="" disabled>
                    {(!cantiere && nomeDestinazione) || (cantieri.isLoading ? "Carico i cantieri…" : inVerifica ? "Cantiere dell’invio precedente" : "Scegli un cantiere")}
                  </option>
                  {cantieri.data?.map((item) => <option key={item.id} value={item.id}>{nomeCantierePrelievo(item)}</option>)}
                </UniformSelect>
                {cantieri.data?.length === 0 && <p className="text-sm text-muted-foreground">Nessun cantiere aperto assegnato. Chiedi un’assegnazione all’ufficio.</p>}
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2 sm:px-4 sm:py-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium sm:text-sm">
                <Warehouse aria-hidden="true" className="h-4 w-4 shrink-0" /> <span className="min-w-0 break-words">{magazzino}</span>
              </div>
              {righe.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aggiungi un materiale dall’inventario.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {righe.map(({ articolo, quantita }) => {
                    const corrente = articoliVisibili.get(articolo.id) ?? articolo;
                    return (
                      <li key={articolo.id} className="space-y-1.5 px-2 py-1.5 sm:px-3 sm:py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 break-words">
                            <Label htmlFor={`riepilogo-qta-${articolo.id}`}>{articolo.name}</Label>
                            {corrente.ubicazione && <p className="mt-0.5 text-xs text-muted-foreground">{corrente.ubicazione}</p>}
                          </div>
                          {!inVerifica && (
                            <p className="max-w-[45%] shrink-0 break-words text-right text-xs text-muted-foreground">
                              {formatoQuantitaMagazzino.format(corrente.disponibile)} {articolo.unita_misura} disponibili
                            </p>
                          )}
                        </div>
                        <QuantitaMateriale id={`riepilogo-qta-${articolo.id}`} articolo={articolo} valore={quantita}
                          disponibile={corrente.disponibile} errore={erroriQuantita.get(articolo.id)} bloccata={inVerifica}
                          inRiepilogo onChange={(valore) => aggiorna(articolo.id, valore)} onRemove={() => rimuovi(articolo.id)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {righe.length > 0 && (!inVerifica || note.trim()) && (
              <Collapsible defaultOpen={!!note.trim()}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="group min-h-11 w-full justify-start gap-2 px-2">
                    <MessageSquare aria-hidden="true" className="h-4 w-4" />
                    {note.trim() ? "Note del prelievo" : "Aggiungi nota"}
                    <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pb-1 pt-1">
                  <Label htmlFor="prelievo-note" className="sr-only">Note facoltative</Label>
                  <Textarea id="prelievo-note" rows={2} value={note} disabled={inVerifica} className="min-h-16 text-base sm:text-sm"
                    onChange={(e) => aggiornaBozza({ ...bozza, note: e.target.value })} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
          <div className="shrink-0 space-y-1.5 border-t bg-background px-3 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] sm:px-4">
            {!online && <p role="status" className="text-sm text-muted-foreground">Sei offline. Puoi riprendere il prelievo quando torna la connessione.</p>}
            {erroreBozza && <p role="alert" className="text-sm text-destructive">{erroreBozza}</p>}
            {prelievo.isError && (
              <p role="alert" className="max-h-20 overflow-y-auto break-words text-sm text-destructive">
                {inVerifica ? "L’app è in attesa dell’esito del prelievo." : prelievo.error.message}
              </p>
            )}
            {righe.length ? (
              <div className="flex gap-2">
                {!inVerifica && righe.length < 100 && (
                  <Button type="button" variant="outline" aria-label="Aggiungi altri materiali" className="h-12 shrink-0 gap-1.5 px-2.5 sm:px-3"
                    onClick={() => setAperto(false)}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    <span className="sm:hidden">Aggiungi</span><span className="hidden sm:inline">Aggiungi altri materiali</span>
                  </Button>
                )}
                <Button className="h-12 min-w-0 flex-1 gap-1.5 whitespace-normal px-2.5 leading-tight sm:px-4 sm:text-base"
                  onClick={() => void registra()} disabled={!puoInviare}>
                  {prelievo.isPending ? <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin" /> : <Check aria-hidden="true" className="h-5 w-5 shrink-0" />}
                  {prelievo.isPending ? "Invio in corso…" : inVerifica ? "Verifica invio" : richiedeConferma ? "Invia richiesta" : "Registra prelievo"}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setAperto(false)}>Torna all’inventario</Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function QuantitaMateriale({ id, articolo, valore, disponibile, errore, bloccata, inRiepilogo, onChange, onRemove }: {
  id: string;
  articolo: Pick<StockCampo, "name" | "unita_misura">;
  valore: string;
  disponibile: number;
  errore?: string;
  bloccata: boolean;
  inRiepilogo?: boolean;
  onChange: (valore: string) => void;
  onRemove: () => void;
}) {
  const quantita = quantitaPrelievo(valore);
  const meno = Number((quantita - 1).toFixed(8));
  const piu = Math.min(disponibile, Number((quantita + 1).toFixed(8)));

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
          disabled={bloccata || !(meno > 0)} aria-label={`Diminuisci quantità di ${articolo.name}`}
          onClick={() => onChange(formatoInputQuantita.format(meno))}>
          <Minus aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Input id={id} inputMode="decimal"
          aria-label={`${inRiepilogo ? "Verifica quantità" : "Quantità"} di ${articolo.name}`} aria-invalid={!!errore}
          aria-describedby={errore ? `${id}-errore` : undefined}
          value={valore} disabled={bloccata} onChange={(e) => onChange(e.target.value)}
          className="min-h-11 min-w-12 max-w-24 flex-1 px-1 text-center text-base tabular-nums" />
        {articolo.unita_misura && <span className="min-w-0 max-w-16 break-words text-sm text-muted-foreground">{articolo.unita_misura}</span>}
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
          disabled={bloccata || !(piu > quantita)} aria-label={`Aumenta quantità di ${articolo.name}`}
          onClick={() => onChange(formatoInputQuantita.format(piu))}>
          <Plus aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0" disabled={bloccata}
          aria-label={inRiepilogo ? `Togli ${articolo.name} dal riepilogo` : `Rimuovi ${articolo.name}`} onClick={onRemove}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {errore && <p id={`${id}-errore`} className="mt-1 text-xs font-medium text-destructive">{errore}</p>}
    </div>
  );
}
