import { RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
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
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { COLORI_GRAFICO, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, euroAsse, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileInput, Lock, Plus, Printer, ReceiptText, Search, Trash2, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
import { FiscalPeriodFilters } from "@/components/fatturazione/FiscalPeriodFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { csvLiquidazioneContabile, differenzaLipe, htmlLiquidazioneContabile, importiPerPeriodo, righeLiquidazione, type EsitoLiquidazione } from "@/lib/contabilita/liquidazioneContabile";
import { avvisoPeriodo, incompletiPerPeriodo, type DocumentoSenzaImporti } from "@/lib/contabilita/controlloIva";
import { useControlloIva } from "@/hooks/useControlloIva";
import { PercorsoIva } from "@/components/contabilita/ControlloIva";
import type { DestinazionePasso } from "@/lib/contabilita/percorsoIva";
// Gli stessi strumenti IVA di Fatture → Fiscalità (23/11/2026): registri, liquidazione e LIPE, F24, impostazioni.
const RegistroIVA = lazy(() => import("@/pages/azienda/fatturazione/RegistroIVA"));
const LiquidazioneIvaEF24 = lazy(() => import("@/pages/azienda/ContabilitaFiscale").then((m) => ({ default: m.LiquidazioneIvaEF24 })));
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
  numeriGiornale,
  riferimentoDocumento,
  type ContoContabile,
  type RigaBozza,
  type Scrittura,
} from "@/lib/contabilita/libroGiornale";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

// Le tabelle sono nuove: i tipi generati non le conoscono ancora.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// «always»: in italiano 4000 resterebbe senza il punto delle migliaia.
const euro = (n: number) => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
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
  const t = useT();
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
        title={t("Contabilità generale")}
        actions={
          <Select value={String(p.anno)} onValueChange={(v) => p.set({ anno: v })}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label={t("Esercizio")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i).map((a) => (
                <SelectItem key={a} value={String(a)}>{t("Esercizio {a}", { a })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {/* Le viste su una riga sola, come linguette (16/11/2026): prima andavano a capo e sembravano pulsanti d'azione. */}
      <div role="tablist" aria-label={t("Viste della contabilità")} className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {([["scritture", "Scritture"], ["giornale", "Libro giornale"], ["mastrini", "Mastrini e partitari"], ["iva", "IVA"], ["bilancio", "Bilancio"], ["fine", "Fine anno e chiusura"], ["conti", "Piano dei conti"]] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={vista === k}
            onClick={() => p.set({ vista: k })}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${vista === k ? "bg-primary font-medium text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {t(l)}
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
        <IvaContabilita companyId={companyId!} anno={p.anno} />
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
  const t = useT();
  const qc = useQueryClient();
  const carica = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_piano_standard", { p_company: companyId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(t("Piano dei conti caricato: {n} conti", { n: String(n ?? "") }));
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error(t("Piano dei conti non caricato"), { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="rounded-xl border p-6 text-sm space-y-3">
      <p className="font-medium">{t("Il piano dei conti è vuoto.")}</p>
      <p className="text-muted-foreground">
        {t("Carica il piano standard per l'edilizia: mastri e conti già collegati alle voci del bilancio CEE (artt. 2424 e 2425 del codice civile). Dopo puoi aggiungere i conti che ti servono.")}
      </p>
      <Button size="sm" onClick={() => carica.mutate()} disabled={carica.isPending}>
        {carica.isPending ? t("Caricamento…") : t("Carica il piano standard")}
      </Button>
    </div>
  );
}

function PianoDeiConti({ companyId, conti }: { companyId: string; conti: ContoContabile[] }) {
  const t = useT();
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
      toast.success(t("Conto creato"));
      setApri(false);
      setCodice(""); setDescrizione(""); setVoce(""); setMastro("");
      void qc.invalidateQueries({ queryKey: chiave(companyId, "conti") });
    },
    onError: (e) => toast.error(t("Conto non creato"), { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input type="search" className="h-8 w-full sm:w-64" aria-label={t("Cerca nel piano dei conti")} placeholder={t("Cerca codice, descrizione o voce CEE…")} value={ricerca} onChange={e => setRicerca(e.target.value)} />
        {daConfermare.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloDaConfermare} onChange={(e) => setSoloDaConfermare(e.target.checked)} />
            {t("Solo i conti da confermare ({n})", { n: daConfermare.length })}
          </label>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("{n} conti", { n: visibili.length })}</span>
          <Button size="sm" variant="outline" onClick={() => scaricaCsv("piano-dei-conti", csvPianoDeiConti(conti))}><Download className="mr-1 h-4 w-4" />{t("Esporta")}</Button>
          <Button size="sm" onClick={() => setApri(true)}><Plus className="mr-1 h-4 w-4" />{t("Nuovo conto")}</Button>
        </div>
      </div>
      <TabellaContabile>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">{t("Codice")}</th><th className="p-2">{t("Descrizione")}</th><th className="p-2">{t("Natura")}</th><th className="p-2">{t("Voce CEE")}</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {visibili.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">{t("Nessun conto con questi filtri.")}</td></tr>}
            {visibili.map((c) => (
              <tr key={c.id} className={c.movimentabile ? "border-t" : "border-t bg-muted/30 font-semibold"}>
                <td className="p-2 font-mono text-xs">{c.codice}</td>
                <td className="p-2">
                  {c.descrizione}
                  {c.codice_standard ? <span className="ml-2 rounded bg-blue-50 px-1.5 text-xs font-normal text-blue-800" title={t("Lo usano le scritture dai documenti")}>{t("ruolo {codice_standard}", { codice_standard: String(c.codice_standard ?? "") })}</span> : null}
                  {c.nota ? <p className="text-xs font-normal text-amber-700">{c.nota}</p> : null}
                </td>
                <td className="p-2 text-muted-foreground">{c.natura}</td>
                <td className="p-2 text-muted-foreground">{c.sezione_cee ? `${c.sezione_cee === "SPA" ? t("Attivo") : c.sezione_cee === "SPP" ? t("Passivo") : "C.E."} ${c.voce_cee ?? ""}` : ""}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setModifica(c)}>{t("Modifica")}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabellaContabile>
      <Dialog open={apri} onOpenChange={setApri}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("Nuovo conto")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>{t("Codice")}</Label><Input value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="30.08" /></div>
              <div className="col-span-2 space-y-1"><Label>{t("Descrizione")}</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label>{t("Natura")}</Label>
              <Select value={natura} onValueChange={(v) => setNatura(v as ContoContabile["natura"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NATURE.map((n) => <SelectItem key={n.value} value={n.value}>{t(n.label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{t("Mastro")}</Label>
                <Select value={mastro || "nessuno"} onValueChange={(v) => setMastro(v === "nessuno" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">{t("Nessuno")}</SelectItem>
                    {mastri.map((m) => <SelectItem key={m.id} value={m.id}>{nomeMastro.get(m.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{t("Voce CEE")}</Label><Input value={voce} onChange={(e) => setVoce(e.target.value)} placeholder="B.7" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApri(false)}>{t("Annulla")}</Button>
            <Button onClick={() => crea.mutate()} disabled={crea.isPending || !codice.trim() || !descrizione.trim()}>{t("Crea")}</Button>
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
  const tTesto = useT();
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
    onSuccess: () => { setDaEliminare(null); setMotivoEliminazione(""); toast.success(tTesto("Scrittura provvisoria eliminata")); void qc.invalidateQueries({ queryKey: chiave(companyId) }); },
    onError: (e) => toast.error(tTesto("Scrittura non eliminata"), { description: messaggioErroreOperazione(e) }),
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
        `${tTesto("{emesse} fatture emesse, {ricevute} ricevute, {incassi} incassi, {pagamenti} pagamenti", { emesse: r.fatture_emesse, ricevute: r.fatture_ricevute, incassi: r.incassi, pagamenti: r.pagamenti })}${r.altre ? `, ${tTesto("{n} ritenute subite", { n: r.altre })}` : ""}${r.movimenti ? `, ${tTesto("{n} movimenti di prima nota e F24", { n: r.movimenti })}` : ""}${r.cedolini ? `, ${tTesto("{n} mesi di cedolini", { n: r.cedolini })}` : ""}`,
        r.giroconti_saltati ? tTesto("{n} giroconti fra conti propri non registrati", { n: r.giroconti_saltati }) : "",
        r.gia_generate ? tTesto("{n} già registrati", { n: r.gia_generate }) : "",
        r.riallineate ? tTesto("{n} scritture aggiornate: revisione delle provvisorie, storno nei periodi definitivi o per documenti annullati", { n: r.riallineate }) : "",
        r.saltate_solo_testata ? tTesto("{n} saltati: senza imponibile (solo testata) o senza la loro fattura in contabilità", { n: r.saltate_solo_testata }) : "",
        r.errori.length ? tTesto("{n} non registrati: {elenco}", { n: r.errori.length, elenco: r.errori.slice(0, 3).join("; ") }) : "",
        r.avvisi?.length ? tTesto("{n} cose da guardare (elenco sopra le scritture)", { n: r.avvisi.length }) : "",
      ].filter(Boolean).join(" · ");
      (r.errori.length || r.avvisi?.length ? toast.warning : toast.success)(tTesto("{n} scritture generate", { n: nuove }), { description: dettagli, duration: 12000 });
      // Tutta la contabilità: scritture, liquidazioni, fine anno e chiusura leggono le stesse scritture.
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
      // L'ora dell'ultimo aggiornamento la scrive il giro automatico; quello a mano la mostra subito.
      qc.setQueryData<StatoEsercizioRiga | null>(chiave(companyId, "esercizio", anno),
        (e) => e ? { ...e, generato_il: new Date().toISOString(), generato_esito: { ...(e.generato_esito ?? {}), avvisi: r.avvisi ?? [], errori: r.errori, saltate_solo_testata: r.saltate_solo_testata } } : e);
    },
    onError: (e) => toast.error(tTesto("Scritture non generate"), { description: e instanceof Error ? e.message : String(e) }),
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
  const nGiornale = useMemo(() => numeriGiornale(scritture.data ?? []), [scritture.data]);
  // Il filtro dell'origine vale per l'elenco delle scritture; ricerca e mese valgono anche nel libro giornale.
  // In ordine di data (la più recente in alto), poi di numero: per numero le date saltavano avanti e indietro
  // perché le fatture importate si registrano dopo, non nell'ordine in cui sono arrivate.
  const visibili = (filtro === "tutte" ? filtrate : filtrate.filter((s) => gruppoDi(s.origine) === filtro))
    .slice().sort((a, b) => b.data_registrazione.localeCompare(a.data_registrazione) || b.numero - a.numero);
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
      if (completate.length) toast.success(tTesto("{n} scritture stornate", { n: completate.length }));
      else toast.error(tTesto("Nessuna scrittura stornata"));
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
          title={tTesto("Libro giornale — anteprima di stampa")} fileName={`libro-giornale-${anno}`} soloPdf />
      )}
      <DaGuardare esito={esercizio?.generato_esito} />
      {/* 14/11/2026: i numeri dell'esercizio in riquadri, con le scritture mese per mese. */}
      {!giornale && elenco.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RiquadroNumero
            etichetta={tTesto("Scritture dell'esercizio")}
            valore={elenco.length.toLocaleString(intlCampo())}
            periodo={ultima ? tTesto("Ultima del {data}", { data: new Date(`${ultima}T12:00:00`).toLocaleDateString(intlCampo(), { day: "numeric", month: "short" }) }) : tTesto("Esercizio {a}", { a: anno })}
            tendenza={perMese}
            etichettaTendenza={tTesto("Scritture registrate mese per mese")}
          />
          <RiquadroNumero etichetta={tTesto("Da fatture ricevute")} valore={quante("ricevute").toLocaleString(intlCampo())} periodo={tTesto("Costi")} />
          <RiquadroNumero etichetta={tTesto("Da fatture emesse")} valore={quante("emesse").toLocaleString(intlCampo())} periodo={tTesto("Ricavi")} />
          <RiquadroNumero
            etichetta={tTesto("Da guardare")}
            valore={String((esercizio?.generato_esito?.avvisi?.length ?? 0) + (esercizio?.generato_esito?.errori?.length ?? 0) + (esercizio?.generato_esito?.saltate_solo_testata ?? 0))}
            periodo={tTesto("Dall'ultimo aggiornamento")}
            tono={(esercizio?.generato_esito?.errori?.length ?? 0) > 0 ? "male" : ((esercizio?.generato_esito?.avvisi?.length ?? 0) + (esercizio?.generato_esito?.saltate_solo_testata ?? 0)) > 0 ? "attenzione" : "buono"}
          />
        </div>
      )}
      {elenco.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn(RICERCA_BARRA, "max-sm:w-full")}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={cerca} onChange={(e) => { setCerca(e.target.value); setMostra(300); }} placeholder={tTesto("Cerca numero, causale, conto, cliente…")} aria-label={tTesto("Cerca nelle scritture")} className="h-8 pl-8 text-xs" />
          </div>
          <Select value={mese || "tutti"} onValueChange={(v) => { setMese(v === "tutti" ? "" : v); setMostra(300); }}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label={tTesto("Mese")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">{tTesto("Tutto il {anno}", { anno })}</SelectItem>
              {MESI.map((m, i) => <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{nomeMese(anno, i, true)}</SelectItem>)}
            </SelectContent>
          </Select>
          {conFiltri && <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => { setCerca(""); setMese(""); }}><X className="mr-1 h-3.5 w-3.5" />{tTesto("Azzera")}</Button>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {conFiltri ? tTesto("{anno}: {n} scritture su {totale}", { anno, n: g.scritture, totale: elenco.length }) : tTesto("{anno}: {n} scritture", { anno, n: g.scritture })} · {tTesto("dare {importo}", { importo: euro(g.totaleDare) })} · {tTesto("avere {importo}", { importo: euro(g.totaleAvere) })}
          {esercizio?.generato_il ? <> · {aggiornataAlle(esercizio.generato_il, tTesto)}</> : null}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => apriStampa()}><Printer className="mr-1 h-4 w-4" />{tTesto("Stampa libro giornale · esercizio")}</Button>
          <Button size="sm" variant="outline" onClick={() => periodo.set({ vista: "iva", iva: "registri" })} title={tTesto("Registri IVA vendite e acquisti: stampa, Excel e CSV")}>
            <ReceiptText className="mr-1 h-4 w-4" />{tTesto("Stampa registri IVA")}
          </Button>
          {giornale ? (
            <>
              {conFiltri && <>
                <Button size="sm" variant="outline" onClick={() => apriStampa(true)}>{tTesto("Stampa vista filtrata")}</Button>
                <Button size="sm" variant="outline" onClick={() => scaricaCsv(`libro-giornale-${anno}-filtrato`, csvGiornale(elenco, conti, filtroGiornale))}>{tTesto("Esporta vista filtrata")}</Button>
              </>}
              <Button size="sm" variant="outline" onClick={() => setDefinitiva(true)}><Lock className="mr-1 h-4 w-4" />{tTesto("Stampa definitiva")}</Button>
              <Button size="sm" variant="outline" onClick={() => scaricaCsv(`libro-giornale-${anno}`, csvGiornale(elenco, conti))}
                title={tTesto("Una riga per movimento, col codice del conto: per il programma dello studio")}>
                <Download className="mr-1 h-4 w-4" />{tTesto("Esporta esercizio")}
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => genera.mutate()} disabled={genera.isPending}>
            <FileInput className="mr-1 h-4 w-4" />{genera.isPending ? tTesto("Aggiornamento…") : tTesto("Aggiorna adesso")}
          </Button>
          <Button size="sm" onClick={() => setNuova(true)}><Plus className="mr-1 h-4 w-4" />{tTesto("Nuova scrittura")}</Button>
        </div>
      </div>

      {!giornale && <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={mostraStorico} onCheckedChange={v => setMostraStorico(v === true)} />{tTesto("Mostra anche storni e scritture stornate")}</label>}
      {(giornale || mostraStorico) && elenco.some(s => s.storno_di) && <p className="rounded-lg border p-3 text-sm text-muted-foreground">{tTesto("Uno storno inverte una registrazione precedente. Se segue una nuova scrittura della stessa fattura, resta il saldo della versione aggiornata. Il libro giornale conserva la sequenza; nell’elenco delle scritture puoi consultare solo quelle attive.")}</p>}
      {!giornale && visibili.length > 0 && <BarraSelezioneRighe nome={tTesto("le scritture")} selezionate={selezione.selezionate.length} consentite={stornabili.length}
        tutte={selezione.tutte} parziale={selezione.parziale}
        entrate={stornabili.reduce((n, s) => n + s.contabilita_righe.reduce((t, r) => t + Number(r.dare || 0), 0), 0)}
        uscite={stornabili.reduce((n, s) => n + s.contabilita_righe.reduce((t, r) => t + Number(r.avere || 0), 0), 0)}
        entrateLabel={tTesto("Dare")} usciteLabel={tTesto("Avere")} azione={tTesto("Storna selezionate")} inCorso={stornaSelezionate.isPending}
        escluse={escluse} onPagina={selezione.pagina} onAzione={() => setStorniAperti(true)} />}
      <ErroriOperazioneRighe errori={erroriStorni} />
      {giornale ? (
        <TabellaContabile>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">N.</th><th className="p-2">{tTesto("Data")}</th><th className="p-2">{tTesto("Causale")}</th><th className="p-2">{tTesto("Conto")}</th><th className="p-2">{tTesto("Descrizione")}</th><th className="p-2 text-right">{tTesto("Dare")}</th><th className="p-2 text-right">{tTesto("Avere")}</th></tr>
            </thead>
            <tbody>
              {g.righe.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">{conFiltri ? tTesto("Nessuna scrittura con questi filtri.") : tTesto("Nessuna scrittura nel {anno}.", { anno })}</td></tr>
              ) : g.righe.slice(0, mostra * 5).map((r) => (
                <tr key={r.progressivo} className={`cursor-pointer ${r.primaDellaScrittura ? "border-t" : ""}`}
                  onClick={e => { e.currentTarget.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus(); setDettaglioId(r.scritturaId); }}>
                  <td className="p-2 font-mono text-xs">{r.primaDellaScrittura ? r.numero : ""}</td>
                  <td className="p-2">{r.primaDellaScrittura ? dataIt(r.data) : ""}</td>
                  <td className="p-2">{r.primaDellaScrittura ? r.causale : ""}</td>
                  <td className="p-2"><button type="button" aria-haspopup="dialog" aria-label={tTesto("Apri scrittura {registrazione}, {conto}", { registrazione: String(r.registrazione ?? ""), conto: String(r.conto ?? "") })} className="text-left text-primary hover:underline">{r.conto}</button></td>
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
            <div className="flex flex-wrap gap-1" role="group" aria-label={tTesto("Da dove vengono le scritture")}>
              {([["tutte", "Tutte"], ...GRUPPI_ORIGINE.map(([k, l]) => [k, l] as const), ["altre", "Altre"]] as Array<readonly [GruppoOrigine, string]>).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filtro === k} onClick={() => { setFiltro(k); setMostra(300); }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${filtro === k ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                  {tTesto(l)} <span className="tabular-nums">{quante(k)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {elenco.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">{tTesto("Nessuna scrittura nel {anno}. Fatture, incassi e pagamenti si registrano da soli ogni quarto d'ora («Aggiorna adesso» per non aspettare); le altre operazioni si registrano con «Nuova scrittura».", { anno })}</p>
          ) : visibili.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">{conFiltri ? tTesto("Nessuna scrittura con questi filtri.") : tTesto("Nessuna scrittura di questo tipo nel {anno}.", { anno })}</p>
          ) : <>
          <p className="text-xs text-muted-foreground">
            {tTesto("«N. scrittura» è il numero della registrazione in contabilità, progressivo nell'esercizio, nell'ordine in cui sono state registrate (di solito il n. 1 è l'apertura dei conti del 1° gennaio). Il numero della fattura è nella colonna «Documento». Il libro giornale stampato rinumera le scritture in ordine di data.")}
          </p>
          <TabellaContabile>
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="relative w-10 p-2"><span className="sr-only">{tTesto("Selezione")}</span></th>
                  <th className="p-2" title={tTesto("Numero di registrazione in contabilità: progressivo dell'esercizio, non il numero della fattura")}>{tTesto("N. scrittura")}</th>
                  <th className="p-2">{tTesto("Data")}</th>
                  <th className="p-2">{tTesto("Causale")}</th>
                  <th className="p-2" title={tTesto("Numero e data della fattura o del documento da cui viene la scrittura")}>{tTesto("Documento")}</th>
                  <th className="p-2">{tTesto("Descrizione")}</th>
                  <th className="p-2 text-right">{tTesto("Importo")}</th>
                </tr>
              </thead>
              <tbody>{visibili.slice(0, mostra).map(s => (
                <tr key={s.id} className="cursor-pointer border-t" onClick={e => {
                  e.currentTarget.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
                  setDettaglioId(s.id);
                }}>
                  <td className="px-2" onClick={e => e.stopPropagation()}><Checkbox aria-label={tTesto("Seleziona scrittura {numero}/{esercizio}", { numero: String(s.numero ?? ""), esercizio: String(s.esercizio ?? "") })} checked={selezione.ids.has(s.id)} disabled={stornaSelezionate.isPending} onCheckedChange={() => selezione.alterna(s.id)} /></td>
                  <td className="px-2"><button type="button" aria-haspopup="dialog" aria-label={tTesto("Apri scrittura {numero}/{esercizio}", { numero: String(s.numero ?? ""), esercizio: String(s.esercizio ?? "") })} className="py-2 font-mono text-xs text-primary hover:underline">{s.numero}/{s.esercizio}</button></td>
                  <td className="px-2">{dataIt(s.data_registrazione)}</td>
                  <td className="px-2">{s.causale}{s.storno_di || stornate.has(s.id) ? <span className="ml-2 text-xs text-muted-foreground">{s.storno_di ? tTesto("storno") : tTesto("stornata")}</span> : null}</td>
                  <td className="px-2 font-medium">{riferimentoDocumento(s) || <span className="font-normal text-muted-foreground">—</span>}</td>
                  <td className="max-w-xs truncate px-2 text-muted-foreground" title={s.descrizione || undefined}>{s.descrizione || "—"}</td>
                  <td className="px-2 text-right tabular-nums">{euro(s.contabilita_righe.reduce((t, r) => t + Number(r.dare || 0), 0))}</td>
                </tr>
              ))}</tbody>
            </table>
          </TabellaContabile>
          </>}
        </div>
      )}
      {(giornale ? g.righe.length > mostra * 5 : visibili.length > mostra) ? (
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{giornale ? tTesto("Righe {mostra} di {n}: la stampa le contiene tutte.", { mostra: mostra * 5, n: g.righe.length }) : tTesto("Scritture {mostra} di {n}: la stampa le contiene tutte.", { mostra, n: visibili.length })}</span>
          <Button size="sm" variant="outline" onClick={() => setMostra((n) => n + 300)}>{tTesto("Mostra altre")}</Button>
        </div>
      ) : null}

      <DettaglioScrittura dettaglio={dettaglio} companyId={companyId} nomi={nomi} numeroGiornale={dettaglio ? nGiornale.get(dettaglio.id) : undefined}
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
        <DialogHeader><DialogTitle>{tTesto("Elimina scrittura provvisoria")}</DialogTitle><DialogDescription>{tTesto("La scrittura {numero}/{esercizio} verrà rimossa e i saldi seguiranno le registrazioni rimaste. Il motivo e la copia precedente restano nello storico delle revisioni.", { numero: String(daEliminare?.numero ?? ""), esercizio: String(daEliminare?.esercizio ?? "") })}</DialogDescription></DialogHeader>
        <Label htmlFor="motivo-eliminazione-scrittura">{tTesto("Motivo dell’eliminazione")}</Label><Input id="motivo-eliminazione-scrittura" value={motivoEliminazione} disabled={elimina.isPending} onChange={e => setMotivoEliminazione(e.target.value)} />
        <DialogFooter><Button variant="outline" disabled={elimina.isPending} onClick={() => { setDaEliminare(null); setMotivoEliminazione(""); }}>{tTesto("Annulla")}</Button><Button variant="destructive" disabled={elimina.isPending || !motivoEliminazione.trim()} onClick={() => elimina.mutate()}>{elimina.isPending ? tTesto("Eliminazione…") : tTesto("Elimina scrittura")}</Button></DialogFooter>
      </DialogContent></Dialog>
      <Dialog open={storniAperti} onOpenChange={(v) => { if (!stornaSelezionate.isPending) setStorniAperti(v); }}><DialogContent>
        <DialogHeader><DialogTitle>{tTesto("Storna {n} scritture manuali", { n: stornabili.length })}</DialogTitle><DialogDescription>{tTesto("Per ogni scrittura viene registrato lo storno in Dare/Avere. Gli originali e il loro storico restano nel giornale.")}</DialogDescription></DialogHeader>
        <Label htmlFor="storni-data">{tTesto("Data degli storni")}</Label><Input id="storni-data" type="date" value={dataStorni} disabled={stornaSelezionate.isPending} onChange={(e) => setDataStorni(e.target.value)} />
        <Label htmlFor="storni-motivo">{tTesto("Motivo")}</Label><Input id="storni-motivo" value={motivoStorni} disabled={stornaSelezionate.isPending} onChange={(e) => setMotivoStorni(e.target.value)} />
        <DialogFooter><Button variant="outline" disabled={stornaSelezionate.isPending} onClick={() => setStorniAperti(false)}>{tTesto("Annulla")}</Button><Button variant="destructive" disabled={stornaSelezionate.isPending || !dataStorni || !motivoStorni.trim() || !stornabili.length} onClick={() => stornaSelezionate.mutate()}>{stornaSelezionate.isPending ? tTesto("Storno in corso…") : tTesto("Conferma storni")}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}

function DettaglioScrittura({ dettaglio, companyId, nomi, numeroGiornale, onClose, onConto, onStorno, onRettifica, onElimina, modificabile }: {
  dettaglio: Scrittura | undefined;
  /** Il numero nel libro giornale (ordine di data): può differire da quello di registrazione. */
  numeroGiornale?: number;
  companyId: string;
  nomi: ReadonlyMap<string, string>;
  onClose: () => void;
  onConto: (id: string) => void;
  onStorno?: (scrittura: Scrittura) => void;
  onRettifica?: (scrittura: Scrittura) => void;
  onElimina?: (scrittura: Scrittura) => void;
  modificabile?: boolean;
}) {
  const tTesto = useT();
  return (
    <Dialog open={!!dettaglio} onOpenChange={open => { if (!open) onClose(); }}>
        {dettaglio && <DialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{tTesto("Scrittura {numero}/{esercizio}", { numero: dettaglio.numero, esercizio: dettaglio.esercizio })}{riferimentoDocumento(dettaglio) ? ` · ${riferimentoDocumento(dettaglio)}` : ""}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {dataIt(dettaglio.data_registrazione)} · {dettaglio.causale}
              {numeroGiornale && numeroGiornale !== dettaglio.numero ? ` · ${tTesto("n. {numeroGiornale}/{esercizio} nel libro giornale", { numeroGiornale, esercizio: dettaglio.esercizio })}` : ""}
            </p>
          </DialogHeader>
          {dettaglio.descrizione && <p className="break-words text-sm">{dettaglio.descrizione}</p>}
          <div className="flex flex-wrap items-baseline gap-2 border-y py-3 text-sm">
            <span className="text-muted-foreground">{tTesto("Documento collegato")}</span>
            <DocumentoScrittura companyId={companyId} scrittura={dettaglio} />
            {dettaglio.documento_data && <span>{tTesto("del {data}", { data: String(dataIt(dettaglio.documento_data) ?? "") })}</span>}
          </div>
          <TabellaContabile>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs"><tr><th className="p-2">{tTesto("Conto")}</th><th className="p-2">{tTesto("Descrizione")}</th><th className="p-2 text-right">{tTesto("Dare")}</th><th className="p-2 text-right">{tTesto("Avere")}</th></tr></thead>
              <tbody>{[...dettaglio.contabilita_righe].sort((a,b) => a.riga-b.riga).map(r => (
                <tr key={r.riga} className="border-t"><td className="p-2">{nomi.has(r.conto_id) ? <button className="text-left text-primary hover:underline" title={tTesto("Apri mastrino")} onClick={() => onConto(r.conto_id)}>{nomi.get(r.conto_id)}</button> : tTesto("Conto non disponibile")}</td><td className="p-2 text-muted-foreground">{r.descrizione || "—"}</td>
                  {(["dare", "avere"] as const).map(lato => <td key={lato} className="p-2 text-right tabular-nums">{Number(r[lato]) ? euro(Number(r[lato])) : "—"}</td>)}</tr>
              ))}</tbody>
              <tfoot className="border-t bg-muted/30 font-semibold"><tr><td colSpan={2} className="p-2">{tTesto("Totali")}</td>
                {(["dare", "avere"] as const).map(lato => <td key={lato} className="p-2 text-right tabular-nums">{euro(dettaglio.contabilita_righe.reduce((t,r) => t + Number(r[lato] || 0), 0))}</td>)}
              </tr></tfoot>
            </table>
          </TabellaContabile>
          {dettaglio.origine === "manuale" && !dettaglio.storno_di && (
            <RaccordoControlloGestione companyId={companyId} scritturaId={dettaglio.id} puoScrivere={!!onRettifica || !!onStorno} />
          )}
          <DialogFooter>
            {onElimina && <Button variant="destructive" onClick={() => { onClose(); onElimina(dettaglio); }}>{tTesto("Elimina scrittura")}</Button>}
            {onRettifica && <Button variant="outline" onClick={() => { onClose(); onRettifica(dettaglio); }}>{modificabile ? tTesto("Modifica scrittura") : tTesto("Rettifica con storno")}</Button>}
            {onStorno && <Button variant="outline" onClick={() => { onClose(); onStorno(dettaglio); }}><Undo2 className="mr-1 h-4 w-4" />{tTesto("Storna")}</Button>}
            <Button onClick={onClose}>{tTesto("Chiudi")}</Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
  );
}

function RaccordoControlloGestione({ companyId, scritturaId, puoScrivere }: {
  companyId: string; scritturaId: string; puoScrivere: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const key = chiave(companyId, "raccordo-cdg", scritturaId);
  const call = async (includi?: boolean) => {
    const { data, error } = await db.rpc("contabilita_raccordo_cdg", {
      p_company: companyId, p_scrittura: scritturaId, p_includi: includi ?? null,
    });
    if (error) throw new Error(error.message);
    return data === true;
  };
  const q = useQuery({ queryKey: key, queryFn: () => call() });
  const aggiorna = useMutation({
    mutationFn: call,
    onSuccess: (value) => {
      qc.setQueryData(key, value);
      void qc.invalidateQueries({ queryKey: ["cg"] });
    },
  });
  if (q.isLoading) return null;
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      <label className="flex items-center gap-2">
        <Checkbox checked={q.data ?? false} disabled={!puoScrivere || aggiorna.isPending || q.isError}
          onCheckedChange={(v) => aggiorna.mutate(v === true)} />
        {t("Includi nel Controllo di gestione")}
      </label>
      <p className="text-xs text-muted-foreground">{t("Usa questa opzione per gli assestamenti economici non ancora rilevati da fatture, costi o cedolini.")}</p>
      {q.isError && <p role="alert" className="text-xs text-destructive">{t("Raccordo non disponibile.")} <button className="underline" onClick={() => void q.refetch()}>{t("Riprova")}</button></p>}
      {aggiorna.isError && <p role="alert" className="text-xs text-destructive">{aggiorna.error.message}</p>}
    </div>
  );
}

function DocumentoScrittura({ companyId, scrittura }: { companyId: string; scrittura: Scrittura }) {
  const t = useT();
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
  if (id && indiretto && documento.isLoading) return <span role="status">{t("Caricamento…")}</span>;
  if (documento.isError) return <Button size="sm" variant="outline" onClick={() => void documento.refetch()}>{t("Riprova a caricare il documento")}</Button>;
  if (origine === "f24" && id) return <VersamentoCollegato companyId={companyId} id={id} />;
  if (origine === "cedolini") {
    const periodo = scrittura.descrizione?.match(/\b(0[1-9]|1[0-2])\/(\d{4})\b/);
    if (periodo) return <Link className="font-medium text-primary hover:underline" to={`/azienda/personale?tab=cedolini&anno=${periodo[2]}&mese=${Number(periodo[1])}`}>{t("Cedolini di {mese}/{anno}", { mese: periodo[1], anno: periodo[2] })}</Link>;
  }
  const acquisto = origine === "fattura_ricevuta" || origine === "pagamento";
  const vendita = origine === "fattura_emessa" || origine === "ritenuta_subita" || origine === "incasso_fattura";
  const documentoId = indiretto ? documento.data : acquisto || vendita ? id : null;
  return documentoId
    ? <FiscalSourceViewer id={documentoId} type={acquisto ? "acquisti" : "vendite"} label={numero || t("Apri documento")} />
    : <span>{numero || t("Nessun documento collegato")}</span>;
}

function VersamentoCollegato({ companyId, id }: { companyId: string; id: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: chiave(companyId, "versamento", id),
    queryFn: async () => {
      const { data, error } = await supabase.from("f24_entries").select("tributo_code, tributo_descrizione, importo, data_pagamento, stato").eq("company_id", companyId).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <span role="status">{t("Caricamento F24…")}</span>;
  if (q.isError) return <Button variant="outline" size="sm" onClick={() => void q.refetch()}>{t("Riprova a caricare il versamento")}</Button>;
  if (!q.data) return <span>{t("Versamento F24 non disponibile")}</span>;
  const f = q.data;
  return <details><summary className="cursor-pointer text-primary">{t("Versamento F24 · {tributo_code}", { tributo_code: String(f.tributo_code ?? "") })}</summary>
    <p className="mt-2">{f.tributo_descrizione} · {euro(f.importo)} · {f.stato}{f.data_pagamento && ` · ${dataIt(f.data_pagamento)}`}</p>
  </details>;
}

/** Conto con ricerca per codice o descrizione: i conti movimentabili sono centinaia. */
function SceltaConto({ conti, value, onChange }: { conti: ContoContabile[]; value: string; onChange: (id: string) => void }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState("");
  const scelto = conti.find((c) => c.id === value);
  const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
  const trovati = conti.filter((c) => { const t = `${c.codice} ${c.descrizione}`.toLowerCase(); return parole.every((p) => t.includes(p)); }).slice(0, 80);
  return (
    <Popover open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={aperto} className="w-full justify-between truncate font-normal">
          <span className="truncate">{scelto ? `${scelto.codice} ${scelto.descrizione}` : <span className="text-muted-foreground">{t("Scegli il conto")}</span>}</span>
        </Button>
      </PopoverTrigger>
      {/* Senza Portal: dentro il Dialog il focus resta nella ricerca (vedi filtri dei Contatti). */}
      <PopoverPrimitive.Content align="start" sideOffset={4} onEscapeKeyDown={(e) => { e.preventDefault(); setAperto(false); }} className="z-50 w-[min(460px,calc(100vw-2rem))] rounded-md border bg-popover p-0 text-popover-foreground shadow-md">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("Cerca codice o nome del conto…")} value={q} onValueChange={setQ} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("Nessun conto trovato")}</CommandEmpty>
            {trovati.map((c) => (
              <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c.id); setAperto(false); setQ(""); }}>
                <span className="mr-2 font-mono text-xs text-muted-foreground">{c.codice}</span>{c.descrizione}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverPrimitive.Content>
    </Popover>
  );
}

function NuovaScrittura({ open, onOpenChange, companyId, conti, onFatto, daRettificare, modificaProvvisoria = false }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; conti: ContoContabile[]; onFatto: () => void; daRettificare?: Scrittura | null; modificaProvvisoria?: boolean;
}) {
  const t = useT();
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
    onSuccess: () => { toast.success(daRettificare ? modificaProvvisoria ? t("Scrittura provvisoria modificata") : t("Scrittura rettificata: originale stornato e nuova registrazione salvata") : t("Scrittura registrata")); reset(); onOpenChange(false); onFatto(); },
    onError: (e) => toast.error(t("Scrittura non registrata"), { description: messaggioErroreOperazione(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!registra.isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{daRettificare ? modificaProvvisoria ? t("Modifica scrittura provvisoria") : t("Rettifica scrittura") : t("Nuova scrittura Dare/Avere")}</DialogTitle><DialogDescription>{daRettificare ? modificaProvvisoria ? t("La scrittura conserva il suo numero. La versione precedente resta nello storico delle revisioni.") : t("La scrittura {numero}/{esercizio} viene stornata e sostituita con questa registrazione.", { numero: String(daRettificare.numero ?? ""), esercizio: String(daRettificare.esercizio ?? "") }) : t("Registra anche stipendi, costi senza fattura, ratei, risconti e altre rilevazioni di competenza. Le righe Dare e Avere devono quadrare; il documento è facoltativo.")}</DialogDescription></DialogHeader>
        <fieldset disabled={registra.isPending} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1"><Label>{t("Data")}</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>{t("Causale")}</Label>
              {/* Un Select, non un datalist: col valore già scritto il browser mostrava solo «Giroconto». */}
              <Select value={CAUSALI.includes(causale) ? causale : "__altra"} onValueChange={(v) => setCausale(v === "__altra" ? "" : v)}>
                <SelectTrigger aria-label={t("Causale")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAUSALI.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="__altra">{t("Altra causale…")}</SelectItem>
                </SelectContent>
              </Select>
              {!CAUSALI.includes(causale) ? <Input autoFocus value={causale} onChange={(e) => setCausale(e.target.value)} placeholder={t("Scrivi la causale")} aria-label={t("Altra causale")} /> : null}
            </div>
            <div className="space-y-1"><Label>{t("Documento")}</Label><Input value={docNumero} onChange={(e) => setDocNumero(e.target.value)} placeholder="n." /></div>
            <div className="space-y-1"><Label>{t("Descrizione")}</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            {righe.map((r, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 space-y-1 sm:col-span-5">
                  {i === 0 ? <Label>{t("Conto")}</Label> : null}
                  <SceltaConto conti={movimentabili} value={r.conto_id} onChange={(v) => cambia(i, "conto_id", v)} />
                </div>
                <div className="col-span-4 space-y-1 sm:col-span-2">{i === 0 ? <Label>{t("Dare")}</Label> : null}<Input inputMode="decimal" value={r.dare} onChange={(e) => cambia(i, "dare", e.target.value)} /></div>
                <div className="col-span-4 space-y-1 sm:col-span-2">{i === 0 ? <Label>{t("Avere")}</Label> : null}<Input inputMode="decimal" value={r.avere} onChange={(e) => cambia(i, "avere", e.target.value)} /></div>
                <div className="col-span-3 space-y-1 sm:col-span-2">{i === 0 ? <Label>{t("Nota")}</Label> : null}<Input value={r.descrizione} onChange={(e) => cambia(i, "descrizione", e.target.value)} /></div>
                <div className="col-span-1">
                  <Button variant="ghost" size="icon" aria-label={t("Togli riga")} disabled={righe.length <= 2} onClick={() => setRighe((rr) => rr.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setRighe((rr) => [...rr, rigaVuota()])}><Plus className="mr-1 h-4 w-4" />{t("Riga")}</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-sm">
            <span>{t("Dare {dare} · Avere {avere}", { dare: euro(esito.dare), avere: euro(esito.avere) })}</span>
            <span className={esito.differenza === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
              {esito.differenza === 0 ? t("Quadra") : t("Differenza {valore}", { valore: euro(Math.abs(esito.differenza)) })}
            </span>
          </div>
          {esito.problemi.length > 0 && righe.some((r) => r.conto_id || r.dare || r.avere) ? (
            <ul className="list-disc pl-5 text-xs text-destructive">{esito.problemi.map((x) => <li key={x}>{x}</li>)}</ul>
          ) : null}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={registra.isPending} onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button onClick={() => registra.mutate()} disabled={registra.isPending || esito.problemi.length > 0 || !causale.trim() || !data}>
            {registra.isPending ? t("Registrazione…") : daRettificare ? modificaProvvisoria ? t("Salva modifiche") : t("Salva rettifica") : t("Registra")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StornaScrittura({ scrittura, onClose, onFatto }: { scrittura: Scrittura | null; onClose: () => void; onFatto: () => void }) {
  const t = useT();
  const [data, setData] = useState(oggi());
  const [motivo, setMotivo] = useState("");
  const storna = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("contabilita_storna_scrittura", { p_scrittura: scrittura!.id, p_data: data, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("Scrittura stornata")); setMotivo(""); onClose(); onFatto(); },
    onError: (e) => toast.error(t("Storno non registrato"), { description: messaggioErroreOperazione(e) }),
  });
  return (
    <Dialog open={!!scrittura} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("Storna la scrittura {numero}", { numero: scrittura ? `${scrittura.numero}/${scrittura.esercizio}` : "" })}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("Una scrittura registrata non si cancella: si registra quella inversa, con la data dello storno. Poi, se serve, si registra quella giusta.")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1"><Label>{t("Data")}</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>{t("Motivo")}</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("es. conto sbagliato")} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Annulla")}</Button>
          <Button onClick={() => storna.mutate()} disabled={storna.isPending || !motivo.trim()}>{t("Storna")}</Button>
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
  const t = useT();
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
  const periodoVista = t("Dal 01/01/{anno} al {data}", { anno, data: dataIt(dataBilancio) });
  const sbilancio = Math.round((cee.totaleAttivo - cee.totalePassivo) * 100) / 100;
  const mesi = ricaviECostiPerMese((scritture.data ?? []).filter(s => s.data_registrazione <= dataBilancio), conti, anno);
  return (
    <div className="space-y-4">
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa.html}
          title={t("{nome} — anteprima di stampa", { nome: String(stampa.nome ?? "") })} fileName={`${stampa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2"><Label htmlFor="bilancio-al">{t("Bilancio al")}</Label><Input id="bilancio-al" type="date" className="h-9 w-40" min={`${anno}-01-01`} max={`${anno}-12-31`} value={dataBilancio} onChange={e => { if (e.target.value) setFinoAl(e.target.value); }} /></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={dettaglioPartitari} onCheckedChange={v => setDettaglioPartitari(v === true)} />{t("Dettaglio clienti e fornitori")}</label>
        <div className="mr-2 flex rounded-md border p-0.5">
          {([["sezioni", "Stato patrimoniale e conto economico"], ["verifica", "Bilancio di verifica"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
              className={`rounded px-2.5 py-1 text-xs ${vista === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{t(l)}</button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioSezioni({ azienda, bilancio: sezioni, periodo }), nome: "Bilancio a sezioni" })}>
          <Printer className="mr-1 h-4 w-4" />{t("Stampa stato patrimoniale e conto economico")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioVerifica({ azienda, verifica, periodo }), nome: "Bilancio di verifica" })}>
          <Printer className="mr-1 h-4 w-4" />{t("Stampa bilancio di verifica")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioCee({ azienda, bilancio: cee, periodo }), nome: "Bilancio CEE" })}>
          <Printer className="mr-1 h-4 w-4" />{t("Stampa bilancio CEE")}
        </Button>
      </div>
      {/* 14/11/2026: i tre numeri col colore dello stato (attivo e passivo
          ambra se non pareggiano, utile verde, perdita rossa) e ricavi e
          costi mese per mese. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <RiquadroNumero etichetta={t("Totale attivo")} valore={euro(cee.totaleAttivo)} periodo={periodoVista} tono={sbilancio !== 0 ? "attenzione" : "neutro"} />
        <RiquadroNumero
          etichetta={t("Totale passivo e netto")}
          valore={euro(cee.totalePassivo)}
          periodo={periodoVista}
          tono={sbilancio !== 0 ? "attenzione" : "neutro"}
          contesto={sbilancio !== 0 ? t("Non pareggia con l'attivo: {importo} di differenza", { importo: euro(sbilancio) }) : t("Pareggia con l'attivo")}
        />
        <RiquadroNumero
          etichetta={cee.utile >= 0 ? t("Utile dell'esercizio") : t("Perdita dell'esercizio")}
          valore={euro(cee.utile)}
          periodo={periodoVista}
          tono={cee.utile > 0 ? "buono" : cee.utile < 0 ? "male" : "neutro"}
          tendenza={mesi.some((m) => m.ricavi !== 0 || m.costi !== 0) ? mesi.reduce<number[]>((acc, m) => [...acc, (acc[acc.length - 1] ?? 0) + m.ricavi - m.costi], []) : undefined}
          etichettaTendenza={t("Utile progressivo mese per mese")}
        />
      </div>
      {!isMobile && (sezioni.attivo.totale > 0 || sezioni.passivo.totale > 0 || mesi.some(m => m.ricavi !== 0 || m.costi !== 0)) && <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("Grafici di bilancio")}</summary><div className="mt-3 space-y-3">
      {!isMobile && (sezioni.attivo.totale > 0 || sezioni.passivo.totale > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ComposizioneLato titolo={t("Com'è fatto l'attivo")} lato={sezioni.attivo} />
          <ComposizioneLato titolo={t("Com'è fatto il passivo e netto")} lato={sezioni.passivo} extra={sezioni.utile > 0 ? { nome: t("Utile dell'esercizio"), valore: sezioni.utile } : undefined} />
        </div>
      )}
      {!isMobile && mesi.some((m) => m.ricavi !== 0 || m.costi !== 0) && (
        <section aria-label={t("Ricavi e costi mese per mese")} className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">{t("Ricavi e costi mese per mese")}</h3>
          <GraficoRicaviCosti righe={mesi.map((m) => ({ mese: m.mese, ricavi: m.ricavi, costi_var: m.costi, costi_fissi: 0 }))} />
        </section>
      )}
      </div></details>}
      {!verifica.quadra || sbilancio !== 0 || cee.vociNonIndicate.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {!verifica.quadra ? <p>{t("Il bilancio di verifica non quadra: dare {totaleDare}, avere {totaleAvere}.", { totaleDare: euro(verifica.totaleDare), totaleAvere: euro(verifica.totaleAvere) })}</p> : null}
          {sbilancio !== 0 ? <p>{t("Attivo e passivo differiscono di {sbilancio}: un conto ha la natura sbagliata nel piano dei conti.", { sbilancio: euro(sbilancio) })}</p> : null}
          {cee.vociNonIndicate.length > 0 ? <p>{t("Conti senza una voce CEE riconosciuta: {vociNonIndicate}.", { vociNonIndicate: cee.vociNonIndicate.join(", ") })}</p> : null}
        </div>
      ) : null}
      {vista === "sezioni" ? (
        <div className="space-y-4">
          <section aria-label={t("Stato patrimoniale")} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("Stato patrimoniale")}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              <LatoDelBilancio titolo={t("Attivo")} lato={sezioni.attivo} />
              <LatoDelBilancio titolo={t("Passivo e netto")} lato={sezioni.passivo}
                chiusura={{ etichetta: sezioni.utile >= 0 ? t("Utile dell'esercizio") : t("Perdita dell'esercizio"), importo: sezioni.utile }} />
            </div>
          </section>
          <section aria-label={t("Conto economico")} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("Conto economico")}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              <LatoDelBilancio titolo={t("Costi")} lato={sezioni.costi}
                chiusura={sezioni.utile > 0 ? { etichetta: t("Utile dell'esercizio"), importo: sezioni.utile } : undefined} />
              <LatoDelBilancio titolo={t("Ricavi")} lato={sezioni.ricavi}
                chiusura={sezioni.utile < 0 ? { etichetta: t("Perdita dell'esercizio"), importo: -sezioni.utile } : undefined} />
            </div>
          </section>
        </div>
      ) : (
      <TabellaContabile>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">{t("Conto")}</th><th className="p-2 text-right">{t("Dare")}</th><th className="p-2 text-right">{t("Avere")}</th><th className="p-2 text-right">{t("Saldo")}</th></tr>
          </thead>
          <tbody>
            {saldi.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">{t("Nessun conto movimentato nel {anno}.", { anno })}</td></tr>
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
  const t = useT();
  const fermo = usePreferisceMenoMovimento();
  const positivi = lato.mastri.filter((m) => m.totale > 0).sort((a, b) => b.totale - a.totale);
  const fette = positivi.slice(0, 5).map((m) => ({ nome: m.descrizione || m.codice || t("Senza mastro"), valore: m.totale }));
  const resto = positivi.slice(5).reduce((s, m) => s + m.totale, 0);
  if (resto > 0) fette.push({ nome: t("Altri mastri"), valore: resto });
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
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Totale")}</span>
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
  const t = useT();
  const totale = lato.totale + (chiusura?.importo ?? 0);
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        <span>{titolo}</span><span className="tabular-nums">{euro(totale)}</span>
      </div>
      {lato.mastri.length === 0 && !chiusura ? <p className="p-3 text-sm text-muted-foreground">{t("Nessun conto movimentato.")}</p> : null}
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
  const t = useT();
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
    onSuccess: () => { toast.success(t("Conto aggiornato")); setPer(null); onClose(); onFatto(); },
    onError: (e) => toast.error(t("Conto non aggiornato"), { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={!!conto} onOpenChange={(v) => { if (!v) { setPer(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("Conto {codice}", { codice: String(conto?.codice ?? "") })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{t("Descrizione")}</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>{t("Natura")}</Label>
            <Select value={natura} onValueChange={(v) => setNatura(v as ContoContabile["natura"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NATURE.map((n) => <SelectItem key={n.value} value={n.value}>{t(n.label)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>{t("Voce CEE")}</Label><Input value={voce} onChange={(e) => setVoce(e.target.value)} placeholder="C.II.1" /></div>
            <div className="space-y-1"><Label>{t("Ruolo (piano standard)")}</Label><Input value={ruolo} onChange={(e) => setRuolo(e.target.value)} placeholder={t("es. 05.01")} /></div>
          </div>
          <div className="space-y-1">
            <Label>{t("Nota")}</Label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t("Vuota quando la classificazione è confermata")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("Il ruolo dice alle scritture dai documenti quale conto usare: 05.01 clienti, 13.04 fornitori, 06.01 banca, 05.10 e 13.10 IVA, 20.01 ricavi, 30.01 acquisti.")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPer(null); onClose(); }}>{t("Annulla")}</Button>
          <Button onClick={() => salva.mutate()} disabled={salva.isPending || !descrizione.trim()}>{t("Salva")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mastrino di un conto e, per clienti e fornitori, il partitario: quanto deve o avanza ognuno. */
function Mastrini({ companyId, anno, conti }: { companyId: string; anno: number; conti: ContoContabile[] }) {
  const tTesto = useT();
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
  if (!conto) return <p className="rounded-xl border p-4 text-sm text-muted-foreground">{tTesto("Nessun conto movimentato nel {anno}.", { anno })}</p>;
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
          title={tTesto("Mastrino — anteprima di stampa")} fileName={`mastrino-${conto.codice}-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={conto.id} onValueChange={cambiaConto}>
          <SelectTrigger className="h-8 w-full sm:w-80" aria-label={tTesto("Conto")}><SelectValue /></SelectTrigger>
          <SelectContent>
            {movimentati.map((c) => <SelectItem key={c.id} value={c.id}>{c.codice} {c.descrizione}</SelectItem>)}
          </SelectContent>
        </Select>
        {soggetto !== null ? (
          <Button size="sm" variant="outline" onClick={() => { setSoggetto(null); setCercaM(""); }}>{tTesto("← Tutti i soggetti")}</Button>
        ) : null}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={cercaM} onChange={(e) => { setCercaM(e.target.value); setMostra(500); }}
            placeholder={aPartite ? tTesto("Cerca cliente o fornitore…") : tTesto("Cerca nei movimenti…")} aria-label={tTesto("Cerca nel mastrino")} className="h-8 pl-8" />
        </div>
        {!aPartite ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setStampa(htmlMastrino({
            azienda: intestazioneDa(anagrafica.data), scritture: elenco, conto, soggetto: soggetto ?? undefined,
            dal: `${anno}-01-01`, al: `${anno}-12-31`,
          }))}><Printer className="mr-1 h-4 w-4" />{soggetto ? tTesto("Stampa scheda") : tTesto("Stampa mastrino")}</Button>
        ) : null}
      </div>
      {aPartite ? (
        <TabellaContabile>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">{conto.codice_standard === "13.04" || /fornitor/i.test(conto.descrizione) ? tTesto("Fornitore") : tTesto("Cliente")}</th><th className="p-2 text-right">{tTesto("Movimenti")}</th><th className="p-2 text-right">{tTesto("Dare")}</th><th className="p-2 text-right">{tTesto("Avere")}</th><th className="p-2 text-right">{tTesto("Saldo")}</th></tr>
            </thead>
            <tbody>
              {partite.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">{tTesto("Nessun soggetto con «{cercaM}».", { cercaM: String(cercaM ?? "") })}</td></tr>
              )}
              {partite.map((x) => (
                <tr key={x.soggetto} className="cursor-pointer border-t hover:bg-muted/40" title={tTesto("Apri la scheda di questo soggetto")} onClick={() => { setSoggetto(x.soggetto); setCercaM(""); }}>
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
                  <td className="p-2">{qm ? tTesto("Totale dei trovati · {n} soggetti", { n: partite.length }) : tTesto("Totale del conto · {n} soggetti", { n: partite.length })}</td>
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
            {soggetto ? `${soggetto} · ` : ""}{tTesto("{n} movimenti · dare {dare} · avere {avere} · saldo {saldo}", { n: m.movimenti.length, dare: euro(m.dare), avere: euro(m.avere), saldo: saldoTesto(m.saldo) })}
          </p>
          <TabellaContabile>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">{tTesto("Data")}</th><th className="p-2">N.</th><th className="p-2">{tTesto("Causale")}</th><th className="p-2">{tTesto("Descrizione")}</th><th className="p-2 text-right">{tTesto("Dare")}</th><th className="p-2 text-right">{tTesto("Avere")}</th><th className="p-2 text-right">{tTesto("Saldo")}</th></tr>
              </thead>
              <tbody>
                {m.movimenti.slice(0, mostra).map((x, i) => (
                  <tr key={`${x.scritturaId}-${i}`} className="cursor-pointer border-t hover:bg-muted/40" onClick={e => {
                    e.currentTarget.querySelector("button")?.focus();
                    setDettaglioId(x.scritturaId);
                  }}>
                    <td className="p-2">{dataIt(x.data)}</td>
                    <td className="p-2 font-mono text-xs"><button type="button" aria-haspopup="dialog" aria-label={tTesto("Apri scrittura {numero}", { numero: String(x.numero ?? "") })} className="text-primary hover:underline">{x.numero}</button></td>
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
              <span>{tTesto("Movimenti {mostra} di {n}: la stampa li contiene tutti.", { mostra, n: m.movimenti.length })}</span>
              <Button size="sm" variant="outline" onClick={() => setMostra((n) => n + 500)}>{tTesto("Mostra altri")}</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** I periodi IVA dell'anno: dodici mesi o quattro trimestri. */
function nomeMese(anno: number, i: number, maiuscolo = false): string {
  const n = new Date(Date.UTC(anno, i, 15)).toLocaleDateString(intlCampo(), { month: "long", timeZone: "UTC" });
  return maiuscolo ? n.charAt(0).toUpperCase() + n.slice(1) : n;
}

function periodiIva(anno: number, trimestrale: boolean, t: (testo: string, valori?: Record<string, string | number>) => string) {
  const fine = (m: number) => new Date(Date.UTC(anno, m, 0)).toISOString().slice(0, 10);
  const mm = (m: number) => String(m).padStart(2, "0");
  return trimestrale
    ? [1, 2, 3, 4].map((q) => ({ dal: `${anno}-${mm(q * 3 - 2)}-01`, al: fine(q * 3), nome: t("{q}° trimestre {anno}", { q, anno }) }))
    : MESI.map((_, i) => ({ dal: `${anno}-${mm(i + 1)}-01`, al: fine(i + 1), nome: `${nomeMese(anno, i)} ${anno}` }));
}


/**
 * IVA a debito (vendite) e a credito (acquisti) periodo per periodo, con la
 * riga «da versare nell'anno / a credito / periodi registrati». Dalle stesse
 * anteprime della tabella sotto: nessuna lettura in più.
 */
function GraficoIva({ periodi, esiti }: { periodi: Array<{ nome: string; dal: string }>; esiti: EsitoLiquidazione[] }) {
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const dati = periodi.map((p, i) => ({ nome: p.nome, vendite: esiti[i]?.iva_vendite ?? 0, acquisti: esiti[i]?.iva_acquisti ?? 0 }));
  if (dati.every((d) => d.vendite === 0 && d.acquisti === 0)) return null;
  const daVersare = esiti.reduce((s, r) => s + (r.da_versare ?? 0) + (r.interessi ?? 0), 0);
  const aCredito = esiti.length ? esiti[esiti.length - 1].a_credito ?? 0 : 0;
  const conMovimenti = esiti.filter((r) => r.iva_vendite !== 0 || r.iva_acquisti !== 0);
  const registrati = conMovimenti.filter((r) => r.gia_liquidato).length;
  return (
    <section aria-label={t("IVA per periodo")} className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
        <StatGrafico etichetta={t("Da versare nell'anno")} valore={euro(daVersare)} nota={t("somma dei periodi")} tono={daVersare > 0 ? "cattivo" : "neutro"} />
        <StatGrafico etichetta={t("A credito")} valore={euro(aCredito)} nota={t("all'ultimo periodo")} tono={aCredito > 0 ? "buono" : "neutro"} />
        <StatGrafico etichetta={t("Periodi registrati")} valore={t("{n} su {totale}", { n: registrati, totale: conMovimenti.length })} nota={t("con movimenti IVA")} tono={registrati === conMovimenti.length ? "buono" : "neutro"} />
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
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_GRAFICO.rosso }} />{t("IVA sulle vendite")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_GRAFICO.verde }} />{t("IVA sugli acquisti")}</span>
      </div>
    </section>
  );
}

const SOTTOVISTE_IVA = [
  ["registri", "Registri IVA"],
  ["liquidazione", "Liquidazione periodica, LIPE e F24"],
  ["contabile", "Giroconto in contabilità"],
] as const;
type SottovistaIva = (typeof SOTTOVISTE_IVA)[number][0];

/**
 * L'IVA in Contabilità generale (23/11/2026): gli stessi strumenti di Fatture → Fiscalità, senza
 * cambiare pagina. Un cliente: «come stampo i registri IVA? non li ho trovati» e «in contabilità
 * generale non fa scaricare l'IVA». Registri (stampa, Excel, CSV, protocolli), liquidazione
 * periodica con righi VP e file LIPE, F24, ritenute e impostazioni IVA sono gli stessi componenti
 * di Fiscalità; il giroconto su Erario c/IVA è quello della partita doppia.
 */
function IvaContabilita({ companyId, anno }: { companyId: string; anno: number }) {
  const t = useT();
  const p = useFiscalPeriod();
  const permessi = usePermissions();
  const documenti = useFeatureAccess("documenti");
  const richiesta = p.params.get("iva");
  const sotto: SottovistaIva = richiesta === "liquidazione" || richiesta === "contabile" ? richiesta : "registri";
  const vistaLiquidazione = p.params.get("iva_vista");
  // Mese o trimestre servono ai registri, all'F24 e alle ritenute; la liquidazione elenca da sola i periodi dell'anno.
  const conPeriodo = sotto === "registri" || (sotto === "liquidazione" && (vistaLiquidazione === "f24" || vistaLiquidazione === "ritenute_bancarie"));
  const registriAperti = permessi.canViewBilling && (documenti.isEnabled || documenti.isPreview);
  const controllo = useControlloIva(companyId, anno);
  // Il percorso segue quello che si fa nelle sottoschede (LIPE confermata, giroconto, F24): si rilegge cambiando scheda.
  const { refetch: rileggiPercorso } = controllo;
  const sottoPrima = useRef(sotto);
  useEffect(() => {
    if (sottoPrima.current === sotto) return;
    sottoPrima.current = sotto;
    void rileggiPercorso();
  }, [sotto, rileggiPercorso]);
  const vai = (dove: DestinazionePasso) => p.set(
    dove === "impostazioni" ? { iva: "liquidazione", iva_vista: "impostazioni_iva" }
    : dove === "ricezione" ? { iva: "registri", registro: "acquisti" }
    : dove === "lipe" ? { iva: "liquidazione", iva_vista: "iva" }
    : dove === "f24" ? { iva: "liquidazione", iva_vista: "f24" }
    : { iva: "contabile" });
  return (
    <div className="space-y-3">
      <PercorsoIva stato={controllo.data} anno={anno} oggi={oggi()} onVai={vai} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label={t("Strumenti IVA")} className="flex flex-wrap gap-1">
          {SOTTOVISTE_IVA.map(([k, l]) => (
            <Button key={k} size="sm" variant={sotto === k ? "default" : "outline"} aria-pressed={sotto === k} onClick={() => p.set({ iva: k })}>{t(l)}</Button>
          ))}
        </div>
        {conPeriodo && <FiscalPeriodFilters anno={p.anno} mese={p.mese} trimestre={p.trimestre} tipo={p.tipo} showPeriod onChange={p.set} />}
      </div>
      <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("Caricamento…")}</p>}>
        {sotto === "registri" ? (
          permessi.isLoading || documenti.isLoading ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">{t("Verifica accesso ai registri…")}</p>
          ) : registriAperti ? (
            <RegistroIVA embedded onApriLiquidazione={() => p.set({ iva: "liquidazione", iva_vista: "iva" })} />
          ) : (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">{t("I registri IVA leggono le fatture: servono il permesso di vedere la fatturazione e la sezione Documenti attiva nel piano.")}</p>
          )
        ) : sotto === "liquidazione" ? (
          <LiquidazioneIvaEF24 chiaveVista="iva_vista" onApriRegistro={() => p.set({ iva: "registri" })} />
        ) : (
          <LiquidazioneIva companyId={companyId} anno={anno} senzaImporti={controllo.data?.senzaImporti ?? []}
            periodicita={controllo.data?.periodicita} onApriLipe={() => p.set({ iva: "liquidazione", iva_vista: "iva" })} />
        )}
      </Suspense>
    </div>
  );
}

/**
 * Liquidazione IVA in contabilità: l'IVA del periodo si gira su Erario c/IVA (contabilita_liquida_iva).
 * Un solo calcolo (23/11/2026): si registra la LIPE confermata dello stesso periodo (VP4, VP5, VP12);
 * senza LIPE la riga è un'anteprima dai saldi delle scritture e il pulsante porta a confermarla.
 */
function LiquidazioneIva({ companyId, anno, senzaImporti = [], periodicita, onApriLipe }: {
  companyId: string; anno: number; senzaImporti?: readonly DocumentoSenzaImporti[];
  /** Dalle Impostazioni IVA dell'anno: è quella della LIPE, quindi anche quella dei giroconti. */
  periodicita?: "mensile" | "trimestrale" | null;
  onApriLipe?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const anagrafica = useAnagraficaAzienda();
  const [stampa, setStampa] = useState<string | null>(null);
  const [sceltaTrimestrale, setTrimestrale] = useState(false);
  const trimestrale = periodicita ? periodicita === "trimestrale" : sceltaTrimestrale;
  const periodi = periodiIva(anno, trimestrale, t);
  const incompleti = incompletiPerPeriodo(senzaImporti, periodi);
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
  // Un periodo registrato mostra gli importi della sua scrittura: i saldi, dopo il giroconto, sono a zero.
  const mostrati = useMemo(() => esiti.data ? importiPerPeriodo(esiti.data) as EsitoLiquidazione[] : undefined, [esiti.data]);
  const registra = useMutation({
    mutationFn: async (per: { dal: string; al: string }) => {
      const { data, error } = await db.rpc("contabilita_liquida_iva", { p_company: companyId, p_dal: per.dal, p_al: per.al, p_anteprima: false });
      if (error) throw error;
      return data as EsitoLiquidazione;
    },
    onSuccess: (r) => {
      toast.success(t("Liquidazione registrata dalla LIPE"), {
        description: r.da_versare > 0 ? t("IVA da versare {da_versare}: il pagamento dell'F24 la chiude.", { da_versare: euro(r.da_versare) }) : t("IVA a credito {a_credito}.", { a_credito: euro(r.a_credito) }),
      });
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error(t("Liquidazione non registrata"), { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {periodicita ? (
          <span className="text-muted-foreground">{t("Periodicità")} <span className="font-medium text-foreground">{periodicita}</span>, {t("dalle Impostazioni IVA")}</span>
        ) : (
          <Select value={trimestrale ? "t" : "m"} onValueChange={(v) => setTrimestrale(v === "t")}>
            <SelectTrigger className="h-8 w-40" aria-label={t("Periodicità")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="m">{t("Mensile")}</SelectItem>
              <SelectItem value="t">{t("Trimestrale")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">{t("Come si calcola la liquidazione")}</summary><p className="mt-2 max-w-prose">
          {t("L'IVA si calcola una volta sola, nella liquidazione periodica (LIPE): quando la confermi, qui la registri e la contabilità gira su Erario c/IVA l'IVA esigibile (VP4), quella detratta (VP5) e gli interessi (VP12). Finché non è confermata vedi un'anteprima dai saldi delle scritture. Se le scritture hanno più IVA della LIPE (fatture registrate in un mese e ricevute nel successivo), la differenza resta sui conti IVA per il periodo giusto. Sotto la soglia (100 € dal 2024) il debito si registra lo stesso e si versa col periodo dopo.")}
        </p></details>
        {mostrati && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setStampa(htmlLiquidazioneContabile({ azienda: intestazioneDa(anagrafica.data), anno, trimestrale, righe: righeLiquidazione(periodi, esiti.data!, incompleti) }))}>
              <Printer className="mr-1 h-4 w-4" />{t("Stampa liquidazioni")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => scaricaCsv(`liquidazioni-iva-${anno}-${trimestrale ? "trimestrali" : "mensili"}`, csvLiquidazioneContabile(righeLiquidazione(periodi, esiti.data!, incompleti)))}>
              <Download className="mr-1 h-4 w-4" />{t("Esporta")}
            </Button>
          </div>
        )}
      </div>
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa}
          title={t("Liquidazioni IVA — anteprima di stampa")} fileName={`liquidazioni-iva-${anno}`} soloPdf />
      )}
      {!isMobile && mostrati && <GraficoIva periodi={periodi} esiti={mostrati} />}
      {esiti.isLoading || esiti.isError ? (
        <FiscalQueryState loading={esiti.isLoading} error={esiti.isError} onRetry={() => void esiti.refetch()} />
      ) : (
        <TabellaContabile>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">{t("Periodo")}</th><th className="p-2 text-right">{t("IVA vendite")}</th><th className="p-2 text-right">{t("IVA acquisti")}</th><th className="p-2 text-right">{t("Credito precedente usato")}</th><th className="p-2 text-right">{t("Da versare")}</th><th className="p-2 text-right">{t("A credito")}</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {periodi.map((per, i) => {
                const r = mostrati?.[i];
                if (!r) return null;
                const vuoto = r.iva_vendite === 0 && r.iva_acquisti === 0 && !r.interessi;
                const dallaLipe = r.fonte !== "scritture";
                // Sull'esito originale: in `r` gli importi del registrato sono già quelli della scrittura.
                const differenza = esiti.data?.[i] ? differenzaLipe(esiti.data[i]) : "";
                // In ordine: il credito di un periodo entra nel successivo solo se è registrato.
                const primaInSospeso = periodi.slice(0, i).some((_, j) => {
                  const q = mostrati?.[j];
                  return q && !q.gia_liquidato && (q.fonte === "lipe" || !q.sotto_minimo) && (q.iva_vendite !== 0 || q.iva_acquisti !== 0 || !!q.interessi);
                });
                return (
                  <tr key={per.dal} className="border-t align-top">
                    <td className="p-2">
                      <span className="capitalize">{per.nome}</span>
                      {!vuoto && !r.gia_liquidato ? (
                        <span className="block text-[11px] text-muted-foreground">{dallaLipe ? t("dalla LIPE confermata") : t("anteprima dalle scritture")}</span>
                      ) : null}
                      {avvisoPeriodo(incompleti[i]) ? (
                        <span className="block text-[11px] text-amber-700 dark:text-amber-300" title={t("Documenti col solo totale: la loro IVA non è nelle scritture")}>{t("{valore}: importi parziali nelle scritture", { valore: String(avvisoPeriodo(incompleti[i]) ?? "") })}</span>
                      ) : null}
                      {differenza ? <span className="block max-w-md text-[11px] text-amber-700 dark:text-amber-300">{differenza}</span> : null}
                    </td>
                    <td className="p-2 text-right tabular-nums">{euro(r.iva_vendite)}</td>
                    <td className="p-2 text-right tabular-nums">{euro(r.iva_acquisti)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{!r.gia_liquidato && r.compensato ? euro(r.compensato) : ""}</td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {!r.gia_liquidato && r.da_versare ? euro(r.da_versare + (r.interessi ?? 0)) : ""}
                      {!r.gia_liquidato && r.interessi ? <span className="block text-[11px] font-normal text-muted-foreground">{t("di cui interessi 1%: {interessi}", { interessi: euro(r.interessi) })}</span> : null}
                      {!r.gia_liquidato && dallaLipe && r.sotto_minimo ? <span className="block text-[11px] font-normal text-muted-foreground">{t("sotto la soglia: si versa col periodo dopo")}</span> : null}
                    </td>
                    <td className="p-2 text-right tabular-nums">{!r.gia_liquidato && r.a_credito ? euro(r.a_credito) : ""}</td>
                    <td className="p-2 text-right">
                      {r.gia_liquidato ? (
                        <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">{t("registrata")}</span>
                      ) : vuoto ? null : !dallaLipe ? (
                        onApriLipe ? <Button size="sm" variant="outline" onClick={onApriLipe} title={t("La contabilità registra la liquidazione periodica confermata")}>{t("Conferma la LIPE")}</Button>
                          : <span className="text-xs text-muted-foreground">{t("da confermare nella LIPE")}</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={registra.isPending || primaInSospeso}
                          title={primaInSospeso ? t("Prima registra i periodi precedenti") : undefined}
                          onClick={() => registra.mutate(per)}>{t("Registra")}</Button>
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
function aggiornataAlle(iso: string, t: (testo: string, valori?: Record<string, string | number>) => string, adesso: Date = new Date()): string {
  const d = new Date(iso);
  const giorno = (x: Date) => x.toLocaleDateString(intlCampo(), { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
  const ora = d.toLocaleTimeString(intlCampo(), { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  const stessoGiorno = d.toLocaleDateString(intlCampo(), { timeZone: "Europe/Rome" }) === adesso.toLocaleDateString(intlCampo(), { timeZone: "Europe/Rome" });
  return stessoGiorno ? t("aggiornata alle {ora}", { ora }) : t("aggiornata il {giorno} alle {ora}", { giorno: giorno(d), ora });
}

/**
 * Quello che la generazione non ha saputo classificare (documenti col solo totale, differenze fra totale
 * e imponibile più IVA, movimenti su «Partite da verificare»): va guardato, non resta nascosto.
 */
function DaGuardare({ esito }: { esito: StatoEsercizioRiga["generato_esito"] }) {
  const tr = useT();
  const avvisi = esito?.avvisi ?? [];
  const errori = esito?.errori ?? [];
  const incompleti = esito?.saltate_solo_testata ?? 0;
  if (avvisi.length + errori.length + incompleti === 0) return null;
  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
      <summary className="cursor-pointer font-medium">
        {tr("Da guardare:")} {[
          avvisi.length ? tr(avvisi.length === 1 ? "{n} avviso" : "{n} avvisi", { n: avvisi.length }) : "",
          errori.length ? tr("{n} non registrati", { n: errori.length }) : "",
          incompleti ? tr("{n} documenti incompleti", { n: incompleti }) : "",
        ].filter(Boolean).join(" · ")}
      </summary>
      <ul className="mt-2 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
        {incompleti > 0 && <li>{tr("{incompleti} documenti non hanno dati sufficienti o dipendono da una fattura non ancora registrata. Completa imponibile, IVA e righe nelle fatture ricevute o emesse, poi aggiorna le scritture.", { incompleti })}</li>}
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
  const t = useT();
  const e = useEsercizio(companyId, anno).data;
  if (!e || (!e.chiuso_il && !e.stampato_fino_al)) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
      <Lock className="h-4 w-4 text-muted-foreground" />
      {e.chiuso_il
        ? t("Esercizio {anno} chiuso il {data}: non si registra più niente con data {anno}.", { anno, data: dataIt(e.chiuso_il.slice(0, 10)) })
        : t("Libro giornale stampato in definitivo fino al {data}: le nuove scritture vanno dopo quel giorno.", { data: dataIt(e.stampato_fino_al!) })}
    </p>
  );
}

/** Stampa definitiva: fissa il giorno, poi apre la stampa del tratto nuovo (numeri e riporto dall'inizio dell'anno). */
function StampaDefinitiva({ open, onOpenChange, companyId, anno, onStampa }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; anno: number; onStampa: (dal: string, al: string) => void;
}) {
  const t = useT();
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
      toast.success(t("Libro giornale stampato in definitivo"), { description: t("{scritture} scritture dal {dal} al {al}: quei giorni ora sono bloccati.", { scritture: r.scritture, dal: dataIt(r.dal), al: dataIt(r.al) }) });
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
      onOpenChange(false);
      onStampa(r.dal, r.al);
    },
    onError: (e) => toast.error(t("Stampa definitiva non fatta"), { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("Stampa definitiva del libro giornale")}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            {t("Si stampano le scritture dal {data} al giorno che scegli, con la numerazione e il riporto dall'inizio dell'esercizio.", { data: dataIt(dal) })}{" "}
            <strong>{t("Dopo, nessuna scrittura potrà avere una data fino a quel giorno: le correzioni andranno registrate dopo.")}</strong>
          </p>
          <div className="space-y-1">
            <Label>{t("Fino al")}</Label>
            <Input type="date" value={al} min={dal} max={oggi() < fineAnno ? oggi() : fineAnno} onChange={(e) => setAl(e.target.value)} />
          </div>
          {esercizio?.stampe?.length ? (
            <p className="text-xs text-muted-foreground">
              {t("Stampe già fatte: {elenco}.", { elenco: esercizio.stampe.map((x) => `${dataIt(x.dal)}–${dataIt(x.al)}`).join(", ") })}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button onClick={() => fissa.mutate()} disabled={fissa.isPending || !al || al < dal}>{t("Blocca e stampa")}</Button>
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
  const t = useT();
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
      toast.success(r.registrate.length ? t("Registrati: {registrate}", { registrate: r.registrate.join(", ") }) : t("Niente di nuovo da registrare"));
      aggiorna();
    },
    onError: (e) => toast.error(t("Scritture di fine anno non registrate"), { description: e instanceof Error ? e.message : String(e) }),
  });
  const chiudi = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_chiudi_esercizio", { p_company: companyId, p_anno: anno, p_anteprima: false });
      if (error) throw error;
      return data as EsitoChiusura & { apertura_registrata: boolean };
    },
    onSuccess: (r) => {
      toast.success(t("Esercizio {anno} chiuso", { anno }), {
        description: `${r.utile >= 0 ? t("Utile {importo}.", { importo: euro(Math.abs(r.utile)) }) : t("Perdita {importo}.", { importo: euro(Math.abs(r.utile)) })} ${r.apertura_registrata
          ? t("Conti riaperti al 01/01/{anno}.", { anno: anno + 1 }) : t("Il {anno} aveva già una scrittura di apertura: non ne è stata fatta un'altra.", { anno: anno + 1 })}`,
        duration: 12000,
      });
      setConferma(false);
      aggiorna();
    },
    onError: (e) => toast.error(t("Esercizio non chiuso"), { description: e instanceof Error ? e.message : String(e) }),
  });
  const riapriM = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("contabilita_riapri_esercizio", { p_company: companyId, p_anno: anno, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("Esercizio {anno} riaperto: chiusura e apertura stornate", { anno })); setRiapri(false); setMotivo(""); aggiorna(); },
    onError: (e) => toast.error(t("Esercizio non riaperto"), { description: e instanceof Error ? e.message : String(e) }),
  });

  if (fine.isLoading || fine.isError) {
    return <FiscalQueryState loading={fine.isLoading} error={fine.isError} onRetry={() => void fine.refetch()} />;
  }
  const f = fine.data!;
  // Anche ammortamenti da rifare (registro cambiato dopo, o sceso a zero): «Registra» li riallinea.
  const daRegistrare = (f.totale_ammortamenti > 0 && !f.ammortamenti_registrati) || !!f.ammortamenti_da_aggiornare || (f.tfr > 0 && !f.tfr_registrato) || !!f.tfr_da_aggiornare;
  // L'indice dei cinque passi in cima (16/11/2026): la pagina è lunga, così si salta al passo.
  const passi: Array<[string, string, boolean | null]> = [
    ["fine-1", t("Ammortamenti e TFR"), !daRegistrare],
    ["fine-2", t("Rimanenze"), null],
    ["fine-3", t("Ratei e risconti"), null],
    ["fine-4", t("Imposte"), null],
    ["fine-5", t("Chiusura"), chiuso],
  ];
  return (
    <div className="space-y-4">
      <nav aria-label={t("Passi di fine anno")} className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1">
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
          <h3 className="text-sm font-semibold">{t("1. Ammortamenti e TFR al 31/12/{anno}", { anno })}</h3>
          <Button size="sm" variant="outline" disabled={chiuso || !daRegistrare || registraFine.isPending} onClick={() => registraFine.mutate()}>
            {registraFine.isPending ? t("Registrazione…") : t("Registra")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("I cespiti sono quelli del registro in Controllo di gestione: quote costanti, metà nel primo anno, fino a esaurire il costo; il fondo è la somma delle quote registrate. «Registra» scrive ammortamenti e TFR al 31/12, e li rifà se il registro cambia.")}
        </p>
        <RegistroCespiti companyId={companyId} anno={anno} chiuso={chiuso} />
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
          <span>{t("Accantonamento TFR")} {f.tfr_da_aggiornare ? <span className="text-amber-700">· {t("da aggiornare: i cedolini sono cambiati")}</span> : f.tfr_registrato ? `· ${t("registrato")}` : ""}</span>
          <span className="tabular-nums">{euro(f.tfr)}</span>
        </div>
        <ContiPerRuolo companyId={companyId} ruoli={RUOLI_TFR.filter((r) => (f.conti_mancanti_tfr ?? []).includes(r.ruolo))} chiuso={chiuso} />
        <p className="text-xs text-muted-foreground">{t("Il TFR è un tredicesimo e mezzo delle retribuzioni lorde dei cedolini ({retribuzioni}), senza rivalutazione.", { retribuzioni: euro(f.retribuzioni) })}</p>
      </section>

      <section id="fine-2" className="scroll-mt-20 space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">{t("2. Rimanenze finali al 31/12/{anno}", { anno })}</h3>
        <RimanenzeFineAnno companyId={companyId} anno={anno} chiuso={chiuso} />
      </section>

      <section id="fine-3" className="scroll-mt-20 space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">{t("3. Ratei e risconti al 31/12/{anno}", { anno })}</h3>
        <RateiRiscontiFineAnno companyId={companyId} anno={anno} chiuso={chiuso} />
      </section>

      <section id="fine-4" className="scroll-mt-20 space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">{t("4. Imposte dell'esercizio (IRES e IRAP)")}</h3>
        <ImposteFineAnno companyId={companyId} anno={anno} chiuso={chiuso} />
      </section>

      <section id="fine-5" className="scroll-mt-20 space-y-2 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{t("5. Chiusura dell'esercizio {anno}", { anno })}</h3>
        {chiuso ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{t("Chiuso il {data}. Costi e ricavi sono girati sull'utile, i conti sono riaperti al 01/01/{anno}.", { data: dataIt(esercizio.data!.chiuso_il!.slice(0, 10)), anno: anno + 1 })}</span>
            <Button size="sm" variant="outline" onClick={() => setRiapri(true)}>{t("Riapri l'esercizio")}</Button>
          </div>
        ) : chiusura.isLoading || chiusura.isError ? (
          <FiscalQueryState loading={chiusura.isLoading} error={chiusura.isError} onRetry={() => void chiusura.refetch()} />
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {chiusura.data!.utile >= 0 ? t("Utile dell'esercizio:") : t("Perdita dell'esercizio:")} <strong>{euro(Math.abs(chiusura.data!.utile))}</strong>
              {" "}· {t("{n} conti economici da chiudere", { n: chiusura.data!.conti_economici })} · {t("{n} conti patrimoniali da riaprire", { n: chiusura.data!.conti_patrimoniali })}
              {chiusura.data!.apertura_gia_presente ? ` · ${t("il {anno} ha già la sua apertura (non se ne farà un'altra)", { anno: anno + 1 })}` : ""}.
            </p>
            {/* Senza «utili portati a nuovo» il risultato riaperto si somma a quello dell'anno dopo, nella stessa voce A.IX. */}
            <ContiPerRuolo companyId={companyId} chiuso={chiuso}
              ruoli={[...(chiusura.data!.conto_utile_da_scegliere ? [RUOLI_UTILE] : []), ...(chiusura.data!.conto_utili_a_nuovo === false ? [RUOLI_UTILI_A_NUOVO] : [])]} />
            {(chiusura.data!.iva_non_liquidata ?? 0) !== 0 || chiusura.data!.ammortamenti_da_registrare || chiusura.data!.tfr_da_registrare || chiusura.data!.esercizio_precedente_aperto || chiusura.data!.imposte_da_stanziare ? (
              <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 py-2 pl-6 pr-3 text-amber-900">
                {chiusura.data!.esercizio_precedente_aperto ? <li>{t("L'esercizio {esercizio_precedente_aperto} è ancora aperto: gli esercizi si chiudono in ordine, prima quello.", { esercizio_precedente_aperto: chiusura.data!.esercizio_precedente_aperto })}</li> : null}
                {(chiusura.data!.iva_non_liquidata ?? 0) !== 0 ? <li>{t("C'è IVA non ancora liquidata: registra la liquidazione dell'ultimo periodo (la chiusura la rifiuta).")}</li> : null}
                {chiusura.data!.ammortamenti_da_registrare ? <li>{t("Ammortamenti non registrati.")}</li> : null}
                {chiusura.data!.tfr_da_registrare ? <li>{t("Accantonamento TFR non registrato.")}</li> : null}
                {chiusura.data!.imposte_da_stanziare ? <li>{t("Le imposte dell'esercizio (IRES e IRAP) non sono stanziate: l'utile è prima delle imposte.")}</li> : null}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("Prima di chiudere: tutto generato dai documenti, liquidazioni IVA registrate, ammortamenti, TFR e rimanenze registrati, ratei e risconti scritti. Dopo, l'anno è bloccato: per correggere si riapre.")}
            </p>
            <Button size="sm" onClick={() => setConferma(true)} disabled={chiudi.isPending || (chiusura.data!.iva_non_liquidata ?? 0) !== 0 || !!chiusura.data!.esercizio_precedente_aperto}>{t("Chiudi l'esercizio {anno}", { anno })}</Button>
          </div>
        )}
      </section>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("Chiudere l'esercizio {anno}?", { anno })}</DialogTitle></DialogHeader>
          <p className="text-sm">{t("Costi e ricavi del {anno} si girano sull'utile al 31/12, i conti patrimoniali si riaprono al 01/01/{anno2} (il risultato fra gli utili portati a nuovo) e nel {anno} non si potrà più registrare niente finché non lo riapri.", { anno, anno2: anno + 1 })}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConferma(false)}>{t("Annulla")}</Button>
            <Button onClick={() => chiudi.mutate()} disabled={chiudi.isPending}>{chiudi.isPending ? t("Chiusura…") : t("Chiudi")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={riapri} onOpenChange={setRiapri}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("Riaprire l'esercizio {anno}?", { anno })}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>{t("Chiusura e apertura vengono stornate (restano nel giornale) e il {anno} torna modificabile.", { anno })}</p>
            <Label>{t("Motivo")}</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("Fattura arrivata dopo la chiusura")} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiapri(false)}>{t("Annulla")}</Button>
            <Button onClick={() => riapriM.mutate()} disabled={riapriM.isPending || !motivo.trim()}>{t("Riapri")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
