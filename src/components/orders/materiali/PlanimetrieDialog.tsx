/**
 * Tavole e conteggi: le planimetrie della commessa (PDF tra i documenti) e
 * quanti simboli ci sono, per locale.
 *   1. «Conta le sigle» legge il testo del PDF: sigle come PA, T, TG, C1…
 *      contate esattamente, legenda esclusa, assegnate al locale più vicino.
 *   2. «Conta i simboli disegnati» manda la tavola a riquadri all'AI con la
 *      legenda come guida: una stima con la sua affidabilità.
 *   3. «Disegno CAD»: un DXF (o DWG salvato come DXF) letto nel browser;
 *      blocchi contati esattamente e lunghezze per layer (DisegnoCadPannello).
 * Tutto entra come bozza: diventa materiale solo il conteggio confermato.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Hash, ScanSearch, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { attachmentStorage } from "@/components/orders/filePreviewUtils";
import { caricaDocumentoCommessa } from "@/lib/commesse/caricaDocumentoCommessa";
import { contaSigleDaTesto, type RisultatoConteggioTesto } from "@/lib/distinta/conteggioTesto";
import { disegnaRiquadri, estraiTestoTavola, immaginePaginaTavola, sommaRiquadri } from "@/lib/distinta/tavolePdf";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import DisegnoCadPannello from "./DisegnoCadPannello";
import { sembraTavola } from "@/lib/distinta/sceltaTavola";
import { ConfrontoTavoleAcquisti } from "./ConfrontoTavoleAcquisti";
import type { ConteggioTavola } from "@/lib/distinta/confrontaTavole";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Tavola { id: string; file_name: string; file_url: string }
interface Conteggio {
  id: string; documento_id: string | null; documento_nome: string | null; phase_id: string | null; simbolo: string;
  descrizione_legenda: string | null; locale: string | null; quantita: number; metodo: string; confidenza: number | null; confermato: boolean;
}
/** Con l'unità: 'm' per le lunghezze dei disegni CAD, vuota = pezzi. */
type ConteggioLetto = Conteggio & ConteggioTavola & { dettaglio?: Json };

const SENZA = "_senza";

async function scaricaTavola(t: Tavola): Promise<Uint8Array> {
  const { bucket, path } = attachmentStorage(t.file_url);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error ?? new Error("Tavola non scaricata");
  return new Uint8Array(await data.arrayBuffer());
}

