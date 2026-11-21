import { useEffect, useRef, useState } from "react";
import { Check, HardHat, Loader2, Minus, Plus, Search, ShoppingCart, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  const inputRicerca = useRef<HTMLInputElement>(null);
  const cerca = useDebounce(ricerca.trim(), 250);
  const [aperto, setAperto] = useState(() => !!apriBozza && righe.length > 0);
  const inInvio = useRef(false);
  const online = useOnlineStatus();
  const inventario = useCampoInventario(companyId, cerca, attivo);
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

  const aggiungi = ({ id, name, warehouse_id, magazzino, unita_misura, disponibile }: StockCampo) => {
    if (inVerifica || righe.length >= 100 || carrello.has(id) || (primaRiga && warehouse_id !== warehouseId)) return;
    aggiornaBozza({ ...bozza, orderId: orderId || cantiere?.id || "", righe: [...righe, {
      articolo: { id, name, warehouse_id, magazzino, unita_misura, disponibile },
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
    <div className={cn("space-y-3", puoPrelevare && righe.length > 0 && "pb-24")}>
      {!aperto && erroreBozza && <p role="alert" className="text-sm text-destructive">{erroreBozza}</p>}
      {puoPrelevare && (cantiereIniziale || nomeDestinazione) && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <HardHat aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Destinazione del prelievo</p>
            <p className="break-words text-sm font-semibold">
              {nomeDestinazione ?? (cantieri.isLoading ? "Verifico il cantiere…" : "Scegli il cantiere nel riepilogo")}
            </p>
          </div>
        </div>
      )}
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRicerca}
          type="search"
          aria-label="Cerca nell’inventario"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca materiale o codice"
          className="min-h-12 rounded-xl pl-9 pr-12 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {ricerca && (
          <Button type="button" variant="ghost" size="icon" aria-label="Cancella la ricerca"
            className="absolute right-0.5 top-0.5 h-11 w-11" onClick={() => {
              setRicerca("");
              inputRicerca.current?.focus();
            }}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
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
          <p className="text-sm">{cerca ? "Nessun materiale trovato." : "Nessun articolo disponibile nei magazzini visibili."}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {articoli.map((articolo) => {
            const riga = carrello.get(articolo.id);
            const errore = erroriQuantita.get(articolo.id);
            const stessaUbicazione = !primaRiga || articolo.warehouse_id === warehouseId;
            const puoAggiungere = puoPrelevare && !inVerifica && articolo.disponibile > 0 && stessaUbicazione;
            const quantita = quantitaPrelievo(riga?.quantita ?? "");
            const meno = Number((quantita - 1).toFixed(8));
            const piu = Math.min(articolo.disponibile, Number((quantita + 1).toFixed(8)));
            return (
              <li key={articolo.id} className={cn("rounded-xl border bg-card p-3.5", riga && "border-primary")}>
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{articolo.name}</p>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {articolo.internal_code && <span>{articolo.internal_code}</span>}
                      <span>{articolo.magazzino ?? "Senza ubicazione"}</span>
                    </p>
                  </div>
                  <div className="max-w-[42%] shrink-0 text-right">
                    <p className="break-words font-bold tabular-nums">{formatoQuantitaMagazzino.format(articolo.disponibile)} {articolo.unita_misura}</p>
                    <p className="text-xs text-muted-foreground">Disponibili</p>
                  </div>
                </div>
                {puoAggiungere && !riga && (
                  <Button type="button" variant="outline" className="mt-2 min-h-11 w-full" disabled={righe.length >= 100}
                    onClick={() => aggiungi(articolo)} aria-label={`Aggiungi ${articolo.name} al prelievo`}>
                    Aggiungi al prelievo
                  </Button>
                )}
                {puoPrelevare && riga && (
                  <div className="mt-2 rounded-xl bg-primary/5 px-2.5 py-1.5">
                    <Label htmlFor={`qta-${articolo.id}`} className="mb-1 block text-xs">Da prelevare</Label>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                        disabled={inVerifica || !(meno > 0)} aria-label={`Diminuisci quantità di ${articolo.name}`}
                        onClick={() => aggiorna(articolo.id, formatoInputQuantita.format(meno))}>
                        <Minus aria-hidden="true" className="h-4 w-4" />
                      </Button>
                      <Input id={`qta-${articolo.id}`} inputMode="decimal"
                        aria-label={`Quantità di ${articolo.name}`} aria-invalid={!!errore}
                        aria-describedby={errore ? `errore-qta-${articolo.id}` : undefined}
                        value={riga.quantita} disabled={inVerifica} onChange={(e) => aggiorna(articolo.id, e.target.value)}
                        className="min-h-11 min-w-12 max-w-24 flex-1 px-1 text-center text-base tabular-nums" />
                      {articolo.unita_misura && <span className="min-w-0 max-w-16 break-words text-sm text-muted-foreground">{articolo.unita_misura}</span>}
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                        disabled={inVerifica || !(piu > quantita)} aria-label={`Aumenta quantità di ${articolo.name}`}
                        onClick={() => aggiorna(articolo.id, formatoInputQuantita.format(piu))}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0" disabled={inVerifica}
                        aria-label={`Rimuovi ${articolo.name}`} onClick={() => rimuovi(articolo.id)}>
                        <X aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                    {errore && <p id={`errore-qta-${articolo.id}`} className="mt-1 text-xs font-medium text-destructive">{errore}</p>}
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
        <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl px-4 md:bottom-4">
          <Button type="button" className="h-12 w-full gap-2 rounded-xl text-sm font-semibold shadow-lg" onClick={apriRiepilogo}>
            <ShoppingCart className="h-4 w-4 shrink-0" />
            {inVerifica ? "Verifica prelievo" : ripristinata ? "Riprendi prelievo" : "Rivedi prelievo"} · {righe.length} {righe.length === 1 ? "articolo" : "articoli"}
          </Button>
        </div>
      )}

      <Sheet open={attivo && puoPrelevare && aperto} onOpenChange={(value) => {
        if (!inInvio.current) setAperto(value);
      }}>
        <SheetContent side="bottom" className="mx-auto flex max-h-[88dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-t-2xl px-0 pb-0 pt-4">
          <SheetHeader className="shrink-0 px-4 pb-3 pr-12 text-left">
            <SheetTitle>Materiale per il cantiere</SheetTitle>
            <SheetDescription>
              {inVerifica && !prelievo.isPending
                ? "Verifica l’invio prima di modificare il prelievo."
                : richiedeConferma ? "Il magazzino conferma la richiesta prima di scalare le giacenze." : "La registrazione aggiorna subito le giacenze."}
            </SheetDescription>
          </SheetHeader>
          <div className="shrink-0 space-y-1.5 border-b px-4 pb-3">
            <Label htmlFor="prelievo-cantiere">Cantiere di destinazione</Label>
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
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Warehouse aria-hidden="true" className="h-4 w-4" /> {magazzino}
              </div>
              {righe.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aggiungi un materiale dall’inventario.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {righe.map(({ articolo, quantita }) => {
                    const errore = erroriQuantita.get(articolo.id);
                    return (
                      <li key={articolo.id} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 break-words text-sm font-medium">{articolo.name}</span>
                          <Input aria-label={`Verifica quantità di ${articolo.name}`} inputMode="decimal"
                            aria-invalid={!!errore} aria-describedby={errore ? `riepilogo-errore-${articolo.id}` : undefined}
                            value={quantita} disabled={inVerifica} onChange={(e) => aggiorna(articolo.id, e.target.value)}
                            className="min-h-11 w-16 text-right text-base tabular-nums" />
                          {articolo.unita_misura && <span className="max-w-16 break-words text-sm text-muted-foreground">{articolo.unita_misura}</span>}
                          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                            disabled={inVerifica}
                            aria-label={`Togli ${articolo.name} dal riepilogo`} onClick={() => rimuovi(articolo.id)}>
                            <X aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        </div>
                        {errore && <p id={`riepilogo-errore-${articolo.id}`} className="mt-1 text-xs font-medium text-destructive">{errore}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prelievo-note">Note facoltative</Label>
              <Textarea id="prelievo-note" rows={2} value={note} disabled={inVerifica}
                onChange={(e) => aggiornaBozza({ ...bozza, note: e.target.value })} />
            </div>

          </div>
          <div className="shrink-0 space-y-2 border-t bg-background px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
            {!online && <p role="status" className="text-sm text-muted-foreground">Sei offline. Puoi riprendere il prelievo quando torna la connessione.</p>}
            {erroreBozza && <p role="alert" className="text-sm text-destructive">{erroreBozza}</p>}
            {prelievo.isError && (
              <p role="alert" className="max-h-20 overflow-y-auto break-words text-sm text-destructive">
                {inVerifica ? "L’app è in attesa dell’esito del prelievo." : prelievo.error.message}
              </p>
            )}
            {righe.length ? (
              <Button className="h-12 w-full gap-2 text-base" onClick={() => void registra()}
                disabled={!puoInviare}>
                {prelievo.isPending ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <Check aria-hidden="true" className="h-5 w-5" />}
                {prelievo.isPending ? "Invio in corso…" : inVerifica ? "Verifica invio" : richiedeConferma ? "Invia richiesta" : "Registra prelievo"}
              </Button>
            ) : (
              <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setAperto(false)}>Torna all’inventario</Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
