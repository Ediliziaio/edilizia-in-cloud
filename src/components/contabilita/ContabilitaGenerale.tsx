import { TabellaContabile } from "./TabellaContabile";
/**
 * Contabilità generale in partita doppia (10/11/2026), sezione dell'area fiscale.
 *
 * Tre viste: le scritture (con la nuova scrittura in dare e avere e lo storno),
 * il piano dei conti con la voce CEE di ogni conto, il libro giornale da
 * stampare. Le regole stanno nel database (contabilita_*): qui si legge e si
 * chiamano le funzioni, niente scritture dirette sulle tabelle.
 */
import { Link } from "react-router-dom";
import { useId, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { COLORI_GRAFICO, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, euroAsse, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileInput, Lock, Plus, Printer, Search, Trash2, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useSelezioneRighe } from "@/hooks/useSelezioneRighe";
import { eseguiPerRiga, messaggioErroreOperazione } from "@/lib/operazioniPerRiga";
import { BarraSelezioneRighe, ErroriOperazioneRighe } from "@/components/shared/BarraSelezioneRighe";
import { percheScritturaNonRettificabile, scritturaProvvisoria } from "@/lib/contabilita/rettificaScrittura";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { scaricaCsv } from "@/lib/csv";
import { FiscalSectionHeader } from "@/components/fatturazione/FiscalSectionLayout";
import { FiscalSourceViewer } from "@/components/fatturazione/FiscalSourceViewer";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { RateiRiscontiFineAnno } from "@/components/contabilita/RateiRiscontiFineAnno";
import { RegistroCespiti } from "@/components/contabilita/RegistroCespiti";
import { ImposteFineAnno } from "@/components/contabilita/ImposteFineAnno";
import { ContiPerRuolo, type RuoloConto } from "@/components/contabilita/ContiPerRuolo";

/** I conti dell'accantonamento TFR, da scegliere in Fine anno quando il piano non ha i codici standard. */
const RUOLI_TFR: readonly RuoloConto[] = [
  { ruolo: "30.12", etichetta: "Accantonamento TFR (conto economico, B.9.c)", natura: "costo" },
  { ruolo: "12.01", etichetta: "Fondo TFR (stato patrimoniale, C)", natura: "passivo" },
];
/** Dove va il risultato dell'anno chiuso all'apertura dell'anno dopo. */
const RUOLI_UTILI_A_NUOVO: RuoloConto = { ruolo: "10.04", etichetta: "Utili (perdite) portati a nuovo (A.VIII): ci va il risultato dell'anno chiuso", natura: "passivo" };
const RUOLI_UTILE: RuoloConto = { ruolo: "10.05", etichetta: "Utile (perdita) dell'esercizio (A.IX): ci va il risultato della chiusura", natura: "passivo" };
import { RimanenzeFineAnno } from "@/components/contabilita/RimanenzeFineAnno";
import { bilancioASezioni, bilancioCee, bilancioDiVerifica, htmlBilancioCee, htmlBilancioSezioni, htmlBilancioVerifica, ricaviECostiPerMese, saldiPerConto, type LatoBilancio } from "@/lib/contabilita/bilancioCee";
import { RiquadroNumero } from "@/components/dashboard/RiquadroNumero";
import { GraficoRicaviCosti } from "@/components/charts/grafici/GraficoRicaviCosti";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AziendaIntestazione } from "@/lib/contabilita/documentoContabile";
import { contoAPartite, htmlMastrino, mastrino, partitario } from "@/lib/contabilita/mastrini";
import {
  controllaBozza,
  costruisciGiornale,
  csvGiornale,
  csvPianoDeiConti,
  htmlLibroGiornale,
  importo,
  type ContoContabile,
  type RigaBozza,
  type Scrittura,
} from "@/lib/contabilita/libroGiornale";

// Le tabelle sono nuove: i tipi generati non le conoscono ancora.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// «always»: in italiano 4000 resterebbe senza il punto delle migliaia.
const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
const dataIt = (d: string) => d.split("-").reverse().join("/");
const oggi = () => new Date().toLocaleDateString("en-CA");
const rigaVuota = (): RigaBozza => ({ conto_id: "", dare: "", avere: "", descrizione: "" });

const CAUSALI = [
  "Giroconto",
  "Pagamento F24",
  "Stipendi",
  "Ammortamento",
  "Rateo",
  "Risconto",
  "Accantonamento",
  "Apertura conti",
  "Chiusura conti",
  "Rettifica",
];

const NATURE: Array<{ value: ContoContabile["natura"]; label: string; sezione: "SPA" | "SPP" | "CE" }> = [
  { value: "attivo", label: "Attività (stato patrimoniale)", sezione: "SPA" },
  { value: "passivo", label: "Passività e netto (stato patrimoniale)", sezione: "SPP" },
  { value: "costo", label: "Costo (conto economico)", sezione: "CE" },
  { value: "ricavo", label: "Ricavo (conto economico)", sezione: "CE" },
];

const chiave = (companyId: string | undefined, ...resto: unknown[]) => ["contabilita-generale", companyId, ...resto];

function useConti(companyId: string | undefined) {
  return useQuery({
    queryKey: chiave(companyId, "conti"),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("contabilita_conti").select("*").eq("company_id", companyId).order("codice");
      if (error) throw error;
      return (data ?? []) as ContoContabile[];
    },
  });
}

function useScritture(companyId: string | undefined, anno: number) {
  return useQuery({
    queryKey: chiave(companyId, "scritture", anno),
    enabled: !!companyId,
    queryFn: async () => {
      // PostgREST restituisce al più mille righe per chiamata: un esercizio di un'impresa
      // vera ne ha migliaia (Bonarrigo 2025: oltre 3.500), e giornale e bilancio senza le
      // altre sarebbero sbagliati senza dirlo. Si legge a pagine finché non finiscono.
      const PAGINA = 1000;
      const tutte: Scrittura[] = [];
      for (let da = 0; ; da += PAGINA) {
        const { data, error } = await db
          .from("contabilita_scritture")
          .select("id, esercizio, numero, data_registrazione, causale, descrizione, documento_numero, documento_data, origine, origine_id, storno_di, revisione, contabilita_righe(riga, conto_id, dare, avere, descrizione)")
          .eq("company_id", companyId)
          .eq("esercizio", anno)
          .order("numero", { ascending: false })
          .range(da, da + PAGINA - 1);
        if (error) throw error;
        tutte.push(...((data ?? []) as Scrittura[]));
        if ((data ?? []).length < PAGINA) break;
      }
      // Anche uno storno registrato nell'anno successivo rende l'originale già stornato.
      const { data: ids, error: erroreStorni } = await db.rpc("contabilita_storni_dell_esercizio", { p_company: companyId, p_anno: anno });
      if (erroreStorni) throw erroreStorni;
      const stornate = new Set<string>(Array.isArray(ids) ? ids : []);
      return tutte.map((s) => ({ ...s, stornata: stornate.has(s.id) }));
    },
  });
}

