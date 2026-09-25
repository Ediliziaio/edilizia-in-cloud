/**
 * Editor del POS sul modello ufficiale (DI 9/9/2014, Allegato I).
 *
 * La bozza vive nello stato della pagina e si salva col pulsante (o Ctrl/Cmd+S).
 * L'approvazione la fa il server dopo il controllo dei contenuti minimi
 * dell'Allegato XV; un POS approvato si legge soltanto: per cambiarlo si apre
 * una nuova revisione. Firme, consultazione dell'RLS e verifiche di impresa
 * affidataria e CSE (art. 101 c. 3) si segnano anche dopo l'approvazione.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileDown, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  ErrorePos, datiAppPos, lavorazioniAiPos, useApprovaPos, useNuovaRevisione, usePos, useSalvaPos,
  type IterPos, type PosRiga,
} from "@/hooks/usePos";
import type { ContestoPos } from "../../../../supabase/functions/_shared/posModello";
import {
  aggiornaDaDatiApp, completezzaPercento, vociMancanti,
  type Lavorazione, type PosContenuto, type SezionePos, type VoceMancante,
} from "../../../../supabase/functions/_shared/posModello";
import { costruisciHtmlPos } from "@/lib/sicurezza/posHtml";
import { Campo } from "@/components/sicurezza/pos/campi";
import {
  SezioneAllegati, SezioneEmergenze, SezioneFigure, SezioneFormazione, SezioneImpresa, SezioneLavorazioni,
  SezioneLavoratori, SezioneOpera, SezionePsc, SezioneRumore, type Modifica,
} from "@/components/sicurezza/pos/PosSezioni";

const SEZIONI: Array<{ id: SezionePos | "iter"; titolo: string }> = [
  { id: "opera", titolo: "Opera e cantiere" },
  { id: "impresa", titolo: "Impresa" },
  { id: "figure", titolo: "Figure" },
  { id: "emergenze", titolo: "Emergenze" },
  { id: "lavoratori", titolo: "Lavoratori" },
  { id: "formazione", titolo: "Formazione" },
  { id: "rumore", titolo: "Rumore" },
  { id: "lavorazioni", titolo: "Lavorazioni" },
  { id: "psc", titolo: "Procedure PSC" },
  { id: "allegati", titolo: "Allegati" },
  { id: "iter", titolo: "Firme e consegna" },
];

const vaiA = (id: string) => document.getElementById(`pos-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

function dataIt(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function piu15(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

export default function PosEditor() {
  const { id } = useParams<{ id: string }>();
  const companyId = useEffectiveCompanyId();
  const perms = usePermissions();
  const { data: pos, isLoading, error, refetch } = usePos(id);
  const puoScrivere = (perms.canViewSicurezzaCantiere || perms.isAdmin) && !perms.solaLettura;

  // I dati dell'app: il contesto (mezzi e subappaltatori della commessa) per le
  // lavorazioni, e il POS già compilato per chi lo apre la prima volta.
  const { data: datiApp, isLoading: datiInCorso } = useQuery({
    queryKey: ["pos-dati-app", id],
    enabled: !!id && !!companyId && !!pos && puoScrivere,
    queryFn: () => datiAppPos(companyId!, id!),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !pos) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <p className="text-sm">{error ? "Non riesco a caricare il POS." : "POS non trovato."}</p>
        <div className="flex justify-center gap-2">
          {error && <Button variant="outline" onClick={() => refetch()}>Riprova</Button>}
          <Button asChild variant="outline"><Link to="/azienda/sicurezza-cantiere">Torna a Sicurezza cantiere</Link></Button>
        </div>
      </div>
    );
  }
  // Un POS del vecchio generatore o creato vuoto dall'assistente si compila
  // subito dai dati dell'app: si aspetta che arrivino.
  if (pos.daCompilare && puoScrivere && pos.status !== "approvato" && datiInCorso) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />Compilo il POS con i dati dell'app…
      </div>
    );
  }

  // Si rimonta quando cambiano stato o revisione (approvato, nuova revisione),
  // NON a ogni salvataggio: un rimontaggio a metà di un'operazione (salva e poi
  // chiedi le proposte all'AI, salva e poi approva) ne butterebbe via l'esito.
  const versione = `${pos.id}:${pos.revisione}:${pos.status}`;
  return <EditorPos key={versione} pos={pos} datiApp={datiApp ?? null} puoScrivere={puoScrivere} />;
}

interface EditorProps {
  pos: PosRiga;
  datiApp: { contenuto: PosContenuto; contesto: ContestoPos } | null;
  puoScrivere: boolean;
}

function EditorPos({ pos, datiApp, puoScrivere }: EditorProps) {
  const location = useLocation();
  const companyId = useEffectiveCompanyId();
  const salva = useSalvaPos(pos.id);
  const approva = useApprovaPos();
  const nuovaRevisione = useNuovaRevisione(pos);

  const approvato = pos.status === "approvato";
  const ro = !puoScrivere || approvato;
  const compilaSubito = pos.daCompilare && !!datiApp && !ro;

  const [bozza, setBozza] = useState<PosContenuto>(() => (compilaSubito && datiApp ? datiApp.contenuto : pos.contenuto));
  const [iter, setIter] = useState<IterPos>(() => pos.iter);
  const [sporco, setSporco] = useState(compilaSubito);
  const [iterSporco, setIterSporco] = useState(false);
  const [avvisi, setAvvisi] = useState<string[]>(() =>
    compilaSubito && datiApp ? datiApp.contesto.avvisi : ((location.state as { avvisi?: string[] } | null)?.avvisi ?? []));
  const [stampa, setStampa] = useState<string | null>(null);
  const [mancantiServer, setMancantiServer] = useState<VoceMancante[] | null>(null);
  const [revisioneAperta, setRevisioneAperta] = useState(false);
  const [descrRevisione, setDescrRevisione] = useState("");
  const [aggiornaAperto, setAggiornaAperto] = useState(false);
  const [aggiornando, setAggiornando] = useState(false);
  const [proposte, setProposte] = useState<Lavorazione[] | null>(null);
  const [proponendo, setProponendo] = useState(false);

  const modifica: Modifica = useCallback((fn) => {
    setBozza((prev) => {
      const copia = structuredClone(prev);
      fn(copia);
      return copia;
    });
    setSporco(true);
  }, []);

  const mancanti = useMemo(() => vociMancanti(bozza), [bozza]);
  const perSezione = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of mancanti) m.set(v.sezione, (m.get(v.sezione) ?? 0) + 1);
    return m;
  }, [mancanti]);
  const percento = completezzaPercento(bozza);

  const salvaOra = useCallback(async () => {
    try {
      await salva.mutateAsync({ contenuto: sporco ? bozza : undefined, iter: iterSporco ? iter : undefined });
      setSporco(false);
      setIterSporco(false);
      toast.success("POS salvato");
      return true;
    } catch {
      return false;
    }
  }, [bozza, iter, sporco, iterSporco, salva]);

  // Ctrl/Cmd+S e avviso se si esce con modifiche non salvate.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (sporco || iterSporco) void salvaOra();
      }
    };
    const esci = (e: BeforeUnloadEvent) => {
      if (sporco || iterSporco) e.preventDefault();
    };
    window.addEventListener("keydown", tasto);
    window.addEventListener("beforeunload", esci);
    return () => {
      window.removeEventListener("keydown", tasto);
      window.removeEventListener("beforeunload", esci);
    };
  }, [sporco, iterSporco, salvaOra]);

  const approvaOra = async () => {
    if (mancanti.length) {
      setMancantiServer(mancanti);
      return;
    }
    if (sporco || iterSporco) {
      const ok = await salvaOra();
      if (!ok) return;
    }
    try {
      await approva.mutateAsync(pos.id);
      setMancantiServer(null);
    } catch (e) {
      if (e instanceof ErrorePos && e.mancanti.length) setMancantiServer(e.mancanti);
      else toast.error(e instanceof Error ? e.message : "POS non approvato");
    }
  };

  const aggiornaDaApp = async () => {
    if (!companyId) return;
    setAggiornando(true);
    try {
      const r = await datiAppPos(companyId, pos.id);
      setBozza((prev) => aggiornaDaDatiApp(prev, r.contenuto));
      setSporco(true);
      setAvvisi(r.contesto.avvisi);
      setAggiornaAperto(false);
      toast.success("Dati aggiornati: controlla e salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dati non aggiornati");
    } finally {
      setAggiornando(false);
    }
  };

  const proponiAi = async () => {
    if (!companyId) return;
    if (sporco) {
      // L'AI legge il POS salvato: prima si salva la descrizione dell'attività.
      const ok = await salvaOra();
      if (!ok) return;
    }
    setProponendo(true);
    try {
      const r = await lavorazioniAiPos(companyId, pos.id);
      setProposte(r.lavorazioni);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Proposte non arrivate");
    } finally {
      setProponendo(false);
    }
  };

  const modificaIter = (fn: (x: IterPos) => IterPos) => {
    setIter((prev) => fn(prev));
    setIterSporco(true);
  };

  const titoloCommessa = [pos.commessa?.order_code, pos.commessa?.description].filter(Boolean).join(" — ") || "Commessa";
  const subappalto = bozza.impresa.ruolo === "esecutrice_subappalto";
  const conCse = bozza.procedure_psc.psc_presente;
  const baseProps = { d: bozza, modifica, ro };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-28">
      {/* Intestazione. Mobile: senza riquadro e senza il secondo «indietro»
          (c'è la freccia della barra in alto); stampa e riallineo coi dati
          dell'app restano al computer, «Approva» resta. */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <Link to="/azienda/sicurezza-cantiere" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground max-sm:hidden">
          <ArrowLeft className="h-3.5 w-3.5" />Sicurezza cantiere
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3 max-sm:mt-0 max-sm:flex-nowrap max-sm:items-center max-sm:gap-2">
          <div className="min-w-0">
            <h1 aria-label="Piano Operativo di Sicurezza" className="text-lg font-bold sm:text-xl max-sm:leading-tight"><span aria-hidden="true" className="max-sm:hidden">Piano Operativo di Sicurezza</span><span aria-hidden="true" className="sm:hidden">POS</span></h1>
            <p className="truncate text-sm text-muted-foreground max-sm:text-xs">{titoloCommessa}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 max-sm:hidden">
              <Badge variant="outline" className={approvato ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50"}>
                {approvato ? "Approvato" : "Bozza"}
              </Badge>
              <Badge variant="outline">Rev. {pos.revisione}</Badge>
              {approvato && pos.approvato_da_nome && (
                <span className="text-xs text-muted-foreground">da {pos.approvato_da_nome}{pos.approvato_il ? ` il ${dataIt(pos.approvato_il)}` : ""}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-sm:shrink-0">
            <Button variant="outline" className="max-sm:hidden" onClick={() => setStampa(costruisciHtmlPos({
              contenuto: bozza, stato: pos.status, revisione: pos.revisione, revisioni: pos.revisioni,
              approvatoDa: pos.approvato_da_nome, approvatoIl: pos.approvato_il, codiceCommessa: pos.commessa?.order_code,
            }))}>
              <FileDown className="mr-1 h-4 w-4" />Anteprima e stampa
            </Button>
            {!ro && (
              <Button variant="outline" className="max-sm:hidden" onClick={() => setAggiornaAperto(true)}>
                <RefreshCw className="mr-1 h-4 w-4" />Aggiorna dai dati dell'app
              </Button>
            )}
            {puoScrivere && !approvato && (
              <Button onClick={approvaOra} disabled={approva.isPending || salva.isPending} className="tap-compact max-sm:h-8 max-sm:px-3 max-sm:text-xs">
                {approva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                Approva
              </Button>
            )}
            {puoScrivere && approvato && (
              <Button variant="outline" className="tap-compact max-sm:h-8 max-sm:px-3 max-sm:text-xs" onClick={() => { setDescrRevisione(""); setRevisioneAperta(true); }}>
                <RotateCcw className="mr-1 h-4 w-4" />Nuova revisione
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-1.5 max-sm:mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Contenuti minimi dell'Allegato XV</span>
            {mancanti.length ? (
              <button type="button" className="font-medium text-amber-800 underline-offset-2 hover:underline" onClick={() => setMancantiServer(mancanti)}>
                {mancanti.length === 1 ? "Manca 1 voce" : `Mancano ${mancanti.length} voci`}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Tutti presenti</span>
            )}
          </div>
          <Progress value={percento} className="h-2" aria-label={`Completezza ${percento}%`} />
        </div>

        {approvato && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 max-sm:hidden">
            Il POS approvato si legge soltanto. Per cambiarlo apri una nuova revisione: torna in bozza e va riapprovato. L'approvazione nell'app non sostituisce le firme sul documento.
          </p>
        )}
        {!puoScrivere && <p className="mt-3 text-xs text-muted-foreground">Sei in sola lettura.</p>}
      </div>

      {avvisi.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <ul className="flex-1 space-y-0.5">{avvisi.map((a) => <li key={a}>{a}</li>)}</ul>
          <button type="button" onClick={() => setAvvisi([])} aria-label="Chiudi gli avvisi" className="rounded p-1 hover:bg-amber-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        {/* Navigazione fra le sezioni */}
        <nav aria-label="Sezioni del POS" className="hidden lg:block">
          <ol className="sticky top-20 space-y-0.5 rounded-xl border bg-card p-2 text-sm">
            {SEZIONI.map((s, i) => {
              const n = perSezione.get(s.id) ?? 0;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => vaiA(s.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.titolo}</span>
                    {s.id !== "iter" && (n > 0
                      ? <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">{n}</span>
                      : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="completa" />)}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4">
          <SezioneOpera {...baseProps} mancanti={perSezione.get("opera") ?? 0} />
          <SezioneImpresa {...baseProps} mancanti={perSezione.get("impresa") ?? 0} />
          <SezioneFigure {...baseProps} mancanti={perSezione.get("figure") ?? 0} />
          <SezioneEmergenze {...baseProps} mancanti={perSezione.get("emergenze") ?? 0} />
          <SezioneLavoratori {...baseProps} mancanti={perSezione.get("lavoratori") ?? 0} />
          <SezioneFormazione {...baseProps} mancanti={perSezione.get("formazione") ?? 0} />
          <SezioneRumore {...baseProps} mancanti={perSezione.get("rumore") ?? 0} />
          <SezioneLavorazioni {...baseProps} mancanti={perSezione.get("lavorazioni") ?? 0}
            contesto={datiApp?.contesto ?? null} onProponiAi={proponiAi} proponendo={proponendo} />
          <SezionePsc {...baseProps} mancanti={perSezione.get("psc") ?? 0} />
          {companyId && <SezioneAllegati {...baseProps} mancanti={perSezione.get("allegati") ?? 0} companyId={companyId} posId={pos.id} />}

          {/* 11. Firme e consegna: si segna anche dopo l'approvazione */}
          <section id="pos-iter" className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby="pos-iter-titolo">
            <header className="border-b px-4 py-3">
              <h2 id="pos-iter-titolo" className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">11</span>
                Firme e consegna
              </h2>
              <p className="mt-0.5 pl-8 text-[11px] text-muted-foreground">Art. 101 comma 3 del D.Lgs 81/2008</p>
            </header>
            <div className="space-y-4 p-4">
              {(subappalto || conCse) && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Prima di iniziare, l'impresa esecutrice consegna il POS all'impresa affidataria, che ne verifica la congruenza e lo trasmette al coordinatore per l'esecuzione.
                  I lavori iniziano solo dopo l'esito positivo delle verifiche, che vanno fatte entro 15 giorni dalla ricezione.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="iter-firma" label="Firmato dal datore di lavoro il" type="date" value={iter.firma_datore_il ?? ""} readOnly={!puoScrivere}
                  onChange={(v) => modificaIter((x) => ({ ...x, firma_datore_il: v || null }))} />
                <Campo id="iter-rls" label="RLS / RLST consultato il" type="date" value={iter.consultazione_rls_il ?? ""} readOnly={!puoScrivere}
                  onChange={(v) => modificaIter((x) => ({ ...x, consultazione_rls_il: v || null }))} />
              </div>
              {subappalto && (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                  <h3 className="text-sm font-semibold sm:col-span-3">Impresa affidataria: {bozza.impresa.subappalto_a || "da indicare"}</h3>
                  <Campo id="iter-aff-inv" label="Consegnato il" type="date" value={iter.affidataria_inviato_il ?? ""} readOnly={!puoScrivere}
                    hint={iter.affidataria_inviato_il ? `Verifica entro il ${dataIt(piu15(iter.affidataria_inviato_il))}` : undefined}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_inviato_il: v || null }))} />
                  <EsitoSelect id="iter-aff-esito" value={iter.affidataria_esito ?? null} readOnly={!puoScrivere}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_esito: v }))} />
                  <Campo id="iter-aff-data" label="Data dell'esito" type="date" value={iter.affidataria_esito_il ?? ""} readOnly={!puoScrivere}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_esito_il: v || null }))} />
                </div>
              )}
              {conCse && (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                  <h3 className="text-sm font-semibold sm:col-span-3">Coordinatore per l'esecuzione (CSE)</h3>
                  <Campo id="iter-cse-inv" label="Trasmesso il" type="date" value={iter.cse_inviato_il ?? ""} readOnly={!puoScrivere}
                    hint={iter.cse_inviato_il ? `Verifica entro il ${dataIt(piu15(iter.cse_inviato_il))}` : undefined}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_inviato_il: v || null }))} />
                  <EsitoSelect id="iter-cse-esito" value={iter.cse_esito ?? null} readOnly={!puoScrivere}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_esito: v }))} />
                  <Campo id="iter-cse-data" label="Data dell'esito" type="date" value={iter.cse_esito_il ?? ""} readOnly={!puoScrivere}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_esito_il: v || null }))} />
                </div>
              )}
              {(iter.affidataria_esito === "negativo" || iter.cse_esito === "negativo") && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  Verifica con esito negativo: i lavori non possono iniziare. Apri una nuova revisione e correggi il POS.
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="iter-note" className="text-xs font-medium text-slate-700">Note</Label>
                <Textarea id="iter-note" rows={2} value={iter.note ?? ""} disabled={!puoScrivere}
                  onChange={(e) => modificaIter((x) => ({ ...x, note: e.target.value || null }))} />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Barra di salvataggio */}
      {(sporco || iterSporco) && puoScrivere && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Modifiche non salvate</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => {
                setBozza(pos.contenuto); setIter(pos.iter); setSporco(false); setIterSporco(false);
              }}>Annulla</Button>
              <Button onClick={() => void salvaOra()} disabled={salva.isPending}>
                {salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salva
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Voci mancanti */}
      <Dialog open={!!mancantiServer} onOpenChange={(o) => !o && setMancantiServer(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Il POS non ha ancora tutti i contenuti minimi</DialogTitle>
            <DialogDescription>
              Un POS senza uno degli elementi dell'Allegato XV è sanzionabile (art. 159 del D.Lgs 81/2008). Completa queste voci, poi approva.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {(mancantiServer ?? []).map((v, i) => (
              <li key={`${v.sezione}-${i}`}>
                <button type="button" className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => { setMancantiServer(null); setTimeout(() => vaiA(v.sezione), 50); }}>
                  {v.testo}
                  <span className="ml-1 text-xs text-muted-foreground">({v.riferimento})</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Aggiorna dai dati dell'app */}
      <Dialog open={aggiornaAperto} onOpenChange={setAggiornaAperto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiorna dai dati dell'app</DialogTitle>
            <DialogDescription>
              Rilegge commessa, impresa, figure della sicurezza, lavoratori e formazione. Lavorazioni, rumore, procedure del PSC, allegati, turni e modalità organizzative restano come li hai scritti.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAggiornaAperto(false)}>Annulla</Button>
            <Button onClick={aggiornaDaApp} disabled={aggiornando}>
              {aggiornando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Aggiorna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proposte dell'AI */}
      <Dialog open={!!proposte} onOpenChange={(o) => !o && setProposte(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lavorazioni proposte dall'AI</DialogTitle>
            <DialogDescription>
              Sono una base da adattare al cantiere: ogni scheda va letta e confermata prima di approvare il POS.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2">
            {(proposte ?? []).map((l, i) => (
              <li key={l.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{i + 1}. {l.titolo}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{l.descrizione}</p>
                {l.svolgimento === "subappalto" && l.svolgimento_con && <p className="mt-1 text-xs">In subappalto a {l.svolgimento_con}</p>}
              </li>
            ))}
          </ol>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setProposte(null)}>Annulla</Button>
            {bozza.lavorazioni.length > 0 && (
              <Button variant="outline" onClick={() => { modifica((x) => { x.lavorazioni = proposte ?? []; }); setProposte(null); }}>
                Sostituisci le attuali
              </Button>
            )}
            <Button onClick={() => { modifica((x) => { x.lavorazioni.push(...(proposte ?? [])); }); setProposte(null); setTimeout(() => vaiA("lavorazioni"), 50); }}>
              Aggiungi al POS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuova revisione */}
      <Dialog open={revisioneAperta} onOpenChange={setRevisioneAperta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova revisione (rev. {pos.revisione + 1})</DialogTitle>
            <DialogDescription>
              Il POS torna in bozza per le modifiche e va riapprovato. Le date di firma e verifica ripartono da capo. Se ne hai già consegnato copia, avvisa chi l'ha ricevuta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="descr-rev" className="text-xs font-medium">Cosa cambia in questa revisione</Label>
            <Textarea id="descr-rev" rows={2} value={descrRevisione} onChange={(e) => setDescrRevisione(e.target.value)}
              placeholder="Es.: nuova fase di lavori in quota sul tetto" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRevisioneAperta(false)}>Annulla</Button>
            <Button disabled={!descrRevisione.trim() || nuovaRevisione.isPending} onClick={async () => {
              try {
                await nuovaRevisione.mutateAsync(descrRevisione.trim());
                setRevisioneAperta(false);
              } catch {
                // l'errore lo mostra la mutation
              }
            }}>
              {nuovaRevisione.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Apri la revisione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {stampa && (
        <PrintPreviewModal
          htmlContent={stampa}
          fileName={`POS-${pos.commessa?.order_code ?? pos.id.slice(0, 8)}-rev${pos.revisione}`}
          title="Anteprima del POS"
          open={!!stampa}
          onOpenChange={(o) => !o && setStampa(null)}
        />
      )}
    </div>
  );
}

function EsitoSelect({ id, value, onChange, readOnly }: { id: string; value: "positivo" | "negativo" | null; onChange: (v: "positivo" | "negativo" | null) => void; readOnly: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-slate-700">Esito della verifica</Label>
      <select
        id={id}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value ?? ""}
        disabled={readOnly}
        onChange={(e) => onChange((e.target.value || null) as "positivo" | "negativo" | null)}
      >
        <option value="">In attesa</option>
        <option value="positivo">Positivo</option>
        <option value="negativo">Negativo</option>
      </select>
    </div>
  );
}
