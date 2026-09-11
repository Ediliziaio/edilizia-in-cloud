/**
 * Una campagna WhatsApp Locale mostrata come le sequenze email: riga compatta
 * (nome, stato, passi, numeri, azioni) che si apre sul FLUSSO — primo
 * messaggio e follow-up in timeline, con l'attesa tra un passo e l'altro — e
 * sulle REGOLE che lo governano (numeri, orari, ritmo, cosa succede se il
 * contatto risponde).
 *
 * Solo presentazione: dati e azioni arrivano dalla pagina, che resta la sola
 * a parlare con il database per scrivere.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, MessageSquare, Clock, Users, Pencil, FlaskConical, Copy,
  KanbanSquare, Trash2, AlertTriangle, RotateCcw, Sparkles, CalendarClock, Smartphone,
  Reply, Gauge, Braces,
} from "lucide-react";
import { TimelineStartCap } from "@/components/admin/outreach/SequenceTimeline";
import { CH_ACCENT } from "@/components/admin/outreach/sequenceShared";
import { RegoleRisposta } from "./RegoleRisposta";
import { useRegoleCampagna } from "./useRegoleCampagna";

export interface CampagnaRiepilogo {
  id: string;
  nome: string;
  stato: string;
  totali: number;
  da_inviare: number;
  inviati: number;
  followup_inviati: number;
  risposti: number;
  saltati: number;
  falliti: number;
  created_at: string;
  avviata_at: string | null;
}

export interface CampagnaTesti {
  nome: string;
  messaggio: string;
  messaggio_b: string | null;
  followup_messaggio: string | null;
  followup_dopo_giorni: number;
  followup2_messaggio: string | null;
  followup2_dopo_giorni: number;
  followup3_messaggio: string | null;
  followup3_dopo_giorni: number;
  ai_personalizza: boolean;
  ai_istruzioni: string | null;
  parte_il: string | null;
  orario_da: number | null;
  orario_a: number | null;
  giorni_settimana: number[] | null;
  scadenza_il: string | null;
  max_al_giorno: number | null;
  variabili: Record<string, string> | null;
  stop_se_risponde: boolean | null;
  tags_numeri?: string[] | null;
}

export interface NumeroWa {
  id: string;
  numero: string | null;
  display_name: string | null;
  stato: string;
  tags?: string[] | null;
}

const STATO_LABEL: Record<string, string> = {
  bozza: "Bozza", in_corso: "In corso", in_pausa: "In pausa", completata: "Completata", annullata: "Annullata",
};
const STATO_DOT: Record<string, string> = {
  bozza: "bg-muted-foreground/40", in_corso: "bg-emerald-500", in_pausa: "bg-amber-500",
  completata: "bg-blue-500", annullata: "bg-muted-foreground/30",
};
const GIORNI: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mer", 4: "Gio", 5: "Ven", 6: "Sab", 7: "Dom" };

interface Passo { testo: string; varianteB: string | null; attesa: number; giorno: number }

/**
 * I passi del flusso nell'ordine in cui partono. Il motore conta ogni
 * follow-up dal messaggio PRECEDENTE (primo +2, poi +4, poi +7 = giorni 0, 2,
 * 6, 13), quindi il giorno di ogni passo è la somma delle attese.
 */
function passiDi(t: CampagnaTesti | undefined): Passo[] {
  if (!t) return [];
  const out: Passo[] = [{ testo: t.messaggio ?? "", varianteB: t.messaggio_b, attesa: 0, giorno: 0 }];
  const follow: Array<[string | null, number]> = [
    [t.followup_messaggio, t.followup_dopo_giorni],
    [t.followup2_messaggio, t.followup2_dopo_giorni],
    [t.followup3_messaggio, t.followup3_dopo_giorni],
  ];
  let giorno = 0;
  for (const [testo, attesa] of follow) {
    if (!testo?.trim()) break; // senza il follow-up N non esiste l'N+1
    giorno += Math.max(0, attesa ?? 0);
    out.push({ testo, varianteB: null, attesa: Math.max(0, attesa ?? 0), giorno });
  }
  return out;
}

