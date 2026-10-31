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
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, RotateCcw, SkipForward, Sparkles, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { completezzaPiano } from "../../../shared/silvio-commessa/completezza.ts";
import type { Modifica } from "../../../shared/silvio-commessa/piano.ts";
import { prontaPerScrivere } from "@/lib/silvio-commessa/scrittura";
import { bozzeDaRiprendere, ErroreBozza, messaggioErrore, type Bozza, type EsitoCommessa } from "@/lib/silvio-commessa/bozze";
import { ColonnaFonti } from "./ColonnaFonti";
import { ColonnaChat } from "./ColonnaChat";
import { ColonnaCommessa } from "./ColonnaCommessa";
import {
  contiDellaBarra, dataBreve, domandaDiSilvio, elencoControlla, euro, euroAI, fineLavori, marginePrevisto, NOMI_AREE,
  pianoDellaCommessa,
} from "./presentazione";
import { useBozzaSilvio, type FonteDaAggiungere } from "./useBozzaSilvio";
import { serviziVeri, type ServiziSilvioCommessa } from "./servizi";

type Scheda = "fonti" | "chat" | "commessa";

export interface CreaConSilvioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  /** La fonte con cui si apre: il popup parte già al lavoro. */
  iniziale?: FonteDaAggiungere | null;
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

