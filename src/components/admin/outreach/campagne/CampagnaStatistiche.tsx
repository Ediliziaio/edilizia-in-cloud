/**
 * Statistiche di una campagna cold (o di tutte): numeri onesti su chi è stato
 * contattato davvero, quale email fa rispondere, come stanno le caselle e
 * quando partono i prossimi invii.
 *
 * Scelte:
 *  - i tassi di risposta si calcolano sui CONTATTATI, non sulle email: 1
 *    risposta su 3 email alla stessa persona è 1 persona su 1;
 *  - le aperture si mostrano solo se la campagna le traccia: con il testo
 *    semplice senza pixel un «0% aperte» è falso, non basso;
 *  - il grafico giornaliero guarda indietro (inviate, fatti) E avanti (stima al
 *    ritmo vero delle caselle): la data scritta in coda è un minimo, non una
 *    promessa — con 45 email al giorno la coda diceva «tutti entro martedì».
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Send, MessageSquareReply, Sparkles, AlertTriangle, Timer, Users, Table2, BarChart3, Server, Trophy, CalendarClock,
  EyeOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCampagnaStatistiche, oggiRoma, type StatisticheCampagna, type CampagnaRiepilogo } from "./useCampagneOutreach";
import {
  percentuale, oggettoLeggibile, passoMigliore, etichettaCanale, STATO_CAMPAGNA, numero, giorniLeggibili, followupSchiacciati,
  type StimaTempi, type RitmoBrand,
} from "./campagneFasi";

type Stima = StimaTempi & { brand: RitmoBrand };

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const it = numero;

function dataCorta(iso: string | null | undefined, conOra = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // L'anno solo quando non è quello in corso: «gio 6 apr» di due anni dopo non si capiva.
  const anno = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  const g = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}${anno}`;
  return conOra ? `${g}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : g;
}

function ore(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${(Math.round(h * 10) / 10).toLocaleString("it-IT")} h`;
  return `${it(Math.round(h / 24))} giorni`;
}

const ESITO: Record<string, { etichetta: string; nota: string }> = {
  interessato: { etichetta: "Interessati", nota: "vogliono saperne di più" },
  domanda: { etichetta: "Domande", nota: "chiedono prezzi o dettagli" },
  non_interessato: { etichetta: "Non interessati", nota: "hanno detto di no" },
  disiscrizione: { etichetta: "Disiscrizioni", nota: "chiedono di non ricevere più" },
  altro: { etichetta: "Altro", nota: "da leggere" },
  da_classificare: { etichetta: "Da classificare", nota: "l'AI non le ha ancora lette" },
};

export function CampagnaStatistiche({ companyId, campagna, campagne, stime, onScegli }: {
  companyId: string;
  /** null = tutte le campagne */
  campagna: CampagnaRiepilogo | null;
  campagne: CampagnaRiepilogo[];
  /** stima dei tempi: una per la campagna, o una per brand nella panoramica */
  stime: Stima[];
  onScegli: (id: string) => void;
}) {
  const q = useCampagnaStatistiche(companyId, campagna?.sequence_id ?? null);

  if (q.isLoading) return <Scheletro />;
  if (q.error || !q.data) {
    return (
      <Card><CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" /> Non riesco a caricare le statistiche. Riprova tra poco.
      </CardContent></Card>
    );
  }
  return (
    <div className={cn("space-y-6 transition-opacity", q.isFetching && "opacity-80")}>
      <Contenuto s={q.data} campagna={campagna} campagne={campagne} stime={stime} onScegli={onScegli} />
    </div>
  );
}

