/**
 * Pipeline di UNA campagna cold: dove si trovano adesso i suoi contatti.
 *
 *   Nel flusso   Da contattare → Email 1 → … → Email N → Flusso finito
 *   Risposte     Interessati · Domande · Altre risposte · Non interessati
 *   Usciti       Rimbalzate · Disiscritti · Fermati
 *
 * Ogni colonna si apre sull'elenco dei suoi contatti (con ricerca e pagine):
 * numeri ed elenco vengono dalla stessa definizione di fase nel database
 * (outreach_campagna_iscrizioni), quindi non possono non tornare.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight, Clock, Search, Loader2, Mail, MessageSquareReply, LogOut, Users, Send, ArrowUpRight,
  ChevronLeft, CalendarClock, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OutreachConvertContactDialog } from "../OutreachConvertContactDialog";
import {
  costruisciFasi, faseIniziale, percentuale, numeroPasso, type FaseVista, type TonoFase,
} from "./campagneFasi";
import {
  useCampagnaFasi, useCampagnaPassi, useCampagnaContatti, CONTATTI_PER_PAGINA,
  type CampagnaRiepilogo, type ContattoCampagna,
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
  send_failed: "Invio non riuscito",
  send_rejected: "Rifiutato dal server del destinatario",
  optout_email: "Ha chiesto di non ricevere email",
  "Risposta del destinatario": "Ha risposto",
};

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function dataBreve(iso: string | null | undefined, conOra = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const g = `${GIORNI[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
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

export function CampagnaPipeline({ companyId, campagna }: { companyId: string; campagna: CampagnaRiepilogo }) {
  const fasiQ = useCampagnaFasi(companyId, campagna.sequence_id);
  const passiQ = useCampagnaPassi(campagna.sequence_id);
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

  if (fasiQ.error || passiQ.error) {
    return (
      <Card><CardContent className="p-5 text-sm text-muted-foreground">
        Non riesco a leggere la pipeline di questa campagna. Riprova tra poco.
      </CardContent></Card>
    );
  }

  return (
    <div className={cn("space-y-4 transition-opacity", fasiQ.isFetching && !fasiQ.isLoading && "opacity-80")}>
      {/* Il colpo d'occhio: quanti, quanto avanti, quante risposte. */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
        <Numero icona={Users} valore={iscritti} etichetta="iscritti" />
        <Numero icona={Send} valore={contattati} etichetta={`contattati · ${percentuale(contattati, iscritti)}`} />
        <Numero icona={MessageSquareReply} valore={totRisposte} etichetta={`risposte · ${percentuale(totRisposte, contattati)} dei contattati`} />
        <Numero icona={Sparkles} valore={caldi} etichetta="interessati o con domande" />
        {campagna.ultimo_programmato && (
          <div className="ml-auto text-right text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> ultimo invio in programma</span>
            <div className="text-sm font-semibold text-foreground">{dataBreve(campagna.ultimo_programmato, false)}</div>
          </div>
        )}
      </div>

      {/* NEL FLUSSO — le colonne in fila, nell'ordine in cui le attraversa un contatto. */}
      <section aria-label="Nel flusso" className="space-y-2">
        <Intestazione icona={Mail} titolo="Nel flusso" nota="dove si trova adesso ogni contatto: «Email 2» = ha ricevuto la seconda e aspetta la terza" />
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-stretch gap-1">
            {flusso.map((f, i) => (
              <div key={f.chiave} className="flex items-stretch gap-1">
                {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/40" aria-hidden />}
                <Tessera f={f} iscritti={iscritti} attiva={attiva === f.chiave} onClick={() => setScelta(f.chiave)} caricamento={!pronta} adesso={adesso} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)]">
        <section aria-label="Hanno risposto" className="space-y-2">
          <Intestazione icona={MessageSquareReply} titolo="Hanno risposto" nota={totRisposte ? `${totRisposte.toLocaleString("it-IT")} in tutto` : "escono dal flusso e finiscono qui"} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {risposte.map((f) => (
              <Tessera key={f.chiave} f={f} iscritti={iscritti} attiva={attiva === f.chiave} onClick={() => setScelta(f.chiave)} caricamento={!pronta} adesso={adesso} largo />
            ))}
          </div>
        </section>
        <section aria-label="Usciti dal flusso" className="space-y-2">
          <Intestazione icona={LogOut} titolo="Usciti dal flusso" nota={totUscite ? `${totUscite.toLocaleString("it-IT")} in tutto` : "nessuno, per ora"} />
          <div className="grid grid-cols-3 gap-2">
            {uscite.map((f) => (
              <Tessera key={f.chiave} f={f} iscritti={iscritti} attiva={attiva === f.chiave} onClick={() => setScelta(f.chiave)} caricamento={!pronta} adesso={adesso} largo />
            ))}
          </div>
        </section>
      </div>

      {faseAttiva && (
        <ElencoContatti
          key={`${campagna.sequence_id}-${faseAttiva.chiave}`}
          companyId={companyId}
          sequenceId={campagna.sequence_id}
          fase={faseAttiva}
          nPassi={passiQ.data?.length ?? 0}
          adesso={adesso}
        />
      )}
    </div>
  );
}

