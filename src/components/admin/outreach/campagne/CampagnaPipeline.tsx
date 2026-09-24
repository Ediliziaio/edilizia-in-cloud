/**
 * Pipeline di UNA campagna cold: dove si trovano adesso i suoi contatti.
 *
 *   Nel flusso   Da contattare → Email 1 → … → Email N → Flusso finito
 *   Risposte     Interessati · Domande · Altre risposte · Non interessati
 *   Usciti       Rimbalzate · Esclusi prima dell'invio · Disiscritti · Fermati
 *
 * Ogni colonna si apre sull'elenco dei suoi contatti (con ricerca e pagine):
 * numeri ed elenco vengono dalla stessa definizione di fase nel database
 * (outreach_campagna_iscrizioni), quindi non possono non tornare.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  ChevronRight, Clock, Search, Loader2, Mail, MessageSquareReply, ArrowUpRight,
  ChevronLeft, CalendarClock, Sparkles, AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OutreachConvertContactDialog } from "../OutreachConvertContactDialog";
import {
  costruisciFasi, faseIniziale, percentuale, numeroPasso, numero, followupSchiacciati,
  giorniLeggibili, rimbalziAlti, STATO_CAMPAGNA,
  type FaseVista, type TonoFase, type StimaTempi, type RitmoBrand,
} from "./campagneFasi";
import {
  useCampagnaFasi, useCampagnaPassi, useCampagnaContatti, useUltimoFreno, CONTATTI_PER_PAGINA,
  type CampagnaRiepilogo, type ContattoCampagna, type FrenoRimbalzi,
} from "./useCampagneOutreach";

const TONO: Record<TonoFase, { barra: string; chip: string }> = {
  attivo: { barra: "bg-primary", chip: "bg-primary/10 text-primary" },
  neutro: { barra: "bg-slate-400 dark:bg-slate-500", chip: "bg-muted text-muted-foreground" },
  buono: { barra: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" },
  info: { barra: "bg-sky-600", chip: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400" },
  spento: { barra: "bg-muted-foreground/40", chip: "bg-muted text-muted-foreground" },
  allerta: { barra: "bg-red-600", chip: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400" },
};

const INTENTO: Record<string, string> = {
  interested: "Interessato",
  question: "Domanda",
  not_interested: "Non interessato",
  unsubscribe: "Disiscrizione",
  other: "Altro",
};

const MOTIVO: Record<string, string> = {
  hard_bounce: "Rimbalzo definitivo: indirizzo inesistente",
  "indirizzo impossibile": "Il dominio non riceve posta",
  send_failed: "Invio non riuscito",
  send_rejected: "Rifiutato dal server del destinatario",
  optout_email: "Ha chiesto di non ricevere email",
  "Risposta del destinatario": "Ha risposto",
};

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function dataBreve(iso: string | null | undefined, conOra = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const anno = d.getFullYear() !== new Date().getFullYear() ? `/${String(d.getFullYear()).slice(2)}` : "";
  const g = `${GIORNI[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}${anno}`;
  return conOra ? `${g} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : g;
}

/** Quando parte il prossimo messaggio: un orario già passato vuol dire «in coda». */
function prossimo(iso: string | null, adesso: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (d.getTime() <= adesso) return "in coda, alla prossima finestra d'invio";
  const oggi = new Date(adesso);
  const domani = new Date(adesso); domani.setDate(oggi.getDate() + 1);
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === oggi.toDateString()) return `oggi alle ${ora}`;
  if (d.toDateString() === domani.toDateString()) return `domani alle ${ora}`;
  return dataBreve(iso, false);
}

