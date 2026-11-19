import { UniformSelect } from "@/components/ui/uniform-select";
// Commessa generale dai documenti — il grande popup «Costruisci la commessa generale» (lotti 4-8 di
// docs/piano-commessa-generale-da-documenti.md, §4). Sul modello di «Crea con Silvio»: Fonti ·
// Proposta · Documento. Ogni dato mostra pagina e citazione, cosa diventa e il suo stato; si
// conferma o si corregge, e niente si scrive senza conferma. L'AI ha solo proposto: i controlli
// sono codice (controlli.ts) e la scrittura è una transazione (commessa_generale_crea_da_documenti).
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, CircleHelp, ExternalLink, FileText, Loader2, MessageSquare, PenLine, Send, Undo2, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { catalogoPer, SCELTE_DECISE, SEZIONI, type CampoCatalogo, type SezioneId, type TipoDaDocumenti } from "@/lib/orders/generali/daDocumenti/catalogo";
import { controlli, statoCampi, statoCampo, type Controllo, type EsitoCampo, type Occorrenza, type Valore } from "@/lib/orders/generali/daDocumenti/controlli";
import { dataIso, numeroItaliano, numeroPercentuale } from "@/lib/orders/generali/daDocumenti/estrazione";
import { bozzaDa, mancaPerCreare, nomeDaOggetto, pianoDiScrittura, type BozzaCostruisci } from "@/lib/orders/generali/daDocumenti/scritture";
import type { Strutturati } from "@/lib/orders/generali/daDocumenti/strutturati";
import type { RigaLettura, RigaPagina } from "@/lib/orders/generali/daDocumenti/foto";
import { BUCKET_LETTURE } from "@/lib/orders/generali/daDocumenti/prepara";
import { chiaveLettura, domandaSuiDocumenti } from "@/hooks/useLetturaGenerale";
import { useRiepilogoGenerale } from "@/hooks/useCommesseGenerali";
import { totaliGenerale } from "@/lib/orders/commesseGenerali";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Props {
  lettura: RigaLettura; pagine: RigaPagina[]; onIndietro: () => void; onChiudi: () => void;
  /** Chiude anche i popup sotto (es. «Nuova commessa generale») quando si apre la commessa creata. */
  onCreata?: () => void;
}

type Fonte = { fileId: string; fileNome: string; pagina: number; citazione?: string };
type Vista = "proposta" | "documento" | "fonti";

const ORDINE_SEZIONI: SezioneId[] = ["generale", "parti", "codici", "figure", "importi", "tempi", "penali", "pagamenti", "garanzie", "computo", "area", "titolo", "immobile"];