export default function ContabilitaGenerale() {
  const p = useFiscalPeriod();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const richiesta = p.params.get("vista");
  const vista = richiesta === "conti" || richiesta === "giornale" || richiesta === "bilancio" || richiesta === "mastrini" || richiesta === "iva" || richiesta === "fine"
    ? richiesta : "scritture";
  const conti = useConti(companyId);

  return (
    <div className="space-y-4">
      <FiscalSectionHeader
        title="Contabilità generale"
        actions={
          <Select value={String(p.anno)} onValueChange={(v) => p.set({ anno: v })}>
            <SelectTrigger className="h-9 w-40" aria-label="Esercizio"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i).map((a) => (
                <SelectItem key={a} value={String(a)}>Esercizio {a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {/* Le viste su una riga sola, come linguette (16/11/2026): prima andavano a capo e sembravano pulsanti d'azione. */}
      <div role="tablist" aria-label="Viste della contabilità" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {([["scritture", "Scritture"], ["giornale", "Libro giornale"], ["mastrini", "Mastrini e partitari"], ["iva", "Liquidazione IVA"], ["bilancio", "Bilancio"], ["fine", "Fine anno e chiusura"], ["conti", "Piano dei conti"]] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={vista === k}
            onClick={() => p.set({ vista: k })}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${vista === k ? "bg-primary font-medium text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <StatoEsercizio companyId={companyId} anno={p.anno} />
      {conti.isLoading || conti.isError ? (
        <FiscalQueryState loading={conti.isLoading} error={conti.isError} onRetry={() => void conti.refetch()} />
      ) : (conti.data ?? []).length === 0 ? (
        <PianoVuoto companyId={companyId!} />
      ) : vista === "conti" ? (
        <PianoDeiConti companyId={companyId!} conti={conti.data!} />
      ) : vista === "mastrini" ? (
        <Mastrini companyId={companyId!} anno={p.anno} conti={conti.data!} />
      ) : vista === "iva" ? (
        <LiquidazioneIva companyId={companyId!} anno={p.anno} />
      ) : vista === "fine" ? (
        <FineAnno companyId={companyId!} anno={p.anno} />
      ) : vista === "bilancio" ? (
        <Bilancio companyId={companyId!} anno={p.anno} conti={conti.data!} />
      ) : (
        <Scritture companyId={companyId!} anno={p.anno} conti={conti.data!} giornale={vista === "giornale"} />
      )}
    </div>
  );
}

function PianoVuoto({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const carica = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_piano_standard", { p_company: companyId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`Piano dei conti caricato: ${n} conti`);
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error("Piano dei conti non caricato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="rounded-xl border p-6 text-sm space-y-3">
      <p className="font-medium">Il piano dei conti è vuoto.</p>
      <p className="text-muted-foreground">
        Carica il piano standard per l'edilizia: mastri e conti già collegati alle voci del bilancio CEE
        (artt. 2424 e 2425 del codice civile). Dopo puoi aggiungere i conti che ti servono.
      </p>
      <Button size="sm" onClick={() => carica.mutate()} disabled={carica.isPending}>
        {carica.isPending ? "Caricamento…" : "Carica il piano standard"}
      </Button>
    </div>
  );
}

function PianoDeiConti({ companyId, conti }: { companyId: string; conti: ContoContabile[] }) {
  const qc = useQueryClient();
  const [apri, setApri] = useState(false);
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [natura, setNatura] = useState<ContoContabile["natura"]>("costo");
  const [voce, setVoce] = useState("");
  const [mastro, setMastro] = useState("");
  const mastri = conti.filter((c) => !c.movimentabile);
  const nomeMastro = new Map(mastri.map((m) => [m.id, `${m.codice} ${m.descrizione}`]));
  const [modifica, setModifica] = useState<ContoContabile | null>(null);
  const [soloDaConfermare, setSoloDaConfermare] = useState(false);
  const daConfermare = conti.filter((c) => c.nota);
  const [ricerca, setRicerca] = useState("");
  const termine = ricerca.trim().toLocaleLowerCase("it");
  const visibili = (soloDaConfermare ? daConfermare : conti).filter(c =>
    [c.codice, c.descrizione, c.natura, c.voce_cee, c.codice_standard].some(v => v?.toLowerCase().includes(termine)));
  const crea = useMutation({
    mutationFn: async () => {
      const sezione = NATURE.find((n) => n.value === natura)!.sezione;
      const { error } = await db.rpc("contabilita_crea_conto", {
        p_company: companyId, p_codice: codice, p_descrizione: descrizione, p_natura: natura,
        p_sezione_cee: sezione, p_voce_cee: voce, p_mastro: mastro || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conto creato");
      setApri(false);
      setCodice(""); setDescrizione(""); setVoce(""); setMastro("");
      void qc.invalidateQueries({ queryKey: chiave(companyId, "conti") });
    },
    onError: (e) => toast.error("Conto non creato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input type="search" className="h-8 w-full sm:w-64" aria-label="Cerca nel piano dei conti" placeholder="Cerca codice, descrizione o voce CEE…" value={ricerca} onChange={e => setRicerca(e.target.value)} />
        {daConfermare.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloDaConfermare} onChange={(e) => setSoloDaConfermare(e.target.checked)} />
            Solo i conti da confermare ({daConfermare.length})
          </label>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{visibili.length} conti</span>
          <Button size="sm" variant="outline" onClick={() => scaricaCsv("piano-dei-conti", csvPianoDeiConti(conti))}><Download className="mr-1 h-4 w-4" />Esporta</Button>
          <Button size="sm" onClick={() => setApri(true)}><Plus className="mr-1 h-4 w-4" />Nuovo conto</Button>
        </div>
      </div>
      <TabellaContabile>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Codice</th><th className="p-2">Descrizione</th><th className="p-2">Natura</th><th className="p-2">Voce CEE</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {visibili.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nessun conto con questi filtri.</td></tr>}
            {visibili.map((c) => (
              <tr key={c.id} className={c.movimentabile ? "border-t" : "border-t bg-muted/30 font-semibold"}>
                <td className="p-2 font-mono text-xs">{c.codice}</td>
                <td className="p-2">
                  {c.descrizione}
                  {c.codice_standard ? <span className="ml-2 rounded bg-blue-50 px-1.5 text-xs font-normal text-blue-800" title="Lo usano le scritture dai documenti">ruolo {c.codice_standard}</span> : null}
                  {c.nota ? <p className="text-xs font-normal text-amber-700">{c.nota}</p> : null}
                </td>
                <td className="p-2 text-muted-foreground">{c.natura}</td>
                <td className="p-2 text-muted-foreground">{c.sezione_cee ? `${c.sezione_cee === "SPA" ? "Attivo" : c.sezione_cee === "SPP" ? "Passivo" : "C.E."} ${c.voce_cee ?? ""}` : ""}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setModifica(c)}>Modifica</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabellaContabile>
      <Dialog open={apri} onOpenChange={setApri}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuovo conto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>Codice</Label><Input value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="30.08" /></div>
              <div className="col-span-2 space-y-1"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label>Natura</Label>
              <Select value={natura} onValueChange={(v) => setNatura(v as ContoContabile["natura"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NATURE.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Mastro</Label>
                <Select value={mastro || "nessuno"} onValueChange={(v) => setMastro(v === "nessuno" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Nessuno</SelectItem>
                    {mastri.map((m) => <SelectItem key={m.id} value={m.id}>{nomeMastro.get(m.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Voce CEE</Label><Input value={voce} onChange={(e) => setVoce(e.target.value)} placeholder="B.7" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApri(false)}>Annulla</Button>
            <Button onClick={() => crea.mutate()} disabled={crea.isPending || !codice.trim() || !descrizione.trim()}>Crea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ModificaConto conto={modifica} onClose={() => setModifica(null)}
        onFatto={() => void qc.invalidateQueries({ queryKey: chiave(companyId, "conti") })} />
    </div>
  );
}

/**
 * Da dove viene una scrittura, per leggere separati i costi delle fatture ricevute e i ricavi
 * delle emesse (richiesta dello studio, 11/11/2026).
 */
const GRUPPI_ORIGINE = [
  ["ricevute", "Fatture ricevute (costi)", ["fattura_ricevuta"]],
  ["emesse", "Fatture emesse (ricavi)", ["fattura_emessa"]],
  ["movimenti", "Incassi, pagamenti e F24", ["incasso", "incasso_fattura", "incasso_documento", "pagamento", "prima_nota", "f24", "giroconto", "ritenuta_subita"]],
] as const;
type GruppoOrigine = (typeof GRUPPI_ORIGINE)[number][0] | "tutte" | "altre";
function gruppoDi(origine: string | null | undefined): Exclude<GruppoOrigine, "tutte"> {
  for (const [k, , origini] of GRUPPI_ORIGINE) if ((origini as readonly string[]).includes(origine ?? "")) return k;
  return "altre";
}

function Scritture({ companyId, anno, conti, giornale }: { companyId: string; anno: number; conti: ContoContabile[]; giornale: boolean }) {
  const periodo = useFiscalPeriod();
  const qc = useQueryClient();
  const scritture = useScritture(companyId, anno);
  const esercizio = useEsercizio(companyId, anno).data;
  const anagrafica = useAnagraficaAzienda();
  const [nuova, setNuova] = useState(() => periodo.params.get("nuova") === "scrittura");
  const [stampa, setStampa] = useState<string | null>(null);
  const [dettaglioId, setDettaglioId] = useState<string | null>(null);
  const [storno, setStorno] = useState<Scrittura | null>(null);
  const [rettifica, setRettifica] = useState<Scrittura | null>(null);
  const [daEliminare, setDaEliminare] = useState<Scrittura | null>(null);
  const [motivoEliminazione, setMotivoEliminazione] = useState("");
  const elimina = useMutation({
    mutationFn: async () => {
      if (!daEliminare) return;
      const { error } = await db.rpc("contabilita_elimina_scrittura", { p_scrittura: daEliminare.id, p_revisione: daEliminare.revisione ?? 1, p_motivo: motivoEliminazione.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setDaEliminare(null); setMotivoEliminazione(""); toast.success("Scrittura provvisoria eliminata"); void qc.invalidateQueries({ queryKey: chiave(companyId) }); },
    onError: (e) => toast.error("Scrittura non eliminata", { description: messaggioErroreOperazione(e) }),
  });
  const [storniAperti, setStorniAperti] = useState(false);
  const [dataStorni, setDataStorni] = useState(oggi());
  const [motivoStorni, setMotivoStorni] = useState("");
  const [erroriStorni, setErroriStorni] = useState<Array<{ nome: string; motivo: string }>>([]);
  // Un esercizio vero ha migliaia di scritture: a video le prime, la stampa le ha tutte.
  const [mostra, setMostra] = useState(300);
  const [definitiva, setDefinitiva] = useState(false);
  const [filtro, setFiltro] = useState<GruppoOrigine>("tutte");
  const [mostraStorico, setMostraStorico] = useState(false);
  // Ricerca e mese (16/11/2026): con un migliaio di scritture l'elenco senza filtri non si legge.
  const [cerca, setCerca] = useState("");
  const [mese, setMese] = useState("");
  const nomi = useMemo(() => new Map(conti.map((c) => [c.id, `${c.codice} ${c.descrizione}`])), [conti]);
  // Fatture emesse e ricevute, incassi e pagamenti, movimenti di prima nota e F24 pagati
  // dell'esercizio diventano scritture.
  // Lo fa il database (contabilita_genera_da_documenti): un documento genera al più
  // una scrittura viva, quindi rilanciarlo aggiunge solo quello che manca; tutto in
  // ordine di data, così i numeri seguono il calendario.
  const genera = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_genera_da_documenti", { p_company: companyId, p_anno: anno });
      if (error) throw error;
      return data as {
        fatture_emesse: number; fatture_ricevute: number; incassi: number; pagamenti: number; altre?: number; movimenti?: number; giroconti_saltati?: number; cedolini?: number;
        saltate_solo_testata: number; gia_generate: number; riallineate?: number; errori: string[]; avvisi?: string[];
      };
    },
    onSuccess: (r) => {
      const nuove = r.fatture_emesse + r.fatture_ricevute + r.incassi + r.pagamenti + (r.altre ?? 0) + (r.movimenti ?? 0) + (r.cedolini ?? 0);
      const dettagli = [
        `${r.fatture_emesse} fatture emesse, ${r.fatture_ricevute} ricevute, ${r.incassi} incassi, ${r.pagamenti} pagamenti${r.altre ? `, ${r.altre} ritenute subite` : ""}${r.movimenti ? `, ${r.movimenti} movimenti di prima nota e F24` : ""}${r.cedolini ? `, ${r.cedolini} mesi di cedolini` : ""}`,
        r.giroconti_saltati ? `${r.giroconti_saltati} giroconti fra conti propri non registrati` : "",
        r.gia_generate ? `${r.gia_generate} già registrati` : "",
        r.riallineate ? `${r.riallineate} scritture aggiornate: revisione delle provvisorie, storno nei periodi definitivi o per documenti annullati` : "",
        r.saltate_solo_testata ? `${r.saltate_solo_testata} saltati: senza imponibile (solo testata) o senza la loro fattura in contabilità` : "",
        r.errori.length ? `${r.errori.length} non registrati: ${r.errori.slice(0, 3).join("; ")}` : "",
        r.avvisi?.length ? `${r.avvisi.length} cose da guardare (elenco sopra le scritture)` : "",
      ].filter(Boolean).join(" · ");
      (r.errori.length || r.avvisi?.length ? toast.warning : toast.success)(`${nuove} scritture generate`, { description: dettagli, duration: 12000 });
      // Tutta la contabilità: scritture, liquidazioni, fine anno e chiusura leggono le stesse scritture.
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
      // L'ora dell'ultimo aggiornamento la scrive il giro automatico; quello a mano la mostra subito.
      qc.setQueryData<StatoEsercizioRiga | null>(chiave(companyId, "esercizio", anno),
        (e) => e ? { ...e, generato_il: new Date().toISOString(), generato_esito: { ...(e.generato_esito ?? {}), avvisi: r.avvisi ?? [], errori: r.errori, saltate_solo_testata: r.saltate_solo_testata } } : e);
    },
    onError: (e) => toast.error("Scritture non generate", { description: e instanceof Error ? e.message : String(e) }),
  });
  const stornate = useMemo(() => new Set((scritture.data ?? []).flatMap((s) => [...(s.storno_di ? [s.storno_di] : []), ...(s.stornata ? [s.id] : [])])), [scritture.data]);
  const elenco = scritture.data ?? [];
  const elencoVisibile = giornale || mostraStorico ? elenco : elenco.filter(s => !s.storno_di && !stornate.has(s.id));
  const dettaglio = elenco.find(s => s.id === dettaglioId);
  const q = cerca.trim().toLowerCase();
  const filtrate = !q && !mese ? elencoVisibile : elencoVisibile.filter((s) => {
    if (mese && s.data_registrazione.slice(5, 7) !== mese) return false;
    if (!q) return true;
    return `${s.numero}/${s.esercizio}`.includes(q)
      || s.causale.toLowerCase().includes(q)
      || (s.descrizione ?? "").toLowerCase().includes(q)
      || (s.documento_numero ?? "").toLowerCase().includes(q)
      || s.contabilita_righe.some((r) => (nomi.get(r.conto_id) ?? "").toLowerCase().includes(q) || (r.descrizione ?? "").toLowerCase().includes(q));
  });
  const conFiltri = !!q || !!mese;
  const filtroGiornale = conFiltri ? new Set(filtrate.map(s => s.id)) : undefined;
  const g = costruisciGiornale(elenco, conti, 0, filtroGiornale);
  // Il filtro dell'origine vale per l'elenco delle scritture; ricerca e mese valgono anche nel libro giornale.
  const visibili = filtro === "tutte" ? filtrate : filtrate.filter((s) => gruppoDi(s.origine) === filtro);
  const selezione = useSelezioneRighe(visibili.slice(0, mostra), JSON.stringify([companyId, anno, filtro, mese, cerca, mostra, giornale]));
  const stornabili = selezione.selezionate.filter((s) => !percheScritturaNonRettificabile(s, stornate));
  const escluse = selezione.selezionate.flatMap((s) => {
    const motivo = percheScritturaNonRettificabile(s, stornate);
    return motivo ? [{ nome: `${s.numero}/${s.esercizio}`, motivo }] : [];
  });
  const stornaSelezionate = useMutation({
    mutationFn: () => eseguiPerRiga([...stornabili], async (s) => {
      const { error } = await db.rpc("contabilita_storna_scrittura", { p_scrittura: s.id, p_data: dataStorni, p_motivo: motivoStorni.trim() });
      if (error) throw error;
    }),
    onSuccess: ({ completate, errori }) => {
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
      selezione.mantieni(errori.map((e) => e.riga.id));
      setErroriStorni(errori.map((e) => ({ nome: `${e.riga.numero}/${e.riga.esercizio}`, motivo: e.motivo })));
      setStorniAperti(false);
      if (completate.length) toast.success(`${completate.length} scritture stornate`);
      else toast.error("Nessuna scrittura stornata");
    },
  });
  const quante = (k: GruppoOrigine) => (k === "tutte" ? filtrate.length : filtrate.filter((s) => gruppoDi(s.origine) === k).length);
  // Per i riquadri: ultima data registrata e quante scritture per mese (fino al mese dell'ultima).
  const ultima = elenco.reduce<string | null>((u, s) => (!u || s.data_registrazione > u ? s.data_registrazione : u), null);
  const fino = ultima ? Number(ultima.slice(5, 7)) : 0;
  const perMese = Array.from({ length: fino }, (_, i) => elenco.filter((s) => Number(s.data_registrazione.slice(5, 7)) === i + 1 && s.data_registrazione.startsWith(String(anno))).length);
  const apriStampa = (filtrata = false) => {
    const a = anagrafica.data;
    setStampa(htmlLibroGiornale({
      azienda: {
        ragione_sociale: a?.ragione_sociale ?? "", partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null,
        indirizzo_via: a?.indirizzo_via ?? null, indirizzo_numero_civico: a?.indirizzo_numero_civico ?? null, indirizzo_cap: a?.indirizzo_cap ?? null,
        indirizzo_comune: a?.indirizzo_comune ?? null, indirizzo_provincia: a?.indirizzo_provincia ?? null, logo_url: a?.logo_url ?? null,
      },
      selezione: filtrata ? filtroGiornale : undefined,
      scritture: elenco, conti, dal: `${anno}-01-01`, al: `${anno}-12-31`,
    }));
  };

  if (scritture.isLoading || scritture.isError) {
    return <FiscalQueryState loading={scritture.isLoading} error={scritture.isError} onRetry={() => void scritture.refetch()} />;
  }
  return (
    <div className="space-y-3">
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa}
          title="Libro giornale — anteprima di stampa" fileName={`libro-giornale-${anno}`} soloPdf />
      )}
      <DaGuardare esito={esercizio?.generato_esito} />
      {/* 14/11/2026: i numeri dell'esercizio in riquadri, con le scritture mese per mese. */}
      {!giornale && elenco.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RiquadroNumero
            etichetta="Scritture dell'esercizio"
            valore={elenco.length.toLocaleString("it-IT")}
            periodo={ultima ? `Ultima del ${new Date(`${ultima}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}` : `Esercizio ${anno}`}
            tendenza={perMese}
            etichettaTendenza="Scritture registrate mese per mese"
          />
          <RiquadroNumero etichetta="Da fatture ricevute" valore={quante("ricevute").toLocaleString("it-IT")} periodo="Costi" />
          <RiquadroNumero etichetta="Da fatture emesse" valore={quante("emesse").toLocaleString("it-IT")} periodo="Ricavi" />
          <RiquadroNumero
            etichetta="Da guardare"
            valore={String((esercizio?.generato_esito?.avvisi?.length ?? 0) + (esercizio?.generato_esito?.errori?.length ?? 0) + (esercizio?.generato_esito?.saltate_solo_testata ?? 0))}
            periodo="Dall'ultimo aggiornamento"
            tono={(esercizio?.generato_esito?.errori?.length ?? 0) > 0 ? "male" : ((esercizio?.generato_esito?.avvisi?.length ?? 0) + (esercizio?.generato_esito?.saltate_solo_testata ?? 0)) > 0 ? "attenzione" : "buono"}
          />
        </div>
      )}
      {elenco.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={cerca} onChange={(e) => { setCerca(e.target.value); setMostra(300); }} placeholder="Cerca numero, causale, conto, cliente…" aria-label="Cerca nelle scritture" className="h-9 pl-8" />
          </div>
          <Select value={mese || "tutti"} onValueChange={(v) => { setMese(v === "tutti" ? "" : v); setMostra(300); }}>
            <SelectTrigger className="h-9 w-40" aria-label="Mese"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutto il {anno}</SelectItem>
              {MESI.map((m, i) => <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          {conFiltri && <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => { setCerca(""); setMese(""); }}><X className="mr-1 h-3.5 w-3.5" />Azzera</Button>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {anno}: {g.scritture} scritture{conFiltri ? ` su ${elenco.length}` : ""} · dare {euro(g.totaleDare)} · avere {euro(g.totaleAvere)}
          {esercizio?.generato_il ? <> · {aggiornataAlle(esercizio.generato_il)}</> : null}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => apriStampa()}><Printer className="mr-1 h-4 w-4" />Stampa libro giornale · esercizio</Button>
          {giornale ? (
            <>
              {conFiltri && <>
                <Button size="sm" variant="outline" onClick={() => apriStampa(true)}>Stampa vista filtrata</Button>
                <Button size="sm" variant="outline" onClick={() => scaricaCsv(`libro-giornale-${anno}-filtrato`, csvGiornale(elenco, conti, filtroGiornale))}>Esporta vista filtrata</Button>
              </>}
              <Button size="sm" variant="outline" onClick={() => setDefinitiva(true)}><Lock className="mr-1 h-4 w-4" />Stampa definitiva</Button>
              <Button size="sm" variant="outline" onClick={() => scaricaCsv(`libro-giornale-${anno}`, csvGiornale(elenco, conti))}
                title="Una riga per movimento, col codice del conto: per il programma dello studio">
                <Download className="mr-1 h-4 w-4" />Esporta esercizio
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => genera.mutate()} disabled={genera.isPending}>
            <FileInput className="mr-1 h-4 w-4" />{genera.isPending ? "Aggiornamento…" : "Aggiorna adesso"}
          </Button>
          <Button size="sm" onClick={() => setNuova(true)}><Plus className="mr-1 h-4 w-4" />Nuova scrittura</Button>
        </div>
      </div>

      {!giornale && <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={mostraStorico} onCheckedChange={v => setMostraStorico(v === true)} />Mostra anche storni e scritture stornate</label>}
      {(giornale || mostraStorico) && elenco.some(s => s.storno_di) && <p className="rounded-lg border p-3 text-sm text-muted-foreground">Uno storno inverte una registrazione precedente. Se segue una nuova scrittura della stessa fattura, resta il saldo della versione aggiornata. Il libro giornale conserva la sequenza; nell’elenco delle scritture puoi consultare solo quelle attive.</p>}
      {!giornale && visibili.length > 0 && <BarraSelezioneRighe nome="le scritture" selezionate={selezione.selezionate.length} consentite={stornabili.length}
        tutte={selezione.tutte} parziale={selezione.parziale}
        entrate={stornabili.reduce((n, s) => n + s.contabilita_righe.reduce((t, r) => t + Number(r.dare || 0), 0), 0)}
        uscite={stornabili.reduce((n, s) => n + s.contabilita_righe.reduce((t, r) => t + Number(r.avere || 0), 0), 0)}
        entrateLabel="Dare" usciteLabel="Avere" azione="Storna selezionate" inCorso={stornaSelezionate.isPending}
        escluse={escluse} onPagina={selezione.pagina} onAzione={() => setStorniAperti(true)} />}
      <ErroriOperazioneRighe errori={erroriStorni} />
      {giornale ? (
        <TabellaContabile>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">N.</th><th className="p-2">Data</th><th className="p-2">Causale</th><th className="p-2">Conto</th><th className="p-2">Descrizione</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th></tr>
            </thead>
            <tbody>
              {g.righe.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">{conFiltri ? "Nessuna scrittura con questi filtri." : `Nessuna scrittura nel ${anno}.`}</td></tr>
              ) : g.righe.slice(0, mostra * 5).map((r) => (
                <tr key={r.progressivo} className={`cursor-pointer ${r.primaDellaScrittura ? "border-t" : ""}`}
                  onClick={e => { e.currentTarget.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus(); setDettaglioId(r.scritturaId); }}>
                  <td className="p-2 font-mono text-xs">{r.primaDellaScrittura ? r.numero : ""}</td>
                  <td className="p-2">{r.primaDellaScrittura ? dataIt(r.data) : ""}</td>
                  <td className="p-2">{r.primaDellaScrittura ? r.causale : ""}</td>
                  <td className="p-2"><button type="button" aria-haspopup="dialog" aria-label={`Apri scrittura ${r.registrazione}, ${r.conto}`} className="text-left text-primary hover:underline">{r.conto}</button></td>
                  <td className="max-w-xs truncate p-2 text-muted-foreground" title={r.descrizione || undefined}>{r.descrizione || "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.dare !== null ? euro(r.dare) : ""}</td>
                  <td className="p-2 text-right tabular-nums">{r.avere !== null ? euro(r.avere) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabellaContabile>
      ) : (
        <div className="space-y-2">
          {elenco.length > 0 ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Da dove vengono le scritture">
              {([["tutte", "Tutte"], ...GRUPPI_ORIGINE.map(([k, l]) => [k, l] as const), ["altre", "Altre"]] as Array<readonly [GruppoOrigine, string]>).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filtro === k} onClick={() => { setFiltro(k); setMostra(300); }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${filtro === k ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                  {l} <span className="tabular-nums">{quante(k)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {elenco.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessuna scrittura nel {anno}. Fatture, incassi e pagamenti si registrano da soli ogni quarto d'ora («Aggiorna adesso» per non aspettare); le altre operazioni si registrano con «Nuova scrittura».</p>
          ) : visibili.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">{conFiltri ? "Nessuna scrittura con questi filtri." : `Nessuna scrittura di questo tipo nel ${anno}.`}</p>
          ) : <TabellaContabile>
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="relative w-10 p-2"><span className="sr-only">Selezione</span></th>{["N.", "Data", "Causale", "Descrizione", "Importo"].map(t => <th key={t} className={t === "Importo" ? "p-2 text-right" : "p-2"}>{t}</th>)}</tr>
              </thead>
              <tbody>{visibili.slice(0, mostra).map(s => (
                <tr key={s.id} className="cursor-pointer border-t" onClick={e => {
                  e.currentTarget.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
                  setDettaglioId(s.id);
                }}>
                  <td className="px-2" onClick={e => e.stopPropagation()}><Checkbox aria-label={`Seleziona scrittura ${s.numero}/${s.esercizio}`} checked={selezione.ids.has(s.id)} disabled={stornaSelezionate.isPending} onCheckedChange={() => selezione.alterna(s.id)} /></td>
                  <td className="px-2"><button type="button" aria-haspopup="dialog" aria-label={`Apri scrittura ${s.numero}/${s.esercizio}`} className="py-2 font-mono text-xs text-primary hover:underline">{s.numero}/{s.esercizio}</button></td>
                  <td className="px-2">{dataIt(s.data_registrazione)}</td>
                  <td className="px-2">{s.causale}{s.storno_di || stornate.has(s.id) ? <span className="ml-2 text-xs text-muted-foreground">{s.storno_di ? "storno" : "stornata"}</span> : null}</td>
                  <td className="max-w-xs truncate px-2 text-muted-foreground" title={s.descrizione || undefined}>{s.descrizione || "—"}</td>
                  <td className="px-2 text-right tabular-nums">{euro(s.contabilita_righe.reduce((t, r) => t + Number(r.dare || 0), 0))}</td>
                </tr>
              ))}</tbody>
            </table>
          </TabellaContabile>}
        </div>
      )}
      {(giornale ? g.righe.length > mostra * 5 : visibili.length > mostra) ? (
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{giornale ? `Righe ${mostra * 5} di ${g.righe.length}` : `Scritture ${mostra} di ${visibili.length}`}: la stampa le contiene tutte.</span>
          <Button size="sm" variant="outline" onClick={() => setMostra((n) => n + 300)}>Mostra altre</Button>
        </div>
      ) : null}

      <DettaglioScrittura dettaglio={dettaglio} companyId={companyId} nomi={nomi}
        onClose={() => setDettaglioId(null)}
        onConto={conto => periodo.set({ vista: "mastrini", conto, anno: String(anno) })}
        onStorno={dettaglio && !dettaglio.storno_di && !stornate.has(dettaglio.id) ? setStorno : undefined}
        modificabile={!!dettaglio && scritturaProvvisoria(dettaglio, esercizio)}
        onElimina={dettaglio?.origine === "manuale" && scritturaProvvisoria(dettaglio, esercizio) ? setDaEliminare : undefined}
        onRettifica={dettaglio && !percheScritturaNonRettificabile(dettaglio, stornate) ? setRettifica : undefined} />
      <StampaDefinitiva open={definitiva} onOpenChange={setDefinitiva} companyId={companyId} anno={anno}
        onStampa={(dal, al) => setStampa(htmlLibroGiornale({ azienda: intestazioneDa(anagrafica.data), scritture: elenco, conti, dal, al, definitiva: true }))} />
      <NuovaScrittura key={rettifica?.id ?? "nuova"} open={nuova || !!rettifica} onOpenChange={(v) => { setNuova(v); if (!v) { setRettifica(null); if (periodo.params.get("nuova")) periodo.set({ nuova: "" }); } }} companyId={companyId} conti={conti} daRettificare={rettifica} modificaProvvisoria={!!rettifica && scritturaProvvisoria(rettifica, esercizio)}
        onFatto={() => void qc.invalidateQueries({ queryKey: chiave(companyId) })} />
      <StornaScrittura scrittura={storno} onClose={() => setStorno(null)}
        onFatto={() => void qc.invalidateQueries({ queryKey: chiave(companyId) })} />
      <Dialog open={!!daEliminare} onOpenChange={(v) => { if (!v && !elimina.isPending) { setDaEliminare(null); setMotivoEliminazione(""); } }}><DialogContent>
        <DialogHeader><DialogTitle>Elimina scrittura provvisoria</DialogTitle><DialogDescription>La scrittura {daEliminare?.numero}/{daEliminare?.esercizio} verrà rimossa e i saldi seguiranno le registrazioni rimaste. Il motivo e la copia precedente restano nello storico delle revisioni.</DialogDescription></DialogHeader>
        <Label htmlFor="motivo-eliminazione-scrittura">Motivo dell’eliminazione</Label><Input id="motivo-eliminazione-scrittura" value={motivoEliminazione} disabled={elimina.isPending} onChange={e => setMotivoEliminazione(e.target.value)} />
        <DialogFooter><Button variant="outline" disabled={elimina.isPending} onClick={() => { setDaEliminare(null); setMotivoEliminazione(""); }}>Annulla</Button><Button variant="destructive" disabled={elimina.isPending || !motivoEliminazione.trim()} onClick={() => elimina.mutate()}>{elimina.isPending ? "Eliminazione…" : "Elimina scrittura"}</Button></DialogFooter>
      </DialogContent></Dialog>
      <Dialog open={storniAperti} onOpenChange={(v) => { if (!stornaSelezionate.isPending) setStorniAperti(v); }}><DialogContent>
        <DialogHeader><DialogTitle>Storna {stornabili.length} scritture manuali</DialogTitle><DialogDescription>Per ogni scrittura viene registrato lo storno in Dare/Avere. Gli originali e il loro storico restano nel giornale.</DialogDescription></DialogHeader>
        <Label htmlFor="storni-data">Data degli storni</Label><Input id="storni-data" type="date" value={dataStorni} disabled={stornaSelezionate.isPending} onChange={(e) => setDataStorni(e.target.value)} />
        <Label htmlFor="storni-motivo">Motivo</Label><Input id="storni-motivo" value={motivoStorni} disabled={stornaSelezionate.isPending} onChange={(e) => setMotivoStorni(e.target.value)} />
        <DialogFooter><Button variant="outline" disabled={stornaSelezionate.isPending} onClick={() => setStorniAperti(false)}>Annulla</Button><Button variant="destructive" disabled={stornaSelezionate.isPending || !dataStorni || !motivoStorni.trim() || !stornabili.length} onClick={() => stornaSelezionate.mutate()}>{stornaSelezionate.isPending ? "Storno in corso…" : "Conferma storni"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}

function DettaglioScrittura({ dettaglio, companyId, nomi, onClose, onConto, onStorno, onRettifica, onElimina, modificabile }: {
  dettaglio: Scrittura | undefined;
  companyId: string;
  nomi: ReadonlyMap<string, string>;
  onClose: () => void;
  onConto: (id: string) => void;
  onStorno?: (scrittura: Scrittura) => void;
  onRettifica?: (scrittura: Scrittura) => void;
  onElimina?: (scrittura: Scrittura) => void;
  modificabile?: boolean;
}) {
  return (
    <Dialog open={!!dettaglio} onOpenChange={open => { if (!open) onClose(); }}>
        {dettaglio && <DialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Scrittura {dettaglio.numero}/{dettaglio.esercizio}</DialogTitle>
            <p className="text-sm text-muted-foreground">{dataIt(dettaglio.data_registrazione)} · {dettaglio.causale}</p>
          </DialogHeader>
          {dettaglio.descrizione && <p className="break-words text-sm">{dettaglio.descrizione}</p>}
          <div className="flex flex-wrap items-baseline gap-2 border-y py-3 text-sm">
            <span className="text-muted-foreground">Documento collegato</span>
            <DocumentoScrittura companyId={companyId} scrittura={dettaglio} />
            {dettaglio.documento_data && <span>{dataIt(dettaglio.documento_data)}</span>}
          </div>
          <TabellaContabile>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs"><tr><th className="p-2">Conto</th><th className="p-2">Descrizione</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th></tr></thead>
              <tbody>{[...dettaglio.contabilita_righe].sort((a,b) => a.riga-b.riga).map(r => (
                <tr key={r.riga} className="border-t"><td className="p-2">{nomi.has(r.conto_id) ? <button className="text-left text-primary hover:underline" title="Apri mastrino" onClick={() => onConto(r.conto_id)}>{nomi.get(r.conto_id)}</button> : "Conto non disponibile"}</td><td className="p-2 text-muted-foreground">{r.descrizione || "—"}</td>
                  {(["dare", "avere"] as const).map(lato => <td key={lato} className="p-2 text-right tabular-nums">{Number(r[lato]) ? euro(Number(r[lato])) : "—"}</td>)}</tr>
              ))}</tbody>
              <tfoot className="border-t bg-muted/30 font-semibold"><tr><td colSpan={2} className="p-2">Totali</td>
                {(["dare", "avere"] as const).map(lato => <td key={lato} className="p-2 text-right tabular-nums">{euro(dettaglio.contabilita_righe.reduce((t,r) => t + Number(r[lato] || 0), 0))}</td>)}
              </tr></tfoot>
            </table>
          </TabellaContabile>
          <DialogFooter>
            {onElimina && <Button variant="destructive" onClick={() => { onClose(); onElimina(dettaglio); }}>Elimina scrittura</Button>}
            {onRettifica && <Button variant="outline" onClick={() => { onClose(); onRettifica(dettaglio); }}>{modificabile ? "Modifica scrittura" : "Rettifica con storno"}</Button>}
            {onStorno && <Button variant="outline" onClick={() => { onClose(); onStorno(dettaglio); }}><Undo2 className="mr-1 h-4 w-4" />Storna</Button>}
            <Button onClick={onClose}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
  );
}

function DocumentoScrittura({ companyId, scrittura }: { companyId: string; scrittura: Scrittura }) {
  const { origine, origine_id: id, documento_numero: numero } = scrittura;
  const daMovimento = origine === "incasso_documento" || origine === "prima_nota";
  const indiretto = daMovimento || origine === "incasso";
  const documento = useQuery({
    queryKey: chiave(companyId, "documento-scrittura", origine, id),
    enabled: !!id && indiretto,
    queryFn: async () => {
      if (daMovimento) {
        const { data, error } = await supabase.from("prima_nota_entries").select("documento_fiscale_id, invoice_id").eq("company_id", companyId).eq("id", id!).maybeSingle();
        if (error) throw error;
        return data?.documento_fiscale_id ?? data?.invoice_id ?? null;
      }
      const { data, error } = await supabase.from("invoice_payments").select("invoice_id").eq("company_id", companyId).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data?.invoice_id ?? null;
    },
  });
  if (id && indiretto && documento.isLoading) return <span role="status">Caricamento…</span>;
  if (documento.isError) return <Button size="sm" variant="outline" onClick={() => void documento.refetch()}>Riprova a caricare il documento</Button>;
  if (origine === "f24" && id) return <VersamentoCollegato companyId={companyId} id={id} />;
  if (origine === "cedolini") {
    const periodo = scrittura.descrizione?.match(/\b(0[1-9]|1[0-2])\/(\d{4})\b/);
    if (periodo) return <Link className="font-medium text-primary hover:underline" to={`/azienda/personale?tab=cedolini&anno=${periodo[2]}&mese=${Number(periodo[1])}`}>Cedolini di {periodo[1]}/{periodo[2]}</Link>;
  }
  const acquisto = origine === "fattura_ricevuta" || origine === "pagamento";
  const vendita = origine === "fattura_emessa" || origine === "ritenuta_subita" || origine === "incasso_fattura";
  const documentoId = indiretto ? documento.data : acquisto || vendita ? id : null;
  return documentoId
    ? <FiscalSourceViewer id={documentoId} type={acquisto ? "acquisti" : "vendite"} label={numero || "Apri documento"} />
    : <span>{numero || "Nessun documento collegato"}</span>;
}

function VersamentoCollegato({ companyId, id }: { companyId: string; id: string }) {
  const q = useQuery({
    queryKey: chiave(companyId, "versamento", id),
    queryFn: async () => {
      const { data, error } = await supabase.from("f24_entries").select("tributo_code, tributo_descrizione, importo, data_pagamento, stato").eq("company_id", companyId).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <span role="status">Caricamento F24…</span>;
  if (q.isError) return <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Riprova a caricare il versamento</Button>;
  if (!q.data) return <span>Versamento F24 non disponibile</span>;
  const f = q.data;
  return <details><summary className="cursor-pointer text-primary">Versamento F24 · {f.tributo_code}</summary>
    <p className="mt-2">{f.tributo_descrizione} · {euro(f.importo)} · {f.stato}{f.data_pagamento && ` · ${dataIt(f.data_pagamento)}`}</p>
  </details>;
}

function NuovaScrittura({ open, onOpenChange, companyId, conti, onFatto, daRettificare, modificaProvvisoria = false }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; conti: ContoContabile[]; onFatto: () => void; daRettificare?: Scrittura | null; modificaProvvisoria?: boolean;
}) {
  const [data, setData] = useState(daRettificare?.data_registrazione ?? oggi());
  const [causale, setCausale] = useState(daRettificare?.causale ?? "Giroconto");
  const [descrizione, setDescrizione] = useState(daRettificare?.descrizione ?? "");
  const [docNumero, setDocNumero] = useState(daRettificare?.documento_numero ?? "");
  const [righe, setRighe] = useState<RigaBozza[]>(() => daRettificare ? [...daRettificare.contabilita_righe].sort((a,b) => a.riga-b.riga).map((r) => ({ conto_id: r.conto_id, dare: Number(r.dare) ? String(r.dare) : "", avere: Number(r.avere) ? String(r.avere) : "", descrizione: r.descrizione ?? "" })) : [rigaVuota(), rigaVuota()]);
  const movimentabili = conti.filter((c) => c.movimentabile && c.attivo);
  const esito = controllaBozza(righe, conti);
  const reset = () => { setData(oggi()); setCausale("Giroconto"); setDescrizione(""); setDocNumero(""); setRighe([rigaVuota(), rigaVuota()]); };
  const cambia = (i: number, k: keyof RigaBozza, v: string) => setRighe((rr) => rr.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const registra = useMutation({
    mutationFn: async () => {
      const usate = righe.filter((r) => r.conto_id || r.dare.trim() || r.avere.trim());
      const { error } = await db.rpc(daRettificare ? modificaProvvisoria ? "contabilita_modifica_scrittura" : "contabilita_rettifica_scrittura" : "contabilita_registra_scrittura", {
        ...(daRettificare && modificaProvvisoria ? { p_revisione: daRettificare.revisione ?? 1 } : {}),
        ...(daRettificare ? { p_scrittura: daRettificare.id } : { p_company: companyId }), p_data: data, p_causale: causale, p_descrizione: descrizione || null,
        p_documento_numero: docNumero || null, p_documento_data: daRettificare?.documento_data ?? null,
        p_righe: usate.map((r) => ({ conto_id: r.conto_id, dare: importo(r.dare), avere: importo(r.avere), descrizione: r.descrizione || null })),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(daRettificare ? modificaProvvisoria ? "Scrittura provvisoria modificata" : "Scrittura rettificata: originale stornato e nuova registrazione salvata" : "Scrittura registrata"); reset(); onOpenChange(false); onFatto(); },
    onError: (e) => toast.error("Scrittura non registrata", { description: messaggioErroreOperazione(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!registra.isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{daRettificare ? modificaProvvisoria ? "Modifica scrittura provvisoria" : "Rettifica scrittura" : "Nuova scrittura Dare/Avere"}</DialogTitle><DialogDescription>{daRettificare ? modificaProvvisoria ? "La scrittura conserva il suo numero. La versione precedente resta nello storico delle revisioni." : `La scrittura ${daRettificare.numero}/${daRettificare.esercizio} viene stornata e sostituita con questa registrazione.` : "Registra anche stipendi, costi senza fattura, ratei, risconti e altre rilevazioni di competenza. Le righe Dare e Avere devono quadrare; il documento è facoltativo."}</DialogDescription></DialogHeader>
        <fieldset disabled={registra.isPending} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Causale</Label>
              <Input list="causali-contabili" value={causale} onChange={(e) => setCausale(e.target.value)} />
              <datalist id="causali-contabili">{CAUSALI.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1"><Label>Documento</Label><Input value={docNumero} onChange={(e) => setDocNumero(e.target.value)} placeholder="n." /></div>
            <div className="space-y-1"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            {righe.map((r, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 space-y-1 sm:col-span-5">
                  {i === 0 ? <Label>Conto</Label> : null}
                  <Select value={r.conto_id || undefined} onValueChange={(v) => cambia(i, "conto_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Scegli il conto" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {movimentabili.map((c) => <SelectItem key={c.id} value={c.id}>{c.codice} {c.descrizione}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 space-y-1 sm:col-span-2">{i === 0 ? <Label>Dare</Label> : null}<Input inputMode="decimal" value={r.dare} onChange={(e) => cambia(i, "dare", e.target.value)} /></div>
                <div className="col-span-4 space-y-1 sm:col-span-2">{i === 0 ? <Label>Avere</Label> : null}<Input inputMode="decimal" value={r.avere} onChange={(e) => cambia(i, "avere", e.target.value)} /></div>
                <div className="col-span-3 space-y-1 sm:col-span-2">{i === 0 ? <Label>Nota</Label> : null}<Input value={r.descrizione} onChange={(e) => cambia(i, "descrizione", e.target.value)} /></div>
                <div className="col-span-1">
                  <Button variant="ghost" size="icon" aria-label="Togli riga" disabled={righe.length <= 2} onClick={() => setRighe((rr) => rr.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setRighe((rr) => [...rr, rigaVuota()])}><Plus className="mr-1 h-4 w-4" />Riga</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-sm">
            <span>Dare {euro(esito.dare)} · Avere {euro(esito.avere)}</span>
            <span className={esito.differenza === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
              {esito.differenza === 0 ? "Quadra" : `Differenza ${euro(Math.abs(esito.differenza))}`}
            </span>
          </div>
          {esito.problemi.length > 0 && righe.some((r) => r.conto_id || r.dare || r.avere) ? (
            <ul className="list-disc pl-5 text-xs text-destructive">{esito.problemi.map((x) => <li key={x}>{x}</li>)}</ul>
          ) : null}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={registra.isPending} onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => registra.mutate()} disabled={registra.isPending || esito.problemi.length > 0 || !causale.trim() || !data}>
            {registra.isPending ? "Registrazione…" : daRettificare ? modificaProvvisoria ? "Salva modifiche" : "Salva rettifica" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StornaScrittura({ scrittura, onClose, onFatto }: { scrittura: Scrittura | null; onClose: () => void; onFatto: () => void }) {
  const [data, setData] = useState(oggi());
  const [motivo, setMotivo] = useState("");
  const storna = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("contabilita_storna_scrittura", { p_scrittura: scrittura!.id, p_data: data, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Scrittura stornata"); setMotivo(""); onClose(); onFatto(); },
    onError: (e) => toast.error("Storno non registrato", { description: messaggioErroreOperazione(e) }),
  });
  return (
    <Dialog open={!!scrittura} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Storna la scrittura {scrittura ? `${scrittura.numero}/${scrittura.esercizio}` : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Una scrittura registrata non si cancella: si registra quella inversa, con la data dello storno. Poi, se serve, si registra quella giusta.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>Motivo</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="es. conto sbagliato" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => storna.mutate()} disabled={storna.isPending || !motivo.trim()}>Storna</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function intestazioneDa(a: ReturnType<typeof useAnagraficaAzienda>["data"]): AziendaIntestazione {
  return {
    ragione_sociale: a?.ragione_sociale ?? "", partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null,
    indirizzo_via: a?.indirizzo_via ?? null, indirizzo_numero_civico: a?.indirizzo_numero_civico ?? null, indirizzo_cap: a?.indirizzo_cap ?? null,
    indirizzo_comune: a?.indirizzo_comune ?? null, indirizzo_provincia: a?.indirizzo_provincia ?? null, logo_url: a?.logo_url ?? null,
  };
}

/** Bilancio di verifica e bilancio CEE dell'esercizio, dalle scritture. */
function Bilancio({ companyId, anno, conti }: { companyId: string; anno: number; conti: ContoContabile[] }) {
  const scritture = useScritture(companyId, anno);
  const isMobile = useIsMobile();
  const anagrafica = useAnagraficaAzienda();
  const [stampa, setStampa] = useState<{ html: string; nome: string } | null>(null);
  // Per default la lettura dello studio: stato patrimoniale e conto economico divisi (11/11/2026).
  const [vista, setVista] = useState<"sezioni" | "verifica">("sezioni");
  const [finoAl, setFinoAl] = useState(`${anno}-12-31`);
  const [dettaglioPartitari, setDettaglioPartitari] = useState(false);
  const dataBilancio = finoAl.startsWith(`${anno}-`) ? finoAl : `${anno}-12-31`;
  if (scritture.isLoading || scritture.isError) {
    return <FiscalQueryState loading={scritture.isLoading} error={scritture.isError} onRetry={() => void scritture.refetch()} />;
  }
  const saldi = saldiPerConto(scritture.data ?? [], conti, dataBilancio);
  const verifica = bilancioDiVerifica(saldi);
  const cee = bilancioCee(saldi);
  const sezioni = bilancioASezioni(saldi, conti, { dettaglioPartitari });
  const azienda = intestazioneDa(anagrafica.data);
  const periodo = `Dal 01/01/${anno} al ${dataIt(dataBilancio)}`;
  const sbilancio = Math.round((cee.totaleAttivo - cee.totalePassivo) * 100) / 100;
  const mesi = ricaviECostiPerMese((scritture.data ?? []).filter(s => s.data_registrazione <= dataBilancio), conti, anno);
  return (
    <div className="space-y-4">
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa.html}
          title={`${stampa.nome} — anteprima di stampa`} fileName={`${stampa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2"><Label htmlFor="bilancio-al">Bilancio al</Label><Input id="bilancio-al" type="date" className="h-9 w-40" min={`${anno}-01-01`} max={`${anno}-12-31`} value={dataBilancio} onChange={e => { if (e.target.value) setFinoAl(e.target.value); }} /></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={dettaglioPartitari} onCheckedChange={v => setDettaglioPartitari(v === true)} />Dettaglio clienti e fornitori</label>
        <div className="mr-2 flex rounded-md border p-0.5">
          {([["sezioni", "Stato patrimoniale e conto economico"], ["verifica", "Bilancio di verifica"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
              className={`rounded px-2.5 py-1 text-xs ${vista === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioSezioni({ azienda, bilancio: sezioni, periodo }), nome: "Bilancio a sezioni" })}>
          <Printer className="mr-1 h-4 w-4" />Stampa stato patrimoniale e conto economico
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioVerifica({ azienda, verifica, periodo }), nome: "Bilancio di verifica" })}>
          <Printer className="mr-1 h-4 w-4" />Stampa bilancio di verifica
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioCee({ azienda, bilancio: cee, periodo }), nome: "Bilancio CEE" })}>
          <Printer className="mr-1 h-4 w-4" />Stampa bilancio CEE
        </Button>
      </div>
      {/* 14/11/2026: i tre numeri col colore dello stato (attivo e passivo
          ambra se non pareggiano, utile verde, perdita rossa) e ricavi e
          costi mese per mese. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <RiquadroNumero etichetta="Totale attivo" valore={euro(cee.totaleAttivo)} periodo={periodo} tono={sbilancio !== 0 ? "attenzione" : "neutro"} />
        <RiquadroNumero
          etichetta="Totale passivo e netto"
          valore={euro(cee.totalePassivo)}
          periodo={periodo}
          tono={sbilancio !== 0 ? "attenzione" : "neutro"}
          contesto={sbilancio !== 0 ? `Non pareggia con l'attivo: ${euro(sbilancio)} di differenza` : "Pareggia con l'attivo"}
        />
        <RiquadroNumero
          etichetta={cee.utile >= 0 ? "Utile dell'esercizio" : "Perdita dell'esercizio"}
          valore={euro(cee.utile)}
          periodo={periodo}
          tono={cee.utile > 0 ? "buono" : cee.utile < 0 ? "male" : "neutro"}
          tendenza={mesi.some((m) => m.ricavi !== 0 || m.costi !== 0) ? mesi.reduce<number[]>((acc, m) => [...acc, (acc[acc.length - 1] ?? 0) + m.ricavi - m.costi], []) : undefined}
          etichettaTendenza="Utile progressivo mese per mese"
        />
      </div>
      {!isMobile && (sezioni.attivo.totale > 0 || sezioni.passivo.totale > 0 || mesi.some(m => m.ricavi !== 0 || m.costi !== 0)) && <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">Grafici di bilancio</summary><div className="mt-3 space-y-3">
      {!isMobile && (sezioni.attivo.totale > 0 || sezioni.passivo.totale > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ComposizioneLato titolo="Com'è fatto l'attivo" lato={sezioni.attivo} />
          <ComposizioneLato titolo="Com'è fatto il passivo e netto" lato={sezioni.passivo} extra={sezioni.utile > 0 ? { nome: "Utile dell'esercizio", valore: sezioni.utile } : undefined} />
        </div>
      )}
      {!isMobile && mesi.some((m) => m.ricavi !== 0 || m.costi !== 0) && (
        <section aria-label="Ricavi e costi mese per mese" className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Ricavi e costi mese per mese</h3>
          <GraficoRicaviCosti righe={mesi.map((m) => ({ mese: m.mese, ricavi: m.ricavi, costi_var: m.costi, costi_fissi: 0 }))} />
        </section>
      )}
      </div></details>}
      {!verifica.quadra || sbilancio !== 0 || cee.vociNonIndicate.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {!verifica.quadra ? <p>Il bilancio di verifica non quadra: dare {euro(verifica.totaleDare)}, avere {euro(verifica.totaleAvere)}.</p> : null}
          {sbilancio !== 0 ? <p>Attivo e passivo differiscono di {euro(sbilancio)}: un conto ha la natura sbagliata nel piano dei conti.</p> : null}
          {cee.vociNonIndicate.length > 0 ? <p>Conti senza una voce CEE riconosciuta: {cee.vociNonIndicate.join(", ")}.</p> : null}
        </div>
      ) : null}
      {vista === "sezioni" ? (
        <div className="space-y-4">
          <section aria-label="Stato patrimoniale" className="space-y-2">
            <h3 className="text-sm font-semibold">Stato patrimoniale</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              <LatoDelBilancio titolo="Attivo" lato={sezioni.attivo} />
              <LatoDelBilancio titolo="Passivo e netto" lato={sezioni.passivo}
                chiusura={{ etichetta: sezioni.utile >= 0 ? "Utile dell'esercizio" : "Perdita dell'esercizio", importo: sezioni.utile }} />
            </div>
          </section>
          <section aria-label="Conto economico" className="space-y-2">
            <h3 className="text-sm font-semibold">Conto economico</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              <LatoDelBilancio titolo="Costi" lato={sezioni.costi}
                chiusura={sezioni.utile > 0 ? { etichetta: "Utile dell'esercizio", importo: sezioni.utile } : undefined} />
              <LatoDelBilancio titolo="Ricavi" lato={sezioni.ricavi}
                chiusura={sezioni.utile < 0 ? { etichetta: "Perdita dell'esercizio", importo: -sezioni.utile } : undefined} />
            </div>
          </section>
        </div>
      ) : (
      <TabellaContabile>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Conto</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th><th className="p-2 text-right">Saldo</th></tr>
          </thead>
          <tbody>
            {saldi.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nessun conto movimentato nel {anno}.</td></tr>
            ) : saldi.map((x) => (
              <tr key={x.conto.id} className="border-t">
                <td className="p-2"><span className="font-mono text-xs mr-2">{x.conto.codice}</span>{x.conto.descrizione}</td>
                <td className="p-2 text-right tabular-nums">{euro(x.dare)}</td>
                <td className="p-2 text-right tabular-nums">{euro(x.avere)}</td>
                <td className="p-2 text-right tabular-nums">{x.saldo >= 0 ? `${euro(x.saldo)} D` : `${euro(-x.saldo)} A`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabellaContabile>
      )}
    </div>
  );
}

/** Un lato del bilancio: i mastri col loro totale, e sotto i conti (si aprono). In fondo il totale del lato. */
const COLORI_MASTRI = [COLORI_GRAFICO.blu, COLORI_GRAFICO.arancio, COLORI_GRAFICO.verde, COLORI_GRAFICO.viola, COLORI_GRAFICO.rosso, "hsl(var(--muted-foreground))"];

/**
 * Com'è fatto un lato del bilancio: ciambella dei mastri (i primi cinque,
 * gli altri insieme) con la legenda in euro e percentuale.
 */
function ComposizioneLato({ titolo, lato, extra }: { titolo: string; lato: LatoBilancio; extra?: { nome: string; valore: number } }) {
  const fermo = usePreferisceMenoMovimento();
  const positivi = lato.mastri.filter((m) => m.totale > 0).sort((a, b) => b.totale - a.totale);
  const fette = positivi.slice(0, 5).map((m) => ({ nome: m.descrizione || m.codice || "Senza mastro", valore: m.totale }));
  const resto = positivi.slice(5).reduce((s, m) => s + m.totale, 0);
  if (resto > 0) fette.push({ nome: "Altri mastri", valore: resto });
  // Il passivo si legge con l'utile, come nella tabella: così il totale torna con l'attivo.
  if (extra && extra.valore > 0) fette.push(extra);
  const tot = fette.reduce((s, f) => s + f.valore, 0);
  if (fette.length === 0 || tot <= 0) return null;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h4 className="mb-2 text-sm font-semibold">{titolo}</h4>
      <div className="grid items-center gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="relative h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={fette} dataKey="valore" nameKey="nome" innerRadius={46} outerRadius={70} paddingAngle={fette.length > 1 ? 2 : 0} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={!fermo} animationDuration={800}>
                {fette.map((f, i) => <Cell key={f.nome} fill={COLORI_MASTRI[i % COLORI_MASTRI.length]} />)}
              </Pie>
              <RechartsTooltip content={(p) => <TooltipScheda active={p.active} payload={(p.payload ?? []).map((x) => ({ ...x, color: (x.payload as { fill?: string } | undefined)?.fill })) as never} label={titolo} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Totale</span>
            <span className="text-xs font-bold tabular-nums">{euroAsse(tot)}</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          {fette.map((f, i) => (
            <li key={f.nome} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORI_MASTRI[i % COLORI_MASTRI.length] }} />
              <span className="min-w-0 flex-1 truncate">{f.nome}</span>
              <span className="tabular-nums">{euro(f.valore)}</span>
              <span className="w-9 text-right tabular-nums text-muted-foreground">{Math.round((f.valore / tot) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LatoDelBilancio({ titolo, lato, chiusura }: { titolo: string; lato: LatoBilancio; chiusura?: { etichetta: string; importo: number } }) {
  const totale = lato.totale + (chiusura?.importo ?? 0);
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        <span>{titolo}</span><span className="tabular-nums">{euro(totale)}</span>
      </div>
      {lato.mastri.length === 0 && !chiusura ? <p className="p-3 text-sm text-muted-foreground">Nessun conto movimentato.</p> : null}
      <ul className="divide-y text-sm">
        {lato.mastri.map((m) => (
          <li key={`${m.codice}-${m.descrizione}`}>
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 font-medium hover:bg-muted/40">
                <span className="min-w-0 truncate">{m.codice ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{m.codice}</span> : null}{m.descrizione}</span>
                <span className="shrink-0 tabular-nums">{euro(m.totale)}</span>
              </summary>
              <ul className="pb-1">
                {m.conti.map((c) => (
                  <li key={c.codice} className="flex items-center justify-between gap-2 py-0.5 pl-8 pr-3 text-xs">
                    <span className="min-w-0 truncate"><span className="mr-1.5 font-mono text-muted-foreground">{c.codice}</span>{c.descrizione}</span>
                    <span className="shrink-0 tabular-nums">{euro(c.importo)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
        {chiusura ? (
          <li className="flex items-center justify-between bg-muted/30 px-3 py-1.5 font-semibold">
            <span>{chiusura.etichetta}</span><span className="tabular-nums">{euro(chiusura.importo)}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Cambia la classificazione di un conto: descrizione, natura, voce CEE, ruolo e nota. I movimenti restano. */
function ModificaConto({ conto, onClose, onFatto }: { conto: ContoContabile | null; onClose: () => void; onFatto: () => void }) {
  const [descrizione, setDescrizione] = useState("");
  const [natura, setNatura] = useState<ContoContabile["natura"]>("costo");
  const [voce, setVoce] = useState("");
  const [ruolo, setRuolo] = useState("");
  const [nota, setNota] = useState("");
  const [per, setPer] = useState<string | null>(null);
  if (conto && per !== conto.id) {
    setPer(conto.id);
    setDescrizione(conto.descrizione);
    setNatura(conto.natura);
    setVoce(conto.voce_cee ?? "");
    setRuolo(conto.codice_standard ?? "");
    setNota(conto.nota ?? "");
  }
  const salva = useMutation({
    mutationFn: async () => {
      const sezione = NATURE.find((n) => n.value === natura)!.sezione;
      const { error } = await db.rpc("contabilita_aggiorna_conto", {
        p_conto: conto!.id, p_descrizione: descrizione, p_natura: natura, p_sezione_cee: sezione,
        p_voce_cee: voce, p_codice_standard: ruolo, p_nota: nota,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conto aggiornato"); setPer(null); onClose(); onFatto(); },
    onError: (e) => toast.error("Conto non aggiornato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={!!conto} onOpenChange={(v) => { if (!v) { setPer(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Conto {conto?.codice}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Natura</Label>
            <Select value={natura} onValueChange={(v) => setNatura(v as ContoContabile["natura"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NATURE.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Voce CEE</Label><Input value={voce} onChange={(e) => setVoce(e.target.value)} placeholder="C.II.1" /></div>
            <div className="space-y-1"><Label>Ruolo (piano standard)</Label><Input value={ruolo} onChange={(e) => setRuolo(e.target.value)} placeholder="es. 05.01" /></div>
          </div>
          <div className="space-y-1">
            <Label>Nota</Label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Vuota quando la classificazione è confermata" />
          </div>
          <p className="text-xs text-muted-foreground">Il ruolo dice alle scritture dai documenti quale conto usare: 05.01 clienti, 13.04 fornitori, 06.01 banca, 05.10 e 13.10 IVA, 20.01 ricavi, 30.01 acquisti.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPer(null); onClose(); }}>Annulla</Button>
          <Button onClick={() => salva.mutate()} disabled={salva.isPending || !descrizione.trim()}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mastrino di un conto e, per clienti e fornitori, il partitario: quanto deve o avanza ognuno. */
function Mastrini({ companyId, anno, conti }: { companyId: string; anno: number; conti: ContoContabile[] }) {
  const [dettaglioId, setDettaglioId] = useState<string | null>(null);
  const nomi = useMemo(() => new Map(conti.map(c => [c.id, `${c.codice} ${c.descrizione}`])), [conti]);
  const scritture = useScritture(companyId, anno);
  const anagrafica = useAnagraficaAzienda();
  const periodo = useFiscalPeriod();
  const contoId = periodo.params.get("conto");
  const [soggetto, setSoggetto] = useState<string | null>(null);
  const [stampa, setStampa] = useState<string | null>(null);
  const [mostra, setMostra] = useState(500);
  // Cerca un cliente/fornitore nel partitario o un movimento nel mastrino (16/11/2026).
  const [cercaM, setCercaM] = useState("");
  const movimentati = useMemo(() => {
    const usati = new Set((scritture.data ?? []).flatMap((s) => s.contabilita_righe.map((r) => r.conto_id)));
    return conti.filter((c) => c.movimentabile && usati.has(c.id));
  }, [scritture.data, conti]);
  if (scritture.isLoading || scritture.isError) {
    return <FiscalQueryState loading={scritture.isLoading} error={scritture.isError} onRetry={() => void scritture.refetch()} />;
  }
  const elenco = scritture.data ?? [];
  const conto = movimentati.find((c) => c.id === contoId) ?? movimentati.find((c) => contoAPartite(c)) ?? movimentati[0];
  if (!conto) return <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessun conto movimentato nel {anno}.</p>;
  const aPartite = contoAPartite(conto) && soggetto === null;
  const qm = cercaM.trim().toLowerCase();
  const partiteTutte = aPartite ? partitario(elenco, conto.id) : [];
  const partite = qm ? partiteTutte.filter((x) => x.soggetto.toLowerCase().includes(qm)) : partiteTutte;
  const totPartite = partite.reduce((t, x) => ({ dare: t.dare + x.dare, avere: t.avere + x.avere, saldo: t.saldo + x.saldo, movimenti: t.movimenti + x.movimenti }), { dare: 0, avere: 0, saldo: 0, movimenti: 0 });
  const mTutto = aPartite ? null : mastrino(elenco, conto.id, soggetto ?? undefined);
  const m = mTutto && qm
    ? { ...mTutto, movimenti: mTutto.movimenti.filter((x) => `${x.causale} ${x.descrizione ?? ""} ${x.numero}`.toLowerCase().includes(qm)) }
    : mTutto;
  const saldoTesto = (n: number) => (n === 0 ? euro(0) : `${euro(Math.abs(n))} ${n > 0 ? "D" : "A"}`);
  function cambiaConto(id: string) {
    periodo.set({ conto: id });
    setCercaM("");
    setSoggetto(null);
    setMostra(500);
  }
  return (
    <div className="space-y-3">
      <DettaglioScrittura dettaglio={elenco.find(s => s.id === dettaglioId)} companyId={companyId} nomi={nomi}
        onClose={() => setDettaglioId(null)}
        onConto={id => { setDettaglioId(null); if (id !== conto.id) cambiaConto(id); }} />
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa}
          title="Mastrino — anteprima di stampa" fileName={`mastrino-${conto.codice}-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={conto.id} onValueChange={cambiaConto}>
          <SelectTrigger className="h-8 w-full sm:w-80" aria-label="Conto"><SelectValue /></SelectTrigger>
          <SelectContent>
            {movimentati.map((c) => <SelectItem key={c.id} value={c.id}>{c.codice} {c.descrizione}</SelectItem>)}
          </SelectContent>
        </Select>
        {soggetto !== null ? (
          <Button size="sm" variant="outline" onClick={() => { setSoggetto(null); setCercaM(""); }}>← Tutti i soggetti</Button>
        ) : null}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={cercaM} onChange={(e) => { setCercaM(e.target.value); setMostra(500); }}
            placeholder={aPartite ? "Cerca cliente o fornitore…" : "Cerca nei movimenti…"} aria-label="Cerca nel mastrino" className="h-8 pl-8" />
        </div>
        {!aPartite ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setStampa(htmlMastrino({
            azienda: intestazioneDa(anagrafica.data), scritture: elenco, conto, soggetto: soggetto ?? undefined,
            dal: `${anno}-01-01`, al: `${anno}-12-31`,
          }))}><Printer className="mr-1 h-4 w-4" />Stampa {soggetto ? "scheda" : "mastrino"}</Button>
        ) : null}
      </div>
      {aPartite ? (
        <TabellaContabile>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">{conto.codice_standard === "13.04" || /fornitor/i.test(conto.descrizione) ? "Fornitore" : "Cliente"}</th><th className="p-2 text-right">Movimenti</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th><th className="p-2 text-right">Saldo</th></tr>
            </thead>
            <tbody>
              {partite.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nessun soggetto con «{cercaM}».</td></tr>
              )}
              {partite.map((x) => (
                <tr key={x.soggetto} className="cursor-pointer border-t hover:bg-muted/40" title="Apri la scheda di questo soggetto" onClick={() => { setSoggetto(x.soggetto); setCercaM(""); }}>
                  <td className="p-2"><button type="button" className="text-left text-primary hover:underline">{x.soggetto}</button></td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{x.movimenti}</td>
                  <td className="p-2 text-right tabular-nums">{euro(x.dare)}</td>
                  <td className="p-2 text-right tabular-nums">{euro(x.avere)}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{saldoTesto(x.saldo)}</td>
                </tr>
              ))}
            </tbody>
            {partite.length > 1 && (
              <tfoot className="border-t-2 bg-muted/40 font-medium">
                <tr>
                  <td className="p-2">Totale {qm ? "dei trovati" : "del conto"} · {partite.length} soggetti</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{totPartite.movimenti}</td>
                  <td className="p-2 text-right tabular-nums">{euro(totPartite.dare)}</td>
                  <td className="p-2 text-right tabular-nums">{euro(totPartite.avere)}</td>
                  <td className="p-2 text-right tabular-nums">{saldoTesto(totPartite.saldo)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TabellaContabile>
      ) : m ? (
        <>
          <p className="text-sm text-muted-foreground">
            {soggetto ? `${soggetto} · ` : ""}{m.movimenti.length} movimenti · dare {euro(m.dare)} · avere {euro(m.avere)} · saldo {saldoTesto(m.saldo)}
          </p>
          <TabellaContabile>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Data</th><th className="p-2">N.</th><th className="p-2">Causale</th><th className="p-2">Descrizione</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th><th className="p-2 text-right">Saldo</th></tr>
              </thead>
              <tbody>
                {m.movimenti.slice(0, mostra).map((x, i) => (
                  <tr key={`${x.scritturaId}-${i}`} className="cursor-pointer border-t hover:bg-muted/40" onClick={e => {
                    e.currentTarget.querySelector("button")?.focus();
                    setDettaglioId(x.scritturaId);
                  }}>
                    <td className="p-2">{dataIt(x.data)}</td>
                    <td className="p-2 font-mono text-xs"><button type="button" aria-haspopup="dialog" aria-label={`Apri scrittura ${x.numero}`} className="text-primary hover:underline">{x.numero}</button></td>
                    <td className="p-2">{x.causale}</td>
                    <td className="p-2 text-muted-foreground">{x.descrizione}</td>
                    <td className="p-2 text-right tabular-nums">{x.dare ? euro(x.dare) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{x.avere ? euro(x.avere) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{saldoTesto(x.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabellaContabile>
          {m.movimenti.length > mostra ? (
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>Movimenti {mostra} di {m.movimenti.length}: la stampa li contiene tutti.</span>
              <Button size="sm" variant="outline" onClick={() => setMostra((n) => n + 500)}>Mostra altri</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** I periodi IVA dell'anno: dodici mesi o quattro trimestri. */
function periodiIva(anno: number, trimestrale: boolean) {
  const fine = (m: number) => new Date(Date.UTC(anno, m, 0)).toISOString().slice(0, 10);
  const mm = (m: number) => String(m).padStart(2, "0");
  return trimestrale
    ? [1, 2, 3, 4].map((t) => ({ dal: `${anno}-${mm(t * 3 - 2)}-01`, al: fine(t * 3), nome: `${t}° trimestre ${anno}` }))
    : MESI.map((nome, i) => ({ dal: `${anno}-${mm(i + 1)}-01`, al: fine(i + 1), nome: `${nome} ${anno}` }));
}

interface EsitoLiquidazione {
  iva_vendite: number; iva_acquisti: number; saldo: number; credito_precedente: number; compensato: number;
  da_versare: number; a_credito: number; gia_liquidato: boolean; sotto_minimo?: boolean;
  /** Trimestrale: l'1% di interessi che si aggiunge al versamento. */
  interessi?: number;
}

/**
 * IVA a debito (vendite) e a credito (acquisti) periodo per periodo, con la
 * riga «da versare nell'anno / a credito / periodi registrati». Dalle stesse
 * anteprime della tabella sotto: nessuna lettura in più.
 */
function GraficoIva({ periodi, esiti }: { periodi: Array<{ nome: string; dal: string }>; esiti: EsitoLiquidazione[] }) {
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const dati = periodi.map((p, i) => ({ nome: p.nome, vendite: esiti[i]?.iva_vendite ?? 0, acquisti: esiti[i]?.iva_acquisti ?? 0 }));
  if (dati.every((d) => d.vendite === 0 && d.acquisti === 0)) return null;
  const daVersare = esiti.reduce((s, r) => s + (r.da_versare ?? 0) + (r.interessi ?? 0), 0);
  const aCredito = esiti.length ? esiti[esiti.length - 1].a_credito ?? 0 : 0;
  const conMovimenti = esiti.filter((r) => r.iva_vendite !== 0 || r.iva_acquisti !== 0);
  const registrati = conMovimenti.filter((r) => r.gia_liquidato).length;
  return (
    <section aria-label="IVA per periodo" className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
        <StatGrafico etichetta="Da versare nell'anno" valore={euro(daVersare)} nota="somma dei periodi" tono={daVersare > 0 ? "cattivo" : "neutro"} />
        <StatGrafico etichetta="A credito" valore={euro(aCredito)} nota="all'ultimo periodo" tono={aCredito > 0 ? "buono" : "neutro"} />
        <StatGrafico etichetta="Periodi registrati" valore={`${registrati} su ${conMovimenti.length}`} nota="con movimenti IVA" tono={registrati === conMovimenti.length ? "buono" : "neutro"} />
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dati} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
            {defsGrafico(id, { vendite: COLORI_GRAFICO.rosso, acquisti: COLORI_GRAFICO.verde })}
            <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="nome" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={60} tickFormatter={euroAsse} />
            <RechartsTooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
              content={(p) => (
                <TooltipScheda
                  active={p.active}
                  payload={(p.payload ?? []).map((x) => ({ ...x, color: x.dataKey === "vendite" ? COLORI_GRAFICO.rosso : COLORI_GRAFICO.verde })) as never}
                  label={String(p.label ?? "")}
                />
              )}
            />
            <Bar dataKey="vendite" name="IVA sulle vendite (a debito)" fill={`url(#${id}-barra-vendite)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} />
            <Bar dataKey="acquisti" name="IVA sugli acquisti (a credito)" fill={`url(#${id}-barra-acquisti)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} animationBegin={120} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_GRAFICO.rosso }} />IVA sulle vendite</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_GRAFICO.verde }} />IVA sugli acquisti</span>
      </div>
    </section>
  );
}

/**
 * Liquidazione IVA in contabilità: l'IVA su vendite e su acquisti del periodo si gira su
 * Erario c/IVA (contabilita_liquida_iva). L'importo si legge dalle scritture: un documento
 * non ancora registrato non c'è, quindi prima si genera dai documenti.
 */
function LiquidazioneIva({ companyId, anno }: { companyId: string; anno: number }) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [trimestrale, setTrimestrale] = useState(false);
  const periodi = periodiIva(anno, trimestrale);
  const esiti = useQuery({
    queryKey: chiave(companyId, "liquidazioni-iva", anno, trimestrale),
    queryFn: async () => {
      const risultati: EsitoLiquidazione[] = [];
      for (const per of periodi) {
        const { data, error } = await db.rpc("contabilita_liquida_iva", { p_company: companyId, p_dal: per.dal, p_al: per.al, p_anteprima: true });
        if (error) throw error;
        risultati.push(data as EsitoLiquidazione);
      }
      return risultati;
    },
  });
  const registra = useMutation({
    mutationFn: async (per: { dal: string; al: string }) => {
      const { data, error } = await db.rpc("contabilita_liquida_iva", { p_company: companyId, p_dal: per.dal, p_al: per.al, p_anteprima: false });
      if (error) throw error;
      return data as EsitoLiquidazione;
    },
    onSuccess: (r) => {
      toast.success("Liquidazione registrata", {
        description: r.da_versare > 0 ? `IVA da versare ${euro(r.da_versare)}: il pagamento dell'F24 la chiude.` : `IVA a credito ${euro(r.a_credito)}.`,
      });
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error("Liquidazione non registrata", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={trimestrale ? "t" : "m"} onValueChange={(v) => setTrimestrale(v === "t")}>
          <SelectTrigger className="h-8 w-40" aria-label="Periodicità"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="m">Mensile</SelectItem>
            <SelectItem value="t">Trimestrale</SelectItem>
          </SelectContent>
        </Select>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Come si calcola la liquidazione</summary><p className="mt-2 max-w-prose">
          Gli importi sono l'IVA non ancora liquidata a fine periodo: genera prima dai documenti. Il credito di un periodo abbatte il debito dei successivi; sotto 25,82 € il debito passa al periodo dopo.
        </p></details>
      </div>
      {!isMobile && esiti.data && <GraficoIva periodi={periodi} esiti={esiti.data} />}
      {esiti.isLoading || esiti.isError ? (
        <FiscalQueryState loading={esiti.isLoading} error={esiti.isError} onRetry={() => void esiti.refetch()} />
      ) : (
        <TabellaContabile>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Periodo</th><th className="p-2 text-right">IVA vendite</th><th className="p-2 text-right">IVA acquisti</th><th className="p-2 text-right">Credito precedente usato</th><th className="p-2 text-right">Da versare</th><th className="p-2 text-right">A credito</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {periodi.map((per, i) => {
                const r = esiti.data?.[i];
                if (!r) return null;
                const vuoto = r.iva_vendite === 0 && r.iva_acquisti === 0;
                // In ordine: il credito di un periodo entra nel successivo solo se è registrato.
                const primaInSospeso = periodi.slice(0, i).some((_, j) => {
                  const q = esiti.data?.[j];
                  return q && !q.gia_liquidato && !q.sotto_minimo && (q.iva_vendite !== 0 || q.iva_acquisti !== 0);
                });
                return (
                  <tr key={per.dal} className="border-t">
                    <td className="p-2 capitalize">{per.nome}</td>
                    <td className="p-2 text-right tabular-nums">{euro(r.iva_vendite)}</td>
                    <td className="p-2 text-right tabular-nums">{euro(r.iva_acquisti)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{r.compensato ? euro(r.compensato) : ""}</td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {r.da_versare ? euro(r.da_versare + (r.interessi ?? 0)) : ""}
                      {r.interessi ? <span className="block text-[11px] font-normal text-muted-foreground">di cui interessi 1%: {euro(r.interessi)}</span> : null}
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.a_credito ? euro(r.a_credito) : ""}</td>
                    <td className="p-2 text-right">
                      {r.gia_liquidato ? (
                        <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">registrata</span>
                      ) : vuoto ? null : r.sotto_minimo ? (
                        <span className="text-xs text-muted-foreground" title="Sotto 25,82 € non si versa">passa al periodo dopo</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={registra.isPending || primaInSospeso}
                          title={primaInSospeso ? "Prima registra i periodi precedenti" : undefined}
                          onClick={() => registra.mutate(per)}>Registra</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabellaContabile>
      )}
    </div>
  );
}

interface StatoEsercizioRiga {
  anno: number; chiuso_il: string | null; stampato_fino_al: string | null; generato_il: string | null;
  stampe: Array<{ dal: string; al: string; scritture: number; il: string }>;
  /** L'esito dell'ultima generazione: avvisi (documenti da guardare) ed errori. */
  generato_esito?: { avvisi?: string[]; errori?: string[]; saltate_solo_testata?: number } | null;
}

/** «Aggiornata alle 10:15» oggi, «Aggiornata il 09/11 alle 18:52» gli altri giorni (ora italiana). */
function aggiornataAlle(iso: string, adesso: Date = new Date()): string {
  const d = new Date(iso);
  const giorno = (x: Date) => x.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
  const ora = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  const stessoGiorno = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) === adesso.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  return stessoGiorno ? `aggiornata alle ${ora}` : `aggiornata il ${giorno(d)} alle ${ora}`;
}

/**
 * Quello che la generazione non ha saputo classificare (documenti col solo totale, differenze fra totale
 * e imponibile più IVA, movimenti su «Partite da verificare»): va guardato, non resta nascosto.
 */
function DaGuardare({ esito }: { esito: StatoEsercizioRiga["generato_esito"] }) {
  const avvisi = esito?.avvisi ?? [];
  const errori = esito?.errori ?? [];
  const incompleti = esito?.saltate_solo_testata ?? 0;
  if (avvisi.length + errori.length + incompleti === 0) return null;
  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
      <summary className="cursor-pointer font-medium">
        Da guardare: {avvisi.length} {avvisi.length === 1 ? "cosa" : "cose"}{errori.length ? ` · ${errori.length} non registrati` : ""}
        {incompleti > 0 ? ` · ${incompleti} documenti incompleti` : ""}
      </summary>
      <ul className="mt-2 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
        {incompleti > 0 && <li>{incompleti} documenti non hanno dati sufficienti o dipendono da una fattura non ancora registrata. Completa imponibile, IVA e righe nelle fatture ricevute o emesse, poi aggiorna le scritture.</li>}
        {errori.map((t, i) => <li key={`e${i}`} className="text-destructive">{t}</li>)}
        {avvisi.map((t, i) => <li key={`a${i}`}>{t}</li>)}
      </ul>
    </details>
  );
}

function useEsercizio(companyId: string | undefined, anno: number) {
  return useQuery({
    queryKey: chiave(companyId, "esercizio", anno),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("contabilita_esercizi").select("anno, chiuso_il, stampato_fino_al, stampe, generato_il, generato_esito")
        .eq("company_id", companyId).eq("anno", anno).maybeSingle();
      if (error) throw error;
      return (data ?? null) as StatoEsercizioRiga | null;
    },
  });
}

/** Una riga sopra le viste: l'esercizio è chiuso, o il giornale è stampato in definitivo fino a…. */
function StatoEsercizio({ companyId, anno }: { companyId: string | undefined; anno: number }) {
  const e = useEsercizio(companyId, anno).data;
  if (!e || (!e.chiuso_il && !e.stampato_fino_al)) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
      <Lock className="h-4 w-4 text-muted-foreground" />
      {e.chiuso_il
        ? `Esercizio ${anno} chiuso il ${dataIt(e.chiuso_il.slice(0, 10))}: non si registra più niente con data ${anno}.`
        : `Libro giornale stampato in definitivo fino al ${dataIt(e.stampato_fino_al!)}: le nuove scritture vanno dopo quel giorno.`}
    </p>
  );
}

/** Stampa definitiva: fissa il giorno, poi apre la stampa del tratto nuovo (numeri e riporto dall'inizio dell'anno). */
function StampaDefinitiva({ open, onOpenChange, companyId, anno, onStampa }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; anno: number; onStampa: (dal: string, al: string) => void;
}) {
  const qc = useQueryClient();
  const esercizio = useEsercizio(companyId, anno).data;
  const fineAnno = `${anno}-12-31`;
  const [al, setAl] = useState(() => (oggi() < fineAnno ? oggi() : fineAnno));
  const dal = esercizio?.stampato_fino_al
    ? new Date(Date.parse(`${esercizio.stampato_fino_al}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
    : `${anno}-01-01`;
  const fissa = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_stampa_definitiva", { p_company: companyId, p_anno: anno, p_al: al });
      if (error) throw error;
      return data as { dal: string; al: string; scritture: number };
    },
    onSuccess: (r) => {
      toast.success("Libro giornale stampato in definitivo", { description: `${r.scritture} scritture dal ${dataIt(r.dal)} al ${dataIt(r.al)}: quei giorni ora sono bloccati.` });
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
      onOpenChange(false);
      onStampa(r.dal, r.al);
    },
    onError: (e) => toast.error("Stampa definitiva non fatta", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Stampa definitiva del libro giornale</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Si stampano le scritture dal <strong>{dataIt(dal)}</strong> al giorno che scegli, con la numerazione e il riporto
            dall'inizio dell'esercizio. Dopo, <strong>nessuna scrittura potrà avere una data fino a quel giorno</strong>:
            le correzioni andranno registrate dopo.
          </p>
          <div className="space-y-1">
            <Label>Fino al</Label>
            <Input type="date" value={al} min={dal} max={oggi() < fineAnno ? oggi() : fineAnno} onChange={(e) => setAl(e.target.value)} />
          </div>
          {esercizio?.stampe?.length ? (
            <p className="text-xs text-muted-foreground">
              Stampe già fatte: {esercizio.stampe.map((x) => `${dataIt(x.dal)}–${dataIt(x.al)}`).join(", ")}.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => fissa.mutate()} disabled={fissa.isPending || !al || al < dal}>Blocca e stampa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EsitoFineAnno {
  totale_ammortamenti: number; retribuzioni: number; tfr: number;
  ammortamenti_registrati: boolean; ammortamenti_da_aggiornare?: boolean; tfr_registrato: boolean; tfr_da_aggiornare?: boolean;
  conti_mancanti_tfr?: string[];
}
interface EsitoChiusura {
  utile: number; conti_economici: number; conti_patrimoniali: number; apertura_gia_presente: boolean;
  iva_non_liquidata?: number; ammortamenti_da_registrare?: boolean; tfr_da_registrare?: boolean; conto_utili_a_nuovo?: boolean; conto_utile_da_scegliere?: boolean;
  imposte_da_stanziare?: boolean;
  /** Il primo esercizio precedente ancora aperto: gli esercizi si chiudono in ordine. */
  esercizio_precedente_aperto?: number | null;
}

/**
 * Fine anno: ammortamenti dal registro dei cespiti (RegistroCespiti) e TFR dai
 * cedolini, poi la chiusura dell'esercizio con la riapertura dei conti al 1° gennaio.
 */
function FineAnno({ companyId, anno }: { companyId: string; anno: number }) {
  const qc = useQueryClient();
  const esercizio = useEsercizio(companyId, anno);
  const chiuso = !!esercizio.data?.chiuso_il;
  const [conferma, setConferma] = useState(false);
  const [riapri, setRiapri] = useState(false);
  const [motivo, setMotivo] = useState("");
  const fine = useQuery({
    queryKey: chiave(companyId, "fine-anno", anno),
    queryFn: async () => {
      const { data, error } = await db.rpc("contabilita_fine_anno", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return data as EsitoFineAnno;
    },
  });
  const chiusura = useQuery({
    queryKey: chiave(companyId, "chiusura", anno),
    enabled: !chiuso,
    queryFn: async () => {
      const { data, error } = await db.rpc("contabilita_chiudi_esercizio", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return data as EsitoChiusura;
    },
  });
  const aggiorna = (): void => { void qc.invalidateQueries({ queryKey: chiave(companyId) }); };
  const registraFine = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_fine_anno", { p_company: companyId, p_anno: anno, p_anteprima: false });
      if (error) throw error;
      return data as EsitoFineAnno & { registrate: string[] };
    },
    onSuccess: (r) => {
      toast.success(r.registrate.length ? `Registrati: ${r.registrate.join(" e ")}` : "Niente di nuovo da registrare");
      aggiorna();
    },
    onError: (e) => toast.error("Scritture di fine anno non registrate", { description: e instanceof Error ? e.message : String(e) }),
  });
  const chiudi = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_chiudi_esercizio", { p_company: companyId, p_anno: anno, p_anteprima: false });
      if (error) throw error;
      return data as EsitoChiusura & { apertura_registrata: boolean };
    },
    onSuccess: (r) => {
      toast.success(`Esercizio ${anno} chiuso`, {
        description: `${r.utile >= 0 ? "Utile" : "Perdita"} ${euro(Math.abs(r.utile))}. ${r.apertura_registrata
          ? `Conti riaperti al 01/01/${anno + 1}.` : `Il ${anno + 1} aveva già una scrittura di apertura: non ne è stata fatta un'altra.`}`,
        duration: 12000,
      });
      setConferma(false);
      aggiorna();
    },
    onError: (e) => toast.error("Esercizio non chiuso", { description: e instanceof Error ? e.message : String(e) }),
  });
  const riapriM = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("contabilita_riapri_esercizio", { p_company: companyId, p_anno: anno, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Esercizio ${anno} riaperto: chiusura e apertura stornate`); setRiapri(false); setMotivo(""); aggiorna(); },
    onError: (e) => toast.error("Esercizio non riaperto", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (fine.isLoading || fine.isError) {
    return <FiscalQueryState loading={fine.isLoading} error={fine.isError} onRetry={() => void fine.refetch()} />;
  }
  const f = fine.data!;
  // Anche ammortamenti da rifare (registro cambiato dopo, o sceso a zero): «Registra» li riallinea.
  const daRegistrare = (f.totale_ammortamenti > 0 && !f.ammortamenti_registrati) || !!f.ammortamenti_da_aggiornare || (f.tfr > 0 && !f.tfr_registrato) || !!f.tfr_da_aggiornare;
  // L'indice dei cinque passi in cima (16/11/2026): la pagina è lunga, così si salta al passo.
  const passi: Array<[string, string, boolean | null]> = [
    ["fine-1", "Ammortamenti e TFR", !daRegistrare],
    ["fine-2", "Rimanenze", null],
    ["fine-3", "Ratei e risconti", null],
    ["fine-4", "Imposte", null],
    ["fine-5", "Chiusura", chiuso],
  ];
  return (
    <div className="space-y-4">
      <nav aria-label="Passi di fine anno" className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1">
        {passi.map(([id, testo, fatto], i) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-background hover:text-foreground">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${fatto ? "bg-emerald-500 text-white" : "bg-background text-foreground ring-1 ring-border"}`}>{fatto ? "✓" : i + 1}</span>
            {testo}
          </button>
        ))}
      </nav>
      <section id="fine-1" className="scroll-mt-20 space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">1. Ammortamenti e TFR al 31/12/{anno}</h3>
          <Button size="sm" variant="outline" disabled={chiuso || !daRegistrare || registraFine.isPending} onClick={() => registraFine.mutate()}>
            {registraFine.isPending ? "Registrazione…" : "Registra"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          I cespiti sono quelli del registro in Controllo di gestione: quote costanti, metà nel primo anno, fino a esaurire il costo;
          il fondo è la somma delle quote registrate. «Registra» scrive ammortamenti e TFR al 31/12, e li rifà se il registro cambia.
        </p>
        <RegistroCespiti companyId={companyId} anno={anno} chiuso={chiuso} />
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
          <span>Accantonamento TFR {f.tfr_da_aggiornare ? <span className="text-amber-700">· da aggiornare: i cedolini sono cambiati</span> : f.tfr_registrato ? "· registrato" : ""}</span>
          <span className="tabular-nums">{euro(f.tfr)}</span>
        </div>
        <ContiPerRuolo companyId={companyId} ruoli={RUOLI_TFR.filter((r) => (f.conti_mancanti_tfr ?? []).includes(r.ruolo))} chiuso={chiuso} />
        <p className="text-xs text-muted-foreground">
          Il TFR è un tredicesimo e mezzo delle retribuzioni lorde dei cedolini ({euro(f.retribuzioni)}), senza rivalutazione.
        </p>
      </section>

      <section id="fine-2" className="scroll-mt-20 space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">2. Rimanenze finali al 31/12/{anno}</h3>
        <RimanenzeFineAnno companyId={companyId} anno={anno} chiuso={chiuso} />
      </section>

      <section id="fine-3" className="scroll-mt-20 space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">3. Ratei e risconti al 31/12/{anno}</h3>
        <RateiRiscontiFineAnno companyId={companyId} anno={anno} chiuso={chiuso} />
      </section>

      <section id="fine-4" className="scroll-mt-20 space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">4. Imposte dell'esercizio (IRES e IRAP)</h3>
        <ImposteFineAnno companyId={companyId} anno={anno} chiuso={chiuso} />
      </section>

      <section id="fine-5" className="scroll-mt-20 space-y-2 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">5. Chiusura dell'esercizio {anno}</h3>
        {chiuso ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Chiuso il {dataIt(esercizio.data!.chiuso_il!.slice(0, 10))}. Costi e ricavi sono girati sull'utile, i conti sono riaperti al 01/01/{anno + 1}.</span>
            <Button size="sm" variant="outline" onClick={() => setRiapri(true)}>Riapri l'esercizio</Button>
          </div>
        ) : chiusura.isLoading || chiusura.isError ? (
          <FiscalQueryState loading={chiusura.isLoading} error={chiusura.isError} onRetry={() => void chiusura.refetch()} />
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {chiusura.data!.utile >= 0 ? "Utile" : "Perdita"} dell'esercizio: <strong>{euro(Math.abs(chiusura.data!.utile))}</strong>
              {" "}· {chiusura.data!.conti_economici} conti economici da chiudere · {chiusura.data!.conti_patrimoniali} conti patrimoniali da riaprire
              {chiusura.data!.apertura_gia_presente ? ` · il ${anno + 1} ha già la sua apertura (non se ne farà un'altra)` : ""}.
            </p>
            {/* Senza «utili portati a nuovo» il risultato riaperto si somma a quello dell'anno dopo, nella stessa voce A.IX. */}
            <ContiPerRuolo companyId={companyId} chiuso={chiuso}
              ruoli={[...(chiusura.data!.conto_utile_da_scegliere ? [RUOLI_UTILE] : []), ...(chiusura.data!.conto_utili_a_nuovo === false ? [RUOLI_UTILI_A_NUOVO] : [])]} />
            {(chiusura.data!.iva_non_liquidata ?? 0) !== 0 || chiusura.data!.ammortamenti_da_registrare || chiusura.data!.tfr_da_registrare || chiusura.data!.esercizio_precedente_aperto || chiusura.data!.imposte_da_stanziare ? (
              <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 py-2 pl-6 pr-3 text-amber-900">
                {chiusura.data!.esercizio_precedente_aperto ? <li>L'esercizio {chiusura.data!.esercizio_precedente_aperto} è ancora aperto: gli esercizi si chiudono in ordine, prima quello.</li> : null}
                {(chiusura.data!.iva_non_liquidata ?? 0) !== 0 ? <li>C'è IVA non ancora liquidata: registra la liquidazione dell'ultimo periodo (la chiusura la rifiuta).</li> : null}
                {chiusura.data!.ammortamenti_da_registrare ? <li>Ammortamenti non registrati.</li> : null}
                {chiusura.data!.tfr_da_registrare ? <li>Accantonamento TFR non registrato.</li> : null}
                {chiusura.data!.imposte_da_stanziare ? <li>Le imposte dell'esercizio (IRES e IRAP) non sono stanziate: l'utile è prima delle imposte.</li> : null}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Prima di chiudere: tutto generato dai documenti, liquidazioni IVA registrate, ammortamenti, TFR e rimanenze registrati, ratei e risconti scritti.
              Dopo, l'anno è bloccato: per correggere si riapre.
            </p>
            <Button size="sm" onClick={() => setConferma(true)} disabled={chiudi.isPending || (chiusura.data!.iva_non_liquidata ?? 0) !== 0 || !!chiusura.data!.esercizio_precedente_aperto}>Chiudi l'esercizio {anno}</Button>
          </div>
        )}
      </section>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Chiudere l'esercizio {anno}?</DialogTitle></DialogHeader>
          <p className="text-sm">
            Costi e ricavi del {anno} si girano sull'utile al 31/12, i conti patrimoniali si riaprono al 01/01/{anno + 1} (il risultato fra gli utili portati a nuovo) e
            nel {anno} non si potrà più registrare niente finché non lo riapri.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConferma(false)}>Annulla</Button>
            <Button onClick={() => chiudi.mutate()} disabled={chiudi.isPending}>{chiudi.isPending ? "Chiusura…" : "Chiudi"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={riapri} onOpenChange={setRiapri}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Riaprire l'esercizio {anno}?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Chiusura e apertura vengono stornate (restano nel giornale) e il {anno} torna modificabile.</p>
            <Label>Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Fattura arrivata dopo la chiusura" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiapri(false)}>Annulla</Button>
            <Button onClick={() => riapriM.mutate()} disabled={riapriM.isPending || !motivo.trim()}>Riapri</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
