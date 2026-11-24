import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, Check, Clock3, Cpu, Flag, GitBranch, Inbox, UserRound } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  durataAttivita, durataPassaggio, faseAttivita, nomeAttore, nomeAttivita,
  oraAttivita, STATI_AI, statoAttivita, type StatoAttivita,
} from "@/lib/ai/attivita";
import { cn } from "@/lib/utils";
import type { AttivitaAi } from "../../../shared/aiAttivita";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const fasi = [
  { nome: "Ricezione", Icona: Inbox },
  { nome: "Lavorazione", Icona: GitBranch },
  { nome: "Esito", Icona: Flag },
] as const;

const toni: Record<StatoAttivita, string> = {
  in_corso: "bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-200",
  in_coda: "bg-muted text-foreground",
  in_attesa: "bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200",
  completata: "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-200",
  errore: "bg-rose-100 text-rose-950 dark:bg-rose-900/60 dark:text-rose-200",
  interrotta: "bg-rose-100 text-rose-950 dark:bg-rose-900/60 dark:text-rose-200",
};

export function StatoAttivitaBadge({ stato, animato = false }: { stato: StatoAttivita; animato?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", toni[stato])}>
      <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
        {animato && stato === "in_corso" && <span className="absolute inset-0 rounded-full bg-current opacity-50 motion-safe:animate-ping" />}
        <span className="relative size-full rounded-full bg-current" />
      </span>
      {STATI_AI[stato]}
    </span>
  );
}

function TempoAttivita({ attivita, adesso, inCorso }: { attivita: AttivitaAi; adesso: number; inCorso: boolean }) {
  const [ora, setOra] = useState(adesso);
  useEffect(() => {
    if (!inCorso) return;
    const timer = window.setInterval(() => setOra(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [inCorso]);
  return <dd className="mt-1 font-semibold tabular-nums">{durataAttivita(attivita, inCorso ? Math.max(ora, adesso) : adesso)}</dd>;
}

export function AiAgentPipeline({ attivita, adesso, disponibile, azione }: {
  attivita?: AttivitaAi;
  adesso: number;
  disponibile: boolean;
  azione?: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const riduciMovimento = useReducedMotion();

  if (!attivita) return (
    <section aria-labelledby={id} className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Activity className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
      <h3 id={id} className="text-sm font-semibold">{disponibile ? t("Dettaglio attività") : t("Registro non disponibile")}</h3>
      {disponibile && <p className="mt-1 text-sm text-muted-foreground">{t("Scegli un’attività per vedere i passaggi.")}</p>}
    </section>
  );

  const stato = statoAttivita(attivita, adesso);
  const fase = faseAttivita(attivita.fase);
  const raggiunte = new Set(attivita.passaggi.map(p => faseAttivita(p.fase).tratto));
  const passaggi = attivita.passaggi.map((passo, indice) => ({
    ...passo, chiave: [passo.fase, passo.at, indice].join("-"),
  })).reverse();

  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 id={id} className="text-base font-semibold tracking-tight">{nomeAttivita(attivita)}</h3>
          <StatoAttivitaBadge stato={stato} animato />
        </div>
        {azione}
      </header>

      <div className="border-b bg-muted/30 px-4 pb-4 pt-3.5 sm:px-5">
        <div aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={[attivita.id, attivita.fase, stato].join("-")}
              initial={riduciMovimento ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={riduciMovimento ? undefined : { opacity: 0 }}
              transition={{ duration: riduciMovimento ? 0 : 0.16, ease: "easeOut" }}
              className="text-lg font-semibold leading-snug tracking-tight sm:text-xl"
            >
              {stato === "interrotta" ? t("Aggiornamenti interrotti") : fase.testo}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="relative mt-4">
          <div aria-hidden="true" className="absolute inset-x-[16.666%] top-[1.125rem] h-px bg-border">
            <motion.div className="h-full origin-left bg-primary/60" initial={false}
              animate={{ scaleX: fase.tratto / 2 }} transition={{ duration: riduciMovimento ? 0 : 0.22, ease: "easeOut" }} />
          </div>
          <ol aria-label={t("Fasi della richiesta")} className="relative grid grid-cols-3 text-center">
            {fasi.map(({ nome, Icona }, indice) => {
              const corrente = indice === fase.tratto;
              const conclusa = indice < fase.tratto && raggiunte.has(indice as 0 | 1 | 2);
              return (
                <li key={nome} aria-current={corrente ? "step" : undefined} className="flex flex-col items-center gap-1.5">
                  <span className={cn("grid size-9 place-items-center rounded-full border bg-card text-muted-foreground",
                    conclusa && "border-primary/30 text-primary", corrente && cn("border-transparent", toni[stato]))}>
                    {conclusa ? <Check className="size-4" aria-label={t("Passaggio completato")} />
                      : <Icona className="size-4" aria-hidden="true" />}
                  </span>
                  <span className={cn("text-xs text-muted-foreground", corrente && "font-semibold text-foreground")}>{t(nome)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b px-4 py-3 text-xs sm:px-5">
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-muted-foreground"><UserRound className="size-3.5" aria-hidden="true" /> {t("Avviata da")}</dt>
          <dd className="mt-1 truncate font-semibold" title={nomeAttore(attivita)}>{nomeAttore(attivita)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="size-3.5" aria-hidden="true" /> {t("Tempo trascorso")}</dt>
          <TempoAttivita attivita={attivita} adesso={adesso} inCorso={stato === "in_corso"} />
        </div>
        {attivita.modello && (
          <div className="col-span-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="flex items-center gap-1.5 text-muted-foreground"><Cpu className="size-3.5" aria-hidden="true" /> {t("Ultimo motore usato")}</dt>
            <dd className="break-all font-medium">{attivita.modello === "regole" ? t("Regole del gestionale") : attivita.modello}</dd>
          </div>
        )}
      </dl>
      {attivita.lotti && (
        <div className="border-b px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-semibold tabular-nums">{t("{completati} su {totale} lotti completati", { completati: String(attivita.lotti.completati ?? ""), totale: String(attivita.lotti.totale ?? "") })}</p>
          <Progress aria-label={t("Avanzamento della riconciliazione")} className="h-1.5"
            indicatorClassName="motion-reduce:transition-none"
            value={100 * attivita.lotti.completati / attivita.lotti.totale} />
        </div>
      )}
      <div className="px-4 pb-3 pt-3.5 sm:px-5">
        <h4 className="mb-2 text-sm font-semibold">{t("Cronologia")}</h4>
        <ol className="max-h-[16rem] divide-y overflow-y-auto overscroll-contain">
          {passaggi.map((passo, indice) => (
            <li key={passo.chiave} className="flex items-start gap-2 py-2 text-xs">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40", indice === 0 && "bg-primary")} aria-hidden="true" />
              <span className={cn("min-w-0 flex-1 leading-relaxed", indice === 0 && "font-semibold")}>{faseAttivita(passo.fase).testo}</span>
              {passo.durata_ms != null && (
                <span className="shrink-0 rounded bg-muted px-1.5 font-medium tabular-nums leading-relaxed"
                  title={t("Durata del passaggio")}>{durataPassaggio(passo.durata_ms)}</span>
              )}
              <time className="shrink-0 tabular-nums leading-relaxed text-muted-foreground" dateTime={passo.at}>{oraAttivita(passo.at)}</time>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