function Contenuto({ s, campagna, campagne, stime, onScegli }: {
  s: StatisticheCampagna; campagna: CampagnaRiepilogo | null; campagne: CampagnaRiepilogo[]; stime: Stima[]; onScegli: (id: string) => void;
}) {
  const t = s.totali;
  const m = s.messaggi;
  const tassoRimbalzo = m.inviati ? t.rimbalzati / m.inviati : 0;

  return (
    <>
      {/* ── I numeri che contano ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tessera icona={Users} etichetta="Contattati" valore={it(t.contattati)}
          nota={`su ${it(t.iscritti)} iscritti · ${percentuale(t.contattati, t.iscritti)}`}
          quota={t.iscritti ? t.contattati / t.iscritti : 0} />
        <Tessera icona={MessageSquareReply} etichetta="Risposte" valore={it(t.risposte)}
          nota={`${percentuale(t.risposte, t.contattati)} dei contattati`} />
        <Tessera icona={Sparkles} etichetta="Interessati" valore={it(t.interessati)}
          nota={`con le domande · ${percentuale(t.interessati, t.contattati)}`} buono={t.interessati > 0} />
        <Tessera icona={Send} etichetta="Email inviate" valore={it(m.inviati)}
          nota={m.programmati ? `${it(m.programmati)} già in coda` : "nessuna in coda"} />
        <Tessera icona={AlertTriangle} etichetta="Rimbalzi" valore={it(t.rimbalzati)}
          nota={`${percentuale(t.rimbalzati, m.inviati)} degli invii${t.disiscritti ? ` · ${it(t.disiscritti)} disiscritti` : ""}`}
          allerta={tassoRimbalzo > 0.03} />
        <Tessera icona={Timer} etichetta="Tempo di risposta" valore={ore(m.ore_mediane_risposta)}
          nota="a metà di chi risponde, dalla prima email" />
      </div>
      {s.aperture_tracciate ? (
        <p className="-mt-3 px-0.5 text-[11px] text-muted-foreground">
          Aperture: {it(m.aperti)} · {percentuale(m.aperti, m.inviati)} delle email inviate.
        </p>
      ) : (
        <p className="-mt-3 inline-flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5" />
          Aperture non misurate: {campagna ? "questa campagna manda" : "le campagne mandano"} testo semplice senza pixel di tracciamento, per arrivare in Posta in arrivo.
        </p>
      )}

      <GraficoGiorni giorni={s.giorni} stime={stime} />

      <RendimentoPassi s={s} ramificata={campagna?.ramificata ?? !campagna} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Esiti s={s} />
        <Caselle s={s} />
      </div>

      <RitmoETempi s={s} stime={stime} campagna={campagna} campagne={campagne} />

      {!campagna && campagne.length > 0 && <Confronto campagne={campagne} onScegli={onScegli} />}
    </>
  );
}

function Tessera({ icona: Icona, etichetta, valore, nota, quota, buono, allerta }: {
  icona: typeof Send; etichetta: string; valore: string; nota: string; quota?: number; buono?: boolean; allerta?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-3.5 shadow-sm", allerta ? "border-amber-300 dark:border-amber-800" : "border-border")}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icona className={cn("h-3.5 w-3.5", allerta && "text-amber-600")} /> {etichetta}
        {allerta && <span className="sr-only">(sopra il 3%: controlla la lista)</span>}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold leading-none", buono ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>{valore}</div>
      {quota != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-primary/15" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(quota > 0 ? 2 : 0, quota * 100))}%` }} />
        </div>
      )}
      <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{nota}</div>
    </div>
  );
}

function Riquadro({ icona: Icona, titolo, azioni, children, nota }: {
  icona: typeof Send; titolo: string; azioni?: ReactNode; children: ReactNode; nota?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icona className="h-4 w-4 text-muted-foreground" /> {titolo}
          </CardTitle>
          {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
        </div>
        {azioni}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ── Invii giorno per giorno: fatti (inviate) e stima (al ritmo delle caselle), risposte sotto ──

interface PuntoGiorno { giorno: string; etichetta: string; inviati: number; stima: number; risposte: number }

function GraficoGiorni({ giorni, stime }: { giorni: StatisticheCampagna["giorni"]; stime: Stima[] }) {
  const [tabella, setTabella] = useState(false);
  const oggi = oggiRoma();
  const dati: PuntoGiorno[] = useMemo(() => {
    // La stima arriva da stimaTempi (oggi compreso, quello che resta da spedire
    // oggi); nella panoramica si sommano i brand.
    const stimaPer = new Map<string, number>();
    for (const st of stime) for (const g of st.perGiorno) stimaPer.set(g.giorno, (stimaPer.get(g.giorno) ?? 0) + g.stima);
    return giorni.map((g) => {
      const d = new Date(`${g.giorno}T12:00:00`);
      return {
        giorno: g.giorno,
        etichetta: g.giorno === oggi ? "oggi" : `${GIORNI[d.getDay()]} ${d.getDate()}`,
        inviati: g.giorno <= oggi ? g.inviati : 0,
        stima: g.giorno >= oggi ? stimaPer.get(g.giorno) ?? 0 : 0,
        risposte: g.risposte,
      };
    });
  }, [giorni, stime, oggi]);
  const risposteTot = dati.reduce((s, d) => s + d.risposte, 0);
  const vuoto = dati.every((d) => !d.inviati && !d.stima);
  const conStima = stime.length > 0;

  return (
    <Riquadro
      icona={BarChart3}
      titolo="Invii giorno per giorno"
      nota={conStima
        ? "Le ultime due settimane come sono andate e le prossime due come andranno al ritmo delle caselle: giorni d'invio, tetti e warm-up compresi."
        : "Le ultime due settimane. Nessuna stima: la campagna è ferma o il brand non ha caselle attive."}
      azioni={
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setTabella((v) => !v)} aria-pressed={tabella}>
          {tabella ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {tabella ? "Grafico" : "Tabella"}
        </Button>
      }
    >
      {/* Colori dei grafici: validati per contrasto e daltonismo in chiaro e in scuro. */}
      <div className="[--serie-invii:#2563eb] [--serie-risposte:#059669] dark:[--serie-invii:#3b82f6]">
        {tabella ? (
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Giorno</th><th className="px-3 py-2 text-right">Inviate</th>
                  <th className="px-3 py-2 text-right">Stima</th><th className="py-2 pl-3 text-right">Risposte</th>
                </tr>
              </thead>
              <tbody>
                {dati.map((d) => (
                  <tr key={d.giorno} className={cn("border-b border-border/60", d.giorno === oggi && "bg-muted/40 font-medium")}>
                    <td className="py-1.5 pr-3">{dataCorta(`${d.giorno}T12:00:00`)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.giorno <= oggi ? it(d.inviati) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.giorno >= oggi && conStima ? it(d.stima) : "—"}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{d.giorno <= oggi ? it(d.risposte) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--serie-invii)]" /> Inviate</span>
              {conStima && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--serie-invii)] opacity-35" /> Stima dei prossimi giorni</span>}
            </div>
            <div className="relative">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={dati} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="etichetta" tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={10} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => it(v)} />
                  <Tooltip content={<SuggerimentoGiorno oggi={oggi} />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.6 }} />
                  <ReferenceLine x="oggi" stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
                  <Bar dataKey="inviati" name="Inviate" stackId="g" maxBarSize={22} fill="var(--serie-invii)"
                    shape={(p: unknown) => <BarraArrotondata {...(p as FormaBarra)} cima={!((p as FormaBarra).payload?.stima)} />} />
                  <Bar dataKey="stima" name="Stima" stackId="g" maxBarSize={22} fill="var(--serie-invii)"
                    shape={(p: unknown) => <BarraArrotondata {...(p as FormaBarra)} fillOpacity={0.35} cima stacco={!!(p as FormaBarra).payload?.inviati} />} />
                </BarChart>
              </ResponsiveContainer>
              {vuoto && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded-md bg-background/85 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">Nessun invio in questo periodo.</span>
                </div>
              )}
            </div>
            <div className="mt-3 border-t border-border pt-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--serie-risposte)]" /> Risposte
                <span className="text-muted-foreground/70">· {risposteTot ? `${it(risposteTot)} nelle ultime due settimane` : "nessuna nelle ultime due settimane"}</span>
              </div>
              <ResponsiveContainer width="100%" height={64}>
                <BarChart data={dati} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <XAxis dataKey="etichetta" hide />
                  <YAxis allowDecimals={false} width={44} tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickCount={2} tickFormatter={(v: number) => it(v)} />
                  <Tooltip content={<SuggerimentoGiorno oggi={oggi} />} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.6 }} />
                  <ReferenceLine x="oggi" stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
                  <Bar dataKey="risposte" name="Risposte" maxBarSize={22} fill="var(--serie-risposte)"
                    shape={(p: unknown) => <BarraArrotondata {...(p as FormaBarra)} cima />} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </Riquadro>
  );
}