export function CampagnaPipeline({ companyId, campagna, stima }: {
  companyId: string;
  campagna: CampagnaRiepilogo;
  /** stima dei tempi al ritmo vero delle caselle (null = campagna ferma o brand senza caselle) */
  stima: (StimaTempi & { brand: RitmoBrand }) | null;
}) {
  const fasiQ = useCampagnaFasi(companyId, campagna.sequence_id);
  const passiQ = useCampagnaPassi(campagna.sequence_id);
  const frenoQ = useUltimoFreno(campagna.sequence_id, campagna.stato === "paused");
  const fasi = useMemo(() => costruisciFasi(fasiQ.data ?? [], passiQ.data ?? []), [fasiQ.data, passiQ.data]);
  // Il genitore monta un componente per campagna (key): cambiando campagna la
  // colonna scelta riparte da capo da sola.
  const [scelta, setScelta] = useState<string | null>(null);
  const [adesso] = useState(() => Date.now());

  const pronta = !!fasiQ.data && !!passiQ.data;
  const attiva = scelta ?? (pronta ? faseIniziale(fasi) : null);
  const faseAttiva = fasi.find((f) => f.chiave === attiva) ?? null;
  const iscritti = fasi.reduce((s, f) => s + f.contatti, 0);
  const flusso = fasi.filter((f) => f.gruppo === "flusso");
  const risposte = fasi.filter((f) => f.gruppo === "risposta");
  const uscite = fasi.filter((f) => f.gruppo === "uscita");
  const totRisposte = risposte.reduce((s, f) => s + f.contatti, 0);
  const totUscite = uscite.reduce((s, f) => s + f.contatti, 0);
  const contattati = iscritti - (fasi.find((f) => f.chiave === "da_contattare")?.contatti ?? 0);
  const caldi = risposte
    .filter((f) => f.chiave === "risposta_interessato" || f.chiave === "risposta_domanda")
    .reduce((s, f) => s + f.contatti, 0);

  // «7 da richiamare» è la cosa da fare: apre l'elenco di chi richiamare e ci
  // porta lì, invece di essere una scritta verde in mezzo a una frase.
  const elenco = useRef<HTMLDivElement>(null);
  const apriDaRichiamare = () => {
    const chiave = ["risposta_interessato", "risposta_domanda"].find((k) => (fasi.find((f) => f.chiave === k)?.contatti ?? 0) > 0);
    if (!chiave) return;
    setScelta(chiave);
    requestAnimationFrame(() => elenco.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };

  if (fasiQ.error || passiQ.error) {
    return (
      <Card><CardContent className="p-5 text-sm text-muted-foreground">
        Non riesco a leggere la pipeline di questa campagna. Riprova tra poco.
      </CardContent></Card>
    );
  }

  return (
    <div className={cn("space-y-4 transition-opacity", fasiQ.isFetching && !fasiQ.isLoading && "opacity-80")}>
      <Riepilogo
        campagna={campagna}
        stima={stima}
        iscritti={iscritti}
        contattati={contattati}
        daContattare={fasi.find((f) => f.chiave === "da_contattare")?.contatti ?? 0}
        nelFlusso={contattati - totRisposte - totUscite}
        totRisposte={totRisposte}
        totUscite={totUscite}
        caldi={caldi}
        onDaRichiamare={apriDaRichiamare}
        freno={frenoQ.data ?? null}
        adesso={adesso}
      />

      {stima && campagna.da_contattare > 0 && campagna.in_corso > 0 && followupSchiacciati(stima.brand) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">I follow-up restano indietro.</strong> Ogni casella di {stima.brand.brand} manda al massimo{" "}
            {numero(Math.max(...stima.brand.caselle.map((c) => c.tetto)))} email al giorno e fino a {numero(stima.brand.nuovi_al_giorno ?? 0)} possono
            essere primi contatti: finché ce ne sono, i primi si prendono tutti i posti e le email successive partono in ritardo sul programma.
            Alzando il tetto delle caselle (Deliverability) e lasciando uguali i nuovi al giorno, i follow-up partono in tempo.
          </span>
        </p>
      )}

      {/*
        Il percorso, una riga sola.
        Prima erano nove riquadri grandi uguali, e con una sequenza da nove
        passi otto mostravano zero: un muro di zeri in cui l'occhio non si
        posava da nessuna parte. Adesso le tappe vuote si stringono e
        sbiadiscono, quelle con qualcuno dentro restano leggibili.
      */}
      <section aria-label="Il percorso" className="space-y-2">
        <Intestazione
          icona={Mail}
          titolo="Il percorso"
          nota="dove si trova adesso ogni contatto · clicca una tappa per vedere chi c'è"
        />
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-stretch gap-1.5">
            {flusso.map((f) => (
              <Tappa
                key={f.chiave}
                f={f}
                iscritti={iscritti}
                attiva={attiva === f.chiave}
                onClick={() => setScelta(f.chiave)}
                caricamento={!pronta}
                adesso={adesso}
              />
            ))}
          </div>
        </div>
      </section>

      {/*
        Risposte e uscite: sette tessere che stanno a zero per settimane
        finché la campagna non gira. Restano cliccabili, ma smettono di
        occupare mezza pagina finché non c'è niente dentro.
      */}
      <Esiti
        risposte={risposte}
        uscite={uscite}
        contattati={campagna.contattati}
        invii={campagna.messaggi_inviati}
        attiva={attiva}
        onScegli={setScelta}
        caricamento={!pronta}
      />

      {faseAttiva && (
        <div ref={elenco} className="scroll-mt-4">
        <ElencoContatti
          key={`${campagna.sequence_id}-${faseAttiva.chiave}`}
          companyId={companyId}
          sequenceId={campagna.sequence_id}
          fase={faseAttiva}
          nPassi={passiQ.data?.length ?? 0}
          adesso={adesso}
        />
        </div>
      )}
    </div>
  );
}

