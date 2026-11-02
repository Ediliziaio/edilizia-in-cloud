/**
 * Il popup «Crea con Silvio» (31/10/2026, fase 1, lotto 1.5): carichi quello che hai e la
 * commessa si compone davanti a te. Vedi docs/piano-silvio-commessa-ai.md, sezione 3.
 *
 * Tre colonne su schermo largo (Fonti · Chat · La commessa), tre schede sul telefono con
 * la barra in basso sempre visibile. A schermo intero sul telefono, finestra grande sul
 * computer, come il popup AI del preventivatore (QuoteWizardAiDialog).
 *
 * Si apre già al lavoro con la fonte che riceve (`iniziale`); senza, propone di riprendere
 * l'ultima bozza aperta. La bozza si salva da sola; «Crea» la scrive con una RPC e apre la
 * commessa.
 *
 * Con `orderId` è «Completa con Silvio» (fase 2, lotto 2.1): parte dalla commessa, mostra
 * chiuso quello che ha già, propone il resto (anche dai suoi documenti) e «Completa» aggiunge
 * senza toccare niente. Con `sequenza` è un passo di «Completa le prossime 5» (lotto 2.3).
 *
 * Fase 3: la chat scrive sulla bozza (anche a voce), la ⓘ apre il documento alla pagina
 * citata (`VisoreFonte`), e il popup si apre con più fonti insieme (gli allegati di un'email,
 * un contratto da aggiungere alla commessa che si completa).
 *
 * 01/11/2026, revisione dell'esperienza (per chi lo usa dal telefono, in cantiere): sul
 * telefono le schede sono Chat · Commessa · Fonti e si parte dalla chat; quando la tastiera
 * si apre il popup si accorcia e la barra di «Crea» si nasconde, così il campo resta in vista;
 * «Crea» dice cosa scriverà e cosa resta da decidere.
 *
 * 02/11/2026, visto davvero a schermo: finché il campo ha il fuoco E la tastiera è aperta si
 * nascondono barra e schede; la barra torna con un attimo di ritardo, altrimenti il tocco su
 * un pulsante (che toglie il fuoco) sposta la pagina e il pulsante non riceve il click. Il
 * fuoco all'apertura va al popup, e alla chiusura torna a chi l'ha aperto.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, RotateCcw, SkipForward, Sparkles, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { completezzaPiano } from "../../../shared/silvio-commessa/completezza.ts";
import type { Fonte, Modifica } from "../../../shared/silvio-commessa/piano.ts";
import { prontaPerScrivere } from "@/lib/silvio-commessa/scrittura";
import { bozzeDaRiprendere, ErroreBozza, messaggioErrore, scartaBozza, type Bozza, type EsitoCommessa } from "@/lib/silvio-commessa/bozze";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";
import { usePermissions } from "@/hooks/usePermissions";
import { ColonnaFonti } from "./ColonnaFonti";
import { ColonnaChat } from "./ColonnaChat";
import { ColonnaCommessa } from "./ColonnaCommessa";
import {
  contiDellaBarra, cosaDecidere, cosaScriveCrea, dataBreve, domandaDiSilvio, elencoControlla, euro, euroAI, dateDalleFasi, fineLavori, importoNascosto, margineDaMostrare,
  minuscola, NOMI_AREE, pianoDellaCommessa, restatoFuori, siRiempieOra, STIMA_DETTATURA_EUR, suggerimentiChat, testoDaDecidere,
} from "./presentazione";
import { useBozzaSilvio, type FonteDaAggiungere } from "./useBozzaSilvio";
import { serviziVeri, type ServiziSilvioCommessa } from "./servizi";
import { VisoreFonte, type DocumentoDelVisore } from "./VisoreFonte";
import { comeSiApre, paginaCitata, tipoDelDocumento } from "./documentoCitato";

type Scheda = "fonti" | "chat" | "commessa";

export interface CreaConSilvioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  /** Le fonti con cui si apre: il popup parte già al lavoro. In «Completa» si aggiungono alla commessa. */
  iniziale?: FonteDaAggiungere | FonteDaAggiungere[] | null;
  servizi?: ServiziSilvioCommessa;
  /** Dopo «Crea». Di serie apre la commessa. */
  onCreata?: (orderId: string) => void;
  /** «Completa con Silvio»: la commessa da completare. */
  orderId?: string | null;
  /** Come si chiama la commessa nel titolo («ORD-2026-034»). */
  etichettaCommessa?: string | null;
  /** Dopo «Completa». Di serie chiude il popup e ricarica la pagina della commessa. */
  onCompletata?: (orderId: string) => void;
  /** «Completa le prossime 5»: a che punto siamo, e come saltare questa commessa. */
  sequenza?: { posizione: number; totale: number; onSalta: () => void } | null;
}