/** Opzioni di stato ammesse da quello attuale: annullare è un gesto a parte. */
function statiAmmessi(stato: string): string[] {
  if (stato === "bozza") return ["bozza", "in_corso"];
  if (stato === "in_corso") return ["in_corso", "in_pausa", "annullata"];
  if (stato === "in_pausa") return ["in_pausa", "in_corso", "annullata"];
  return [stato];
}

const ETICHETTA_SCELTA: Record<string, Record<string, string>> = {
  bozza: { in_corso: "Avvia" },
  in_pausa: { in_corso: "Riprendi" },
};

export function CampagnaFlusso({
  c, t, numeri, capacitaGiorno, aperta, onToggle,
  onDestinatari, onStato, onModifica, onProva, onDuplica, onPipeline, onRisposte,
  onProblemi, onRiprova, onElimina, inCorso,
}: {
  c: CampagnaRiepilogo;
  t?: CampagnaTesti;
  numeri: NumeroWa[];
  capacitaGiorno: number;
  aperta: boolean;
  onToggle: () => void;
  onDestinatari: () => void;
  onStato: (stato: string) => void;
  onModifica: () => void;
  onProva: () => void;
  onDuplica: () => void;
  onPipeline: () => void;
  onRisposte: () => void;
  onProblemi: () => void;
  onRiprova: () => void;
  onElimina: () => void;
  inCorso: { duplica: boolean; stato: boolean; riprova: boolean; elimina: boolean };
}) {
  const passi = passiDi(t);
  const contattati = c.inviati + c.followup_inviati + c.risposti;
  const replyRate = contattati > 0 ? Math.round((c.risposti / contattati) * 100) : 0;
  const modificabile = c.stato === "bozza" || c.stato === "in_pausa";
  const ammessi = statiAmmessi(c.stato);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onToggle} aria-label={aperta ? "Comprimi" : "Apri il flusso"}
          >
            {aperta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <button className="truncate text-left text-base font-semibold" onClick={onToggle}>{c.nome}</button>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", STATO_DOT[c.stato] ?? STATO_DOT.bozza)} />
                {STATO_LABEL[c.stato] ?? c.stato}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{passi.length || 1} step</span>
              <span className="hidden items-center gap-1 sm:inline-flex" title="Passi del flusso, in ordine">
                {Array.from({ length: passi.length || 1 }).map((_, i) => (
                  <span key={i} className={cn("flex h-5 w-5 items-center justify-center rounded-md", CH_ACCENT.whatsapp.wrap, CH_ACCENT.whatsapp.text)}>
                    <MessageSquare className="h-3 w-3" />
                  </span>
                ))}
              </span>
              {t?.messaggio_b && <Badge variant="outline" className="text-[10px]">A/B</Badge>}
              {t?.ai_personalizza && <Badge variant="outline" className="text-[10px] text-violet-700 dark:text-violet-400">AI</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip valore={c.totali} etichetta="destinatari" />
              <Chip valore={c.da_inviare} etichetta="in coda" tono="attivo" />
              <Chip valore={contattati} etichetta="contattati" />
              {c.risposti > 0 ? (
                <button onClick={onRisposte} title="Apri le risposte">
                  <Chip valore={c.risposti} etichetta="risposte" tono="buono" cliccabile />
                </button>
              ) : <Chip valore={0} etichetta="risposte" tono="buono" />}
              <Chip valore={`${replyRate}%`} etichetta="reply rate" tono="buono" />
              {c.falliti > 0 && (
                <button onClick={onProblemi} title="Vedi cosa è andato storto">
                  <Chip valore={c.falliti} etichetta="falliti" tono="rosso" cliccabile />
                </button>
              )}
              {c.saltati > 0 && (
                <button onClick={onProblemi} title="Vedi perché sono stati saltati">
                  <Chip valore={c.saltati} etichetta="saltati" tono="spento" cliccabile />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onDestinatari} title="Aggiungi destinatari da un filtro sui contatti">
            <Users className="h-3.5 w-3.5" /> Destinatari
          </Button>
          <Select value={c.stato} onValueChange={onStato} disabled={ammessi.length === 1 || inCorso.stato}>
            <SelectTrigger className="h-8 w-[112px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ammessi.map((s) => (
                <SelectItem key={s} value={s} disabled={s === "in_corso" && c.stato === "bozza" && c.totali === 0}>
                  {s === c.stato ? STATO_LABEL[s] ?? s : ETICHETTA_SCELTA[c.stato]?.[s] ?? (s === "annullata" ? "Annulla…" : STATO_LABEL[s] ?? s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {modificabile && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Modifica testi e regole" onClick={onModifica}><Pencil className="h-3.5 w-3.5" /></Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Prova: mandalo prima a te" onClick={onProva}><FlaskConical className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Pipeline: destinatari ed esiti su una bacheca" onClick={onPipeline}><KanbanSquare className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Duplica: stessi testi e regole, senza destinatari" disabled={inCorso.duplica} onClick={onDuplica}><Copy className="h-3.5 w-3.5" /></Button>
          {c.stato === "bozza" && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title="Elimina bozza" disabled={inCorso.elimina} onClick={onElimina}><Trash2 className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </div>

      {aperta && (
        <div className="grid gap-4 border-t border-border bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <Flusso c={c} t={t} passi={passi} onModifica={modificabile ? onModifica : undefined} />
            <RegoleRisposta campagnaId={c.id} stopSeRisponde={t?.stop_se_risponde !== false} />
          </div>
          <Regole c={c} t={t} numeri={numeri} capacitaGiorno={capacitaGiorno} onRiprova={onRiprova} riprovaInCorso={inCorso.riprova} />
        </div>
      )}
    </div>
  );
}

/** Chip numerico, stesso stile dei numeri delle sequenze email. */
function Chip({ valore, etichetta, tono = "base", cliccabile = false }: {
  valore: number | string; etichetta: string; tono?: "base" | "attivo" | "buono" | "rosso" | "spento"; cliccabile?: boolean;
}) {
  const cls = tono === "buono" ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400"
    : tono === "attivo" ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-400"
    : tono === "rosso" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
    : tono === "spento" ? "bg-muted text-muted-foreground"
    : "bg-card";
  return (
    <span className={cn("rounded-md border px-2 py-1 text-[11px] tabular-nums", cls, cliccabile && "underline-offset-2 hover:underline")}>
      <span className="font-semibold">{typeof valore === "number" ? valore.toLocaleString("it-IT") : valore}</span>{" "}
      <span className="opacity-70">{etichetta}</span>
    </span>
  );
}

/** Quanti destinatari sono fermi dopo ogni passo, contati solo a flusso aperto. */
function useFermiPerPasso(campagnaId: string) {
  return useQuery({
    queryKey: ["openwa-campagna-passi", campagnaId],
    staleTime: 30_000,
    queryFn: async () => {
      const conta = async (stato: string) => {
        const { count, error } = await supabase.from("openwa_campagna_destinatari")
          .select("id", { count: "exact", head: true }).eq("campagna_id", campagnaId).eq("stato", stato);
        if (error) throw error;
        return count ?? 0;
      };
      const [p1, p2, p3, p4] = await Promise.all(["inviato", "followup_inviato", "followup2_inviato", "followup3_inviato"].map(conta));
      return [p1, p2, p3, p4];
    },
  });
}

function Flusso({ c, t, passi, onModifica }: { c: CampagnaRiepilogo; t?: CampagnaTesti; passi: Passo[]; onModifica?: () => void }) {
  const fermi = useFermiPerPasso(c.id);
  const partenza = t?.parte_il && new Date(t.parte_il) > new Date()
    ? `Parte il ${new Date(t.parte_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
    : c.avviata_at ? `Avviata il ${new Date(c.avviata_at).toLocaleDateString("it-IT")}` : "Parte quando la avvii";
  const stopSeRisponde = t?.stop_se_risponde !== false;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flusso</span>
        <span className="text-[10px] text-muted-foreground">
          {onModifica ? "clicca un passo per modificarlo" : "i testi si modificano solo in bozza o in pausa"}
        </span>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <TimelineStartCap label={partenza} />
        {passi.length === 0 ? (
          <p className="py-3 pl-[66px] text-xs text-muted-foreground">Testi in caricamento…</p>
        ) : passi.map((p, i) => (
          <div key={i}>
            <Attesa etichetta={i === 0 ? "Al primo giro utile, nella fascia oraria" : `Attendi ${p.attesa} ${p.attesa === 1 ? "giorno" : "giorni"}${stopSeRisponde ? " · solo se non ha risposto" : ""}`} />
            <PassoCard passo={p} indice={i} fermi={fermi.data?.[i]} ultimo={i === passi.length - 1} onModifica={onModifica} />
          </div>
        ))}
        <div className="relative flex items-center gap-3 pt-2">
          <span className="absolute left-[27px] top-[-4px] h-3 w-px bg-border" aria-hidden />
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
              <Reply className="h-4 w-4" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Fine flusso</p>
            <p className="text-[11px] text-muted-foreground">
              {stopSeRisponde
                ? "Chi risponde, in qualsiasi momento, esce dal flusso: cosa succede dopo lo decidono le regole qui sotto. Chi non risponde esce dopo l'ultimo passo."
                : "Chi risponde continua a ricevere i follow-up, salvo le regole qui sotto. Esce dopo l'ultimo passo."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Connettore tra due passi: l'attesa e la condizione per proseguire. */
function Attesa({ etichetta }: { etichetta: string }) {
  return (
    <div className="relative flex h-9 items-center justify-center">
      <span className="absolute left-[27px] top-0 h-full w-px bg-border" aria-hidden />
      <div className="relative z-10 pl-[27px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
          <Clock className="h-3 w-3" /> {etichetta}
        </span>
      </div>
    </div>
  );
}

function PassoCard({ passo, indice, fermi, ultimo, onModifica }: {
  passo: Passo; indice: number; fermi?: number; ultimo: boolean; onModifica?: () => void;
}) {
  const [tutto, setTutto] = useState(false);
  const accent = CH_ACCENT.whatsapp;
  const titolo = indice === 0 ? "Primo messaggio" : `Follow-up ${indice}`;
  const corpo = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Step {indice + 1}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titolo}</span>
        <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
          <Clock className="h-3 w-3" />{passo.giorno === 0 ? "Giorno 0" : `Giorno ${passo.giorno}`}
        </Badge>
        {passo.varianteB && <Badge variant="outline" className="text-[10px]">A/B</Badge>}
        {typeof fermi === "number" && fermi > 0 && (
          <span className="text-[11px] text-muted-foreground" title="Destinatari che hanno ricevuto questo passo e aspettano il successivo (o hanno finito)">
            {fermi.toLocaleString("it-IT")} {ultimo ? "hanno finito il flusso" : "arrivati qui"}
          </span>
        )}
      </div>
      <p className={cn("mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground", !tutto && "line-clamp-3")}>
        {passo.testo.trim() || <span className="italic">Nessun testo</span>}
      </p>
      {passo.varianteB && (
        <div className="mt-2 rounded-md border border-dashed border-border p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variante B</p>
          <p className={cn("mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground", !tutto && "line-clamp-2")}>{passo.varianteB}</p>
        </div>
      )}
    </>
  );
  return (
    <div className="group relative flex gap-3">
      <div className="relative flex w-[54px] shrink-0 flex-col items-center">
        <span className="absolute left-1/2 top-[44px] h-[calc(100%-44px+0.5rem)] w-px -translate-x-1/2 bg-border" aria-hidden />
        <div className={cn("flex h-[44px] w-[44px] items-center justify-center rounded-xl", accent.wrap, accent.text)}>
          <MessageSquare className="h-[18px] w-[18px]" />
        </div>
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-primary/30">
        {onModifica ? (
          <button type="button" className="w-full text-left" onClick={onModifica} title="Modifica testi e regole">{corpo}</button>
        ) : corpo}
        {passo.testo.length > 180 && (
          <button type="button" className="mt-1.5 text-[11px] font-medium text-primary hover:underline" onClick={() => setTutto((v) => !v)}>
            {tutto ? "Mostra meno" : "Leggi tutto"}
          </button>
        )}
      </div>
    </div>
  );
}

function Regole({ c, t, numeri, capacitaGiorno, onRiprova, riprovaInCorso }: {
  c: CampagnaRiepilogo; t?: CampagnaTesti; numeri: NumeroWa[]; capacitaGiorno: number;
  onRiprova: () => void; riprovaInCorso: boolean;
}) {
  const tag = t?.tags_numeri ?? [];
  const suoiNumeri = tag.length ? numeri.filter((n) => (n.tags ?? []).some((x) => tag.includes(x))) : numeri;
  const quando = [
    t?.giorni_settimana?.length ? t.giorni_settimana.map((g) => GIORNI[g]).filter(Boolean).join(" ") : null,
    t?.orario_da != null || t?.orario_a != null ? `ore ${t?.orario_da ?? 8}–${t?.orario_a ?? 21}` : null,
  ].filter(Boolean).join(" · ");
  const variabili = Object.entries(t?.variabili ?? {});
  const giorniAllaFine = c.stato === "in_corso" && c.da_inviare > 0 && capacitaGiorno > 0 ? Math.ceil(c.da_inviare / capacitaGiorno) : null;
  const regoleAccese = (useRegoleCampagna(c.id).data ?? []).filter((r) => r.enabled).length;

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Regole</span>
      <div className="divide-y divide-border rounded-xl border border-border bg-card text-xs">
        <Regola icona={Smartphone} titolo="Numeri">
          {suoiNumeri.length === 0 ? (
            <span className="text-amber-700 dark:text-amber-400">Nessun numero con {tag.length ? `il tag ${tag.join(", ")}` : "questa regola"}: la campagna non può partire.</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {suoiNumeri.map((n) => (
                <span key={n.id} className={cn("rounded px-1.5 py-0.5 text-[11px]",
                  n.stato === "connected" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400")}>
                  {n.display_name || n.numero || "numero"}{n.stato !== "connected" ? " · non connesso" : ""}
                </span>
              ))}
            </span>
          )}
        </Regola>
        <Regola icona={CalendarClock} titolo="Quando">
          {quando || "Finestra anti-ban di piattaforma"}
          {t?.parte_il && new Date(t.parte_il) > new Date() && <> · parte il {new Date(t.parte_il).toLocaleDateString("it-IT")}</>}
          {t?.scadenza_il && <> · scade il {new Date(t.scadenza_il).toLocaleDateString("it-IT")}</>}
        </Regola>
        <Regola icona={Gauge} titolo="Ritmo">
          {t?.max_al_giorno ? `Al massimo ${t.max_al_giorno} al giorno per questa campagna` : "Senza tetto proprio"}; il resto lo decidono warm-up e tetti dei numeri.
          {giorniAllaFine !== null && <> Al ritmo attuale finisce in ≈ {giorniAllaFine} {giorniAllaFine === 1 ? "giorno" : "giorni"}.</>}
        </Regola>
        <Regola icona={Reply} titolo="Se risponde">
          {t?.stop_se_risponde !== false ? "Esce dal flusso: niente follow-up a chi ha già risposto." : "Continua a ricevere i follow-up."}
          {" "}{regoleAccese > 0
            ? `${regoleAccese} ${regoleAccese === 1 ? "regola decide" : "regole decidono"} bacheca, etichette e risposte.`
            : "Nessuna regola sulle risposte."}
        </Regola>
        <Regola icona={Sparkles} titolo="Personalizzazione AI">
          {t?.ai_personalizza ? (t.ai_istruzioni?.trim() ? <span className="line-clamp-3">{t.ai_istruzioni}</span> : "Attiva") : "Spenta: parte il testo così com'è."}
        </Regola>
        {variabili.length > 0 && (
          <Regola icona={Braces} titolo="Variabili">
            <span className="flex flex-wrap gap-1">
              {variabili.map(([k, v]) => <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{`{{${k}}}`} = {v}</span>)}
            </span>
          </Regola>
        )}
        {c.falliti > 0 && (
          <Regola icona={AlertTriangle} titolo="Invii falliti">
            <span className="flex flex-wrap items-center gap-2">
              {c.falliti.toLocaleString("it-IT")} non partiti dopo 5 tentativi.
              <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" disabled={riprovaInCorso} onClick={onRiprova}>
                <RotateCcw className="h-3 w-3" /> Rimetti in coda
              </Button>
            </span>
          </Regola>
        )}
      </div>
    </div>
  );
}

function Regola({ icona: Icona, titolo, children }: { icona: typeof Clock; titolo: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 p-3">
      <Icona className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground">{titolo}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
