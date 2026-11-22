import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, HardHat, Loader2, MapPin, MessageSquare, Minus, Plus, Search, ShoppingCart, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { CampoListaRitiro } from "@/components/campo/CampoListaRitiro";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import {
  PrelievoNonRegistrato, useCampoCantieriPrelievo, useCampoInventario, usePrelievoRegistra,
  type CantierePrelievo, type StockCampo,
} from "@/hooks/campo/useCampoPrelievo";
import { useDebounce } from "@/hooks/useDebounce";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  BOZZA_PRELIEVO_VUOTA, bozzaPerCantiere, bozzeCantieriPrelievo, quantitaNelleBozze, salvaBozzaPrelievo,
  type BozzaPrelievo, type PrelievoLocale,
} from "@/lib/campo/bozzaPrelievo";
import { formatoQuantitaMagazzino, nomeCantierePrelievo, quantitaPrelievo } from "@/lib/campo/magazzino";
import { cn } from "@/lib/utils";

const formatoInputQuantita = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 20, useGrouping: false });
const erroreSalvataggioBozza = "Non riesco a salvare il prelievo su questo dispositivo. Riprova.";
type ArticoloBozza = BozzaPrelievo["righe"][number]["articolo"];

function nomePrelievo(prelievo: PrelievoLocale, cantieri: Map<string, CantierePrelievo>) {
  const cantiere = cantieri.get(prelievo.cantiere);
  return cantiere ? nomeCantierePrelievo(cantiere) : prelievo.bozza.nomeCantiere || "Scegli cantiere";
}

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
  const leggiBozze = useCallback(() => puoPrelevare ? bozzeCantieriPrelievo(companyId, userId) : [], [companyId, userId, puoPrelevare]);
  const [bozze, setBozze] = useState(leggiBozze);
  const [cantiereScelto, setCantiereScelto] = useState(cantiereIniziale);
  const [erroreBozza, setErroreBozza] = useState<string | null>(null);
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [soloDisponibili, setSoloDisponibili] = useState(true);
  const inputRicerca = useRef<HTMLInputElement>(null);
  const cerca = useDebounce(ricerca.trim(), 250);
  const [aperto, setAperto] = useState(() => !!apriBozza && bozze.length > 0);
  const [vistaRitiro, setVistaRitiro] = useState(false);
  const areaRiepilogo = useRef<HTMLDivElement>(null);
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const inInvio = useRef(false);
  const online = useOnlineStatus();
  const inventario = useCampoInventario(companyId, cerca, soloDisponibili, attivo);
  const cantieri = useCampoCantieriPrelievo(companyId, attivo && puoPrelevare);
  const prelievo = usePrelievoRegistra(companyId);

  useEffect(() => {
    if (!puoPrelevare) return;
    const leggiAggiornamento = () => {
      if (!inInvio.current) setBozze(leggiBozze());
    };
    window.addEventListener("storage", leggiAggiornamento);
    return () => window.removeEventListener("storage", leggiAggiornamento);
  }, [leggiBozze, puoPrelevare]);

  const articoli = inventario.data?.pages.flat() ?? [];
  const articoliVisibili = new Map(articoli.map((articolo) => [articolo.id, articolo]));
  const assegnabili = cantieri.isError ? [] : cantieri.data ?? [];
  const cantieriPerId = new Map(assegnabili.map((cantiere) => [cantiere.id, cantiere]));
  const cantiereAttivo = cantiereScelto ?? (bozze.length === 1 ? bozze[0].cantiere : assegnabili.length === 1 ? assegnabili[0].id : "");
  const attiva = bozzaPerCantiere(bozze, companyId, userId, cantiereAttivo);
  const { bozza } = attiva;
  const { righe, inVerifica } = bozza;
  const carrello = new Map(righe.map((riga) => [riga.articolo.id, riga]));
  const cantiere = cantieriPerId.get(cantiereAttivo);
  const totali = quantitaNelleBozze(bozze);
  const daVerificare = bozze.filter((locale) => locale.bozza.inVerifica);

  const verificaQuantita = (articolo: ArticoloBozza, valore?: string, giaInviata = false) => {
    const quantita = quantitaPrelievo(valore ?? "");
    const altre = Math.max(0, (totali.get(articolo.id) ?? 0) - (!giaInviata && quantita > 0 ? quantita : 0));
    const scheda = articoliVisibili.get(articolo.id);
    const corrente = scheda?.disponibile ?? articolo.disponibile;
    const disponibile = altre > 0 ? Number(Math.max(0, corrente - altre).toPrecision(15)) : corrente;
    const unita = articolo.unita_misura ? ` ${articolo.unita_misura}` : "";
    let errore: string | undefined;
    if (valore !== undefined) {
      if (!(quantita > 0)) errore = "Inserisci una quantità maggiore di zero.";
      else if (!giaInviata && scheda && scheda.warehouse_id !== articolo.warehouse_id) {
        errore = "Articolo spostato. Rimuovilo e aggiungilo di nuovo.";
      } else if (!giaInviata && quantita > disponibile) {
        errore = `Disponibili ${formatoQuantitaMagazzino.format(disponibile)}${unita}${altre > 0 ? " con le altre bozze" : ""}.`;
      }
    }
    return { altre, disponibile, errore };
  };
  const quantitaValide = bozze.filter((locale) =>
    locale.bozza.righe.every((riga) => !verificaQuantita(riga.articolo, riga.quantita, locale.bozza.inVerifica).errore));
  const pronti = new Set(quantitaValide.filter((locale) => locale.bozza.inVerifica || cantieriPerId.has(locale.cantiere))
    .map((locale) => locale.chiave));
  const daInviare = (daVerificare.length ? daVerificare : bozze).filter((locale) => pronti.has(locale.chiave));
  const bozzeRitiro = daVerificare.length ? [] : !online && !cantieri.data
    ? quantitaValide.filter(({ bozza }) => !!bozza.orderId && !!bozza.nomeCantiere)
    : daInviare;
  const haRitiro = bozzeRitiro.reduce((totale, { bozza }) => totale + bozza.righe.length, 0) > 1;
  const mostraRitiro = haRitiro && vistaRitiro;
  const puoInviare = online && puoPrelevare && !inSalvataggio && daInviare.length > 0;
  const articoliInBozza = bozze[0]?.bozza.righe.length ?? 0;
  const numeroInvii = daInviare.length || bozze.length;
  const invia = daVerificare.length ? "Verifica invio" : richiedeConferma
    ? numeroInvii === 1 ? "Invia richiesta" : `Invia ${numeroInvii} richieste`
    : numeroInvii === 1 ? "Registra prelievo" : `Registra ${numeroInvii} prelievi`;

  const scriviBozza = (locale: PrelievoLocale, prossima: BozzaPrelievo) => {
    const scelto = cantieriPerId.get(prossima.orderId);
    const daSalvare = prossima.righe.length ? {
      ...prossima,
      id: prossima.id || crypto.randomUUID(),
      nomeCantiere: scelto ? nomeCantierePrelievo(scelto) : prossima.nomeCantiere,
    } : BOZZA_PRELIEVO_VUOTA;
    const esito = salvaBozzaPrelievo(locale.chiave, locale.bozza, daSalvare);
    if (esito.stato === "cambiata") {
      setBozze(leggiBozze());
      setErroreBozza("La bozza è cambiata in un’altra scheda. Controlla il prelievo aggiornato.");
      return null;
    }
    if (esito.stato === "errore") {
      setErroreBozza(erroreSalvataggioBozza);
      return null;
    }
    setErroreBozza(null);
    setBozze(leggiBozze());
    return daSalvare;
  };

  const aggiornaBozza = (locale: PrelievoLocale, prossima: BozzaPrelievo) => {
    if (inInvio.current || locale.bozza.inVerifica) return;
    if (scriviBozza(locale, prossima)) setErroreInvio(null);
  };

  const rimuovi = (locale: PrelievoLocale, id: string) => aggiornaBozza(locale, {
    ...locale.bozza, righe: locale.bozza.righe.filter((riga) => riga.articolo.id !== id),
  });
  const aggiorna = (locale: PrelievoLocale, id: string, quantita: string) => aggiornaBozza(locale, {
    ...locale.bozza, righe: locale.bozza.righe.map((riga) => riga.articolo.id === id ? { ...riga, quantita } : riga),
  });

  const aggiungi = (materiale: StockCampo) => {
    const { id, name, warehouse_id, magazzino, ubicazione, internal_code, unita_misura, disponibile } = materiale;
    const limite = verificaQuantita(materiale).disponibile;
    if (!cantiere || inVerifica || righe.length >= 100 || carrello.has(id) || limite <= 0) return;
    if (righe.length && warehouse_id !== righe[0].articolo.warehouse_id) return;
    setCantiereScelto(cantiere.id);
    aggiornaBozza(attiva, { ...bozza, orderId: cantiere.id, righe: [...righe, {
      articolo: { id, name, warehouse_id, magazzino, ubicazione, internal_code, unita_misura, disponibile },
      quantita: formatoInputQuantita.format(Math.min(1, limite)),
    }] });
  };

  const registra = async () => {
    if (inInvio.current || !puoInviare) return;
    inInvio.current = true;
    setInSalvataggio(true);
    setErroreInvio(null);
    const esiti = { consegnato: 0, richiesto: 0, rifiutato: 0 };
    try {
      for (const locale of daInviare) {
        // Prima si fissa la bozza sul dispositivo. Un ricontrollo ripete lo stesso identificativo.
        const tentativo = scriviBozza(locale, { ...locale.bozza, orderId: locale.cantiere, inVerifica: true });
        if (!tentativo) break;
        const salvata = { ...locale, bozza: tentativo };
        try {
          const esito = await prelievo.mutateAsync({
            orderId: tentativo.orderId, warehouseId: tentativo.righe[0].articolo.warehouse_id,
            righe: tentativo.righe.map((riga) => ({ stock_item_id: riga.articolo.id, quantita: quantitaPrelievo(riga.quantita) })),
            note: tentativo.note.trim(), requestId: tentativo.id,
          });
          esiti[esito.stato]++;
        } catch (error) {
          const nome = nomePrelievo(locale, cantieriPerId);
          if (error instanceof PrelievoNonRegistrato) {
            scriviBozza(salvata, { ...tentativo, inVerifica: false });
            setErroreInvio(`${nome} · ${error.message}`);
            void inventario.refetch();
            void cantieri.refetch();
          } else {
            setErroreInvio(`Verifica l’invio per ${nome}. Gli altri prelievi restano salvati.`);
          }
          break;
        }
        if (!scriviBozza(salvata, BOZZA_PRELIEVO_VUOTA)) break;
      }
      if (esiti.consegnato) toast.success(esiti.consegnato === 1 ? "Prelievo registrato" : `${esiti.consegnato} prelievi registrati`);
      if (esiti.richiesto) toast.success(esiti.richiesto === 1 ? "Richiesta inviata" : `${esiti.richiesto} richieste inviate`);
      if (esiti.rifiutato) toast.info(esiti.rifiutato === 1 ? "Prelievo rifiutato" : `${esiti.rifiutato} prelievi rifiutati`);
      const rimaste = leggiBozze();
      setBozze(rimaste);
      if (!rimaste.length && (esiti.consegnato || esiti.richiesto || esiti.rifiutato)) {
        setAperto(false);
        setVistaRitiro(false);
        onRegistrato();
      }
    } finally {
      inInvio.current = false;
      setInSalvataggio(false);
    }
  };

  return (
    <div className={cn("space-y-2 sm:space-y-3", puoPrelevare && bozze.length > 0 && "pb-12 md:pb-14")}>
      {!aperto && erroreBozza && <p role="alert" className="text-sm text-destructive">{erroreBozza}</p>}
      {puoPrelevare && (cantieri.isError ? (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border px-2 text-sm">
          <span>Cantieri non disponibili</span>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => void cantieri.refetch()}>Riprova</Button>
        </div>
      ) : (
        <div className="relative">
          <HardHat aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-primary" />
          <UniformSelect aria-label="Cantiere attivo" value={cantiere?.id ?? ""}
            disabled={inSalvataggio || !assegnabili.length}
            onChange={(event) => setCantiereScelto(event.target.value)}
            className="h-auto !min-h-11 w-full gap-2 rounded-lg bg-primary/5 py-1 pl-8 pr-2 text-left font-semibold leading-tight [&>span]:line-clamp-2 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0">
            <option value="" disabled>
              {bozza.nomeCantiere && !online ? bozza.nomeCantiere : cantieri.isLoading ? "Carico i cantieri…"
                : assegnabili.length ? "Scegli cantiere" : "Nessun cantiere assegnato"}
            </option>
            {assegnabili.map((item) => <option key={item.id} value={item.id}>{nomeCantierePrelievo(item)}</option>)}
          </UniformSelect>
        </div>
      ))}
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
        <div className="rounded-xl border border-dashed p-3 text-center text-muted-foreground">
          <p className="text-sm">{soloDisponibili ? "Nessun materiale disponibile." : "Nessun materiale trovato."}</p>
          {soloDisponibili && (
            <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => setSoloDisponibili(false)}>
              Mostra tutti
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5 sm:space-y-2">
          {articoli.map((articolo) => {
            const riga = carrello.get(articolo.id);
            const { altre, disponibile, errore } = verificaQuantita(riga?.articolo ?? articolo, riga?.quantita, inVerifica);
            const residuoPerCantiere = puoPrelevare && !!cantiere && !inVerifica && altre > 0;
            const stessoMagazzino = !righe.length || articolo.warehouse_id === righe[0].articolo.warehouse_id;
            const puoAggiungere = puoPrelevare && !!cantiere && !inVerifica && articolo.disponibile > 0 && stessoMagazzino;
            return (
              <li key={articolo.id} className={cn("rounded-xl border bg-card px-2.5 py-2 sm:p-3.5", riga && "border-primary")}>
                <div className="flex justify-between gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-snug sm:text-base">{articolo.name}</p>
                    {articolo.internal_code && <p className="mt-0.5 break-words text-xs leading-tight text-muted-foreground">{articolo.internal_code}</p>}
                    <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-muted-foreground sm:text-sm">
                      <MapPin aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">
                        {articolo.ubicazione && <span className="font-medium text-foreground">{articolo.ubicazione}</span>}
                        {articolo.ubicazione && articolo.magazzino && " · "}
                        {articolo.magazzino || (!articolo.ubicazione && "Senza ubicazione")}
                      </span>
                    </p>
                    {puoPrelevare && altre > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">{formatoQuantitaMagazzino.format(altre)} {articolo.unita_misura} in altre bozze</p>
                    )}
                  </div>
                  <div className="flex max-w-[44%] shrink-0 flex-col items-end gap-1">
                    <div className="max-w-full text-right">
                      <p className="break-words font-bold leading-tight tabular-nums">
                        {formatoQuantitaMagazzino.format(residuoPerCantiere ? disponibile : articolo.disponibile)} {articolo.unita_misura}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {articolo.disponibile <= 0 ? "Esaurito" : residuoPerCantiere ? "Per il cantiere" : "Disponibili"}
                      </p>
                    </div>
                    {puoAggiungere && !riga && (
                      <Button type="button" variant="outline" className="min-h-11 gap-1 px-2" disabled={inSalvataggio || righe.length >= 100 || disponibile <= 0}
                        onClick={() => aggiungi(articolo)} aria-label={`Aggiungi ${articolo.name} al prelievo`}>
                        <Plus aria-hidden="true" className="h-4 w-4" /> Aggiungi
                      </Button>
                    )}
                  </div>
                </div>
                {puoPrelevare && riga && (
                  <div className="mt-1.5 rounded-lg bg-primary/5 p-1">
                    <QuantitaMateriale id={`qta-${articolo.id}`} articolo={articolo} valore={riga.quantita}
                      disponibile={disponibile} errore={errore} bloccata={inSalvataggio || inVerifica}
                      onChange={(valore) => aggiorna(attiva, articolo.id, valore)} onRemove={() => rimuovi(attiva, articolo.id)} />
                  </div>
                )}
                {puoPrelevare && !stessoMagazzino && articolo.disponibile > 0 &&
                  <p className="mt-1 text-xs text-muted-foreground">Prelievo da un altro magazzino.</p>}
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

      {attivo && puoPrelevare && bozze.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl px-3 sm:px-4 md:bottom-4">
          <Button type="button" className="min-h-11 w-full gap-2 rounded-lg text-sm font-semibold shadow-lg" onClick={() => setAperto(true)}>
            <ShoppingCart aria-hidden="true" className="h-4 w-4 shrink-0" />
            {daVerificare.length ? "Verifica prelievo" : "Rivedi"} · {bozze.length > 1
              ? `${bozze.length} prelievi`
              : `${articoliInBozza} ${articoliInBozza === 1 ? "materiale" : "materiali"}`}
          </Button>
        </div>
      )}

      <Sheet open={attivo && puoPrelevare && aperto} onOpenChange={(value) => {
        if (!inInvio.current) setAperto(value);
      }}>
        <SheetContent side="bottom" className="mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-t-2xl px-0 pb-0 pt-3.5 sm:max-h-[88dvh] sm:pt-4">
          <SheetHeader className="shrink-0 space-y-0.5 px-3 pb-2 pr-12 text-left sm:px-4">
            <SheetTitle className="text-base sm:text-lg">{bozze.length > 1 ? "Riepilogo prelievi" : "Riepilogo prelievo"}</SheetTitle>
            <SheetDescription className={cn("text-xs leading-snug", !daVerificare.length && !richiedeConferma && "sr-only")}>
              {daVerificare.length ? "Verifica gli invii in sospeso per continuare."
                : richiedeConferma ? "Il magazzino conferma prima dello scarico." : "Controlla quantità e destinazioni."}
            </SheetDescription>
          </SheetHeader>
          {haRitiro && (
            <div className="shrink-0 px-3 pb-2 sm:px-4">
              <div role="group" aria-label="Vista riepilogo" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
                {[{ ritiro: false, testo: "Per cantiere" }, { ritiro: true, testo: "Per ubicazione" }].map(({ ritiro, testo }) => (
                  <button key={testo} type="button" aria-pressed={mostraRitiro === ritiro}
                    className={cn("min-h-11 rounded-md px-1 text-sm font-semibold", mostraRitiro === ritiro ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
                    onClick={() => {
                      setVistaRitiro(ritiro);
                      if (areaRiepilogo.current) areaRiepilogo.current.scrollTop = 0;
                    }}>
                    {testo}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={areaRiepilogo} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain border-t px-3 py-2 sm:px-4 sm:py-3">
            {!bozze.length && <p className="text-sm text-muted-foreground">Nessun materiale selezionato.</p>}
            {mostraRitiro ? (
              <CampoListaRitiro inventario={articoliVisibili} prelievi={bozzeRitiro.map((locale) => ({
                cantiere: locale.cantiere, nome: nomePrelievo(locale, cantieriPerId), righe: locale.bozza.righe,
              }))} />
            ) : bozze.map((locale) => {
              const gruppo = locale.bozza;
              const nome = nomePrelievo(locale, cantieriPerId);
              const bloccata = inSalvataggio || gruppo.inVerifica;
              return (
                <section key={locale.chiave} aria-label={nome} className="min-w-0 rounded-xl border">
                  <div className="space-y-1 rounded-t-xl bg-muted/50 px-2 py-1.5 sm:px-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="flex min-w-0 items-start gap-1.5 text-sm font-semibold leading-snug">
                        <HardHat aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 break-words">{nome}</span>
                      </h3>
                      {(gruppo.inVerifica || !pronti.has(locale.chiave)) && (
                        <span className="shrink-0 text-xs font-medium text-amber-800 dark:text-amber-300">
                          {gruppo.inVerifica ? "Da verificare" : "Da completare"}
                        </span>
                      )}
                    </div>
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Warehouse aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">{gruppo.righe[0].articolo.magazzino ?? "Senza ubicazione"}</span>
                    </p>
                    {!gruppo.inVerifica && !cantieriPerId.has(locale.cantiere) && (
                      <UniformSelect aria-label="Cantiere di destinazione" value="" disabled={bloccata || !assegnabili.length}
                        onChange={(event) => aggiornaBozza(locale, { ...gruppo, orderId: event.target.value })}
                        className="h-11 w-full rounded-lg px-2 text-sm">
                        <option value="" disabled>{assegnabili.length ? "Scegli cantiere" : "Cantieri non disponibili"}</option>
                        {assegnabili.map((item) => <option key={item.id} value={item.id}>{nomeCantierePrelievo(item)}</option>)}
                      </UniformSelect>
                    )}
                  </div>

                  <ul className="divide-y border-t">
                    {gruppo.righe.map(({ articolo, quantita }) => {
                      const id = `riepilogo-${gruppo.id}-${articolo.id}`;
                      const ubicazione = articoliVisibili.get(articolo.id)?.ubicazione ?? articolo.ubicazione;
                      const verifica = verificaQuantita(articolo, quantita, gruppo.inVerifica);
                      return (
                        <li key={articolo.id} className="space-y-1 px-2 py-1.5 sm:px-3 sm:py-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                            <Label htmlFor={id} className="min-w-0 break-words">{articolo.name}</Label>
                            {ubicazione && <p className="min-w-0 break-words text-xs text-muted-foreground">{ubicazione}</p>}
                          </div>
                          <QuantitaMateriale id={id} articolo={articolo} valore={quantita}
                            disponibile={verifica.disponibile} errore={verifica.errore} bloccata={bloccata}
                            inRiepilogo onChange={(valore) => aggiorna(locale, articolo.id, valore)} onRemove={() => rimuovi(locale, articolo.id)} />
                        </li>
                      );
                    })}
                  </ul>

                  {(!gruppo.inVerifica || gruppo.note.trim()) && (
                    <Collapsible defaultOpen={!!gruppo.note.trim()} className="border-t px-2 sm:px-3">
                      <CollapsibleTrigger asChild>
                        <Button type="button" variant="ghost" className="group min-h-11 w-full justify-start gap-1.5 px-1 text-xs">
                          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                          {gruppo.note.trim() ? "Nota" : "Aggiungi nota"}
                          <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 group-data-[state=open]:rotate-180" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pb-2">
                        <Label htmlFor={`prelievo-note-${gruppo.id}`} className="sr-only">Note facoltative</Label>
                        <Textarea id={`prelievo-note-${gruppo.id}`} rows={2} value={gruppo.note} disabled={bloccata} className="min-h-14 text-base sm:text-sm"
                          onChange={(event) => aggiornaBozza(locale, { ...gruppo, note: event.target.value })} />
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </section>
              );
            })}
          </div>
          <div className="shrink-0 space-y-1.5 border-t bg-background px-3 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-4">
            {!online && <p role="status" className="text-xs text-muted-foreground">Bozze salvate. Torna online per inviare.</p>}
            {online && !daVerificare.length && daInviare.length > 0 && daInviare.length < bozze.length && (
              <p className="text-xs text-muted-foreground">Invii solo i prelievi pronti.</p>
            )}
            {(erroreBozza || erroreInvio) && (
              <p role="alert" className="max-h-16 overflow-y-auto break-words text-xs text-destructive">{erroreBozza || erroreInvio}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-11 shrink-0 px-2.5 text-sm" disabled={inSalvataggio}
                onClick={() => setAperto(false)}>Inventario</Button>
              {!!bozze.length && (
                <Button type="button" className="min-h-11 min-w-0 flex-1 gap-1.5 whitespace-normal px-2.5 text-sm leading-tight"
                  onClick={() => void registra()} disabled={!puoInviare}>
                  {inSalvataggio ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
                  {inSalvataggio ? "Invio…" : invia}
                </Button>
              )}
            </div>
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
        <Button type="button" variant="outline" size="icon" className="min-h-11 w-11 shrink-0"
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
        <Button type="button" variant="outline" size="icon" className="min-h-11 w-11 shrink-0"
          disabled={bloccata || !(piu > quantita)} aria-label={`Aumenta quantità di ${articolo.name}`}
          onClick={() => onChange(formatoInputQuantita.format(piu))}>
          <Plus aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="ml-auto min-h-11 w-11 shrink-0" disabled={bloccata}
          aria-label={inRiepilogo ? `Togli ${articolo.name} dal riepilogo` : `Rimuovi ${articolo.name}`} onClick={onRemove}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {errore && <p id={`${id}-errore`} className="mt-1 text-xs font-medium text-destructive">{errore}</p>}
    </div>
  );
}