interface FormaBarra { x?: number; y?: number; width?: number; height?: number; fill?: string; fillOpacity?: number; payload?: PuntoGiorno }

/** Barra con gli angoli superiori arrotondati (4px) e base dritta; «stacco» lascia 2px di superficie sotto. */
function BarraArrotondata({ x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, cima, stacco }: FormaBarra & { cima?: boolean; stacco?: boolean }) {
  const h = stacco ? height - 2 : height;
  if (h <= 0 || width <= 0) return null;
  const r = cima ? Math.min(4, width / 2, h) : 0;
  const d = `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + h} Z`;
  return <path d={d} fill={fill} fillOpacity={fillOpacity} />;
}

function SuggerimentoGiorno({ active, payload, oggi }: { active?: boolean; payload?: Array<{ payload: PuntoGiorno }>; oggi: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const futuro = d.giorno > oggi;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 text-muted-foreground">{dataCorta(`${d.giorno}T12:00:00`)}</div>
      {!futuro && <RigaSuggerimento colore="var(--serie-invii)" valore={d.inviati} etichetta="inviate" />}
      {d.giorno >= oggi && <RigaSuggerimento colore="var(--serie-invii)" chiaro valore={d.stima} etichetta={futuro ? "stimate" : "ancora da spedire oggi (stima)"} />}
      {!futuro && <RigaSuggerimento colore="var(--serie-risposte)" valore={d.risposte} etichetta={d.risposte === 1 ? "risposta" : "risposte"} />}
    </div>
  );
}