/** Il nome di una bozza da riprendere: il cliente, o il titolo. */
function nomeBozza(b: Bozza): string {
  const nome = b.piano?.aree?.cliente?.["cliente.nome"]?.valore as Record<string, string> | undefined;
  const titolo = b.piano?.aree?.identita?.["identita.description"]?.valore;
  return [nome?.client_name || nome?.client_company, typeof titolo === "string" ? titolo : null].filter(Boolean).join(" · ") || "senza nome";
}

/**
 * Sul telefono la tastiera copre il fondo dello schermo ma `100dvh` non si accorcia: si
 * segue l'altezza visibile, così il campo della chat resta sopra la tastiera.
 */
function useAltezzaVisibile(attivo: boolean): number | null {
  const [altezza, setAltezza] = useState<number | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!attivo || !vv) return;
    const aggiorna = () => setAltezza(window.innerWidth < 1024 && vv.height < window.innerHeight - 80 ? Math.round(vv.height) : null);
    aggiorna();
    vv.addEventListener("resize", aggiorna);
    return () => vv.removeEventListener("resize", aggiorna);
  }, [attivo]);
  return altezza;
}

/** Il giorno di un istante, a Roma: «2026-10-31T23:30Z» è il 1° novembre, non il 31 ottobre. */
const giornoInItalia = (istante: string) => new Date(istante).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

/** Quanto aspetta la barra a tornare dopo che il campo ha perso il fuoco: il click di quel tocco deve arrivare prima. */
const RITARDO_BARRA_MS = 250;