/**
 * Il riepilogo in cima: una frase, una barra, e la riga che dice quando
 * si spedisce davvero.
 *
 * Prima c'erano quattro numeri affiancati e, staccata in un angolo, la stima
 * della fine — il pezzo che interessa di più. E in nessun punto la pagina
 * diceva la cosa che chiunque si chiede guardando «0 contattati oggi»: che
 * di sabato non parte niente perché la finestra d'invio è lun–ven.
 */
function Riepilogo({
  campagna, stima, iscritti, daContattare, nelFlusso, totRisposte, totUscite, caldi, onDaRichiamare, freno, adesso,
}: {
  campagna: CampagnaRiepilogo;
  stima: (StimaTempi & { brand: RitmoBrand }) | null;
  iscritti: number; contattati: number; daContattare: number; nelFlusso: number;
  totRisposte: number; totUscite: number; caldi: number; onDaRichiamare: () => void;
  /** ultima fermata del freno dei rimbalzi, se la campagna è in pausa */
  freno: FrenoRimbalzi | null;
  adesso: number;
}) {
  // «Contattati» = chi ha ricevuto almeno un'email: lo stesso numero della
  // scheda della campagna e delle Statistiche. Prima qui si contava chiunque
  // fosse uscito da «Da contattare», compresi gli indirizzi rimbalzati al primo
  // invio: 417 qui, 390 nella scheda subito sopra.
  const contattati = campagna.contattati;
  const ferma = campagna.stato !== "active";
  const fin = stima ? finestraAdesso(stima.brand.giorni_invio, stima.brand.ora_inizio, stima.brand.ora_fine, new Date(adesso)) : null;

  // La parte fatta a sinistra, quella che resta a destra: prima «Da contattare»
  // riempiva l'inizio della barra e l'avanzamento stava in fondo a destra.
  const segmenti = [
    { chiave: "risposte", etichetta: "Hanno risposto", valore: totRisposte, colore: "bg-emerald-600" },
    { chiave: "in_corso", etichetta: "Nel flusso", valore: Math.max(0, nelFlusso), colore: "bg-primary" },
    { chiave: "uscite", etichetta: "Usciti", valore: totUscite, colore: "bg-muted-foreground/50" },
    { chiave: "da_contattare", etichetta: "Da contattare", valore: daContattare, colore: "bg-muted-foreground/20" },
  ].filter((x) => x.valore > 0);

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm text-foreground">
          <span className="text-lg font-semibold">{numero(contattati)}</span>
          <span className="text-muted-foreground"> contattati su {numero(iscritti)}</span>
          {totRisposte > 0 ? (
            <>
              <span className="text-muted-foreground"> · </span>
              <span className="font-semibold">{numero(totRisposte)}</span>
              <span className="text-muted-foreground"> hanno risposto{contattati > 0 && ` (${percentuale(totRisposte, contattati)})`}</span>
            </>
          ) : (
            <span className="text-muted-foreground"> · nessuna risposta ancora</span>
          )}
        </p>
        {caldi > 0 && (
          <Button size="sm" onClick={onDaRichiamare} className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
            <MessageSquareReply className="h-3.5 w-3.5" /> {numero(caldi)} da richiamare <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {segmenti.map((sg) => (
          <span key={sg.chiave} className={cn("block h-full", sg.colore)} style={{ width: `${(sg.valore / Math.max(1, iscritti)) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {segmenti.map((sg) => (
          <span key={sg.chiave} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", sg.colore)} aria-hidden />
            {sg.etichetta} <span className="font-semibold text-foreground">{numero(sg.valore)}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-border pt-2.5 text-xs">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-muted-foreground">
          {ferma && freno ? (
            <span className="text-foreground">
              <strong className="font-semibold">Fermata dal freno dei rimbalzi</strong> {dataBreve(freno.fermato_at)}: {numero(freno.rimbalzi)} indirizzi
              inesistenti sulle ultime {numero(freno.prime_email)} prime email. Prima di riattivarla da Sequenze conviene far verificare gli
              indirizzi della lista; ripartendo, il conto ricomincia da zero.
            </span>
          ) : ferma ? (
            <span className="text-foreground">Campagna {(STATO_CAMPAGNA[campagna.stato]?.etichetta ?? campagna.stato).toLowerCase()}: non parte niente finché non la riattivi.</span>
          ) : fin && !fin.aperta ? (
            <>
              <span className="font-semibold text-foreground">Oggi non si spedisce.</span>{" "}
              {stima!.brand.brand} spedisce {giorniLeggibili(stima!.brand.giorni_invio)} dalle {stima!.brand.ora_inizio} alle {stima!.brand.ora_fine}: riprende {fin.riprende}.
            </>
          ) : (
            <span className="font-semibold text-foreground">Si sta spedendo adesso.</span>
          )}
          {!ferma && stima && daContattare > 0 && (
            <>
              {" "}Al ritmo di oggi ({numero(stima.capOggi)} email al giorno){" "}
              {stima.primi
                ? <>i primi contatti finiscono verso <span className="font-semibold text-foreground">{dataBreve(stima.primi.fine.toISOString(), false)}</span>, circa {numero(stima.primi.giorni)} giorni d'invio.</>
                : stima.oltre
                  ? <span className="text-amber-700 dark:text-amber-400">servirebbero più di tre anni: alza il tetto delle caselle in Deliverability.</span>
                  : <>restano {numero(daContattare)} contatti da raggiungere.</>}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Giorno della settimana (0-6) e ora a Roma: la finestra d'invio vive su quel fuso. */
function oraEGiornoRoma(d: Date): { ora: number; giorno: number } {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const nomi: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let ora = 0, giorno = 0;
  for (const p of parti) {
    if (p.type === "hour") ora = parseInt(p.value, 10) % 24;
    else if (p.type === "weekday") giorno = nomi[p.value] ?? 0;
  }
  return { ora, giorno };
}

const NOMI_GIORNO = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/**
 * Se adesso si spedisce, e quando riprende se no. Prima guardava solo l'ora
 * di chiusura: alle 6 di un lunedì diceva «si sta spedendo» con la finestra
 * che apriva alle 8.
 */
function finestraAdesso(giorni: number[], oraInizio: number, oraFine: number, d: Date): { aperta: boolean; riprende: string } {
  const { ora, giorno } = oraEGiornoRoma(d);
  if (giorni.includes(giorno)) {
    if (ora >= oraInizio && ora < oraFine) return { aperta: true, riprende: "" };
    if (ora < oraInizio) return { aperta: false, riprende: `oggi alle ${oraInizio}` };
  }
  for (let k = 1; k <= 7; k++) {
    const g = (giorno + k) % 7;
    if (giorni.includes(g)) return { aperta: false, riprende: `${k === 1 ? "domani" : NOMI_GIORNO[g]} alle ${oraInizio}` };
  }
  return { aperta: false, riprende: "quando il brand avrà dei giorni d'invio" };
}

/**
 * Una tappa del percorso. Vuota si stringe e sbiadisce: serve a tenere la
 * forma del flusso, non a occupare spazio con uno zero.
 */
function Tappa({ f, iscritti, attiva, onClick, caricamento, adesso }: {
  f: FaseVista; iscritti: number; attiva: boolean; onClick: () => void; caricamento: boolean; adesso: number;
}) {
  const vuota = f.contatti === 0;
  const tono = TONO[f.tono];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      title={f.sottotitolo}
      className={cn(
        "flex flex-col justify-between rounded-lg border px-3 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        vuota ? "min-w-[96px] bg-muted/30" : "min-w-[132px] bg-card",
        attiva ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      <span className={cn("truncate text-[11px] font-semibold uppercase tracking-wide", vuota ? "text-muted-foreground/60" : "text-muted-foreground")}>
        {f.titolo}
      </span>
      <span className={cn("mt-0.5 text-xl font-semibold leading-none tabular-nums", vuota ? "text-muted-foreground/40" : "text-foreground")}>
        {caricamento ? "…" : numero(f.contatti)}
      </span>
      {!vuota && (
        <>
          <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn("block h-full rounded-full", tono.barra)} style={{ width: `${Math.max(3, Math.round((f.contatti / Math.max(1, iscritti)) * 100))}%` }} />
          </span>
          {f.prossimoInvio && f.gruppo === "flusso" && (
            <span className="mt-1.5 inline-flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
              <Clock className="mt-0.5 h-3 w-3 shrink-0" /> {prossimo(f.prossimoInvio, adesso)}
            </span>
          )}
          {f.inPausa > 0 && <Badge variant="outline" className="mt-1.5 w-fit text-[10px]">{f.inPausa} in pausa</Badge>}
        </>
      )}
    </button>
  );
}

/**
 * Risposte e uscite. Quando sono tutte a zero diventano una riga di
 * pastiglie: restano raggiungibili, smettono di riempire la pagina di zeri.
 *
 * Con qualcuno dentro sono tessere basse su una riga, come le tappe del
 * percorso (prima: schede alte 125 px su due righe). Le percentuali sono sui
 * contattati, i rimbalzi sugli invii come nelle Statistiche: sugli iscritti
 * (migliaia mai raggiunti) dicevano tutte «<1%», anche 37 rimbalzi su 621 invii.
 */
function Esiti({ risposte, uscite, contattati, invii, attiva, onScegli, caricamento }: {
  risposte: FaseVista[]; uscite: FaseVista[]; contattati: number; invii: number; attiva: string | null;
  onScegli: (chiave: string) => void; caricamento: boolean;
}) {
  const tutte = [...risposte, ...uscite];
  const conQualcuno = tutte.filter((f) => f.contatti > 0);
  const rimbalzi = uscite.find((f) => f.chiave === "rimbalzato")?.contatti ?? 0;
  const allerta = rimbalziAlti(rimbalzi, invii);

  const pastiglia = (f: FaseVista) => (
    <button
      key={f.chiave}
      type="button"
      onClick={() => onScegli(f.chiave)}
      aria-pressed={attiva === f.chiave}
      title={f.sottotitolo}
      className={cn(
        "self-center rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        attiva === f.chiave ? "border-primary text-foreground" : "border-border hover:border-primary/40",
      )}
    >
      {f.titolo} <span className="tabular-nums">0</span>
    </button>
  );

  if (conQualcuno.length === 0) {
    return (
      <section aria-label="Risposte e uscite" className="space-y-2">
        <Intestazione icona={MessageSquareReply} titolo="Risposte e uscite" nota="nessuno è ancora uscito dal flusso" />
        <div className="flex flex-wrap gap-1.5">{tutte.map(pastiglia)}</div>
      </section>
    );
  }

  // Prima le tessere con qualcuno dentro, in fondo al gruppo quelle a zero.
  const tessere = (gruppo: FaseVista[]) =>
    [...gruppo.filter((f) => f.contatti > 0), ...gruppo.filter((f) => f.contatti === 0)].map((f) => {
      if (f.contatti === 0) return pastiglia(f);
      const suInvii = f.chiave === "rimbalzato";
      // Gli esclusi non hanno ricevuto niente da qui: una quota sui contattati
      // o sugli invii non vorrebbe dire nulla.
      const quota = f.chiave === "escluso"
        ? "nessuna email partita"
        : suInvii ? `${percentuale(f.contatti, invii)} degli invii` : `${percentuale(f.contatti, contattati)} dei contattati`;
      return (
        <Esito
          key={f.chiave}
          f={f}
          quota={quota}
          allerta={suInvii && allerta}
          attiva={attiva === f.chiave}
          onClick={() => onScegli(f.chiave)}
          caricamento={caricamento}
        />
      );
    });

  return (
    <section aria-label="Risposte e uscite" className="space-y-2">
      <Intestazione
        icona={MessageSquareReply}
        titolo="Risposte e uscite"
        nota={`${numero(conQualcuno.reduce((s, f) => s + f.contatti, 0))} contatti hanno lasciato il flusso · clicca per vedere chi`}
      />
      {/* Due gruppi che vanno a capo interi: risposte, poi uscite. */}
      <div className="flex flex-wrap items-stretch gap-x-5 gap-y-1.5">
        <div className="flex flex-wrap items-stretch gap-1.5">{tessere(risposte)}</div>
        <div className="flex flex-wrap items-stretch gap-1.5">{tessere(uscite)}</div>
      </div>
      {allerta && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Rimbalzi al {percentuale(rimbalzi, invii)} degli invii</strong> (la soglia è il 3%): oltre, i provider
            mandano in spam anche le email buone. Prima di arruolare altri contatti conviene verificare gli indirizzi della lista.
          </p>
          <Button size="sm" variant="outline" className="h-7 border-red-300 bg-white px-2 text-xs text-red-800 hover:bg-red-50 dark:bg-transparent" onClick={() => onScegli("rimbalzato")}>
            Vedi chi
          </Button>
        </div>
      )}
    </section>
  );
}

/** Una risposta o un'uscita: tessera bassa come le tappe del percorso. */
function Esito({ f, quota, allerta, attiva, onClick, caricamento }: {
  f: FaseVista; quota: string; allerta: boolean; attiva: boolean; onClick: () => void; caricamento: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      title={f.sottotitolo}
      className={cn(
        "flex min-w-[128px] flex-col rounded-lg border px-3 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        allerta ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30" : "bg-card",
        attiva ? "border-primary ring-1 ring-primary" : !allerta && "border-border hover:border-primary/40",
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", TONO[f.tono].barra)} aria-hidden />
        {f.titolo}
      </span>
      <span className="mt-0.5 text-xl font-semibold leading-none tabular-nums text-foreground">{caricamento ? "…" : numero(f.contatti)}</span>
      <span className={cn("mt-1 text-[11px]", allerta ? "font-semibold text-red-700 dark:text-red-400" : "text-muted-foreground")}>{quota}</span>
    </button>
  );
}

function Intestazione({ icona: Icona, titolo, nota }: { icona: typeof Mail; titolo: string; nota: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icona className="h-3.5 w-3.5" /> {titolo}
      </span>
      <span className="text-[11px] text-muted-foreground/80">{nota}</span>
    </div>
  );
}

function ElencoContatti({ companyId, sequenceId, fase, nPassi, adesso }: {
  companyId: string; sequenceId: string; fase: FaseVista; nPassi: number; adesso: number;
}) {
  const [testo, setTesto] = useState("");
  const [cerca, setCerca] = useState("");
  const [pagina, setPagina] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { setCerca(testo); setPagina(0); }, 300);
    return () => clearTimeout(t);
  }, [testo]);

  const q = useCampagnaContatti(companyId, sequenceId, fase.chiave, cerca, pagina);
  const righe = q.data?.righe ?? [];
  const totale = q.data?.totale ?? 0;

  // Solo per le fasi "risposta": chi ha già un'opportunità aperta mostra il
  // chip "Opportunità creata" al posto del pulsante di creazione manuale.
  const contactIds = useMemo(
    () => (fase.gruppo === "risposta" ? (q.data?.righe ?? []).map((r) => r.contact_id).filter((id): id is string => !!id) : []),
    [q.data, fase.gruppo],
  );
  const oppQ = useQuery({
    queryKey: ["outreach-campagne", "opportunita-aperte", companyId, contactIds],
    enabled: contactIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, contact_id")
        .eq("company_id", companyId)
        .eq("status", "open")
        .in("contact_id", contactIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const o of (data ?? []) as Array<{ id: string; contact_id: string }>) m.set(o.contact_id, o.id);
      return m;
    },
  });
  const opportunitaPerContatto = oppQ.data ?? new Map<string, string>();
  const da = totale === 0 ? 0 : pagina * CONTATTI_PER_PAGINA + 1;
  const a = Math.min(totale, (pagina + 1) * CONTATTI_PER_PAGINA);
  const passo = numeroPasso(fase.chiave);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", TONO[fase.tono].chip)}>{fase.titolo}</span>
            <span className="text-sm font-semibold text-foreground">{numero(fase.contatti)} contatti</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{fase.sottotitolo}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca azienda, email, città…" className="h-8 pl-8 text-xs" aria-label="Cerca tra i contatti di questa fase" />
        </div>
      </div>

      <div className={cn("overflow-x-auto transition-opacity", q.isFetching && "opacity-70")}>
        {q.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carico i contatti…</div>
        ) : q.error ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Non riesco a caricare i contatti di questa fase.</p>
        ) : righe.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {cerca ? "Nessun contatto trovato con questa ricerca." : "Nessun contatto in questa fase, per ora."}
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Contatto</th>
                <th className="px-3 py-2">Zona</th>
                {fase.gruppo === "risposta" ? (
                  <><th className="px-3 py-2">Risposta</th><th className="px-3 py-2 text-right">Email prima</th><th className="px-4 py-2" /></>
                ) : fase.gruppo === "uscita" ? (
                  <><th className="px-3 py-2">Motivo</th><th className="px-3 py-2">Ultimo invio</th><th className="px-3 py-2 text-right">Email ricevute</th></>
                ) : (
                  <><th className="px-3 py-2 text-right">Email ricevute</th><th className="px-3 py-2">Ultimo invio</th><th className="px-4 py-2">Prossimo invio</th></>
                )}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <Riga
                  key={r.enrollment_id} r={r} gruppo={fase.gruppo} nPassi={Math.max(nPassi, passo ?? 0)}
                  companyId={companyId} adesso={adesso}
                  opportunitaId={r.contact_id ? opportunitaPerContatto.get(r.contact_id) ?? null : null}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totale > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{numero(da)}–{numero(a)} di {numero(totale)}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={pagina === 0 || q.isFetching} onClick={() => setPagina((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Indietro
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={a >= totale || q.isFetching} onClick={() => setPagina((p) => p + 1)}>
              Avanti <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Riga({ r, gruppo, nPassi, companyId, adesso, opportunitaId }: {
  r: ContattoCampagna; gruppo: FaseVista["gruppo"]; nPassi: number; companyId: string; adesso: number;
  opportunitaId: string | null;
}) {
  const titolo = r.azienda || r.nome || r.email || "Contatto";
  // Nelle liste importate il nome è spesso l'insegna: non ripeterlo sotto il titolo.
  const nomeDiverso = r.nome && r.azienda && r.nome.trim().toLowerCase() !== r.azienda.trim().toLowerCase() ? r.nome : null;
  const sotto = [nomeDiverso, r.email].filter(Boolean).join(" · ");
  const zona = [r.citta, r.provincia && r.provincia !== r.citta ? r.provincia : null].filter(Boolean).join(" · ") || "—";
  const ricevute = nPassi > 0 ? `${r.inviati} di ${nPassi}` : String(r.inviati);
  const interessante = r.risposta_intent === "interested" || r.risposta_intent === "question";

  return (
    <tr className="border-b border-border/70 align-top last:border-0 hover:bg-muted/20">
      <td className="max-w-[280px] px-4 py-2.5">
        {r.contact_id ? (
          <Link to={`/admin/marketing/contatti/${r.contact_id}`} className="group inline-flex max-w-full items-center gap-1 font-medium text-foreground hover:text-primary">
            <span className="truncate">{titolo}</span>
            <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ) : <span className="font-medium text-foreground">{titolo}</span>}
        {sotto && <div className="truncate text-[11px] text-muted-foreground">{sotto}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{zona}</td>
      {gruppo === "risposta" ? (
        <>
          <td className="max-w-[360px] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px] font-medium">{r.risposta_intent ? INTENTO[r.risposta_intent] ?? "Altro" : "Da classificare"}</Badge>
              {dataBreve(r.risposta_at)}
            </div>
            {r.risposta_testo && <p className="mt-1 line-clamp-2 text-xs text-foreground/80">«{r.risposta_testo}»</p>}
          </td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">{ricevute}</td>
          <td className="whitespace-nowrap px-4 py-2.5 text-right">
            {interessante && r.contact_id && (
              opportunitaId ? (
                <Link
                  to={`/admin/marketing/opportunita?apri=${opportunitaId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <Sparkles className="h-3 w-3" /> Opportunità creata
                </Link>
              ) : (
                <OutreachConvertContactDialog
                  companyId={companyId}
                  initialContactId={r.contact_id}
                  trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs">Crea opportunità</Button>}
                />
              )
            )}
          </td>
        </>
      ) : gruppo === "uscita" ? (
        <>
          <td className="px-3 py-2.5 text-xs text-foreground/80">{r.motivo_stop ? MOTIVO[r.motivo_stop] ?? r.motivo_stop : "—"}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
            {dataBreve(r.ultimo_invio_at)}{r.casella && <div className="text-[11px]">da {r.casella}</div>}
          </td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">{ricevute}</td>
        </>
      ) : (
        <>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">{ricevute}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
            {r.ultimo_invio_at ? <>{dataBreve(r.ultimo_invio_at)}{r.casella && <div className="text-[11px]">da {r.casella}</div>}</> : "—"}
          </td>
          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-foreground/80">{r.prossimo_invio_at ? prossimo(r.prossimo_invio_at, adesso) : "—"}</td>
        </>
      )}
    </tr>
  );
}