const campoDiTesto = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function CreaConSilvioDialog(props: CreaConSilvioDialogProps) {
  const { open, onOpenChange, companyId, userId, servizi = serviziVeri, orderId = null, sequenza = null } = props;
  const completa = !!orderId;
  const { etichettaCommessa, iniziale: daFuori } = props;
  const iniziale = useMemo((): FonteDaAggiungere | null | undefined => (orderId
    ? { tipo: "commessa", id: orderId, etichetta: etichettaCommessa ? `commessa ${etichettaCommessa}` : undefined }
    : daFuori), [orderId, etichettaCommessa, daFuori]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const b = useBozzaSilvio({ companyId, userId, servizi, orderId });
  const [scheda, setScheda] = useState<Scheda>(iniziale ? "commessa" : "fonti");
  const [aperta, setAperta] = useState<string | null>(null);
  const [controlla, setControlla] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoCommessa | null>(null);
  const [riallegando, setRiallegando] = useState(false);
  const [rifiutoRipresa, setRifiutoRipresa] = useState(false);
  const partito = useRef(false);

  useEffect(() => {
    if (partito.current || !iniziale) return;
    partito.current = true;
    b.aggiungi([iniziale]);
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
  const costo = b.fonti.reduce((s, f) => s + (f.costoEur ?? 0), 0);
  const conti = contiDellaBarra(b.piano, b.scrittura, costo);
  const domanda = domandaDiSilvio(b.piano, b.scrittura);
  const margine = marginePrevisto(b.piano);
  const fine = fineLavori(b.piano);
  const legge = b.fonti.some((f) => f.stato === "in_lettura" || f.stato === "in_coda");
  const motivi = [...prontaPerScrivere(b.scrittura), ...(legge ? ["Aspetta che finiscano le letture"] : [])];
  const ultimo = b.messaggi[b.messaggi.length - 1];

  const apri = (chiave: string | null) => {
    setAperta(chiave);
    if (chiave) { setControlla(false); setScheda("commessa"); }
  };
  const modifica = (m: Modifica | Modifica[]) => { setErrore(null); b.modifica(m); };

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
      if (fatto.allegatiNonRiusciti.length) setEsito(fatto);
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

  const riallega = async () => {
    if (!esito) return;
    setRiallegando(true);
    try {
      const r = await b.riallega(esito.order_id, esito.allegatiNonRiusciti.map((x) => x.nome));
      setEsito({ ...esito, allegati: esito.allegati + r.allegati, allegatiNonRiusciti: r.nonRiusciti });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : messaggioErrore(e));
    } finally {
      setRiallegando(false);
    }
  };

  const schede: { id: Scheda; nome: string; conta?: string }[] = [
    { id: "fonti", nome: "Fonti", conta: b.fonti.length ? String(b.fonti.length) : undefined },
    { id: "chat", nome: "Chat", conta: domanda ? "1" : undefined },
    { id: "commessa", nome: "Commessa", conta: `${completezza.punteggio}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onKeyDown={tasti}
        className={cn(
          "inset-0 left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-0",
          "lg:left-[50%] lg:top-[50%] lg:h-[calc(100dvh-48px)] lg:w-[calc(100vw-48px)] lg:max-w-[1500px] lg:translate-x-[-50%] lg:translate-y-[-50%] lg:rounded-2xl lg:border",
        )}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">{ultimo?.testo ?? ""}</div>

        {/* ── Testata ───────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-white px-4 py-3 pr-12 lg:px-6">
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
          <p className="text-xs text-slate-500 max-sm:order-last max-sm:w-full" role="status">
            {b.salvataggio.tipo === "in_corso" ? "salvo la bozza…"
              : b.salvataggio.tipo === "salvata" ? "bozza salvata ✓"
                : b.salvataggio.tipo === "errore" ? <span className="text-red-700" title={b.salvataggio.messaggio}>bozza non salvata: {b.salvataggio.messaggio}</span>
                  : null}
          </p>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1" disabled={!b.storia.length}
            onClick={b.indietro} aria-keyshortcuts="Meta+Z Control+Z" title="Annulla l'ultima modifica (Cmd+Z)">
            <Undo2 className="h-4 w-4" aria-hidden /><span className="max-sm:sr-only">Annulla</span>
          </Button>
          <dl className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 lg:w-auto">
            <div className="flex items-center gap-2">
              <dt>{completa ? "Completa al" : "Completezza"}</dt>
              <dd className="flex items-center gap-2 font-semibold text-slate-900">
                <Progress value={completezza.punteggio} className="h-1.5 w-20" aria-label={`Completezza ${completezza.punteggio} su 100`} />
                {prima != null && prima !== completezza.punteggio
                  ? <span>{prima} % <span className="text-slate-400" aria-hidden>→</span><span className="sr-only">, con Silvio</span> {completezza.punteggio} %</span>
                  : completa ? `${completezza.punteggio} %` : `${completezza.punteggio}/100`}
              </dd>
            </div>
            {margine && <div className="flex gap-1"><dt>Margine previsto</dt><dd className="font-semibold text-slate-900">{euro(margine.euro)} ({margine.percento} %)</dd></div>}
            {fine && <div className="flex gap-1"><dt>Fine lavori</dt><dd className="font-semibold text-slate-900">{dataBreve(fine)}</dd></div>}
          </dl>
        </header>

        {ripresa && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm lg:px-6" role="region" aria-label="Bozza da riprendere">
            <p className="min-w-0 flex-1 text-amber-900">
              {completa
                ? <>Avevi già cominciato a completarla il {dataBreve(ripresa.updated_at.slice(0, 10))}.</>
                : <>Hai una commessa a metà: <strong>{nomeBozza(ripresa)}</strong>, modificata il {dataBreve(ripresa.updated_at.slice(0, 10))}.</>}
            </p>
            <Button type="button" size="sm" onClick={() => { b.riprendi(ripresa); setScheda("commessa"); }}>
              {completa ? "Riprendi da lì" : "Riprendi la commessa"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRifiutoRipresa(true)}>Ricomincia</Button>
          </div>
        )}

        {/* ── Schede del telefono ───────────────────────────────── */}
        <div role="tablist" aria-label="Sezioni" className={cn("grid grid-cols-3 border-b bg-white lg:hidden", (controlla || esito) && "hidden")}>
          {schede.map((s) => (
            <button key={s.id} type="button" role="tab" id={`scheda-${s.id}`} aria-controls={`pannello-${s.id}`} aria-selected={scheda === s.id}
              onClick={() => setScheda(s.id)}
              className={cn("flex h-11 items-center justify-center gap-1 border-b-2 text-sm",
                scheda === s.id ? "border-orange-600 font-semibold text-slate-900" : "border-transparent text-slate-500")}>
              {s.nome}{s.conta && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{s.conta}</span>}
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
              <p className="text-sm text-slate-600">
                {esito.allegati ? `${esito.allegati} ${esito.allegati === 1 ? "fonte è" : "fonti sono"} tra i documenti della commessa. ` : ""}
                {esito.allegatiNonRiusciti.length === 1 ? "Un file non si è copiato" : `${esito.allegatiNonRiusciti.length} file non si sono copiati`}:
                l'originale resta nella bozza.
              </p>
              <ul className="space-y-1 text-sm">
                {esito.allegatiNonRiusciti.map((x) => <li key={x.nome}><strong>{x.nome}</strong>: {x.motivo}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                {esito.allegatiNonRiusciti.length > 0 && (
                  <Button type="button" variant="outline" className="gap-1" disabled={riallegando} onClick={() => void riallega()}>
                    {riallegando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}Riprova
                  </Button>
                )}
                <Button type="button" onClick={() => dopo(esito.order_id)}>
                  {completa ? (avanti ? "Vai alla prossima" : "Chiudi") : "Apri la commessa"}
                </Button>
              </div>
            </div>
          </section>
        ) : controlla ? (
          <section className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6" aria-labelledby="titolo-controlla">
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setControlla(false)}>
                  <ArrowLeft className="h-4 w-4" aria-hidden />Torna alla commessa
                </Button>
                <h3 id="titolo-controlla" className="text-base font-semibold text-slate-900">{completa ? "Cosa si aggiunge" : "Cosa nascerà"}</h3>
              </div>
              {elencoControlla(b.piano, b.scrittura).map((g) => (
                <section key={g.area} className="rounded-xl border bg-white p-3 shadow-sm" aria-label={NOMI_AREE[g.area]}>
                  <h4 className="text-sm font-semibold text-slate-900">{NOMI_AREE[g.area]}</h4>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {g.voci.map((v) => (
                      <li key={v.chiave} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-sm">
                        <span className="w-44 shrink-0 text-xs text-slate-500">{v.etichetta}</span>
                        <span className={cn("min-w-0 flex-1", v.fuori ? "text-slate-400 line-through" : "text-slate-900")}>{v.testo}</span>
                        {v.fuori && <span className="w-full text-xs text-amber-800 sm:w-auto">resta fuori: {v.fuori}</span>}
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
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(250px,300px)_minmax(260px,1fr)_minmax(340px,1.35fr)] lg:divide-x">
            <section id="pannello-fonti" role="tabpanel" aria-label="Fonti"
              className={cn("min-h-0 overflow-y-auto p-4", scheda !== "fonti" && "max-lg:hidden")}>
              <h3 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-500 lg:block">Fonti</h3>
              <ColonnaFonti companyId={companyId} orderId={orderId} fonti={b.fonti} servizi={servizi} onAggiungi={b.aggiungi}
                onConferma={b.confermaLetture} onRiprova={b.riprova} onTogli={b.togliFonte} />
            </section>
            <section id="pannello-chat" role="tabpanel" aria-label="Chat con Silvio"
              className={cn("min-h-0 p-4 max-lg:overflow-y-auto", scheda !== "chat" && "max-lg:hidden")}>
              <h3 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-500 lg:block">Chat</h3>
              <ColonnaChat messaggi={b.messaggi} domanda={domanda} legge={legge} onModifica={modifica} onApri={apri} />
            </section>
            <section id="pannello-commessa" role="tabpanel" aria-label="La commessa"
              className={cn("min-h-0 overflow-y-auto p-4", scheda !== "commessa" && "max-lg:hidden")}>
              <h3 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-500 lg:block">La commessa</h3>
              <ColonnaCommessa companyId={companyId} piano={b.piano} completezza={completezza} evidenziate={b.evidenziate}
                aperta={aperta} onApri={apri} onModifica={modifica} />
            </section>
          </div>
        )}

        {/* ── Barra ─────────────────────────────────────────────── */}
        {!esito && (
          <footer className="border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6">
            {errore && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="min-w-0 flex-1 text-sm text-slate-700">
                <strong>{conti.pronte}</strong> {conti.pronte === 1 ? "voce pronta" : "voci pronte"}
                {" · "}<strong className={conti.aspettano ? "text-amber-700" : undefined}>{conti.aspettano}</strong> {conti.aspettano === 1 ? "aspetta te" : "aspettano te"}
                {" · "}costo AI {euroAI(conti.costoEur)}
              </p>
              <div className="flex gap-2 max-sm:w-full">
                {sequenza && (
                  <Button type="button" variant="ghost" className="gap-1 max-sm:flex-1" disabled={creando} onClick={sequenza.onSalta}>
                    <SkipForward className="h-4 w-4" aria-hidden />Salta
                  </Button>
                )}
                <Button type="button" variant="outline" className="gap-1 max-sm:flex-1" aria-pressed={controlla}
                  onClick={() => setControlla(!controlla)}>
                  <ClipboardCheck className="h-4 w-4" aria-hidden />Controlla
                </Button>
                <Button type="button" className="gap-1 bg-orange-600 hover:bg-orange-700 max-sm:flex-1"
                  disabled={creando || motivi.length > 0} aria-describedby={motivi.length ? "silvio-crea-motivi" : undefined}
                  aria-label={completa && avanti && !creando ? "Completa e vai alla prossima" : undefined}
                  onClick={() => void crea()}>
                  {creando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {completa
                    ? (creando ? "Completo…" : avanti ? <><span className="sm:hidden" aria-hidden>Completa ▸</span><span className="max-sm:hidden" aria-hidden>Completa e vai alla prossima ▸</span></> : "Completa ▸")
                    : (creando ? "Creo…" : "Crea ▸")}
                </Button>
              </div>
            </div>
            {motivi.length > 0 && (
              <p id="silvio-crea-motivi" className="mt-1 text-xs text-slate-500">
                {completa ? "Per completare" : "Per creare"}: {motivi.map((m) => m.charAt(0).toLowerCase() + m.slice(1)).join("; ")}.
              </p>
            )}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