const campoDiTesto = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function CreaConSilvioDialog(props: CreaConSilvioDialogProps) {
  const { open, onOpenChange, companyId, userId, servizi = serviziVeri, orderId = null, sequenza = null } = props;
  const completa = !!orderId;
  const { etichettaCommessa, iniziale: daFuori } = props;
  const iniziale = useMemo((): FonteDaAggiungere[] | null => {
    const fuori = daFuori ? (Array.isArray(daFuori) ? daFuori : [daFuori]) : [];
    if (orderId) return [{ tipo: "commessa", id: orderId, etichetta: etichettaCommessa ? `commessa ${etichettaCommessa}` : undefined }, ...fuori];
    return fuori.length ? fuori : null;
  }, [orderId, etichettaCommessa, daFuori]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // «Importi di vendita» decide anche qui; il margine ha il suo permesso, e dagli importi si ricava.
  const { canViewOrderAmounts: vedeImporti, canViewMargins, canViewCosts: vedeCosti } = usePermissions();
  const b = useBozzaSilvio({ companyId, userId, servizi, orderId, vedeImporti, vedeCosti });
  // La chat è la scheda principale del telefono: lì Silvio dice cosa legge e cosa chiede.
  const [scheda, setScheda] = useState<Scheda>("chat");
  const [campoAttivo, setCampoAttivo] = useState(false);
  const altezza = useAltezzaVisibile(open);
  // La tastiera c'è davvero solo se l'altezza visibile si è accorciata: con un mouse, su uno schermo stretto, non si nasconde niente.
  const tastiera = campoAttivo && altezza != null;
  const attesaBarra = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alFuoco = useCallback((dentro: boolean) => {
    if (attesaBarra.current) clearTimeout(attesaBarra.current);
    if (dentro) setCampoAttivo(true);
    else attesaBarra.current = setTimeout(() => setCampoAttivo(false), RITARDO_BARRA_MS);
  }, []);
  useEffect(() => () => { if (attesaBarra.current) clearTimeout(attesaBarra.current); }, []);
  // La tastiera si è aperta: il campo resta in vista nello spazio che è rimasto.
  useEffect(() => {
    if (!tastiera) return;
    // Tutta la modifica, se ce n'è una: il campo col suo «Salva». A tastiera ferma: sale a scatti, e prima lo scorrimento si perde.
    const t = setTimeout(() => {
      const attivo = document.activeElement as HTMLElement | null;
      (attivo?.closest("form:not(.thinking-composer)") ?? attivo)?.scrollIntoView?.({ block: "nearest" });
    }, 300);
    return () => clearTimeout(t);
  }, [tastiera, altezza]);
  // Senza DialogTrigger Radix non sa a chi ridare il fuoco: lo ricorda il popup.
  const chiLhaAperto = useRef<HTMLElement | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);
  const [controlla, setControlla] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoCommessa | null>(null);
  const [riallegando, setRiallegando] = useState(false);
  const [rifiutoRipresa, setRifiutoRipresa] = useState(false);
  const [scartare, setScartare] = useState(false);
  const partito = useRef(false);

  useEffect(() => {
    if (partito.current || !iniziale) return;
    partito.current = true;
    b.aggiungi(iniziale);
  }, [iniziale, b]);

  // Crea e completa non si mescolano: Nuova commessa riprende le bozze «crea», la commessa le sue.
  const daRiprendere = useQuery({
    queryKey: ["silvio-commessa", "bozze", companyId, userId, orderId ?? "crea"],
    enabled: open && (completa || !iniziale),
    retry: false,
    staleTime: 0,
    queryFn: async () => (await bozzeDaRiprendere(companyId, servizi.db, new Date(),
      completa ? { modo: "completa", orderId: orderId! } : { modo: "crea" }))
      .filter((x) => x.created_by === userId && (completa ? x.modo === "completa" && x.order_id === orderId : x.modo === "crea")),
  });
  const intatta = completa
    ? !b.storia.length && b.fonti.every((f) => f.tipo === "commessa")
    : !iniziale && !b.fonti.length;
  const ripresa = intatta && !rifiutoRipresa && !b.idBozza ? daRiprendere.data?.[0] : undefined;

  const completezza = useMemo(() => completezzaPiano(b.piano), [b.piano]);
  const prima = useMemo(() => (completa ? completezzaPiano(pianoDellaCommessa(b.piano)).punteggio : null), [completa, b.piano]);
  const costo = b.fonti.reduce((s, f) => s + (f.costoEur ?? 0), 0) + b.costoChat;
  const [visore, setVisore] = useState<DocumentoDelVisore | null>(null);
  const conti = contiDellaBarra(b.piano, b.scrittura, costo);
  // Prima di caricare qualcosa non si chiede niente: la chat dice cosa fare, la commessa aspetta.
  const vuota = !completa && !b.fonti.length && !b.messaggi.length;
  const legge = b.fonti.some((f) => f.stato === "in_lettura" || f.stato === "in_coda");
  // Una domanda alla volta, e non mentre legge: la risposta può arrivare dal documento.
  const domanda = vuota || (legge && !b.piano.conflitti.length) ? null : domandaDiSilvio(b.piano, b.scrittura, new Date(), vedeImporti, vedeCosti);
  const margine = vedeImporti && canViewMargins ? margineDaMostrare(b.piano) : null;
  const fine = fineLavori(b.piano, b.scrittura);
  const inAttesa = b.fonti.filter((f) => f.stato === "da_confermare").map((f) => f.etichetta);
  const nonLetti = b.fonti.filter((f) => f.stato === "errore" || f.stato === "da_collegare").map((f) => f.etichetta);
  const motivi = [
    ...prontaPerScrivere(b.scrittura),
    ...(legge ? ["Aspetta che finiscano le letture"] : []),
    ...(b.scrivendo ? ["Aspetta la risposta di Silvio"] : []),
    ...(inAttesa.length ? [`Leggi o togli ${inAttesa.join(", ")}`] : []),
  ];
  const ultimo = b.messaggi[b.messaggi.length - 1];
  const daDecidere = useMemo(() => {
    const d = cosaDecidere(b.piano, b.scrittura, completezza, { vedeImporti, vedeCosti, contesto: b.contesto });
    return vuota ? { ...d, domande: [], totale: d.totale - d.domande.length } : d;
  }, [b.piano, b.scrittura, completezza, vuota, vedeImporti, vedeCosti, b.contesto]);
  const suggerimenti = useMemo(() => suggerimentiChat(b.piano, completezza), [b.piano, completezza]);
  const mancano = useMemo(() => completezza.mancano.filter((v) => siRiempieOra(v) && !importoNascosto(v.chiave, vedeImporti, vedeCosti)).map((v) => ({ chiave: v.chiave, etichetta: v.etichetta })), [completezza, vedeImporti, vedeCosti]);
  const scrive = cosaScriveCrea(b.scrittura);

  const apri = (chiave: string | null) => {
    setAperta(chiave);
    if (chiave) { setControlla(false); setScheda("commessa"); }
  };
  const modifica = (m: Modifica | Modifica[]) => { setErrore(null); b.modifica(m); };

  /**
   * Il campo della chat. Finché non c'è nessuna fonte, quello che si scrive è il lavoro da
   * leggere (come «Leggi il testo» nelle Fonti); dopo, è una correzione della bozza.
   */
  const scrivi = useCallback(async (t: string) => {
    setErrore(null);
    if (!completa && !b.fonti.length) { b.aggiungi([{ tipo: "testo", testo: t }]); return true; }
    return b.scrivi(t);
  }, [b, completa]);

  /** «Vedi» su una risposta della chat: la commessa, alla prima variabile cambiata. */
  const vedi = (chiavi: string[]) => {
    setControlla(false);
    setScheda("commessa");
    requestAnimationFrame(() => document.querySelector(`[data-chiave="${CSS.escape(chiavi[0] ?? "")}"]`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
  };

  /** La ⓘ: come si riapre il documento da cui viene un valore, o null se non è un documento. */
  const apriFonte = (fonte: Fonte): (() => void) | null => {
    const delPopup = b.fonteDelPopup(fonte);
    const doc = comeSiApre(fonte, companyId, delPopup);
    if (!doc) return null;
    const nome = doc.tipo === "file" ? doc.file.name : doc.nome;
    const mime = doc.tipo === "file" ? doc.file.type : doc.mime;
    const carica = async (): Promise<Blob> => {
      switch (doc.tipo) {
        case "file": return doc.file;
        case "caricato": return servizi.scaricaCaricato(doc.path, doc.nome, doc.mime);
        case "allegato_commessa": return servizi.scaricaAllegato({ id: "", nome: doc.nome, path: doc.path, mime: doc.mime ?? null, dimensione: null });
        case "email": {
          const url = await servizi.apriDocumento({ tipo: "allegato_email", email_id: doc.email_id, indice: doc.indice }, companyId);
          const r = await fetch(url);
          if (!r.ok) throw new Error("Non riesco a scaricare l'allegato.");
          return await r.blob();
        }
      }
    };
    return () => setVisore({
      titolo: fonte.etichetta.replace(/^(scelto|modificato|spostato) da te: /, ""),
      tipo: tipoDelDocumento(nome, mime) ?? "pdf",
      carica, pagina: paginaCitata(fonte.dove), citazione: fonte.citazione ?? null, dove: fonte.dove ?? null,
    });
  };

  const tasti = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !campoDiTesto(e.target)) {
      e.preventDefault();
      b.indietro();
    }
  };

  const crea = async () => {
    if (creando || motivi.length) return;
    setCreando(true);
    setErrore(null);
    try {
      const fatto = await b.crea();
      // Un file non copiato, un mezzo non prenotato (prenotato da altri nel frattempo), un contratto saltato
      // o quello che i permessi hanno tolto si dicono prima di uscire.
      if (fatto.allegatiNonRiusciti.length || fatto.risorse?.non_prenotati?.length || restatoFuori(fatto, b.piano).length) setEsito(fatto);
      else dopo(fatto.order_id);
    } catch (e) {
      const testo = e instanceof ErroreBozza ? e.message : messaggioErrore(e);
      setErrore(testo);
      if (/manca il cliente/i.test(testo)) apri("cliente.customer_id");
    } finally {
      setCreando(false);
    }
  };

  /** Dopo la scrittura: la commessa nuova si apre; quella completata si ricarica, o si passa alla prossima. */
  const dopo = (id: string) => {
    if (completa) {
      if (props.onCompletata) props.onCompletata(id);
      else {
        // Sulla pagina della commessa: tutto quello che mostra va riletto.
        void queryClient.invalidateQueries();
        onOpenChange(false);
      }
      return;
    }
    onOpenChange(false);
    (props.onCreata ?? ((x: string) => navigate(`/azienda/ordini/${x}`)))(id);
  };
  const avanti = sequenza && sequenza.posizione < sequenza.totale;

  /**
   * Chiudere mentre Silvio legge o scrive vuol dire pagare la lettura e perderne il
   * risultato: prima si chiede. Vale per la X, per Esc e per «Salta».
   */
  const [chiudere, setChiudere] = useState<(() => void) | null>(null);
  const alLavoro = legge || b.scrivendo || creando;
  const chiudiSeSicuro = (fai: () => void) => { if (alLavoro) setChiudere(() => fai); else fai(); };
  const cambiaApertura = (o: boolean) => { if (o) onOpenChange(true); else chiudiSeSicuro(() => onOpenChange(false)); };

  const riallega = async () => {
    if (!esito) return;
    setRiallegando(true);
    try {
      const r = await b.riallega(esito.order_id, esito.allegatiNonRiusciti.map((x) => x.nome));
      setEsito({ ...esito, allegati: esito.allegati + r.allegati, allegatiNonRiusciti: r.nonRiusciti });
    } catch (e) {
      setErrore(erroreLeggibile(e));
    } finally {
      setRiallegando(false);
    }
  };

  /** «Ricomincia»: la bozza si butta via davvero, non si nasconde soltanto (P9). */
  const ricomincia = async () => {
    const via = ripresa;
    setScartare(false);
    if (!via) return;
    try {
      await scartaBozza(via.id, servizi.db);
      setRifiutoRipresa(true);
      void daRiprendere.refetch();
    } catch (e) {
      setErrore(e instanceof ErroreBozza ? e.message : messaggioErrore(e));
    }
  };

  const schede: { id: Scheda; nome: string; conta?: string; avviso?: boolean; etichetta?: string }[] = [
    { id: "chat", nome: "Chat", conta: b.scrivendo || legge ? "…" : undefined },
    {
      id: "commessa", nome: "Commessa", conta: daDecidere.totale ? String(daDecidere.totale) : undefined, avviso: daDecidere.totale > 0,
      etichetta: daDecidere.totale ? `Commessa, ${daDecidere.totale} da decidere` : undefined,
    },
    { id: "fonti", nome: "Fonti", conta: b.fonti.length ? String(b.fonti.length) : undefined },
  ];

  return (
    <Dialog open={open} onOpenChange={cambiaApertura}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          chiLhaAperto.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          // Il fuoco sul popup, non sul primo pulsante: niente anello su «Chat» o «Scegli i file», niente tastiera che sale.
          e.preventDefault();
          (e.target as HTMLElement | null)?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (chiLhaAperto.current?.isConnected) chiLhaAperto.current.focus();
        }}
        onKeyDown={tasti}
        // Ogni campo, non solo la chat: con la tastiera aperta anche la modifica di un importo ha bisogno dello spazio.
        onFocus={(e) => { if (campoDiTesto(e.target)) alFuoco(true); }}
        onBlur={(e) => { if (campoDiTesto(e.target)) alFuoco(false); }}
        // Esc mentre si modifica un valore annulla la modifica, non chiude il popup.
        onEscapeKeyDown={(e) => { if (aperta) { e.preventDefault(); setAperta(null); } }}
        style={altezza ? { height: altezza, maxHeight: altezza } : undefined}
        className={cn(
          // La X del popup: 44 px sotto lg, come ogni altro tocco.
          "max-lg:[&>button:last-child]:right-1 max-lg:[&>button:last-child]:top-1 max-lg:[&>button:last-child]:flex max-lg:[&>button:last-child]:h-11 max-lg:[&>button:last-child]:w-11 max-lg:[&>button:last-child]:items-center max-lg:[&>button:last-child]:justify-center",
          "inset-0 left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-0 outline-none",
          "lg:left-[50%] lg:top-[50%] lg:h-[calc(100dvh-48px)] lg:w-[calc(100vw-48px)] lg:max-w-[1500px] lg:translate-x-[-50%] lg:translate-y-[-50%] lg:rounded-2xl lg:border",
        )}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">{ultimo?.testo ?? ""}</div>

        {/* ── Testata ───────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-white py-2.5 pl-4 pr-12 lg:py-2 lg:pl-5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 lg:text-lg">
              <Sparkles className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
              <span className="min-w-0 break-words sm:truncate">
                {completa
                  ? <>
                    <span className="sm:hidden" aria-hidden>Completa <span className="whitespace-nowrap">{props.etichettaCommessa ?? "la commessa"}</span></span>
                    <span className="max-sm:sr-only">{`Completa ${props.etichettaCommessa ? `la commessa ${props.etichettaCommessa}` : "la commessa"} con Silvio`}</span>
                  </>
                  : "Nuova commessa con Silvio"}
              </span>
              {sequenza && (
                <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                  {sequenza.posizione} di {sequenza.totale}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 max-sm:sr-only">
              {completa
                ? "Quello che c'è già resta com'è: Silvio propone solo quello che manca, anche dai documenti della commessa."
                : "Carica quello che hai: Silvio compone la commessa, tu controlli e crei."}
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-11 w-11 gap-1 max-sm:px-0 sm:w-auto lg:h-8" disabled={!b.storia.length || !!esito}
            onClick={b.indietro} aria-keyshortcuts="Meta+Z Control+Z" title="Annulla l'ultima modifica (Cmd+Z)">
            <Undo2 className="h-4 w-4" aria-hidden /><span className="max-sm:sr-only">Annulla</span>
          </Button>
          {/* Sul telefono percentuale e salvataggio stanno sulla stessa riga, sotto il titolo; su schermo largo seguono la testata. */}
          <div className={cn("flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 lg:contents", tastiera && "max-lg:hidden")}>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <dt>{completa ? "Completa al" : "Pronta al"}</dt>
              <dd className="flex items-center gap-2 font-semibold text-slate-900">
                <Progress value={completezza.punteggio} className="h-1.5 w-16 bg-slate-200 sm:w-20" aria-label={`Pronta al ${completezza.punteggio} %`} />
                {prima != null && prima !== completezza.punteggio
                  ? <span>{prima} % <span className="text-slate-400" aria-hidden>→</span><span className="sr-only">, con Silvio</span> {completezza.punteggio} %</span>
                  : `${completezza.punteggio} %`}
              </dd>
            </div>
            {margine && margine.parziale === false && (
              <div className="flex gap-1 max-sm:hidden">
                <dt>Margine previsto</dt>
                <dd className="font-semibold text-slate-900">{euro(margine.euro)} ({margine.percento} %)</dd>
              </div>
            )}
            {/* Coi costi di una fase sola il margine verrebbe 98 %: finché sono parziali non è un risultato. */}
            {margine?.parziale && vedeCosti && (
              <div className="flex gap-1 max-sm:hidden" title="Il margine si calcola quando ci sono tutti i costi.">
                <dt>Costi inseriti</dt>
                <dd><span className="font-semibold text-slate-900">{euro(margine.costi)}</span> ({margine.mancano})</dd>
              </div>
            )}
            {fine && <div className="flex gap-1 max-sm:hidden"><dt>Fine lavori</dt><dd className="font-semibold text-slate-900">{dataBreve(fine)}</dd></div>}
          </dl>
          <p className="min-w-0 text-xs text-slate-500" role="status">
            {b.salvataggio.tipo === "in_corso" ? "salvo la bozza…"
              : b.salvataggio.tipo === "salvata" ? "bozza salvata ✓"
                : b.salvataggio.tipo === "errore" ? <span className="text-red-700" title={b.salvataggio.messaggio}>bozza non salvata: {b.salvataggio.messaggio}</span>
                  : null}
          </p>
          </div>
        </header>

        {ripresa && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm lg:px-6" role="region" aria-label="Bozza da riprendere">
            <p className="min-w-0 flex-1 text-amber-900 max-sm:basis-full">
              {completa
                ? <>Avevi già cominciato a completarla il {dataBreve(giornoInItalia(ripresa.updated_at))}.</>
                : <>Hai una commessa a metà: <strong>{nomeBozza(ripresa)}</strong>, modificata il {dataBreve(giornoInItalia(ripresa.updated_at))}.</>}
            </p>
            <Button type="button" size="sm" className="h-11 lg:h-9" onClick={() => { b.riprendi(ripresa); setScheda("commessa"); }}>
              {completa ? "Riprendi da lì" : "Riprendi la commessa"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-9" onClick={() => setScartare(true)}>Ricomincia</Button>
          </div>
        )}

        {/* ── Schede del telefono ───────────────────────────────── */}
        <div role="tablist" aria-label="Sezioni" className={cn("grid grid-cols-3 border-b bg-white lg:hidden", (controlla || esito || tastiera) && "hidden")}>
          {schede.map((s) => (
            <button key={s.id} type="button" role="tab" id={`scheda-${s.id}`} aria-controls={`pannello-${s.id}`} aria-selected={scheda === s.id}
              onClick={() => setScheda(s.id)} aria-label={s.etichetta}
              className={cn("flex h-12 items-center justify-center gap-1.5 border-b-2 text-[15px]",
                scheda === s.id ? "border-orange-600 font-semibold text-slate-900" : "border-transparent text-slate-500")}>
              {s.nome}
              {s.conta && <span className={cn("min-w-5 rounded-full px-1.5 text-xs font-semibold", s.avviso ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600")}>{s.conta}</span>}
            </button>
          ))}
        </div>

        {/* ── Corpo ─────────────────────────────────────────────── */}
        {esito ? (
          <section className="min-h-0 flex-1 overflow-y-auto p-6" aria-label="Commessa creata">
            <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-white p-6 shadow-sm">
              <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />{completa ? "La commessa è completata" : "La commessa è nata"}
              </p>
              {restatoFuori(esito, b.piano).length > 0 && (
                <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                  {restatoFuori(esito, b.piano).map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {esito.allegatiNonRiusciti.length > 0 && (
                <>
                  <p className="text-sm text-slate-600">
                    {esito.allegati ? `${esito.allegati} ${esito.allegati === 1 ? "fonte è" : "fonti sono"} tra i documenti della commessa. ` : ""}
                    {esito.allegatiNonRiusciti.length === 1 ? "Un file non si è copiato" : `${esito.allegatiNonRiusciti.length} file non si sono copiati`}:
                    l'originale resta nella bozza.
                  </p>
                  <ul className="space-y-1 text-sm">
                    {esito.allegatiNonRiusciti.map((x) => <li key={x.nome}><strong>{x.nome}</strong>: {x.motivo}</li>)}
                  </ul>
                </>
              )}
              {!!esito.risorse?.non_prenotati?.length && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                  <p className="font-medium">
                    {esito.risorse.non_prenotati.length === 1 ? "Un mezzo non si è prenotato" : `${esito.risorse.non_prenotati.length} mezzi non si sono prenotati`}:
                    il resto della commessa c'è. {esito.risorse.non_prenotati.length === 1 ? "Prenotalo" : "Prenotali"} dalla scheda Mezzi della commessa.
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {esito.risorse.non_prenotati.map((x, i) => <li key={`${x.mezzo_id}-${i}`}>• {x.motivo}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {esito.allegatiNonRiusciti.length > 0 && (
                  <Button type="button" variant="outline" className="h-11 gap-1 lg:h-10" disabled={riallegando} onClick={() => void riallega()}>
                    {riallegando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}Riprova
                  </Button>
                )}
                <Button type="button" className="h-11 lg:h-10" onClick={() => dopo(esito.order_id)}>
                  {completa ? (avanti ? "Vai alla prossima" : "Chiudi") : "Apri la commessa"}
                </Button>
              </div>
            </div>
          </section>
        ) : controlla ? (
          <section className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6" aria-labelledby="titolo-controlla">
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-11 gap-1 lg:h-9" onClick={() => setControlla(false)}>
                  <ArrowLeft className="h-4 w-4" aria-hidden />Torna alla commessa
                </Button>
                <h3 id="titolo-controlla" className="text-base font-semibold text-slate-900">{completa ? "Cosa si aggiunge" : "Cosa nascerà"}</h3>
              </div>
              {elencoControlla(b.piano, b.scrittura, vedeImporti, vedeCosti).map((g) => (
                <section key={g.area} className="rounded-xl border bg-white p-3 shadow-sm" aria-label={NOMI_AREE[g.area]}>
                  <h4 className="text-sm font-semibold text-slate-900">{NOMI_AREE[g.area]}</h4>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {g.voci.map((v) => (
                      <li key={v.chiave} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-sm">
                        <span className="w-full text-xs text-slate-500 sm:w-44 sm:shrink-0">{v.etichetta}</span>
                        <span className={cn("min-w-0 flex-1 [overflow-wrap:anywhere]", v.fuori && !v.parziale ? "text-slate-400 line-through" : "text-slate-900")}>{v.testo}</span>
                        {v.fuori && <span className="w-full text-xs text-amber-800 sm:w-auto">{v.parziale ? "entra in parte, resta fuori" : "resta fuori"}: {v.fuori}</span>}
                        {v.nota && <span className="w-full text-xs text-slate-500 sm:w-auto">{v.nota}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {!b.scrittura.fasi.length && !b.scrittura.rate.length && !Object.keys(b.scrittura.ordine).length && (
                <p className="text-sm text-slate-500">
                  {completa ? "Ancora niente da aggiungere: rispondi alle domande di Silvio o fagli leggere un documento." : "Ancora niente: carica una fonte o scrivi due righe sul lavoro."}
                </p>
              )}
            </div>
          </section>
        ) : (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(210px,248px)_minmax(340px,1.15fr)_minmax(320px,1fr)] xl:grid-cols-[248px_minmax(380px,1.2fr)_minmax(340px,460px)] lg:divide-x">
            <section id="pannello-fonti" role="tabpanel" aria-label="Fonti"
              className={cn("min-h-0 overflow-y-auto p-3", scheda !== "fonti" && "max-lg:hidden")}>
              <h3 className="mb-1.5 hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:block">Fonti</h3>
              <ColonnaFonti companyId={companyId} orderId={orderId} fonti={b.fonti} servizi={servizi} onAggiungi={b.aggiungi}
                onConferma={b.confermaLetture} onRiprova={b.riprova} onTogli={b.togliFonte}
                onCollegaOfferta={(id, r) => void b.collegaOfferta(id, r)} onComeDocumento={b.leggiComeDocumento} />
            </section>
            <section id="pannello-chat" role="tabpanel" aria-label="Chat con Silvio"
              className={cn("flex min-h-0 flex-col p-3", scheda !== "chat" && "max-lg:hidden")}>
              <h3 className="mb-1.5 hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:block">Chat con Silvio</h3>
              <ColonnaChat messaggi={b.messaggi} domanda={domanda} legge={legge} onModifica={modifica} onApri={apri}
                onScrivi={scrivi} scrivendo={b.scrivendo} onVedi={vedi}
                annullabile={b.storia.length > 0} onAnnulla={b.indietro}
                trascrivi={servizi.trascrivi} primaDiDettare={() => b.controllaCrediti(STIMA_DETTATURA_EUR)}
                fonti={b.fonti} onAllega={(f) => b.aggiungi(f.map((file) => ({ tipo: "file" as const, file })))} onConferma={b.confermaLetture}
                suggerimenti={suggerimenti} daDecidere={daDecidere} mancano={mancano} onFonti={() => setScheda("fonti")} tastiera={tastiera} />
            </section>
            <section id="pannello-commessa" role="tabpanel" aria-label="La commessa"
              className={cn("min-h-0 overflow-y-auto p-3", scheda !== "commessa" && "max-lg:hidden")}>
              <h3 className="mb-1.5 hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:block">La commessa</h3>
              <ColonnaCommessa companyId={companyId} piano={b.piano} completezza={completezza} evidenziate={b.evidenziate}
                aperta={aperta} onApri={apri} onModifica={modifica}
                daGuardare={b.daGuardare} onVisto={b.visto} apriFonte={apriFonte} autonomia={b.autonomia}
                daDecidere={daDecidere} onVai={(c) => vedi([c])} vuota={vuota} contesto={b.contesto} vedeImporti={vedeImporti} vedeCosti={vedeCosti}
                fineDalleFasi={dateDalleFasi(b.scrittura).fine} />
            </section>
          </div>
        )}

        {/* ── Barra ─────────────────────────────────────────────── */}
        {!esito && (
          <footer className={cn("border-t bg-white px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:px-5", tastiera && "max-lg:hidden")}>
            {errore && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 text-sm text-slate-700">
                <p className={cn(vuota && "hidden")}>
                  {scrive
                    ? <>{completa ? "Aggiunge" : "Nasce con"} <strong>{scrive}</strong><span className="max-sm:hidden">{conti.pronte ? ` (${conti.pronte} ${conti.pronte === 1 ? "dato" : "dati"} in tutto)` : ""}</span>.</>
                    : <><strong>{conti.pronte}</strong> {conti.pronte === 1 ? "dato pronto" : "dati pronti"}.</>}
                </p>
                <p className="text-xs text-slate-500">
                  {daDecidere.totale > 0
                    ? <button type="button" className="min-h-11 text-left font-medium text-amber-700 underline-offset-2 hover:underline max-lg:-my-2.5 lg:min-h-0" onClick={() => vedi(["silvio-da-decidere"])}>
                      Da decidere: {testoDaDecidere(daDecidere)}
                    </button>
                    : vuota ? "Carica un documento o scrivi il lavoro nella chat." : "Niente da decidere."}
                  <span className="max-sm:hidden">{" · "}costo AI {euroAI(conti.costoEur)}</span>
                </p>
              </div>
              <div className="flex gap-2 max-sm:w-full">
                {sequenza && (
                  <Button type="button" variant="ghost" className="h-11 gap-1 max-sm:flex-1 lg:h-10" disabled={creando} onClick={() => chiudiSeSicuro(sequenza.onSalta)}>
                    <SkipForward className="h-4 w-4" aria-hidden />Salta
                  </Button>
                )}
                <Button type="button" variant="outline" className="h-11 gap-1 max-sm:flex-1 lg:h-10" aria-pressed={controlla}
                  onClick={() => setControlla(!controlla)}>
                  <ClipboardCheck className="h-4 w-4" aria-hidden />Controlla
                </Button>
                <Button type="button" className="h-11 gap-1 bg-orange-700 hover:bg-orange-800 max-sm:flex-1 lg:h-10"
                  disabled={creando || motivi.length > 0} aria-describedby={motivi.length ? "silvio-crea-motivi" : undefined}
                  aria-label={completa && avanti && !creando ? "Completa e vai alla prossima" : undefined}
                  onClick={() => void crea()}>
                  {creando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {completa
                    ? (creando ? "Completo…" : avanti ? <><span className="sm:hidden" aria-hidden>Completa ▸</span><span className="max-sm:hidden" aria-hidden>Completa e vai alla prossima ▸</span></> : "Completa ▸")
                    : (creando ? "Creo…" : "Crea la commessa ▸")}
                </Button>
              </div>
            </div>
            {motivi.length > 0 && (
              <p id="silvio-crea-motivi" hidden={vuota} className="mt-1 text-xs text-slate-500">
                {completa ? "Per completare" : "Per creare"}: {motivi.map(minuscola).join("; ")}.
              </p>
            )}
            {nonLetti.length > 0 && (
              <p className="mt-1 break-words text-xs text-amber-800">Non letti, restano fuori: {nonLetti.join(", ")}.</p>
            )}
          </footer>
        )}
        <VisoreFonte documento={visore} onChiudi={() => setVisore(null)} />
        <AlertDialog open={scartare} onOpenChange={setScartare}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Butto via la commessa a metà?</AlertDialogTitle>
              <AlertDialogDescription>
                {ripresa && !completa ? <>«{nomeBozza(ripresa)}» sparisce e non torna più. </> : "La bozza sparisce e non torna più. "}
                Si riparte da zero.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Tienila</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void ricomincia()}>Sì, buttala via</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={!!chiudere} onOpenChange={(o) => { if (!o) setChiudere(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{creando ? "Silvio sta creando la commessa" : legge ? "Silvio sta ancora leggendo" : "Silvio sta ancora rispondendo"}</AlertDialogTitle>
              <AlertDialogDescription>
                {creando
                  ? "Aspetta un attimo: se chiudi adesso non vedi com'è andata."
                  : legge
                    ? "Se chiudi adesso perdi quello che ha trovato, e la lettura si paga lo stesso. La bozza resta salvata fin qui."
                    : "Se chiudi adesso perdi la sua risposta. La bozza resta salvata fin qui."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Aspetta</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { const f = chiudere; setChiudere(null); f?.(); }}>
                Chiudi lo stesso
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
