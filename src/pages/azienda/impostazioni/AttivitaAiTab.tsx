import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowLeft, ArrowUpRight, BrainCircuit, CheckCircle2, ChevronRight, CircleAlert, Clock3, FileText,
  MessageSquare, ReceiptText, RefreshCw, Scale, SearchX, Wifi,
} from "lucide-react";
import { AiAgentPipeline, StatoAttivitaBadge } from "@/components/ui/ai-agent-pipeline";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LIMITE_ATTIVITA_AI, type useAttivitaAi } from "@/hooks/useAttivitaAi";
import { usePermissions } from "@/hooks/usePermissions";
import {
  FLUSSI_AI, azioneAttivita, faseAttivita, nomeAttivita, nomeAttore, oraAttivita, raggruppaAttivita, statoAttivita, type StatoAttivita,
} from "@/lib/ai/attivita";
import { cn } from "@/lib/utils";
import type { FlussoAi } from "../../../../shared/aiAttivita";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const iconeFlusso = {
  whatsapp: MessageSquare,
  silvio: BrainCircuit,
  assistente: BrainCircuit,
  preventivo: FileText,
  riconciliazione: Scale,
  ddt: ReceiptText,
};
const gruppi = [
  { chiave: "in_corso", testo: "In corso", Icona: Activity, colore: "text-sky-700 bg-sky-50 dark:bg-sky-950 dark:text-sky-300" },
  { chiave: "in_attesa", testo: "In attesa", Icona: Clock3, colore: "text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300" },
  { chiave: "completata", testo: "Completate", Icona: CheckCircle2, colore: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300" },
  { chiave: "errore", testo: "Problemi", Icona: CircleAlert, colore: "text-rose-700 bg-rose-50 dark:bg-rose-950 dark:text-rose-300" },
] as const;
type Gruppo = (typeof gruppi)[number]["chiave"];

function gruppoDi(stato: StatoAttivita): Gruppo {
  if (stato === "in_coda") return "in_attesa";
  return stato === "interrotta" ? "errore" : stato;
}

export default function AttivitaAiTab({
  dati, apriChat,
}: { dati: ReturnType<typeof useAttivitaAi>; apriChat: () => void }) {
  const t = useT();
  const [flusso, setFlusso] = useState<FlussoAi | "tutti">("tutti");
  const [gruppo, setGruppo] = useState<Gruppo | null>(null);
  const [selezionata, setSelezionata] = useState<string | null>(null);
  const [dettaglioMobile, setDettaglioMobile] = useState(false);
  const dettaglio = useRef<HTMLDivElement>(null);
  const elenco = useRef<HTMLElement>(null);
  const pulsanteSelezionato = useRef<HTMLButtonElement>(null);
  const permessi = usePermissions();
  const { righe, esiti, inDiretta, dataUpdatedAt, isLoading, isFetching, isError, refetch } = dati;
  const adesso = dataUpdatedAt;
  const attivita = raggruppaAttivita(righe, adesso, esiti);
  const delFlusso = flusso === "tutti" ? attivita : attivita.filter(riga => riga.flussi.includes(flusso));
  const visibili = gruppo ? delFlusso.filter(riga => gruppoDi(statoAttivita(riga, adesso)) === gruppo) : delFlusso;
  const corrente = attivita.find(riga => riga.id === selezionata || (selezionata && riga.idPassaggi.includes(selezionata)))
    ?? visibili.find(riga => statoAttivita(riga, adesso) === "in_corso") ?? visibili[0];
  const mostraSoloDettaglio = dettaglioMobile && !!corrente;
  const azione = azioneAttivita(corrente);
  const azioneAccessibile = azione?.tipo === "ddt" ? permessi.canViewOrders
    : azione?.tipo === "preventivo" ? permessi.canViewPreventivi
    : azione?.tipo === "riconciliazione" && permessi.canViewBilling && permessi.canViewCosts;

  function mostraDettaglio(id: string) {
    setSelezionata(id);
    if (window.matchMedia("(min-width: 1280px)").matches) return;
    setDettaglioMobile(true);
    window.requestAnimationFrame(() => {
      dettaglio.current?.focus({ preventScroll: true });
      dettaglio.current?.scrollIntoView({ block: "nearest" });
    });
  }

  function tornaAlleAttivita() {
    setDettaglioMobile(false);
    window.requestAnimationFrame(() => {
      const destinazione = pulsanteSelezionato.current ?? elenco.current;
      destinazione?.focus({ preventScroll: true });
      destinazione?.scrollIntoView({ block: "nearest" });
    });
  }

  return (
    <section aria-labelledby="attivita-ai-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="attivita-ai-heading" className="text-xl font-semibold tracking-tight">{t("Attività AI")}</h2>
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            inDiretta && !isError ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-border text-muted-foreground",
          )}>
            <Wifi className="size-3.5" aria-hidden="true" />
            {isError ? t("Connessione da verificare") : inDiretta ? t("In diretta") : t("Aggiornamento automatico")}
          </span>
          <Button variant="outline" size="icon" className="size-11 shrink-0 sm:size-9" title={t("Aggiorna")} aria-label={t("Aggiorna attività")} disabled={isFetching}
            onClick={() => void refetch()}>
            <RefreshCw className={cn("size-3.5", isFetching && "motion-safe:animate-spin")} />
          </Button>
        </div>
      </div>

      {isError && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {dataUpdatedAt ? t("Attività aggiornata alle {valore}. Riprovo il collegamento quando la pagina è aperta.", { valore: String(oraAttivita(new Date(dataUpdatedAt).toISOString()) ?? "") })
            : t("Il registro non è disponibile. Riprova con il pulsante Aggiorna.")}
        </div>
      )}

      <div role="group" aria-label={t("Stati delle attività")} className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", mostraSoloDettaglio && "hidden xl:grid")}>
        {gruppi.map(({ chiave, testo, Icona, colore }) => {
          const quanti = delFlusso.filter(riga => gruppoDi(statoAttivita(riga, adesso)) === chiave).length;
          return (
            <button key={chiave} type="button"
              aria-pressed={gruppo === chiave}
              disabled={isLoading || (isError && !dataUpdatedAt)}
              onClick={() => { setGruppo(gruppo === chiave ? null : chiave); setSelezionata(null); setDettaglioMobile(false); }}
              className={cn("flex min-w-0 items-center gap-2.5 rounded-xl border p-2.5 text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-3",
                gruppo === chiave ? "border-primary/50 bg-primary/5 ring-1 ring-inset ring-primary/20" : "bg-card hover:bg-muted/40")}
            >
              <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", colore)}>
                <Icona className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-none tabular-nums">{isLoading || (isError && !dataUpdatedAt) ? "—" : quanti}</span>
                <span className="text-xs text-muted-foreground">{t(testo)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" role="status" aria-label={t("Caricamento attività")} />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.15fr)]">
          <section ref={elenco} tabIndex={-1} aria-labelledby="attivita-recenti-heading"
            className={cn("min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mostraSoloDettaglio && "hidden xl:block")}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:px-4">
              <div>
                <h3 id="attivita-recenti-heading" className="text-sm font-semibold">{t("Attività recenti")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("Ultime 24 ore")}{righe.length === LIMITE_ATTIVITA_AI ? t(" · fino a {LIMITE_ATTIVITA_AI} attività", { LIMITE_ATTIVITA_AI: String(LIMITE_ATTIVITA_AI ?? "") }) : ""}
                </p>
              </div>
              <Select value={flusso} onValueChange={value => { setFlusso(value as FlussoAi | "tutti"); setSelezionata(null); setDettaglioMobile(false); }}>
                <SelectTrigger className="h-11 w-[min(10.5rem,100%)] text-xs sm:h-8" aria-label={t("Filtra per flusso")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">{t("Tutti i flussi")}</SelectItem>
                  {Object.entries(FLUSSI_AI).map(([chiave, testo]) => <SelectItem key={chiave} value={chiave}>{t(testo)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {visibili.length > 0 ? (
              <ul className="divide-y xl:max-h-[33rem] xl:overflow-y-auto xl:overscroll-contain">
                {visibili.map(riga => {
                  const Icona = iconeFlusso[riga.flusso] ?? Activity;
                  const attiva = corrente?.id === riga.id;
                  const stato = statoAttivita(riga, adesso);
                  const colore = gruppi.find(g => g.chiave === gruppoDi(stato))?.colore;
                  return (
                    <li key={riga.id}>
                      <button ref={attiva ? pulsanteSelezionato : undefined} type="button" aria-pressed={attiva} aria-controls="attivita-ai-dettaglio" onClick={() => mostraDettaglio(riga.id)}
                        className={cn("group flex w-full items-start gap-2.5 border-l-[3px] p-3 text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4",
                          attiva ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/50")}
                      >
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", colore)}>
                          <Icona className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{nomeAttivita(riga)}</span>
                            <time dateTime={riga.ultimoAggiornamento} className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {oraAttivita(riga.ultimoAggiornamento)}
                            </time>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground" title={nomeAttore(riga)}>{nomeAttore(riga)}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatoAttivitaBadge stato={stato} />
                            {stato !== "interrotta" && <span className="text-xs leading-snug">{faseAttivita(riga.fase).testo}</span>}
                          </span>
                        </span>
                        <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-foreground xl:hidden" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-5 text-center">
                <SearchX className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {isError && !dataUpdatedAt ? t("Registro non raggiungibile")
                    : gruppo || flusso !== "tutti" ? t("Nessuna attività per questi filtri") : t("Nessuna attività nelle ultime 24 ore")}
                </p>
                {gruppo || flusso !== "tutti" ? (
                  <Button variant="ghost" size="sm" onClick={() => { setGruppo(null); setFlusso("tutti"); }}>{t("Rimuovi filtri")}</Button>
                ) : !isError && (
                  <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={apriChat}>
                    {t("Apri la chat")} <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}
          </section>
          <div id="attivita-ai-dettaglio" ref={dettaglio} tabIndex={-1}
            className={cn("min-w-0 scroll-mt-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mostraSoloDettaglio ? "block" : "hidden xl:block")}>
            {mostraSoloDettaglio && (
              <Button type="button" variant="outline" size="sm" className="mb-3 min-h-11 gap-2 xl:hidden" onClick={tornaAlleAttivita}>
                <ArrowLeft className="size-4" aria-hidden="true" /> {t("Torna alle attività")}
              </Button>
            )}
            <AiAgentPipeline attivita={corrente} adesso={adesso} disponibile={!isError || !!dataUpdatedAt}
              azione={azione && azioneAccessibile && (
                <Button asChild size="sm" className="min-h-11 gap-1.5 sm:min-h-9">
                  <Link to={azione.to}>{azione.titolo} <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
                </Button>
              )} />
          </div>
        </div>
      )}
    </section>
  );
}