function RigaSuggerimento({ colore, chiaro, valore, etichetta }: { colore: string; chiaro?: boolean; valore: number; etichetta: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-0.5 w-3 rounded-full" style={{ background: colore, opacity: chiaro ? 0.4 : 1 }} aria-hidden />
      <span className="font-semibold tabular-nums text-foreground">{it(valore)}</span>
      <span className="text-muted-foreground">{etichetta}</span>
    </div>
  );
}

// ── Rendimento per email ──

function RendimentoPassi({ s, ramificata }: { s: StatisticheCampagna; ramificata: boolean }) {
  const passi = s.passi;
  const maxInviati = Math.max(1, ...passi.map((p) => p.inviati));
  const migliore = passoMigliore(passi);
  if (passi.length === 0) return null;

  return (
    <Riquadro
      icona={Trophy}
      titolo="Rendimento per email"
      nota="Una risposta conta per l'ultima email ricevuta prima di rispondere. «In attesa» = l'hanno ricevuta e aspettano la successiva."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Email</th>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Inviate</th>
              <th className="px-3 py-2 text-right">Risposte</th>
              <th className="px-3 py-2">Tasso di risposta</th>
              <th className="px-3 py-2 text-right">Interessati</th>
              <th className="px-3 py-2 text-right">Rimbalzi</th>
              <th className="py-2 pl-3 text-right">In attesa</th>
            </tr>
          </thead>
          <tbody>
            {passi.map((p) => {
              const ogg = oggettoLeggibile(p.oggetto);
              const tasso = p.inviati ? p.risposte / p.inviati : 0;
              const nonPartita = p.inviati === 0;
              return (
                <tr key={p.passo} className={cn("border-b border-border/60 last:border-0", nonPartita && "text-muted-foreground")}>
                  <td className="max-w-[320px] py-2.5 pr-3">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      {ramificata ? `Messaggio ${p.passo}` : `${etichettaCanale(p.canale)} ${p.passo}`}
                      {migliore === p.passo && <Badge className="border-transparent bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">fa rispondere di più</Badge>}
                    </div>
                    {!ramificata && (
                      <div className="truncate text-[11px] text-muted-foreground" title={p.oggetto ?? undefined}>
                        {ogg.testo}{ogg.varianti > 0 && ` · +${ogg.varianti} ${ogg.varianti === 1 ? "variante" : "varianti"}`}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{p.giorno != null ? `giorno ${p.giorno}` : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${p.inviati ? Math.max(3, (p.inviati / maxInviati) * 100) : 0}%` }} />
                      </div>
                      <span className="tabular-nums">{nonPartita ? "non ancora" : it(p.inviati)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it(p.risposte)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, tasso * 100 * 5)}%` }} />
                      </div>
                      <span className="tabular-nums">{percentuale(p.risposte, p.inviati)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it(p.interessati)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", p.rimbalzi > 0 && "text-amber-700 dark:text-amber-400")}>{it(p.rimbalzi)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{it(p.in_attesa)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">La barra del tasso è in scala 0–20%: oltre il 20% è piena.</p>
    </Riquadro>
  );
}

// ── Esiti delle risposte ──

function Esiti({ s }: { s: StatisticheCampagna }) {
  const totale = s.esiti.reduce((a, e) => a + e.contatti, 0);
  const max = Math.max(1, ...s.esiti.map((e) => e.contatti));
  return (
    <Riquadro icona={MessageSquareReply} titolo="Com'è andata con chi ha risposto"
      nota={totale ? `${it(totale)} ${totale === 1 ? "persona ha" : "persone hanno"} risposto; l'AI legge ogni risposta e la classifica.` : undefined}>
      {totale === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Ancora nessuna risposta. Le autorisposte (fuori ufficio, no-reply) non contano.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {s.esiti.map((e) => {
            const info = ESITO[e.esito] ?? { etichetta: e.esito, nota: "" };
            return (
              <li key={e.esito}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{info.etichetta} <span className="text-xs font-normal text-muted-foreground">{info.nota}</span></span>
                  <span className="tabular-nums text-foreground">{it(e.contatti)} <span className="text-xs text-muted-foreground">· {percentuale(e.contatti, totale)}</span></span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-[#059669]" style={{ width: `${(e.contatti / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Riquadro>
  );
}

// ── Caselle ──

function Caselle({ s }: { s: StatisticheCampagna }) {
  const conProgrammati = s.caselle.some((c) => c.programmati > 0);
  return (
    <Riquadro icona={Server} titolo="Caselle usate" nota="Da quale indirizzo partono le email e come rispondono i destinatari.">
      {s.caselle.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Nessuna email ancora partita.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Casella</th>
                <th className="px-3 py-2 text-right">Inviate</th>
                {conProgrammati && <th className="px-3 py-2 text-right">In programma</th>}
                <th className="px-3 py-2 text-right">Risposte</th>
                <th className="py-2 pl-3 text-right">Rimbalzi</th>
              </tr>
            </thead>
            <tbody>
              {s.caselle.map((c) => {
                const rischio = c.inviati >= 20 && c.rimbalzi / c.inviati > 0.03;
                return (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[240px] py-2 pr-3">
                      <div className="truncate font-medium text-foreground">{c.email}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.stato === "warming" ? "in riscaldamento" : c.stato === "active" ? "attiva" : c.stato === "paused" ? "in pausa" : c.stato}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{it(c.inviati)}</td>
                    {conProgrammati && <td className="px-3 py-2 text-right tabular-nums">{it(c.programmati)}</td>}
                    <td className="px-3 py-2 text-right tabular-nums">{it(c.risposte)}</td>
                    <td className={cn("py-2 pl-3 text-right tabular-nums", rischio && "font-semibold text-amber-700 dark:text-amber-400")}>
                      {it(c.rimbalzi)}{rischio && <AlertTriangle className="ml-1 inline h-3 w-3" aria-label="oltre il 3% degli invii" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!conProgrammati && s.messaggi.programmati > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">Le email in programma si assegnano a una casella solo al momento dell'invio.</p>
          )}
        </div>
      )}
    </Riquadro>
  );
}

// ── Ritmo e tempi: quando finiscono davvero, al ritmo delle caselle ──

function RitmoETempi({ s, stime, campagna, campagne }: {
  s: StatisticheCampagna; stime: Stima[]; campagna: CampagnaRiepilogo | null; campagne: CampagnaRiepilogo[];
}) {
  const m = s.messaggi;
  const fatti: Array<[string, string]> = [
    ["Primo invio", dataCorta(m.primo_invio, true)],
    ["Ultimo invio", dataCorta(m.ultimo_invio, true)],
  ];
  const ferma = campagna && campagna.stato !== "active";

  return (
    <Riquadro icona={CalendarClock} titolo="Ritmo e tempi"
      nota="Quando finiscono gli invii al ritmo vero delle caselle: la data scritta in coda è un minimo, non una promessa.">
      <div className="space-y-4">
        {ferma ? (
          <p className="text-sm text-muted-foreground">La campagna è {STATO_CAMPAGNA[campagna.stato]?.etichetta.toLowerCase() ?? campagna.stato}: non spedisce, quindi non c'è una stima.</p>
        ) : stime.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna stima: il brand non ha caselle attive o è in pausa.</p>
        ) : stime.map((st) => {
          const b = st.brand;
          const nCaselle = b.caselle.length;
          const campagneBrand = campagne.filter((c) => c.brand_id === b.brand_id && c.stato === "active");
          const primi = campagna ? campagna.da_contattare : campagneBrand.reduce((a, c) => a + c.da_contattare, 0);
          const tutti = campagna ? campagna.messaggi_da_mandare : campagneBrand.reduce((a, c) => a + c.messaggi_da_mandare, 0);
          const passi = campagna?.passi ?? 0;
          return (
            <div key={b.brand_id} className="space-y-3">
              <p className="text-sm text-foreground">
                <span className="font-semibold">{b.brand}</span>: fino a <strong>{it(st.capOggi)}</strong> email al giorno oggi,{" "}
                <strong>{it(st.capRegime)}</strong> a regime · {it(nCaselle)} {nCaselle === 1 ? "casella" : "caselle"}
                {b.nuovi_al_giorno ? ` · al massimo ${it(b.nuovi_al_giorno)} nuovi contatti per casella al giorno` : ""} · spedisce {giorniLeggibili(b.giorni_invio)} fino alle {b.ora_fine}.
                {campagna && campagneBrand.length > 1 && (
                  <span className="text-muted-foreground"> Il ritmo è diviso con {campagneBrand.length === 2 ? "l'altra campagna" : `altre ${campagneBrand.length - 1} campagne`} del brand.</span>
                )}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Previsione
                  titolo="Primi contatti"
                  quanti={primi}
                  unita="da contattare"
                  esito={st.primi}
                  oltre={st.oltre && !st.primi}
                />
                <Previsione
                  titolo={campagna ? `Tutta la sequenza${passi ? ` (${passi} email a testa)` : ""}` : "Tutte le sequenze"}
                  quanti={tutti}
                  unita="email se nessuno risponde"
                  esito={st.tutto}
                  oltre={st.oltre}
                />
              </div>
              {primi > 0 && followupSchiacciati(b) && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong className="font-semibold">I follow-up restano indietro.</strong> Il tetto giornaliero delle caselle è uguale ai nuovi contatti al giorno:
                    finché ci sono primi contatti da mandare si prendono tutti i posti, e la seconda email arriva settimane dopo invece che al giorno previsto.
                    Alzando il tetto delle caselle (Deliverability) e lasciando uguali i nuovi al giorno, i follow-up partono in tempo.
                  </span>
                </p>
              )}
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 md:grid-cols-4">
          {fatti.map(([k, v]) => (
            <div key={k}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{v}</div>
            </div>
          ))}
          <div className="col-span-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Per andare più veloce</div>
            <div className="mt-1 text-xs text-muted-foreground">Più caselle o un tetto giornaliero più alto (Deliverability → caselle), dopo il riscaldamento.</div>
          </div>
        </div>
      </div>
    </Riquadro>
  );
}

function Previsione({ titolo, quanti, unita, esito, oltre }: {
  titolo: string; quanti: number; unita: string; esito: { giorni: number; fine: Date } | null; oltre: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titolo}</div>
      <div className="mt-1 text-sm text-foreground">
        <strong className="text-base font-semibold">{it(quanti)}</strong> {unita}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {quanti === 0 ? "niente da mandare"
          : esito ? <>finiti verso <strong className="font-semibold text-foreground">{dataCorta(esito.fine.toISOString())}</strong> · circa {it(esito.giorni)} giorni d'invio (stima)</>
          : oltre ? "oltre tre anni a questo ritmo"
          : "—"}
      </div>
    </div>
  );
}

// ── Confronto tra campagne (solo nella panoramica) ──

function Confronto({ campagne, onScegli }: { campagne: CampagnaRiepilogo[]; onScegli: (id: string) => void }) {
  return (
    <Riquadro icona={BarChart3} titolo="Confronto tra campagne" nota="Clicca una campagna per vederne il dettaglio.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Campagna</th>
              <th className="px-3 py-2 text-right">Iscritti</th>
              <th className="px-3 py-2">Contattati</th>
              <th className="px-3 py-2 text-right">Risposte</th>
              <th className="px-3 py-2 text-right">Tasso</th>
              <th className="px-3 py-2 text-right">Interessati</th>
              <th className="py-2 pl-3 text-right">Rimbalzi</th>
            </tr>
          </thead>
          <tbody>
            {campagne.map((c) => {
              const stato = STATO_CAMPAGNA[c.stato] ?? STATO_CAMPAGNA.draft;
              return (
                <tr key={c.sequence_id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30" onClick={() => onScegli(c.sequence_id)}>
                  <td className="max-w-[320px] py-2.5 pr-3">
                    <button type="button" className="text-left font-medium text-foreground hover:text-primary" onClick={() => onScegli(c.sequence_id)}>{c.nome}</button>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", stato.punto)} aria-hidden /> {stato.etichetta}{c.brand ? ` · ${c.brand}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it(c.iscritti)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${c.iscritti ? Math.max(c.contattati ? 3 : 0, (c.contattati / c.iscritti) * 100) : 0}%` }} />
                      </div>
                      <span className="tabular-nums">{it(c.contattati)} <span className="text-xs text-muted-foreground">· {percentuale(c.contattati, c.iscritti)}</span></span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it(c.risposte)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentuale(c.risposte, c.contattati)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it(c.interessati)}</td>
                  <td className={cn("py-2.5 pl-3 text-right tabular-nums", c.messaggi_inviati >= 20 && c.rimbalzati / c.messaggi_inviati > 0.03 && "text-amber-700 dark:text-amber-400")}>
                    {it(c.rimbalzati)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Riquadro>
  );
}

function Scheletro() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
      </div>
      <Skeleton className="h-[380px] rounded-xl" />
      <Skeleton className="h-[260px] rounded-xl" />
    </div>
  );
}