export function CostruisciGenerale({ lettura, pagine, onIndietro, onChiudi, onCreata }: Props) {
  const tipo = lettura.tipo;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const [bozza, setBozza] = useState<BozzaCostruisci>(() => {
    const b = bozzaDa(lettura.bozza);
    // Il nome proposto: l'oggetto letto, se c'è e non ne è stato scritto uno.
    const oggetto = statoCampo(tipo, "oggetto", lettura.dati ?? {}, b.scelte).valore;
    if (!b.nome && typeof oggetto === "string") b.nome = nomeDaOggetto(oggetto);
    if (!b.forma && tipo === "appalto_pubblico") b.forma = (lettura.forma as BozzaCostruisci["forma"]) ?? "singolo";
    return b;
  });
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [vista, setVista] = useState<Vista>("proposta");
  const [crea, setCrea] = useState<"no" | "in_corso">("no");
  const [creato, setCreato] = useState<{ id: string; figlia: boolean } | null>(lettura.stato === "usata" && lettura.generale_id ? { id: lettura.generale_id, figlia: false } : null);
  const nomiFile = useMemo(() => new Map(lettura.file.map((f) => [f.nome, f.id])), [lettura.file]);

  // La bozza si salva da sola: si chiude e si riprende.
  const primo = useRef(true);
  useEffect(() => {
    if (primo.current) { primo.current = false; return; }
    // Il costruttore delle query di supabase parte solo con then/await: senza, la bozza non si salva.
    const t = setTimeout(() => {
      db.rpc("generale_lettura_bozza_salva", { p_id: lettura.id, p_bozza: bozza })
        .then(({ error }: { error: { message: string } | null }) => { if (error) console.warn("[costruisci] bozza non salvata:", error.message); });
    }, 800);
    return () => clearTimeout(t);
  }, [bozza, lettura.id]);

  const dati = useMemo(() => lettura.dati ?? {}, [lettura.dati]);
  const campi = useMemo(() => statoCampi(tipo, dati, bozza.scelte), [tipo, dati, bozza.scelte]);
  const ctrl = useMemo(() => controlli(tipo, dati, bozza.scelte), [tipo, dati, bozza.scelte]);
  const confermati = new Set(bozza.confermati);
  // Bloccano solo i controlli rossi su campi che si stanno per scrivere, non accettati.
  const rossi = ctrl.filter((c) => c.esito === "errore" && !bozza.accettati.includes(c.id) && c.campi.some((k) => confermati.has(k)));
  const piano = useMemo(() => pianoDiScrittura(tipo, dati, bozza, lettura.strutturati as Strutturati), [tipo, dati, bozza, lettura.strutturati]);
  const applicativo = tipo === "appalto_pubblico" && bozza.forma === "applicativo";
  const manca = mancaPerCreare({ ...piano, cliente_id: applicativo ? "figlia" : piano.cliente_id }, rossi.length, applicativo);
  const [accordo, setAccordo] = useState<string | null>(lettura.generale_id);
  if (applicativo && !accordo) manca.push("l'accordo quadro a cui aggiungere il contratto applicativo");

  const cambia = (k: string, v: Valore | null) => setBozza((b) => ({ ...b, scelte: { ...b.scelte, [k]: v } }));
  const conferma = (k: string, si: boolean) => setBozza((b) => ({ ...b, confermati: si ? [...new Set([...b.confermati, k])] : b.confermati.filter((x) => x !== k) }));
  const apriFonte = (o: Occorrenza) => { setFonte({ fileId: nomiFile.get(o.file) ?? o.file, fileNome: o.file, pagina: o.pagina, citazione: o.citazione }); setVista("documento"); };

  const creaOra = async () => {
    if (manca.length > 0 || !effectiveCompany?.id || !user?.id) return;
    setCrea("in_corso");
    try {
      const { data, error } = applicativo
        ? await db.rpc("generale_applicativo_crea", { p_lettura: lettura.id, p_generale: accordo, p_piano: piano })
        : await db.rpc("commessa_generale_crea_da_documenti", { p_lettura: lettura.id, p_piano: piano });
      if (error) throw new Error(error.message);
      const id = data as string;
      const avvisi = await allegaOriginali(id, effectiveCompany.id, user.id, lettura);
      setCreato({ id, figlia: applicativo });
      toast.success(applicativo ? "Contratto applicativo aggiunto all'accordo quadro" : "Commessa generale creata dai documenti",
        avvisi.length ? { description: avvisi.join(" ") } : undefined);
      void qc.invalidateQueries({ queryKey: chiaveLettura(lettura.id) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCrea("no");
    }
  };

  const annullaTutto = async () => {
    const { error } = await db.rpc("commessa_generale_da_documenti_annulla", { p_lettura: lettura.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Tolto quello che era stato creato: è nel cestino.", { description: "La lettura resta: puoi ricostruire." });
    setCreato(null);
    void qc.invalidateQueries({ queryKey: chiaveLettura(lettura.id) });
  };

  if (creato) {
    return (
      <>
        <Testata tipo={tipo} onIndietro={onIndietro} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-6 w-6" aria-hidden /></span>
          <p className="text-lg font-semibold">{creato.figlia ? "Contratto applicativo aggiunto" : "Commessa generale creata"}</p>
          <p className="max-w-md text-sm text-muted-foreground">Sono stati scritti solo i dati confermati. I documenti caricati sono fra quelli della commessa.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={annullaTutto}><Undo2 className="mr-2 h-4 w-4" aria-hidden />Annulla tutto</Button>
            <Button onClick={() => { onChiudi(); onCreata?.(); navigate(`/azienda/ordini/${creato.figlia ? accordo ?? creato.id : creato.id}?scheda=contratto`); }}>Apri la commessa</Button>
          </div>
        </div>
      </>
    );
  }

  const conteggio = { campi: campi.filter((c) => c.stato !== "non_trovato" && c.stato !== "escluso").length };

  return (
    <>
      <Testata tipo={tipo} onIndietro={onIndietro} />
      {/* Sul computer la testata sta ferma sopra le colonne; sul telefono scorre con la proposta. */}
      <div className="hidden lg:block"><IntestazioneCostruisci dove="alto" tipo={tipo} bozza={bozza} setBozza={setBozza} campi={campi} accordo={accordo} setAccordo={setAccordo} /></div>
      {/* Telefono: una colonna per volta. */}
      <div className="flex border-b bg-white lg:hidden" role="tablist">
        {(["proposta", "documento", "fonti"] as Vista[]).map((v) => (
          <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
            className={cn("flex-1 px-3 py-2 text-sm", vista === v ? "border-b-2 border-primary font-semibold" : "text-muted-foreground")}>
            {v === "proposta" ? "Proposta" : v === "documento" ? "Documento" : "Fonti"}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[11rem_minmax(0,1fr)_20rem] xl:grid-cols-[14rem_minmax(0,1fr)_26rem]">
        <aside className={cn("min-h-0 overflow-y-auto border-r bg-white p-3", vista === "fonti" ? "block" : "hidden lg:block")} aria-label="Fonti">
          <Fonti lettura={lettura} pagine={pagine} attiva={fonte} onApri={(f) => { setFonte(f); setVista("documento"); }} />
        </aside>
        <section className={cn("min-h-0 space-y-4 overflow-y-auto p-3 sm:p-4", vista === "proposta" ? "block" : "hidden lg:block")} aria-label="Proposta">
          <div className="-mx-3 -mt-3 border-b lg:hidden"><IntestazioneCostruisci dove="dentro" tipo={tipo} bozza={bozza} setBozza={setBozza} campi={campi} accordo={accordo} setAccordo={setAccordo} /></div>
          <Controlli ctrl={ctrl} accettati={bozza.accettati} onAccetta={(id, si) => setBozza((b) => ({ ...b, accettati: si ? [...b.accettati, id] : b.accettati.filter((x) => x !== id) }))} confermati={confermati} />
          {ORDINE_SEZIONI.map((s) => {
            const qui = catalogoPer(tipo).campi.filter((c) => c.sezione === s && !c.escluso);
            if (qui.length === 0 && !(s === "computo" && Object.keys(lettura.strutturati ?? {}).length)) return null;
            return (
              <Sezione key={s} id={s} campi={qui} esiti={campi} bozza={bozza}
                onCambia={cambia} onConferma={conferma} onFonte={apriFonte}
                onConfermaTutti={(chiavi) => setBozza((b) => ({ ...b, confermati: [...new Set([...b.confermati, ...chiavi])] }))}
                extra={s === "computo" ? <ComputoStrutturato strutturati={lettura.strutturati as Strutturati} bozza={bozza} setBozza={setBozza} piano={piano} /> : null} />
            );
          })}
          {lettura.avvisi?.length > 0 && (
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Avvisi della lettura ({lettura.avvisi.length})</summary>
              <ul className="mt-1 list-disc pl-5">{lettura.avvisi.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
          )}
        </section>
        <aside className={cn("min-h-0 overflow-y-auto border-l bg-white", vista === "documento" ? "block" : "hidden lg:block")} aria-label="Documento">
          <Documento lettura={lettura} fonte={fonte} onIncludi={async (f) => {
            const { error } = await db.rpc("generale_lettura_includi_pagina", { p_id: lettura.id, p_file: f.fileId, p_numero: f.pagina });
            if (error) { toast.error(error.message); return; }
            toast.success("Pagina inclusa", { description: "Premi «Riprendi»: si legge la pagina e si rifà l'estrazione (costa come una lettura nuova delle pagine)." });
            await qc.invalidateQueries({ queryKey: chiaveLettura(lettura.id) });
            onIndietro();
          }} />
          <Domanda letturaId={lettura.id} onFonte={(f) => setFonte(f)} nomiFile={nomiFile} />
        </aside>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <span className="mr-auto min-w-0 text-xs text-muted-foreground">
          {manca.length > 0 ? <>Manca: {manca.join(", ")}.</> : <>Si scrivono {bozza.confermati.length} dati confermati su {conteggio.campi} letti{piano.elenco.length ? `, ${piano.elenco.length} voci di elenco prezzi` : ""}{piano.fasi.length ? `, ${piano.fasi.length} fasi` : ""}.</>}
          {piano.note.length > 0 && <span className="block text-amber-700">{piano.note.join(" ")}</span>}
        </span>
        <Button variant="ghost" onClick={onIndietro}>Indietro</Button>
        <Button onClick={creaOra} disabled={manca.length > 0 || crea === "in_corso"}>
          {crea === "in_corso" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {applicativo ? "Aggiungi il contratto applicativo" : "Crea la commessa generale"}
        </Button>
      </footer>
    </>
  );
}

// ─── Pezzi ─────────────────────────────────────────────────────────────────────

function Testata({ tipo, onIndietro }: { tipo: TipoDaDocumenti; onIndietro: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b bg-white px-4 py-3 pr-14 sm:px-6">
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onIndietro} aria-label="Torna alla lettura"><ArrowLeft className="h-4 w-4" /></Button>
      <div className="min-w-0 flex-1">
        <DialogTitle className="text-base font-semibold sm:text-lg">Costruisci la commessa generale</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {tipo === "appalto_pubblico" ? "Appalto pubblico" : tipo === "appalto_privato" ? "Appalto privato" : tipo === "sviluppo" ? "Sviluppo immobiliare" : "Compra, ristruttura, vendi"} · conferma o correggi ogni dato: si scrive solo quello confermato
        </DialogDescription>
      </div>
    </header>
  );
}

function IntestazioneCostruisci({ dove, tipo, bozza, setBozza, campi, accordo, setAccordo }: {
  dove: string; tipo: TipoDaDocumenti; bozza: BozzaCostruisci; setBozza: React.Dispatch<React.SetStateAction<BozzaCostruisci>>; campi: EsitoCampo[];
  accordo: string | null; setAccordo: (id: string | null) => void;
}) {
  const { effectiveCompany } = useAuth();
  const appalto = tipo === "appalto_pubblico" || tipo === "appalto_privato";
  // Il committente letto; se manca, la stazione appaltante (negli appalti pubblici è lei).
  const committenteLetto = campi.find((c) => c.chiave === "committente" && c.valore) ?? campi.find((c) => c.chiave === "stazione_appaltante" && c.valore);
  const esecutore = campi.find((c) => c.chiave === "esecutore_forma");
  const rti = typeof esecutore?.valore === "string" && /rti|raggrupp|ati\b|mandataria|mandante/i.test(esecutore.valore);
  const generali = useQuery({
    queryKey: ["generali-appalto", effectiveCompany?.id],
    enabled: tipo === "appalto_pubblico" && bozza.forma === "applicativo" && !!effectiveCompany?.id,
    queryFn: async () => {
      // Solo le generali d'appalto; gli accordi quadro in cima.
      const { data: generali } = await db.from("commesse_generali").select("order_id, dati").eq("company_id", effectiveCompany!.id).eq("modello", "appalto").limit(500);
      const forma = new Map<string, string | null>(((generali ?? []) as { order_id: string; dati: { appalto?: { forma?: string } } | null }[])
        .map((g) => [g.order_id, g.dati?.appalto?.forma ?? null]));
      if (forma.size === 0) return [];
      const { data } = await db.from("orders").select("id, description, order_code").in("id", [...forma.keys()])
        .is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
      return ((data ?? []) as { id: string; description: string | null; order_code: string | null }[])
        .map((o) => ({ ...o, accordo: forma.get(o.id) === "Accordo quadro" }))
        .sort((a, b) => Number(b.accordo) - Number(a.accordo));
    },
  });
  return (
    <div className="grid gap-3 border-b bg-white px-4 py-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-1">
        <Label htmlFor={`cg-nome-${dove}`} className="text-xs">{bozza.forma === "applicativo" ? "Nome del contratto applicativo" : "Nome della commessa generale"}</Label>
        <Input id={`cg-nome-${dove}`} value={bozza.nome} onChange={(e) => setBozza((b) => ({ ...b, nome: e.target.value }))} placeholder="Dall'oggetto del contratto" />
      </div>
      {bozza.forma !== "applicativo" && (
        <div className="space-y-1">
          <Label htmlFor={`cg-cliente-${dove}`} className="text-xs">{appalto ? "Committente" : "Cliente"} {committenteLetto?.valore ? <span className="font-normal text-muted-foreground">— letto: {String(committenteLetto.valore)}</span> : null}</Label>
          <ScegliCliente id={`cg-cliente-${dove}`} valore={bozza.clienteId} onCambia={(id) => setBozza((b) => ({ ...b, clienteId: id }))} consentiNuovo />
        </div>
      )}
      {tipo === "appalto_pubblico" && (
        <div className="space-y-1">
          <Label className="text-xs">Forma <span className="font-normal text-muted-foreground">(l'accordo quadro è la generale, ogni applicativo una figlia che ne scala l'importo)</span></Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {(["singolo", "accordo_quadro", "applicativo"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={bozza.forma === f} onClick={() => setBozza((b) => ({ ...b, forma: f }))}
                className={cn("rounded-md border px-2 py-1 text-xs", bozza.forma === f ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground")}>
                {f === "singolo" ? "Contratto singolo" : f === "accordo_quadro" ? "Accordo quadro" : "Applicativo di un accordo"}
              </button>
            ))}
          </div>
          {bozza.forma === "applicativo" && accordo && <ResiduoAccordo accordoId={accordo} importo={campi.find((c) => c.chiave === "importo_contrattuale")?.valore ?? null} />}
          {bozza.forma === "applicativo" && (
            <UniformSelect className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={accordo ?? ""} onChange={(e) => setAccordo(e.target.value || null)} aria-label="Accordo quadro">
              <option value="">Scegli l'accordo quadro…</option>
              {(generali.data ?? []).map((g) => <option key={g.id} value={g.id}>{[g.order_code, g.description].filter(Boolean).join(" · ")}{g.accordo ? " (accordo quadro)" : ""}</option>)}
            </UniformSelect>
          )}
        </div>
      )}
      {appalto && (rti || bozza.quotaPct !== null) && (
        <div className="space-y-1">
          <Label htmlFor={`cg-quota-${dove}`} className="text-xs">La nostra quota nel raggruppamento <span className="font-normal text-muted-foreground">(la commessa vale per la quota; il totale resta nel contratto)</span></Label>
          <div className="flex items-center gap-2">
            <Input id={`cg-quota-${dove}`} inputMode="decimal" className="w-24" value={bozza.quotaPct ?? ""} placeholder="100"
              onChange={(e) => { const n = numeroItaliano(e.target.value); setBozza((b) => ({ ...b, quotaPct: e.target.value.trim() === "" ? null : n })); }} />
            <span className="text-sm">%</span>
          </div>
        </div>
      )}
    </div>
  );
}

const TONO: Record<EsitoCampo["stato"], { testo: string; classe: string }> = {
  letto: { testo: "letto", classe: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  scelto: { testo: "scelto da te", classe: "bg-sky-50 text-sky-800 border-sky-200" },
  conflitto: { testo: "valori diversi", classe: "bg-amber-50 text-amber-800 border-amber-300" },
  a_mano: { testo: "a mano: guarda", classe: "bg-amber-50 text-amber-800 border-amber-300" },
  non_trovato: { testo: "non trovato", classe: "bg-slate-50 text-slate-600 border-slate-200" },
  escluso: { testo: "non si legge", classe: "bg-slate-50 text-slate-500 border-slate-200" },
};

function Sezione({ id, campi, esiti, bozza, onCambia, onConferma, onConfermaTutti, onFonte, extra }: {
  id: SezioneId; campi: CampoCatalogo[]; esiti: EsitoCampo[]; bozza: BozzaCostruisci;
  onCambia: (k: string, v: Valore | null) => void; onConferma: (k: string, si: boolean) => void; onConfermaTutti: (k: string[]) => void;
  onFonte: (o: Occorrenza) => void; extra?: React.ReactNode;
}) {
  const [mostraMancanti, setMostraMancanti] = useState(false);
  const perChiave = new Map(esiti.map((e) => [e.chiave, e]));
  const trovati = campi.filter((c) => { const e = perChiave.get(c.chiave); return e && e.stato !== "non_trovato"; });
  const mancanti = campi.filter((c) => perChiave.get(c.chiave)?.stato === "non_trovato");
  const verdi = trovati.filter((c) => ["letto", "scelto"].includes(perChiave.get(c.chiave)!.stato)).map((c) => c.chiave);
  const tuttiVerdi = trovati.length > 0 && verdi.length === trovati.length && !trovati.every((c) => bozza.confermati.includes(c.chiave));
  const s = SEZIONI[id];
  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{s.titolo}</h3>
        <span className="text-xs text-muted-foreground">→ {s.diventa}</span>
        {tuttiVerdi && <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => onConfermaTutti(verdi)}><Check className="mr-1 h-3.5 w-3.5" />Conferma la sezione</Button>}
      </div>
      <ul className="divide-y">
        {trovati.map((c) => <RigaCampo key={c.chiave} def={c} esito={perChiave.get(c.chiave)!} confermato={bozza.confermati.includes(c.chiave)} onCambia={onCambia} onConferma={onConferma} onFonte={onFonte} />)}
        {mostraMancanti && mancanti.map((c) => <RigaCampo key={c.chiave} def={c} esito={perChiave.get(c.chiave)!} confermato={bozza.confermati.includes(c.chiave)} onCambia={onCambia} onConferma={onConferma} onFonte={onFonte} />)}
      </ul>
      {extra}
      {mancanti.length > 0 && !mostraMancanti && (
        <button className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-slate-50" onClick={() => setMostraMancanti(true)}>
          {mancanti.length} non trovati nei documenti{mancanti.some((m) => m.scelta === "capitolato") ? " (alcuni stanno di solito nel capitolato speciale: caricalo, è facoltativo)" : ""} — scrivili a mano
        </button>
      )}
    </div>
  );
}

function RigaCampo({ def, esito, confermato, onCambia, onConferma, onFonte }: {
  def: CampoCatalogo; esito: EsitoCampo; confermato: boolean;
  onCambia: (k: string, v: Valore | null) => void; onConferma: (k: string, si: boolean) => void; onFonte: (o: Occorrenza) => void;
}) {
  const [modifica, setModifica] = useState(false);
  const [testo, setTesto] = useState("");
  const tono = TONO[esito.stato];
  const valore = esito.valore;
  const puoConfermare = valore !== null && valore !== "";
  const salva = () => {
    const v = leggiInput(def.tipo, testo);
    if (v === null) {
      toast.error(def.tipo === "percentuale" || def.tipo === "permille"
        ? `«${def.etichetta}»: scrivi un numero sotto 100, con la virgola o il punto per i decimali (es. 12,5).`
        : `Valore non valido per «${def.etichetta}».`);
      return;
    }
    onCambia(def.chiave, v); setModifica(false); onConferma(def.chiave, false);
  };
  return (
    <li className={cn("px-3 py-2", confermato && "bg-emerald-50/40")}>
      <div className="flex flex-wrap items-start gap-2">
        <label className="flex shrink-0 items-center pt-0.5" title={puoConfermare ? "Conferma: si scrive" : "Prima scegli o scrivi il valore"}>
          <input type="checkbox" className="h-4 w-4" checked={confermato} disabled={!puoConfermare} onChange={(e) => onConferma(def.chiave, e.target.checked)} aria-label={`Conferma ${def.etichetta}`} />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs text-muted-foreground">{def.etichetta}</span>
            <span className={cn("rounded border px-1.5 text-[10px] font-medium", tono.classe)}>{tono.testo}</span>
          </div>
          {modifica ? (
            <div className="mt-1 flex gap-1.5">
              <Input autoFocus className="h-8" value={testo} onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salva(); if (e.key === "Escape") setModifica(false); }}
                placeholder={def.tipo === "data" ? "gg/mm/aaaa" : def.tipo === "importo" ? "es. 365.000,00" : ""} />
              <Button size="sm" className="h-8" onClick={salva}>Usa</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setModifica(false)}>Annulla</Button>
            </div>
          ) : esito.stato === "conflitto" ? (
            <div className="mt-1 space-y-1" role="radiogroup" aria-label={`Scegli ${def.etichetta}`}>
              {esito.valori.map((v) => (
                <label key={String(v.valore)} className="flex cursor-pointer items-start gap-2 rounded border border-amber-200 bg-amber-50/60 px-2 py-1 text-sm">
                  <input type="radio" name={`scelta-${def.chiave}`} className="mt-1" onChange={() => onCambia(def.chiave, v.valore)} />
                  <span className="min-w-0"><b className="tabular-nums">{mostra(v.valore, def.tipo)}</b>
                    {v.occorrenze.map((o, i) => <button key={i} type="button" className="ml-2 text-xs text-primary underline-offset-2 hover:underline" onClick={() => onFonte(o)}>pag. {o.pagina} · {o.file}</button>)}
                  </span>
                </label>
              ))}
              {def.scelta && <p className="flex gap-1 text-[11px] text-amber-900"><CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />{SCELTE_DECISE[def.scelta].regola}</p>}
            </div>
          ) : (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className={cn("text-sm font-medium tabular-nums", valore === null && "font-normal text-muted-foreground")}>{valore === null ? "—" : mostra(valore, def.tipo)}</span>
              {esito.valori[0]?.occorrenze.slice(0, 2).map((o, i) => (
                <button key={i} type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => onFonte(o)} title={o.citazione}>
                  pag. {o.pagina} · {o.file}{o.certezza === "dedotto" ? " · citazione non trovata" : o.certezza === "calcolato" ? " · calcolato" : ""}
                </button>
              ))}
            </div>
          )}
          {!modifica && esito.valori[0]?.occorrenze[0]?.citazione && esito.stato !== "conflitto" && (
            <p className="mt-0.5 line-clamp-2 text-[11px] italic text-muted-foreground">«{esito.valori[0].occorrenze[0].citazione}»</p>
          )}
        </div>
        {!modifica && (
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setTesto(valore === null ? "" : mostra(valore, def.tipo)); setModifica(true); }} aria-label={`Correggi ${def.etichetta}`}>
            <PenLine className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

function Controlli({ ctrl, accettati, onAccetta, confermati }: { ctrl: Controllo[]; accettati: string[]; onAccetta: (id: string, si: boolean) => void; confermati: Set<string> }) {
  const visibili = ctrl.filter((c) => c.esito !== "non_verificabile");
  if (visibili.length === 0) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <h3 className="mb-1 text-sm font-semibold">Controlli <span className="font-normal text-muted-foreground">— li fa il sistema, non l'AI</span></h3>
      <ul className="grid gap-1 sm:grid-cols-2">
        {visibili.map((c) => {
          const rosso = c.esito === "errore";
          const pesa = rosso && c.campi.some((k) => confermati.has(k));
          return (
            <li key={c.id} className="flex gap-1.5 text-xs">
              <span className="mt-0.5 shrink-0" aria-hidden>{c.esito === "ok" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : rosso ? <XIcon className="h-3.5 w-3.5 text-red-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}</span>
              <span className="min-w-0">{c.titolo}{c.esito !== "ok" && <span className="block text-muted-foreground">{c.messaggio}</span>}
                {pesa && (
                  <label className="mt-0.5 flex items-center gap-1 text-[11px]"><input type="checkbox" checked={accettati.includes(c.id)} onChange={(e) => onAccetta(c.id, e.target.checked)} />Ho controllato: va bene così</label>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComputoStrutturato({ strutturati, bozza, setBozza, piano }: {
  strutturati: Strutturati; bozza: BozzaCostruisci; setBozza: React.Dispatch<React.SetStateAction<BozzaCostruisci>>; piano: ReturnType<typeof pianoDiScrittura>;
}) {
  const voci = Object.values(strutturati ?? {}).reduce((s, x) => s + (x.voci?.length ?? 0), 0);
  if (!voci) return null;
  return (
    <div className="space-y-1 border-t px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">Dal computo letto senza AI: {voci} voci.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={bozza.conElenco} onChange={(e) => setBozza((b) => ({ ...b, conElenco: e.target.checked }))} />Crea l'elenco prezzi del contratto ({piano.elenco.length} voci)</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={bozza.conFasi} onChange={(e) => setBozza((b) => ({ ...b, conFasi: e.target.checked }))} />Crea le fasi dai capitoli ({piano.fasi.length} fasi){bozza.forma === "accordo_quadro" ? " — per un accordo quadro di solito si fanno sugli applicativi" : ""}</label>
    </div>
  );
}

function Fonti({ lettura, pagine, attiva, onApri }: { lettura: RigaLettura; pagine: RigaPagina[]; attiva: Fonte | null; onApri: (f: Fonte) => void }) {
  return (
    <div className="space-y-3">
      {lettura.file.map((f) => (
        <div key={f.id}>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /><span className="truncate">{f.nome}</span></p>
          <ul className="flex flex-wrap gap-1">
            {pagine.filter((p) => p.file_id === f.id).map((p) => (
              <li key={p.numero}>
                <button type="button" onClick={() => onApri({ fileId: f.id, fileNome: f.nome, pagina: p.numero })} title={`Pag. ${p.numero}${p.classe ? ` · ${p.classe}` : ""}`}
                  className={cn("h-7 min-w-7 rounded border px-1 text-[10px] tabular-nums",
                    attiva?.fileId === f.id && attiva.pagina === p.numero ? "border-primary bg-primary text-white"
                      : p.stato === "esclusa" || p.stato === "bianca" ? "text-muted-foreground opacity-50" : p.stato === "illeggibile" ? "border-red-300 bg-red-50" : "bg-white hover:border-primary")}>
                  {f.strutturato ? "file" : p.numero}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Documento({ lettura, fonte, onIncludi }: { lettura: RigaLettura; fonte: Fonte | null; onIncludi: (f: Fonte) => void }) {
  const testo = useQuery({
    queryKey: ["generale-lettura-pagina", lettura.id, fonte?.fileId, fonte?.pagina],
    enabled: !!fonte,
    queryFn: async () => {
      const { data } = await db.from("generale_lettura_pagine").select("testo, stato, classe").eq("lettura_id", lettura.id).eq("file_id", fonte!.fileId).eq("numero", fonte!.pagina).maybeSingle();
      return data as { testo: string | null; stato: string; classe: string | null } | null;
    },
  });
  const apriPdf = async () => {
    const f = lettura.file.find((x) => x.id === fonte?.fileId);
    if (!f) return;
    const { data, error } = await supabase.storage.from(BUCKET_LETTURE).createSignedUrl(f.percorso, 300);
    if (error || !data?.signedUrl) { toast.error("Non riesco ad aprire il file."); return; }
    window.open(`${data.signedUrl}#page=${fonte!.pagina}`, "_blank", "noopener");
  };
  if (!fonte) return <p className="p-4 text-sm text-muted-foreground">Tocca «pag. N» accanto a un dato per vedere la pagina e la citazione.</p>;
  const corpo = testo.data?.testo ?? "";
  const cit = (fonte.citazione ?? "").trim();
  const i = cit.length >= 4 ? corpo.toLowerCase().indexOf(cit.toLowerCase().slice(0, 80)) : -1;
  return (
    <div className="p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{fonte.fileNome} · pag. {fonte.pagina}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={apriPdf}><ExternalLink className="mr-1 h-3.5 w-3.5" />Originale</Button>
      </div>
      {testo.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : testo.data?.stato === "esclusa" ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Pagina con dati personali ({testo.data.classe ?? "esclusa"}): non è stata letta. Guardala dall'originale.</p>
            {lettura.stato !== "usata" && (
              <Button size="sm" variant="outline" onClick={() => onIncludi(fonte)}>Includi questa pagina</Button>
            )}
            <p className="text-xs">Se non contiene dati personali, includila: si rilegge e l'estrazione riparte da capo.</p>
          </div>
        )
          : !corpo ? <p className="text-sm text-muted-foreground">Nessun testo per questa pagina.</p>
            : (
              <pre className="max-h-[60vh] whitespace-pre-wrap break-words rounded border bg-slate-50 p-2 font-sans text-xs leading-relaxed">
                {i >= 0 ? <>{corpo.slice(0, i)}<mark className="rounded bg-yellow-200 px-0.5">{corpo.slice(i, i + Math.min(cit.length, 300))}</mark>{corpo.slice(i + Math.min(cit.length, 300))}</> : corpo}
              </pre>
            )}
      {cit && i < 0 && corpo && <p className="mt-1 text-[11px] text-amber-700">La citazione non si trova parola per parola in questa pagina: controlla sull'originale.</p>}
    </div>
  );
}

/** Silvio nel popup (lotto 8): una domanda sulle pagine già lette. Una chiamata, addebitata; non scrive niente. */
function Domanda({ letturaId, onFonte, nomiFile }: { letturaId: string; onFonte: (f: Fonte) => void; nomiFile: Map<string, string> }) {
  const [testo, setTesto] = useState("");
  const [risposta, setRisposta] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const chiedi = async () => {
    if (testo.trim().length < 3) return;
    setInCorso(true);
    try { setRisposta((await domandaSuiDocumenti(letturaId, testo.trim())).risposta); }
    catch (e) { toast.error((e as Error).message); }
    finally { setInCorso(false); }
  };
  // «pag. 5 di Contratto.pdf» nella risposta diventa un collegamento.
  const pezzi = (risposta ?? "").split(/(pag\.\s*\d+\s+di\s+[^\s,;.)»]+(?:\.[a-z]{3,4})?)/i);
  return (
    <div className="border-t p-3 sm:p-4">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><MessageSquare className="h-3.5 w-3.5" aria-hidden />Chiedi ai documenti</p>
      <div className="flex gap-1.5">
        <Input value={testo} onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void chiedi(); }} placeholder="Es. dove parla del subappalto?" className="h-8 text-sm" maxLength={500} />
        <Button size="icon" className="h-8 w-8 shrink-0" onClick={chiedi} disabled={inCorso || testo.trim().length < 3} aria-label="Chiedi">{inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Risponde solo con le pagine già lette. Ogni domanda è una chiamata AI addebitata.</p>
      {risposta && (
        <p className="mt-2 whitespace-pre-wrap rounded border bg-slate-50 p-2 text-sm">
          {pezzi.map((p, i) => {
            const m = /pag\.\s*(\d+)\s+di\s+(.+)/i.exec(p);
            if (!m) return <span key={i}>{p}</span>;
            const nome = m[2].trim();
            const id = nomiFile.get(nome);
            return id ? <button key={i} type="button" className="text-primary underline" onClick={() => onFonte({ fileId: id, fileNome: nome, pagina: Number(m[1]) })}>{p}</button> : <span key={i}>{p}</span>;
          })}
        </p>
      )}
    </div>
  );
}

/**
 * Contratto applicativo: quanto resta dell'accordo quadro, prima e dopo questo applicativo. È lo
 * stesso «Da assegnare» della pagina della generale: le figlie scalano l'importo massimo.
 * Avvisa sotto il 10% e oltre il tetto; non blocca (un atto aggiuntivo può alzare il tetto).
 */
function ResiduoAccordo({ accordoId, importo }: { accordoId: string; importo: Valore | null }) {
  const r = useRiepilogoGenerale(accordoId);
  if (!r.data) return null;
  const t = totaliGenerale(r.data);
  const valore = r.data.generale.valore;
  if (valore === null || t.daAssegnare === null) return <p className="mt-1 text-xs text-muted-foreground">L'accordo non ha un valore: scrivilo dalla sua pagina («Modifica»).</p>;
  const questo = typeof importo === "number" ? importo : 0;
  const dopo = t.daAssegnare - questo;
  const tono = dopo < 0 ? "text-destructive" : dopo < valore * 0.1 ? "text-amber-700" : "text-muted-foreground";
  const e = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  return (
    <p className={cn("mt-1 text-xs", tono)}>
      Accordo da {e(valore)}: già assegnati {e(t.assegnato ?? 0)} in {t.figlie === 1 ? "1 applicativo" : `${t.figlie} applicativi`}. Con questo ne restano {e(dopo)}{dopo < 0 ? ": si supera l'importo massimo" : dopo < valore * 0.1 ? ": meno del 10%" : ""}.
    </p>
  );
}

// ─── Utilità ───────────────────────────────────────────────────────────────────

function mostra(v: Valore, tipo: CampoCatalogo["tipo"]): string {
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (typeof v === "number") {
    if (tipo === "importo") return v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
    if (tipo === "percentuale") return `${v.toLocaleString("it-IT")}%`;
    if (tipo === "permille") return `${v.toLocaleString("it-IT")}‰ al giorno`;
    if (tipo === "giorni") return `${v} giorni`;
    return v.toLocaleString("it-IT");
  }
  if (tipo === "data" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  return v;
}

function leggiInput(tipo: CampoCatalogo["tipo"], t: string): Valore | null {
  const s = t.trim();
  if (!s) return null;
  switch (tipo) {
    case "percentuale": case "permille": return numeroPercentuale(s.replace(/al giorno/gi, ""));
    case "importo": { const n = numeroItaliano(s); return n === null || n < 0 ? null : n; }
    case "giorni": { const n = numeroItaliano(s.replace(/giorni/gi, "")); return n === null || !Number.isInteger(n) || n < 0 ? null : n; }
    case "data": return dataIso(s);
    case "si_no": return /^s[iì]$/i.test(s) ? true : /^no$/i.test(s) ? false : null;
    case "codice": return s.replace(/\s+/g, "").toUpperCase();
    default: return s.slice(0, 300);
  }
}

/** I file caricati diventano documenti della commessa (accesso «vendita», come il contratto letto alla creazione). */
async function allegaOriginali(ordineId: string, companyId: string, userId: string, lettura: RigaLettura): Promise<string[]> {
  const avvisi: string[] = [];
  for (const f of lettura.file) {
    try {
      if (!f.percorso.startsWith(`${companyId}/generali-letture/`)) continue;
      const nome = f.percorso.split("/").pop()!;
      const percorso = `${ordineId}/documenti-gara/${nome}`;
      const { data: gia } = await db.from("order_attachments").select("id").eq("order_id", ordineId).eq("file_url", percorso).limit(1);
      if (gia?.length) continue;
      const { data: blob, error: eGiu } = await supabase.storage.from(BUCKET_LETTURE).download(f.percorso);
      if (eGiu || !blob) throw eGiu ?? new Error("scaricamento");
      const { error: eSu } = await supabase.storage.from("order-attachments").upload(percorso, blob, { upsert: false, contentType: blob.type || undefined });
      if (eSu && !/already exists|duplicate/i.test(eSu.message)) throw eSu;
      const { error: eIns } = await db.from("order_attachments").insert({
        order_id: ordineId, file_url: percorso, file_name: f.nome, file_type: blob.type || null, file_size: blob.size,
        uploaded_by: userId, visible_to_customer: false, access_scope: "vendita",
      });
      if (eIns) throw eIns;
    } catch {
      avvisi.push(`«${f.nome}» non è stato copiato fra i documenti: caricalo dalla scheda Documenti.`);
    }
  }
  return avvisi;
}