function Numero({ icona: Icona, valore, etichetta }: { icona: typeof Users; valore: number; etichetta: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icona className="h-4 w-4" /></span>
      <div>
        <div className="text-xl font-semibold leading-tight text-foreground">{valore.toLocaleString("it-IT")}</div>
        <div className="text-[11px] text-muted-foreground">{etichetta}</div>
      </div>
    </div>
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

function Tessera({ f, iscritti, attiva, onClick, caricamento, adesso, largo = false }: {
  f: FaseVista; iscritti: number; attiva: boolean; onClick: () => void; caricamento: boolean; adesso: number; largo?: boolean;
}) {
  const tono = TONO[f.tono];
  const quota = iscritti > 0 && f.contatti > 0 ? Math.max(3, Math.round((f.contatti / iscritti) * 100)) : 0;
  const vuota = f.contatti === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={cn(
        "flex flex-col rounded-xl border bg-card p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        largo ? "min-w-0" : "w-[148px] shrink-0",
        attiva ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
        vuota && !attiva && "bg-card/60",
      )}
    >
      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.titolo}</span>
      <span className={cn("mt-1 text-2xl font-semibold leading-none", vuota ? "text-muted-foreground/50" : "text-foreground")}>
        {caricamento ? "…" : f.contatti.toLocaleString("it-IT")}
      </span>
      <span className="mt-1 text-[11px] text-muted-foreground">{percentuale(f.contatti, iscritti)} degli iscritti</span>
      <span className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", tono.barra)} style={{ width: `${quota}%` }} />
      </span>
      <span className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{f.sottotitolo}</span>
      {f.contatti > 0 && f.prossimoInvio && f.gruppo === "flusso" && (
        <span className="mt-1.5 inline-flex items-start gap-1 text-[11px] leading-snug text-foreground/80">
          <Clock className="mt-0.5 h-3 w-3 shrink-0" /> prossimo: {prossimo(f.prossimoInvio, adesso)}
        </span>
      )}
      {f.chiave === "da_contattare" && f.contatti > 0 && f.ultimoProgrammato && (
        <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">tutti entro {dataBreve(f.ultimoProgrammato, false)}</span>
      )}
      {f.inPausa > 0 && <Badge variant="outline" className="mt-1.5 w-fit text-[10px]">{f.inPausa} in pausa</Badge>}
    </button>
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
  const da = totale === 0 ? 0 : pagina * CONTATTI_PER_PAGINA + 1;
  const a = Math.min(totale, (pagina + 1) * CONTATTI_PER_PAGINA);
  const passo = numeroPasso(fase.chiave);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", TONO[fase.tono].chip)}>{fase.titolo}</span>
            <span className="text-sm font-semibold text-foreground">{fase.contatti.toLocaleString("it-IT")} contatti</span>
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
                <Riga key={r.enrollment_id} r={r} gruppo={fase.gruppo} nPassi={Math.max(nPassi, passo ?? 0)} companyId={companyId} adesso={adesso} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totale > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{da.toLocaleString("it-IT")}–{a.toLocaleString("it-IT")} di {totale.toLocaleString("it-IT")}</span>
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

function Riga({ r, gruppo, nPassi, companyId, adesso }: { r: ContattoCampagna; gruppo: FaseVista["gruppo"]; nPassi: number; companyId: string; adesso: number }) {
  const titolo = r.azienda || r.nome || r.email || "Contatto";
  const sotto = [r.azienda && r.nome ? r.nome : null, r.email].filter(Boolean).join(" · ");
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
              <OutreachConvertContactDialog
                companyId={companyId}
                initialContactId={r.contact_id}
                trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs">Crea opportunità</Button>}
              />
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
