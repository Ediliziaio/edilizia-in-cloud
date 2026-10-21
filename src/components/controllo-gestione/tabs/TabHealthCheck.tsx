/**
 * Scheda Health-check & Riconciliazione.
 *
 * Sezioni:
 *   A. Punteggio salute dati (controlli dal database)
 *   B. Primi passi (link alle sezioni mancanti)
 *   C. Dati di partenza: patrimonio netto e beni dell'azienda (prima non c'era
 *      nessun posto dove inserirli)
 *   D. Riconciliazione con il bilancio del commercialista
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { CespitiEditor, PatrimonioNettoEditor } from "@/components/controllo-gestione/ui/DatiPartenzaEditor";
import {
  useHealthCheck, useRiconciliazione, useUpsertRiconciliazione,
  type HealthCheck, type HealthStatus, type RiconciliazioneDichiarato,
} from "@/hooks/controlloGestione/useHealthRiconciliazione";
import { formatEuro, formatNumero, formatValoreCheck, parseImportoIt } from "@/lib/controlloGestione/indiciBanca";
import { cn } from "@/lib/utils";
import {
  HeartPulse, CheckCircle2, AlertCircle, XCircle,
  ArrowRight, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  anno: number;
}

const STATUS_BADGE: Record<HealthStatus, { color: string; icon: React.ReactNode; label: string }> = {
  ok:       { color: "text-emerald-700 bg-emerald-50", icon: <CheckCircle2 className="h-4 w-4" />, label: "A posto" },
  warn:     { color: "text-amber-700 bg-amber-50",     icon: <AlertCircle className="h-4 w-4" />,  label: "Da migliorare" },
  critical: { color: "text-rose-700 bg-rose-50",       icon: <XCircle className="h-4 w-4" />,      label: "Da sistemare" },
};

// Link che il database (versioni precedenti) mandava a pagine inesistenti.
const LINK_CORRETTI: Record<string, string> = {
  "/azienda/costi-aziendali": "/azienda/costi",
};

function linkCheck(c: HealthCheck): string | undefined {
  if (c.codice === "patrimonio_netto") return "#patrimonio";
  if (c.codice === "cespiti") return "#cespiti";
  if (!c.azione_url) return undefined;
  const url = LINK_CORRETTI[c.azione_url] ?? c.azione_url;
  return url.startsWith("/azienda/controllo-gestione/health#") ? url.slice(url.indexOf("#")) : url;
}

type CampoRic = "ricavi" | "costi" | "utile" | "pn" | "imposte";

const CAMPI_RIC: { campo: CampoRic; label: string; esempio: string; aiuto: string }[] = [
  { campo: "ricavi", label: "Ricavi", esempio: "es. 4.700.000", aiuto: "Conto economico, voce A1" },
  { campo: "costi", label: "Costi della produzione", esempio: "es. 4.200.000", aiuto: "Conto economico, totale B" },
  { campo: "utile", label: "Utile (o perdita)", esempio: "es. 250.000", aiuto: "Utile dell'esercizio, voce 21" },
  { campo: "pn", label: "Patrimonio netto", esempio: "es. 480.000", aiuto: "Passivo, totale A" },
  { campo: "imposte", label: "Imposte", esempio: "es. 90.000", aiuto: "Conto economico, voce 20" },
];

function scrollAncora(hash: string) {
  const el = document.getElementById(hash.replace("#", ""));
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function TabHealthCheck({ anno }: Props) {
  const h = useHealthCheck(anno);
  const r = useRiconciliazione(anno);
  const location = useLocation();

  // Arrivando con #patrimonio o #cespiti (link dei controlli), porta lì.
  useEffect(() => {
    if (location.hash && h.data) scrollAncora(location.hash);
  }, [location.hash, h.data]);

  // Confronto: sempre «gestionale − bilancio», così euro e percentuale hanno
  // lo stesso segno (prima l'euro era bilancio − gestionale e la % il contrario).
  const righeConfronto = useMemo(() => {
    const d = r.data?.dichiarato;
    const s = r.data?.sistema;
    if (!d || !s) return [];
    const ricavi = Number(s.ricavi ?? 0);
    const utile = Number(s.utile ?? 0);
    const imposte = Number(s.imposte ?? 0);
    return [
      { label: "Ricavi", dich: d.ricavi, sist: ricavi },
      // Costi del gestionale = ricavi − utile prima delle imposte.
      { label: "Costi", dich: d.costi, sist: ricavi - (utile + imposte) },
      { label: "Utile", dich: d.utile, sist: utile },
      { label: "Patrimonio netto", dich: d.patrimonio_netto, sist: Number(s.patrimonio_netto ?? 0) },
      { label: "Imposte", dich: d.imposte, sist: imposte },
    ].filter((x) => x.dich !== null && x.dich !== undefined);
  }, [r.data]);

  const checks = h.data?.checks ?? [];
  const nOk = checks.filter((c) => c.status === "ok").length;
  const nWarn = checks.filter((c) => c.status === "warn").length;
  const nCrit = checks.filter((c) => c.status === "critical").length;
  const statoCheck = (codice: string) => checks.find((c) => c.codice === codice)?.status === "ok";

  return (
    <div className="space-y-4">
      {/* A. Punteggio */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4" /> Salute dei dati del {anno}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Controlla che ci siano tutti i dati per avere numeri affidabili in questa pagina.
          </p>
        </CardHeader>
        <CardContent>
          {h.isLoading && <Skeleton className="h-32 w-full" />}
          {h.isError && <ErrorBlock onRetry={() => h.refetch()} />}
          {h.data && (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div
                  className={cn(
                    "rounded-2xl p-6",
                    h.data.percentuale >= 80 ? "bg-emerald-50" : h.data.percentuale >= 50 ? "bg-amber-50" : "bg-rose-50",
                  )}
                >
                  <p className="text-xs text-muted-foreground">Punteggio</p>
                  <p
                    className={cn(
                      "mt-1 text-4xl font-bold tabular-nums",
                      nCrit > 0 ? "text-rose-700" : h.data.report_ready === true ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {formatNumero(h.data.score, Number.isInteger(h.data.score) ? 0 : 1)}/{h.data.max_score}
                  </p>
                  <p className="mt-2 text-sm font-medium">{formatNumero(h.data.percentuale, 0)}%</p>
                  <Progress value={h.data.percentuale} className="mt-2 h-2" />
                </div>
                <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">In breve</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {nOk} controlli a posto</li>
                    <li className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" /> {nWarn} da migliorare</li>
                    <li className="flex items-center gap-2"><XCircle className="h-4 w-4 text-rose-600" /> {nCrit} da sistemare</li>
                  </ul>
                  {h.data.report_ready === true ? (
                    <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                      Tutti i controlli necessari sono superati: rating e pacchetto banca sono utilizzabili.
                    </p>
                  ) : (
                    <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                      Finché i controlli in rosso non sono a posto, rating, Z-score e pacchetto banca restano provvisori.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {checks.map((c) => {
                  const cfg = STATUS_BADGE[c.status];
                  const href = linkCheck(c);
                  return (
                    <div key={c.codice} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:gap-3">
                      <div className="flex flex-1 items-start gap-3">
                        <span className={cn("rounded-md p-1.5", cfg.color)} title={cfg.label}>{cfg.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{c.label}</p>
                          <p className="text-xs text-muted-foreground">{c.descrizione}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 pl-10 sm:block sm:pl-0 sm:text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatValoreCheck(c.codice, c.valore, c.unita)}</p>
                        <p className="text-[11px] text-muted-foreground">obiettivo: {c.target}</p>
                      </div>
                      {href && c.status !== "ok" && (
                        href.startsWith("#") ? (
                          <Button variant="ghost" size="sm" className="h-7 shrink-0 self-end sm:self-start" onClick={() => scrollAncora(href)}>
                            Sistema <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        ) : (
                          <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 self-end sm:self-start">
                            <Link to={href}>Vai <ArrowRight className="ml-1 h-3 w-3" /></Link>
                          </Button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* B. Primi passi */}
      {h.data && h.data.percentuale < 80 && (
        <Card className="rounded-2xl border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Primi passi
            </CardTitle>
            <p className="text-xs text-muted-foreground">Quattro passi, in quest'ordine, per avere numeri affidabili:</p>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              <PassoGuida done={statoCheck("classificazioni")} label="1. Carica le voci di classificazione predefinite"
                href="/azienda/controllo-gestione/configurazione" />
              <PassoGuida done={statoCheck("patrimonio_netto")} label="2. Inserisci il patrimonio netto (capitale, riserve)"
                ancora="#patrimonio" />
              <PassoGuida done={statoCheck("cespiti")} label="3. Inserisci mezzi e attrezzature per gli ammortamenti"
                ancora="#cespiti" />
              <PassoGuida done={statoCheck("loans")} label="4. Aggiungi i mutui e i finanziamenti in corso"
                href="/azienda/controllo-gestione/pfn-debiti" />
            </ol>
          </CardContent>
        </Card>
      )}

      {/* C. Dati di partenza */}
      <PatrimonioNettoEditor anno={anno} />
      <CespitiEditor />

      {/* D. Riconciliazione */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Confronto con il bilancio del commercialista · {anno}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Copia qui i numeri del bilancio depositato (o della situazione contabile del commercialista). Importi in
            euro, per esempio 1.234.567 oppure 1234567,50. Puoi lasciare vuoti quelli che non hai: vedrai quanto e
            dove i numeri del gestionale si discostano.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {r.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            // Il form riparte dai valori salvati quando cambiano anno o dati.
            <FormRiconciliazione
              key={`${anno}-${r.data?.dichiarato?.updated_at ?? "nuovo"}`}
              anno={anno}
              dichiarato={r.data?.dichiarato ?? null}
            />
          )}

          {r.isError && <ErrorBlock onRetry={() => r.refetch()} />}

          {righeConfronto.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Voce</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Bilancio</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Gestionale</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Differenza</th>
                  </tr>
                </thead>
                <tbody>
                  {righeConfronto.map((x) => <RigaConfronto key={x.label} {...x} />)}
                </tbody>
              </table>
              <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                Differenza = gestionale − bilancio. Entro il 5% è normale (arrotondamenti, scritture di chiusura); oltre,
                manca qualcosa nel gestionale o è registrato in un'altra voce.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FormRiconciliazione({ anno, dichiarato }: { anno: number; dichiarato: RiconciliazioneDichiarato | null }) {
  const upsert = useUpsertRiconciliazione();
  const { toast } = useToast();
  const t = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(v);
  const [form, setForm] = useState<Record<CampoRic | "note", string>>(() => ({
    ricavi: t(dichiarato?.ricavi),
    costi: t(dichiarato?.costi),
    utile: t(dichiarato?.utile),
    pn: t(dichiarato?.patrimonio_netto),
    imposte: t(dichiarato?.imposte),
    note: dichiarato?.note ?? "",
  }));

  const handleSave = async () => {
    const numeri: Partial<Record<CampoRic, number | null>> = {};
    for (const c of CAMPI_RIC) {
      const n = parseImportoIt(form[c.campo]);
      if (Number.isNaN(n)) {
        toast({ title: "Importo non valido", description: `Controlla «${c.label}» (es. 1.234.567 oppure 1234567,50).`, variant: "destructive" });
        return;
      }
      numeri[c.campo] = n;
    }
    if (CAMPI_RIC.every((c) => numeri[c.campo] === null)) {
      toast({ title: "Nessun numero inserito", description: "Inserisci almeno un valore dal bilancio.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        anno,
        ricavi_dichiarati: numeri.ricavi ?? null,
        costi_dichiarati: numeri.costi ?? null,
        utile_dichiarato: numeri.utile ?? null,
        patrimonio_netto_dichiarato: numeri.pn ?? null,
        imposte_dichiarate: numeri.imposte ?? null,
        note: form.note.trim() || null,
      });
      toast({ title: "Bilancio salvato", description: "Sotto vedi le differenze con i numeri del gestionale." });
    } catch (e) {
      toast({
        title: "Bilancio non salvato",
        description: e instanceof Error ? e.message : "Riprova tra qualche secondo.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CAMPI_RIC.map((c) => (
          <div key={c.campo}>
            <Label className="text-xs" htmlFor={`ric-${c.campo}`}>{c.label} (€)</Label>
            <Input
              id={`ric-${c.campo}`}
              inputMode="decimal"
              placeholder={c.esempio}
              value={form[c.campo]}
              onChange={(e) => setForm((f) => ({ ...f, [c.campo]: e.target.value }))}
            />
            <p className="mt-0.5 text-[11px] text-muted-foreground">{c.aiuto}</p>
          </div>
        ))}
      </div>
      <div>
        <Label className="text-xs" htmlFor="ric-note">Note</Label>
        <Textarea
          id="ric-note"
          rows={2}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="es. Bilancio depositato il 30/04, firmato dott. Rossi"
        />
      </div>
      <Button onClick={handleSave} disabled={upsert.isPending}>
        {upsert.isPending ? "Salvataggio…" : "Salva e confronta"}
      </Button>
    </>
  );
}

function PassoGuida({ done, label, href, ancora }: { done: boolean; label: string; href?: string; ancora?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
      {done ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <span className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/40" />
      )}
      <span className={cn("flex-1", done && "text-muted-foreground line-through")}>{label}</span>
      {!done && (ancora ? (
        <Button size="sm" variant="outline" onClick={() => scrollAncora(ancora)}>
          Vai <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      ) : href ? (
        <Button asChild size="sm" variant="outline">
          <Link to={href}>Vai <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      ) : null)}
    </li>
  );
}

function RigaConfronto({ label, dich, sist }: { label: string; dich: number | null; sist: number }) {
  const d = Number(dich ?? 0);
  const diff = sist - d;
  const pct = d !== 0 ? (diff / Math.abs(d)) * 100 : null;
  const dentro = Math.abs(diff) <= Math.abs(d) * 0.05;
  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-medium">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatEuro(d)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatEuro(sist)}</td>
      <td className={cn(
        "px-3 py-2 text-right tabular-nums font-medium",
        Math.round(diff) === 0 ? "text-muted-foreground" : dentro ? "text-amber-700" : "text-rose-700",
      )}>
        {Math.round(diff) > 0 ? "+" : ""}{formatEuro(diff)}
        {pct !== null && (
          <span className="ml-1 text-xs font-normal">
            ({pct > 0 ? "+" : ""}{formatNumero(pct, 1)}%) {dentro ? "ok" : "da verificare"}
          </span>
        )}
      </td>
    </tr>
  );
}