type PropsTavole = { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onGenera?: () => void };
export default function PlanimetrieDialog(props: PropsTavole) {
  const { effectiveCompany } = useAuth();
  return <TavoleCommessa key={`${effectiveCompany?.id}:${props.orderId}:${props.open}`} {...props} />;
}
function TavoleCommessa({ orderId, open, onOpenChange, onGenera }: PropsTavole) {
  const tr = useT();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const { canEditOrders, canValidateBom } = usePermissions();
  const puoScrivere = !!(canEditOrders || canValidateBom);
  const qc = useQueryClient();
  const chiave = ["planimetrie-conteggi", companyId, orderId];
  const inputFile = useRef<HTMLInputElement>(null);
  const sessione = useRef(0);
  const interruzione = useRef<AbortController | null>(null);
  const inizia = () => { interruzione.current?.abort(); const ctrl = new AbortController(); interruzione.current = ctrl; return { token: ++sessione.current, ctrl }; };
  const interrompi = () => { sessione.current++; interruzione.current?.abort(); setLavoro(null); };

  const dati = useQuery({
    queryKey: chiave,
    enabled: open,
    queryFn: async () => {
      const [tavole, conteggi, fasi] = await Promise.all([
        supabase.from("order_attachments").select("id, file_name, file_url").eq("order_id", orderId).or("file_name.ilike.%.pdf,file_name.ilike.%.dwg,file_name.ilike.%.dxf").order("created_at", { ascending: false }),
        // «*»: la colonna unita arriva con la migrazione dei disegni CAD.
        supabase.from("planimetrie_conteggi").select("*")
          .eq("order_id", orderId).order("documento_nome").order("simbolo").order("locale"),
        supabase.from("order_work_phases").select("id, name").eq("order_id", orderId).order("position"),
      ]);
      if (tavole.error) throw tavole.error;
      if (conteggi.error) throw conteggi.error;
      if (fasi.error) throw fasi.error;
      return { tavole: (tavole.data ?? []) as Tavola[], conteggi: (conteggi.data ?? []) as unknown as ConteggioLetto[], fasi: fasi.data ?? [] };
    },
  });
  const aggiorna = () => {
    qc.invalidateQueries({ queryKey: chiave });
    qc.invalidateQueries({ queryKey: ["piano-acquisti-computo"] });
    qc.invalidateQueries({ queryKey: ["confronto-tavole-acquisti"] });
    qc.invalidateQueries({ queryKey: ["genera-materiali", orderId] });
    qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
  };

  const carica = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error(tr("Accesso richiesto"));
      await caricaDocumentoCommessa({ orderId, companyId, userId: user.id, file, tipo: "application/pdf", accessScope: scopeDocumento });
    },
    onSuccess: () => { toast.success(tr("Tavola caricata tra i documenti della commessa")); aggiorna(); },
    onError: (e) => toast.error(tr("Tavola non caricata"), { description: e instanceof Error ? e.message : String(e) }),
  });

  const [tavolaId, setTavolaId] = useState<string | null>(null);
  const documenti = dati.data?.tavole ?? [];
  const tavole = documenti.filter(t => /\.pdf$/i.test(t.file_name));
  const consigliate = tavole.filter(t => sembraTavola(t.file_name));
  const tavola = tavole.find(t => t.id === tavolaId) ?? (consigliate.length === 1 ? consigliate[0] : null);
  const [pagina, setPagina] = useState(1);
  const [risultatoLetto, setRisultatoLetto] = useState<{ documentoId: string; pagina: number; risultato: RisultatoConteggioTesto } | null>(null);
  const lettura = risultatoLetto?.documentoId === tavola?.id && risultatoLetto?.pagina === pagina ? risultatoLetto.risultato : null;
  const setLettura = (risultato: RisultatoConteggioTesto | null) => setRisultatoLetto(risultato && tavola ? { documentoId: tavola.id, pagina, risultato } : null);
  const [sceltaSigle, setSceltaSigle] = useState<Set<string>>(new Set());
  const [sceltaSimboli, setSceltaSimboli] = useState<Set<string>>(new Set());
  const [faseNuovi, setFaseNuovi] = useState<string>(SENZA);
  const [legendaManuale, setLegendaManuale] = useState("");
  const [lavoro, setLavoro] = useState<string | null>(null);
  const [pagine, setPagine] = useState(1);
  const [impronta, setImpronta] = useState("");
  const [confronto, setConfronto] = useState(false);
  const [vista, setVista] = useState<"pdf" | "cad">("pdf");
  const [scopeDocumento, setScopeDocumento] = useState<"operativo" | "riservato">("operativo");

  const leggi = async () => {
    if (!tavola) return;
    const { token } = inizia();
    setLavoro(tr("Leggo il testo della tavola…"));
    try {
      const byte = await scaricaTavola(tavola);
      const { testi, pagine: elencoPagine } = await estraiTestoTavola(byte);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(byte).buffer)), b => b.toString(16).padStart(2,"0")).join("");
      if (token !== sessione.current) return;
      setPagine(elencoPagine.length); setImpronta(hash);
      const r = contaSigleDaTesto(testi.filter(t => t.pagina === pagina));
      setLettura(r);
      setSceltaSigle(new Set(r.sigle.filter((s) => s.quantita >= 3).map((s) => s.sigla)));
      if (!r.sigle.length && !r.legenda.length) toast.info(tr("Non trovo sigle o legenda"), { description: tr("Verifica che il PDF sia una planimetria. Per una scansione puoi usare il conteggio dei simboli dopo aver indicato la legenda.") });
    } catch (e) {
      if (token === sessione.current) toast.error(tr("Tavola non letta"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      if (token === sessione.current) setLavoro(null);
    }
  };

  const salvaRighe = async (righe: Omit<Conteggio, "id" | "confermato">[]) => {
    if (!righe.length) return;
    const { error } = await supabase.rpc("planimetrie_salva_conteggi" as never, { p_order: orderId, p_documento: tavola?.id ?? null, p_nome: tavola?.file_name, p_sha256: impronta, p_righe: righe.map(r => ({ ...r, pagina })) } as never);
    if (error) throw error;
    aggiorna();
  };

  const salvaSigle = async () => {
    if (!lettura || !tavola) return;
    const righe: Omit<Conteggio, "id" | "confermato">[] = [];
    for (const s of lettura.sigle.filter((x) => sceltaSigle.has(x.sigla))) {
      for (const [locale, n] of Object.entries(s.perLocale)) {
        righe.push({
          documento_id: tavola.id, documento_nome: tavola.file_name, phase_id: faseNuovi === SENZA ? null : faseNuovi,
          simbolo: s.sigla, descrizione_legenda: s.descrizioneLegenda, locale: locale === "Senza locale" ? null : locale,
          quantita: n, metodo: "testo", confidenza: 1,
        });
      }
    }
    try {
      await salvaRighe(righe);
      toast.success(tr("{n} conteggi salvati come bozza", { n: righe.length }), { description: tr("Controllali e confermali: solo i confermati diventano materiali.") });
    } catch (e) {
      toast.error(tr("Conteggi non salvati"), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const legendaDisponibile = [...new Set([...(lettura?.legenda ?? []), ...legendaManuale.split(/[;\n]+/).map(s => s.trim()).filter(Boolean)])];
  const rilevaLegenda = async () => {
    if (!tavola || lavoro) return;
    const { token, ctrl } = inizia();
    setLavoro(tr("Leggo la legenda con l’AI…"));
    try {
      const byte = await scaricaTavola(tavola);
      const immagine = await immaginePaginaTavola(byte, pagina);
      if (token !== sessione.current) return;
      const { data, error } = await supabase.functions.invoke("planimetria-conta-simboli", { body: { company_id: companyId, azione: "legenda", immagine }, signal: ctrl.signal });
      if (token !== sessione.current) return;
      if (error) throw error;
      const legenda = Array.isArray(data?.legenda) ? data.legenda.filter((s: unknown): s is string => typeof s === "string") : [];
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(byte).buffer)), b => b.toString(16).padStart(2,"0")).join("");
      if (token !== sessione.current) return;
      setImpronta(hash);
      setLettura(lettura ?? contaSigleDaTesto([])); setLegendaManuale(legenda.join("\n")); setSceltaSimboli(new Set(legenda));
      toast.info(legenda.length ? tr("Legenda proposta dall’AI: controllala prima di contare") : tr("Nessuna legenda leggibile: puoi inserirla a mano"));
    } catch (e) { if (token === sessione.current) toast.error(tr("Legenda non letta"), { description: e instanceof Error ? e.message : String(e) }); }
    finally { if (token === sessione.current) setLavoro(null); }
  };
  const contaSimboli = async () => {
    if (!tavola || !lettura) return;
    const legenda = legendaDisponibile.filter((l) => sceltaSimboli.has(l));
    if (!legenda.length) return;
    const parziali: { simbolo: string; quantita: number; confidenza: number }[][] = [];
    let mandati = 0;
    const { token, ctrl } = inizia();
    try {
      await disegnaRiquadri(await scaricaTavola(tavola), { pagina, segnale: ctrl.signal }, async (r, totale) => {
        if (token !== sessione.current) throw new DOMException("Lettura annullata", "AbortError");
        setLavoro(tr("Riquadro {riga}-{colonna} di {totale}…", { riga: r.riga, colonna: r.colonna, totale }));
        if (r.pieno < 0.003) return;
        mandati++;
        const { data, error } = await supabase.functions.invoke("planimetria-conta-simboli", {
          body: { company_id: companyId, immagine: r.immagine, legenda, riquadro: { riga: r.riga, colonna: r.colonna } }, signal: ctrl.signal,
        });
        if (error) throw error;
        parziali.push(((data as { simboli?: { simbolo: string; quantita: number; confidenza: number }[] })?.simboli) ?? []);
      });
      if (token !== sessione.current) return;
      const somma = sommaRiquadri(parziali);
      await salvaRighe(somma.map((s) => ({
        documento_id: tavola.id, documento_nome: tavola.file_name, phase_id: faseNuovi === SENZA ? null : faseNuovi,
        simbolo: s.simbolo, descrizione_legenda: s.simbolo, locale: null as string | null, quantita: s.quantita, metodo: "ai_immagine", confidenza: s.confidenza,
      })));
      toast.success(tr("Simboli contati su {n} riquadri", { n: mandati }), { description: tr("È una stima: controlla e conferma ogni conteggio.") });
    } catch (e) {
      if (token === sessione.current) toast.error(tr("Conteggio dei simboli non riuscito"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      if (token === sessione.current) setLavoro(null);
    }
  };

  const modifica = useMutation({
    mutationFn: async (p: { id: string; patch: Partial<ConteggioLetto> }) => {
      const { error } = await supabase.from("planimetrie_conteggi").update({ ...p.patch, ...(p.patch.quantita != null || p.patch.phase_id !== undefined ? { confermato: false } : {}) }).eq("id", p.id).eq("order_id", orderId).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planimetrie_conteggi").delete().eq("id", id).eq("order_id", orderId).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });
  const confermaTutti = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("planimetrie_conteggi").update({ confermato: true }).eq("order_id", orderId).eq("company_id", companyId).in("id", ids);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });

  const pulisciLettura = useCallback(() => { sessione.current++; interruzione.current?.abort(); }, []);
  useEffect(() => pulisciLettura, [pulisciLettura]);

  const conteggiTavola = (dati.data?.conteggi ?? []).filter((c) => vista === "cad"
    // I disegni CAD: col documento se l'utente ha scelto di salvarlo, altrimenti senza.
    ? c.metodo === "dwg"
    : c.metodo !== "dwg" && (!tavola || c.documento_id === tavola.id) && (c.pagina || 1) === pagina);
  const daConfermare = conteggiTavola.filter((c) => !c.confermato).map((c) => c.id);
  const fasi = dati.data?.fasi ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Tavole e conteggi")}</DialogTitle>
          <DialogDescription>
            {tr("Scegli la planimetria, conta sigle o simboli e verifica le quantità. I conteggi confermati si possono usare per generare i materiali.")}
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2 rounded-xl border bg-muted/20 p-3 text-xs sm:grid-cols-3" aria-label={tr("Passi dei conteggi")}><li><strong>{tr("1. Scegli la tavola")}</strong><p className="mt-1 text-muted-foreground">{tr("Planimetria PDF o disegno CAD.")}</p></li><li><strong>{tr("2. Leggi i conteggi")}</strong><p className="mt-1 text-muted-foreground">{tr("Sigle senza AI; simboli con AI.")}</p></li><li><strong>{tr("3. Controlla e conferma")}</strong><p className="mt-1 text-muted-foreground">{tr("Assegna locale e fase ai risultati.")}</p></li></ol>
        {dati.isPending && <p role="status" className="text-sm text-muted-foreground">{tr("Carico tavole e conteggi…")}</p>}
        {dati.isError && <p role="alert" className="text-sm text-destructive">{tr("Non riesco a caricare tavole e conteggi.")} <Button variant="link" onClick={() => void dati.refetch()}>{tr("Riprova")}</Button></p>}

        <div className="flex flex-wrap gap-1 text-sm" role="tablist" aria-label={tr("Tipo di tavola")}>
          <Button size="sm" role="tab" aria-selected={vista === "pdf"} variant={vista === "pdf" ? "default" : "outline"} className="h-8" onClick={() => setVista("pdf")}>{tr("Tavole PDF")}</Button>
          <Button size="sm" role="tab" aria-selected={vista === "cad"} variant={vista === "cad" ? "default" : "outline"} className="h-8" onClick={() => setVista("cad")}>{tr("Disegno CAD (DWG / DXF)")}</Button>
        </div>

        {canEditOrders && <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{tr("Nuovi disegni visibili a")}<select aria-label={tr("Visibilità dei nuovi disegni")} className="h-8 rounded-md border bg-background px-2" value={scopeDocumento} onChange={e => setScopeDocumento(e.target.value as "operativo" | "riservato")}><option value="operativo">{tr("Uffici con accesso alla commessa")}</option><option value="riservato">{tr("Solo amministratori")}</option></select><span>{tr("I documenti già caricati conservano la loro riservatezza.")}</span></label>}

        {vista === "cad" && (
          <DisegnoCadPannello key={`${companyId}:${orderId}`} orderId={orderId} companyId={companyId} fasi={fasi} puoScrivere={puoScrivere}
            puoArchiviare={!!canEditOrders} scopeDocumento={scopeDocumento} onSalvati={aggiorna} documenti={documenti.filter(d => /\.(dwg|dxf)$/i.test(d.file_name))} />
        )}

        {vista === "pdf" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select value={tavola?.id ?? ""} onValueChange={(v) => { interrompi(); setTavolaId(v); setLettura(null); setLegendaManuale(""); setSceltaSimboli(new Set()); setPagina(1); setPagine(1); }}>
            <SelectTrigger className="h-9 w-full sm:w-80" aria-label={tr("Tavola")}><SelectValue placeholder={tr("Scegli una planimetria PDF")} /></SelectTrigger>
            <SelectContent>{[...consigliate, ...tavole.filter(t => !sembraTavola(t.file_name))].map((t) => <SelectItem key={t.id} value={t.id}>{t.file_name}{sembraTavola(t.file_name) ? " · " + tr("tavola suggerita") : ""}</SelectItem>)}</SelectContent>
          </Select>
          {puoScrivere && (
            <>
              <input ref={inputFile} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) carica.mutate(f); e.target.value = ""; }} />
              <Button size="sm" variant="outline" className="h-8" disabled={carica.isPending} onClick={() => inputFile.current?.click()}>
                <FileUp className="mr-1.5 h-3.5 w-3.5" /> {carica.isPending ? tr("Carico…") : tr("Carica tavola PDF")}
              </Button>
              <Button size="sm" className="h-8" disabled={!tavola || !!lavoro} onClick={leggi}>
                <Hash className="mr-1.5 h-3.5 w-3.5" /> {tr("Conta le sigle")}
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={!tavola || !!lavoro} onClick={() => void rilevaLegenda()}><ScanSearch className="mr-1.5 h-3.5 w-3.5" /> {tr("Leggi legenda con AI")}</Button>
            </>
          )}
          {pagine > 1 && <label className="text-xs">{tr("Pagina")}<select aria-label={tr("Pagina della tavola")} className="ml-2 h-8 rounded border bg-background px-2" value={pagina} disabled={!!lavoro} onChange={e => { interrompi(); setPagina(Number(e.target.value)); setLettura(null); }}>{Array.from({length:pagine},(_,i) => <option key={i} value={i+1}>{i+1}</option>)}</select></label>}
          {lavoro && <><span role="status" className="text-xs text-slate-600">{lavoro}</span><Button size="sm" variant="ghost" onClick={interrompi}>{tr("Annulla lettura")}</Button></>}
        </div>
        )}
        {vista === "pdf" && !dati.isPending && !dati.isError && !tavola && <div className="rounded-xl border border-dashed p-5 text-sm"><p className="font-medium">{tr("Scegli o carica una planimetria")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{tr("I preventivi, contratti e computi rimangono tra i documenti. Se un PDF dal nome generico contiene anche una tavola, selezionalo dall'elenco.")}</p></div>}
        {vista === "pdf" && tavola && <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{!sembraTavola(tavola.file_name) ? tr("PDF selezionato manualmente: verifica che contenga la planimetria da contare.") + " " : ""}{tr("La lettura delle sigle non usa AI. Legenda e simboli con AI consumano il credito della tua azienda e restano da controllare.")}</p>}

        {vista === "pdf" && lettura && puoScrivere && (
          <div className="grid gap-3 md:grid-cols-2">
            <section aria-label={tr("Sigle trovate")} className="rounded border p-2 text-sm">
              <h4 className="mb-1 font-semibold">{tr("Sigle scritte sulla tavola (conteggio esatto)")}</h4>
              {lettura.sigle.length ? (
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {lettura.sigle.map((s) => (
                    <li key={s.sigla} className="flex items-start gap-2">
                      <Checkbox checked={sceltaSigle.has(s.sigla)} aria-label={tr("Salva {sigla}", { sigla: s.sigla })} onCheckedChange={(v) => {
                        const n = new Set(sceltaSigle); if (v) n.add(s.sigla); else n.delete(s.sigla); setSceltaSigle(n);
                      }} />
                      <div className="min-w-0">
                        <p><strong>{s.sigla}</strong> × {s.quantita}{s.inLegenda ? <span className="text-xs text-slate-500"> {tr("(+{n} in legenda, escluso)", { n: s.inLegenda })}</span> : null}</p>
                        {s.descrizioneLegenda && <p className="text-xs text-slate-600">{s.descrizioneLegenda}</p>}
                        <p className="truncate text-[11px] text-slate-500" title={Object.entries(s.perLocale).map(([l, n]) => `${l}: ${n}`).join(", ")}>
                          {Object.entries(s.perLocale).map(([l, n]) => `${l} ${n}`).join(" · ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-500">{tr("Nessuna sigla scritta: i simboli sono solo disegnati.")}</p>}
            </section>
            <section aria-label={tr("Simboli della legenda")} className="rounded border p-2 text-sm">
              <h4 className="mb-1 font-semibold">{tr("Simboli disegnati (stima dell'AI)")}</h4>
              <p className="mb-1 text-xs text-slate-500">{tr("Scegli dalla legenda i simboli da contare. La tavola va all'AI a riquadri: richiede qualche minuto e consuma credito AI.")}</p>
              <label className="mb-2 block text-xs">{tr("Legenda da integrare o correggere")}<textarea aria-label={tr("Legenda della tavola")} className="mt-1 min-h-16 w-full rounded-md border bg-background p-2" placeholder={tr("Un simbolo o prodotto per riga, anche per PDF scansionati")} value={legendaManuale} onChange={e => { setLegendaManuale(e.target.value); setSceltaSimboli(new Set(e.target.value.split(/[;\n]+/).map(s => s.trim()).filter(Boolean))); }} /></label>
              <ul className="max-h-48 space-y-1 overflow-auto">
                {legendaDisponibile.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={sceltaSimboli.has(l)} aria-label={l} onCheckedChange={(v) => {
                      const n = new Set(sceltaSimboli); if (v) n.add(l); else n.delete(l); setSceltaSimboli(n);
                    }} />
                    {l}
                  </li>
                ))}
              </ul>
            </section>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <span className="text-sm">{tr("Fase dei conteggi")}</span>
              <Select value={faseNuovi} onValueChange={setFaseNuovi}>
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SENZA}>{tr("Senza fase")}</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={!sceltaSigle.size || !!lavoro} onClick={salvaSigle}>{tr("Salva le sigle scelte")}</Button>
              <Button size="sm" variant="outline" className="h-8" disabled={!sceltaSimboli.size || !!lavoro} onClick={contaSimboli}>
                <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> {tr("Conta i simboli scelti con l'AI")}
              </Button>
            </div>
          </div>
        )}

        <section aria-label={tr("Conteggi della tavola")} className="text-sm">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="font-semibold">{vista === "cad" ? tr("Conteggi dei disegni CAD") : tavola ? tr("Conteggi di {nome}", { nome: tavola.file_name }) : tr("Conteggi")}</h4>
            {puoScrivere && daConfermare.length > 0 && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => confermaTutti.mutate(daConfermare)}>{tr("Conferma tutti ({n})", { n: daConfermare.length })}</Button>
            )}
          </div>
          {conteggiTavola.length ? (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr><th className="px-2 py-1">{tr("Simbolo")}</th><th className="px-2 py-1">{tr("Locale")}</th><th className="px-2 py-1 text-right">{tr("Quantità")}</th><th className="px-2 py-1">{tr("Metodo")}</th><th className="px-2 py-1">{tr("Fase")}</th><th className="px-2 py-1">{tr("Confermato")}</th><th /></tr>
                </thead>
                <tbody className="divide-y">
                  {conteggiTavola.map((c) => (
                    <tr key={c.id} className={c.confermato ? "" : "bg-amber-50/40"}>
                      <td className="px-2 py-1"><strong>{c.simbolo}</strong>{c.descrizione_legenda && c.descrizione_legenda !== c.simbolo ? <span className="text-slate-500"> · {c.descrizione_legenda}</span> : null}{vista === "cad" && c.documento_nome ? <span className="block text-[10px] text-slate-400">{c.documento_nome}</span> : null}</td>
                      <td className="px-2 py-1">{c.locale ?? "—"}</td>
                      <td className="px-2 py-1 text-right">
                        {puoScrivere ? (
                          <Input className="ml-auto h-7 w-20 text-right tabular-nums" defaultValue={String(c.quantita)} aria-label={tr("Quantità {simbolo}", { simbolo: c.simbolo })}
                            onBlur={(e) => { const q = Number(e.target.value.replace(",", ".")); if (Number.isFinite(q) && q >= 0 && q !== Number(c.quantita)) modifica.mutate({ id: c.id, patch: { quantita: q, metodo: c.metodo, dettaglio: { ...(c.dettaglio && typeof c.dettaglio === "object" && !Array.isArray(c.dettaglio) ? c.dettaglio : {}), quantita_modificata_a_mano: true } } }); }} />
                        ) : c.quantita}
                        {c.unita === "m" && <span className="text-slate-500"> m</span>}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {c.metodo === "testo" ? tr("Testo (esatto)") : c.metodo === "dwg" ? tr("Disegno CAD (esatto)") : c.metodo === "ai_immagine" ? `AI · ${Math.round(Number(c.confidenza ?? 0) * 100)}%` : c.metodo === "manuale" ? tr("A mano") : tr("Disegno")}
                      </td>
                      <td className="px-2 py-1">
                        <Select value={c.phase_id ?? SENZA} disabled={!puoScrivere} onValueChange={(v) => modifica.mutate({ id: c.id, patch: { phase_id: v === SENZA ? null : v } })}>
                          <SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SENZA}>{tr("Senza fase")}</SelectItem>
                            {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Checkbox checked={c.confermato} disabled={!puoScrivere || modifica.isPending || confermaTutti.isPending} aria-label={tr("Conferma {simbolo}", { simbolo: c.simbolo })} onCheckedChange={(v) => modifica.mutate({ id: c.id, patch: { confermato: !!v } })} />
                      </td>
                      <td className="px-2 py-1">
                        {puoScrivere && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={tr("Elimina {simbolo}", { simbolo: c.simbolo })} onClick={() => elimina.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-slate-500">{tr("Nessun conteggio per questa tavola.")}</p>}
        </section>
        <div className="border-t pt-3"><Button type="button" variant={confronto ? "secondary" : "default"} onClick={() => setConfronto(v => !v)}>{confronto ? tr("Chiudi confronto acquisti") : tr("Confronta con gli acquisti")}</Button><p className="mt-2 text-xs text-muted-foreground">{tr("Usa i conteggi confermati per completare i materiali o correggere il fabbisogno.")}</p></div>
        {confronto && <ConfrontoTavoleAcquisti companyId={companyId} orderId={orderId} conteggi={dati.data?.conteggi ?? []} puoScrivere={puoScrivere} onAggiornati={aggiorna} onGenera={onGenera ? () => { onOpenChange(false); onGenera(); } : undefined} />}
      </DialogContent>
    </Dialog>
  );
}
