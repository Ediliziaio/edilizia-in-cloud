/**
 * «Genera materiali dal computo e dalle tavole»: anteprima prima di salvare.
 * Mostra cosa entra (per fase), cosa è escluso e perché, gli avvisi e le voci
 * che non sanno ancora diventare materiali (con la proposta dell'AI). Il
 * capitolo del computo va nella fase proposta; l'utente la cambia o fa creare
 * la fase. Salvando, i materiali diventano righe della commessa «da ordinare».
 *
 * Dal 31/10/2026 il computo si carica da qui: la scheda «Computo metrico» fra
 * i materiali non c'è più. Senza computo il popup chiede il file, lo legge e
 * passa all'anteprima; il computo completo (libretto, lavoro pubblico,
 * contabilità) si apre da «Apri il computo».
 *
 * Dal 14/11/2026 il file si legge con la finestra di «Importa voci»
 * (ImportaVociDialog, la stessa del computo: trascinamento, formati, lettura
 * a fasi, revisione delle voci). Confermate le voci, diventano il computo
 * della commessa (useSalvaComputoImportato: lo stesso file una seconda volta
 * riusa quello già caricato) e qui si vedono i materiali proposti, ciascuno
 * con la voce da cui viene, la fonte, la sicurezza e l'articolo o il listino
 * dell'azienda a cui è collegato. Le proposte dell'AI da approvare restano
 * spente finché non le si accende.
 */
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Link2, Loader2, Sparkles, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { computoInLettura, computoLetto, useComputiCommessa, useRiprovaLetturaComputo, useSalvaComputoImportato, useVociComputo } from "@/hooks/useComputoCommessa";
import { usePermissions } from "@/hooks/usePermissions";
import { ImportaVociDialog } from "@/components/computo/ImportaVociDialog";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import { ETICHETTA_FONTE_MATERIALE, generaDistinta, type ConteggioConfermato, type OrigineRiga, type Scomposizione } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { collegaMateriali, rigaDaSalvare, type ArticoloCatalogo, type MaterialeCollegato, type MaterialeGiaUsato, type VoceListino } from "@/lib/distinta/collegaArticoli";
import { capitoloVoce, faseDaTesto, fasiDaCreare, propostaFasi } from "@/lib/distinta/fasiMateriali";
import { capitoliIncerti, fondiProposte, leggiSuggerimentiFase, VALORE_NUOVA, VALORE_SENZA, type SuggerimentoFase } from "@/lib/distinta/faseProposta";

const OrderComputoTab = lazy(() => import("@/components/computo/commessa/OrderComputoTab"));

const NUOVA = VALORE_NUOVA;
const SENZA = VALORE_SENZA;

/** Le scomposizioni attive dell'azienda e, a parte, quelle proposte dall'AI e non ancora approvate. */
async function caricaScomposizioni(companyId: string): Promise<{ attive: Scomposizione[]; proposteAI: Scomposizione[] }> {
  const { data, error } = await supabase
    .from("scomposizioni_voce")
    .select("id, nome, codice_prezzario, parole_chiave, unita_misura, categoria, attiva, origine, componenti:scomposizioni_voce_componenti(descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria, article_template_id, supplier_id, ordine)")
    .eq("company_id", companyId)
    .or("attiva.eq.true,origine.eq.ai");
  if (error) throw error;
  const tutte = (data ?? []).map((s) => ({
    ...s,
    componenti: [...((s as { componenti?: { ordine: number }[] }).componenti ?? [])].sort((a, b) => a.ordine - b.ordine),
  })) as unknown as (Scomposizione & { origine?: string | null })[];
  return { attive: tutte.filter((s) => s.attiva), proposteAI: tutte.filter((s) => !s.attiva && s.origine === "ai") };
}

/** Articoli, voci dei listini in corso e materiali già comprati: per collegare i materiali proposti. */
async function caricaCatalogo(companyId: string): Promise<{ articoli: ArticoloCatalogo[]; listini: VoceListino[]; giaUsati: MaterialeGiaUsato[] }> {
  const oggi = new Date().toLocaleDateString("en-CA");
  const [articoli, listini, usati] = await Promise.all([
    supabase.from("article_templates").select("id, name, sku, unit_of_measure, supplier_id, prezzo_acquisto_netto, standard_cost, attivo")
      .eq("company_id", companyId).limit(5000),
    supabase.from("listino_fornitore_voci").select("id, codice, descrizione, unita, prezzo, sconto_pct, listino:listini_fornitore!inner(nome, supplier_id, attivo, valido_dal, valido_al)")
      .eq("company_id", companyId).limit(5000),
    supabase.from("order_items").select("name, unita_misura, article_template_id, supplier_id, orders!inner(company_id)")
      .eq("orders.company_id", companyId).eq("natura_riga", "materiale").not("article_template_id", "is", null)
      .order("created_at", { ascending: false }).limit(2000),
  ]);
  // Il catalogo aiuta ma non è indispensabile: se una lettura non riesce, si propone senza collegamenti.
  type RigaListino = { id: string; codice: string | null; descrizione: string; unita: string | null; prezzo: number | null; sconto_pct: number | null;
    listino: { nome: string | null; supplier_id: string | null; attivo: boolean | null; valido_dal: string | null; valido_al: string | null } | null };
  return {
    articoli: ((articoli.data ?? []) as (ArticoloCatalogo & { attivo?: boolean | null })[]).filter((a) => a.attivo !== false),
    listini: ((listini.data ?? []) as unknown as RigaListino[])
      .filter((v) => v.listino && v.listino.attivo !== false && (!v.listino.valido_dal || v.listino.valido_dal <= oggi) && (!v.listino.valido_al || v.listino.valido_al >= oggi))
      .map((v) => ({ id: v.id, codice: v.codice, descrizione: v.descrizione, unita: v.unita, prezzo: v.prezzo, sconto_pct: v.sconto_pct, supplier_id: v.listino?.supplier_id ?? null, listino: v.listino?.nome ?? null })),
    giaUsati: (usati.data ?? []) as unknown as MaterialeGiaUsato[],
  };
}

const RISERVA = catalogoComeScomposizioni();

function Sicurezza({ valore }: { valore: number }) {
  const [testo, classe] = valore >= 0.85 ? ["Sicuro", "bg-emerald-50 text-emerald-800 border-emerald-200"]
    : valore >= 0.65 ? ["Probabile", "bg-sky-50 text-sky-800 border-sky-200"]
      : ["Da controllare", "bg-amber-50 text-amber-900 border-amber-200"];
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${classe}`} title={`Sicurezza ${Math.round(valore * 100)}%`}>
    {testo} {Math.round(valore * 100)}%
  </span>;
}

/** Da quali voci del computo (o tavole) viene il materiale. */
function Provenienza({ origini }: { origini: OrigineRiga[] }) {
  const prima = origini[0];
  if (!prima) return null;
  const etichetta = (o: OrigineRiga) => o.tipo === "computo"
    ? `${o.codice ? `${o.codice} · ` : ""}${o.descrizione} (${o.quantita_voce.toLocaleString("it-IT")} ${o.unita_voce ?? ""})`.replace(/ \)$/, ")")
    : `Tavola ${o.documento ?? ""} · ${o.simbolo}${o.locale ? ` · ${o.locale}` : ""}`;
  const tutte = origini.map(etichetta);
  return <span className="block truncate text-[11px] text-slate-500" title={tutte.join("\n")}>
    da {etichetta(prima)}{origini.length > 1 ? ` e altre ${origini.length - 1}` : ""}
  </span>;
}

export default function GeneraMaterialiDialog({ orderId, orderCode, open, onOpenChange }: { orderId: string; orderCode?: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { effectiveCompany, user } = useAuth();
  const permessi = usePermissions();
  const [apriComputo, setApriComputo] = useState(false);
  const companyId = effectiveCompany?.id ?? "";
  const qc = useQueryClient();
  const computi = useComputiCommessa(orderId, companyId);
  const letti = (computi.data ?? []).filter(computoLetto);
  const [computoId, setComputoId] = useState<string | null>(null);
  const preferito = letti.find((c) => c.stato === "contrattuale") ?? letti.find((c) => c.stato === "verificato") ?? letti[0];
  const scelto = letti.find((c) => c.id === computoId) ?? preferito;
  const voci = useVociComputo(scelto?.id, open);
  const inLettura = (computi.data ?? []).find(computoInLettura);
  const nonLetto = !letti.length && !inLettura ? (computi.data ?? []).find((c) => c.extraction_status === "failed") : undefined;
  const riprova = useRiprovaLetturaComputo(orderId, companyId);
  const salvaComputo = useSalvaComputoImportato(orderId, companyId, user?.id);

  const dati = useQuery({
    queryKey: ["genera-materiali", orderId, companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const [scomposizioni, fasi, conteggi, catalogo] = await Promise.all([
        caricaScomposizioni(companyId),
        supabase.from("order_work_phases").select("id, name, position").eq("order_id", orderId).order("position"),
        supabase.from("planimetrie_conteggi").select("id, simbolo, descrizione_legenda, locale, quantita, documento_id, documento_nome, scomposizione_id, phase_id, unita")
          .eq("order_id", orderId).eq("confermato", true),
        caricaCatalogo(companyId).catch(() => ({ articoli: [], listini: [], giaUsati: [] })),
      ]);
      if (fasi.error) throw fasi.error;
      if (conteggi.error) throw conteggi.error;
      return { scomposizioni, fasi: fasi.data ?? [], conteggi: (conteggi.data ?? []) as ConteggioConfermato[], catalogo };
    },
  });

  // ── La lettura del file: la finestra di «Importa voci» ─────────────────────
  // Si apre da sola quando la commessa non ha ancora un computo (né tavole contate),
  // o con «Carica un altro». Confermate le voci, diventano il computo della commessa.
  const [importa, setImporta] = useState(false);
  const [rinunciato, setRinunciato] = useState(false);
  const confermato = useRef(false);
  const caricamento = computi.isLoading || voci.isLoading || dati.isLoading;
  // Non si aspettano le tavole: senza computo la finestra si apre subito (le tavole contate sono rare,
  // e se ci sono si torna all'anteprima appena lette).
  const senzaNiente = !computi.isLoading && !!companyId && !letti.length && !inLettura && !(dati.data?.conteggi.length);
  const importaAperta = open && !salvaComputo.isPending && (importa || (senzaNiente && !rinunciato));

  const chiudiImporta = () => {
    if (confermato.current) { confermato.current = false; return; }
    if (importa) { setImporta(false); return; }
    // Aperta da sola e chiusa senza leggere niente: si chiude tutto.
    setRinunciato(true);
    onOpenChange(false);
  };
  const daImporta: Parameters<typeof ImportaVociDialog>[0]["onAggiungi"] = (vociLette, esito, file) => {
    confermato.current = true;
    setImporta(false);
    salvaComputo.mutate(
      { voci: vociLette, file, totaleDocumento: esito?.totaleDocumento ?? null, sostituisce: importa ? scelto : null },
      {
        onSuccess: ({ id, riusato }) => {
          setComputoId(id);
          setScelte({});
          if (riusato) toast.info("Questo computo è già nella commessa: uso quello", { description: "Nessun doppione: i materiali generati prima e non ordinati si aggiornano quando salvi." });
        },
        onError: (e) => toast.error("Computo non salvato", { description: e instanceof Error ? e.message : String(e) }),
      },
    );
  };

  const vociComputo = useMemo(() => voci.data ?? [], [voci.data]);
  // La proposta automatica; le scelte dell'utente la sovrascrivono capitolo per capitolo.
  const proposta = useMemo(() => {
    const iniziale: Record<string, string> = {};
    if (!dati.data) return iniziale;
    for (const [capitolo, fase] of propostaFasi(vociComputo, dati.data.fasi)) {
      iniziale[capitolo] = fase ?? (capitolo === "Senza capitolo" ? SENZA : NUOVA + capitolo);
    }
    return iniziale;
  }, [dati.data, vociComputo]);
  // I capitoli che le parole non sanno mettere in una fase: li propone l'AI
  // (fase esistente o nuova, col motivo). Resta un suggerimento modificabile;
  // se l'AI non risponde vale la proposta per parole.
  const perParole = useMemo(() => (dati.data ? propostaFasi(vociComputo, dati.data.fasi) : new Map<string, string | null>()), [dati.data, vociComputo]);
  const sicuri = useMemo(() => new Set([...perParole].filter(([, f]) => !!f).map(([c]) => c)), [perParole]);
  const incerti = useMemo(() => capitoliIncerti(vociComputo, perParole), [vociComputo, perParole]);
  const suggerimentiAI = useQuery({
    queryKey: ["genera-materiali-fasi-ai", orderId, incerti.map((c) => c.nome).join("|"), (dati.data?.fasi ?? []).map((f) => f.id).join("|")],
    enabled: open && !!dati.data && incerti.length > 0 && !!companyId,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<SuggerimentoFase[]> => {
      const { data, error } = await supabase.functions.invoke("distinta-proponi-fasi", {
        body: { company_id: companyId, order_id: orderId, capitoli: incerti.slice(0, 40) },
      });
      if (error) throw error;
      return leggiSuggerimentiFase(data, incerti.map((c) => c.nome), dati.data?.fasi ?? []);
    },
  });
  const suggerimenti = useMemo(() => suggerimentiAI.data ?? [], [suggerimentiAI.data]);
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const mappa = useMemo(() => fondiProposte(proposta, suggerimenti, sicuri, scelte), [proposta, suggerimenti, sicuri, scelte]);
  const setMappa = (m: Record<string, string>) => setScelte(m);

  const risultato = useMemo(() => {
    if (!dati.data) return null;
    const fasi = dati.data.fasi;
    // Il capitolo decide; se non porta a una fase (e l'utente non l'ha scelta), la decide il testo della voce.
    const faseVoce = (v: Parameters<typeof capitoloVoce>[0]) => {
      const c = capitoloVoce(v);
      const valore = mappa[c];
      if (valore && valore !== SENZA) return valore;
      return scelte[c] === SENZA && c !== "Senza capitolo" ? null : faseDaTesto(v, fasi);
    };
    return generaDistinta({
      voci: vociComputo,
      scomposizioni: dati.data.scomposizioni.attive,
      riserva: RISERVA,
      proposteAI: dati.data.scomposizioni.proposteAI,
      conteggi: dati.data.conteggi,
      faseVoce,
    });
  }, [dati.data, vociComputo, mappa, scelte]);
  const materiali = useMemo<MaterialeCollegato[]>(
    () => (risultato && dati.data ? collegaMateriali(risultato.righe, dati.data.catalogo) : []),
    [risultato, dati.data],
  );
  // Righe spente: le proposte dell'AI da approvare partono spente, le altre si spengono a mano.
  const [accese, setAccese] = useState<Record<string, boolean>>({});
  const accesa = (m: MaterialeCollegato) => accese[m.chiave] ?? !m.proposta_ai;
  const daSalvare = materiali.filter(accesa);

  const nomeFase = (id: string | null) => {
    if (!id) return "Senza fase";
    if (id.startsWith(NUOVA)) return `${id.slice(NUOVA.length)} (nuova)`;
    return dati.data?.fasi.find((f) => f.id === id)?.name ?? "Fase";
  };
  const perFase = useMemo(() => {
    const m = new Map<string, MaterialeCollegato[]>();
    for (const r of materiali) {
      const k = r.phase_id ?? SENZA;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [materiali]);
  const conteggiFonte = useMemo(() => {
    const collegati = materiali.filter((m) => m.collegamento).length;
    const daControllare = materiali.filter((m) => m.affidabilita < 0.65).length;
    return { collegati, daControllare };
  }, [materiali]);

  const [proponendo, setProponendo] = useState(false);
  const proponiAI = async () => {
    if (!risultato?.senzaScomposizione.length) return;
    setProponendo(true);
    try {
      let create = 0;
      const voci = risultato.senzaScomposizione;
      for (let i = 0; i < voci.length; i += 12) {
        const { data, error } = await supabase.functions.invoke("distinta-proponi-scomposizioni", {
          body: {
            company_id: companyId,
            voci: voci.slice(i, i + 12).map((v) => ({ id: v.id, codice_prezzario: v.codice_prezzario, descrizione_breve: v.descrizione_breve, descrizione_estesa: v.descrizione_estesa, unita_misura: v.unita_misura })),
          },
        });
        if (error) throw error;
        create += Number((data as { create?: number })?.create ?? 0);
      }
      toast.success(`${create} scomposizioni proposte dall'AI`, { description: "Compaiono qui sotto spente, «Da controllare»: accendile per salvarle. Restano in Scomposizioni da approvare, e al prossimo import non si richiedono." });
      qc.invalidateQueries({ queryKey: ["scomposizioni"] });
      qc.invalidateQueries({ queryKey: ["genera-materiali", orderId, companyId] });
    } catch (e) {
      toast.error("Proposta non riuscita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setProponendo(false);
    }
  };

  const [salvando, setSalvando] = useState(false);
  const salva = async () => {
    if (!risultato || !daSalvare.length) return;
    setSalvando(true);
    try {
      // Le fasi nuove si creano prima, in fondo all'elenco, nell'ordine del computo.
      const daCreare = [...new Set(daSalvare.map((r) => r.phase_id).filter((v): v is string => !!v?.startsWith(NUOVA)).map((v) => v.slice(NUOVA.length)))];
      const create = new Map<string, string>();
      if (daCreare.length) {
        const base = Math.max(0, ...(dati.data?.fasi ?? []).map((f) => f.position ?? 0)) + 1;
        const { data, error } = await supabase.from("order_work_phases")
          .insert(daCreare.map((name, i) => ({ company_id: companyId, order_id: orderId, name, position: base + i })))
          .select("id, name");
        if (error) throw error;
        for (const f of data ?? []) create.set(NUOVA + f.name, f.id);
      }
      const righe = daSalvare.map(rigaDaSalvare).map((r) => ({
        ...r,
        phase_id: r.phase_id?.startsWith(NUOVA) ? create.get(r.phase_id) ?? null : r.phase_id,
      }));
      const { data, error } = await supabase.rpc("materiali_salva_generazione", {
        p_order: orderId,
        p_righe: righe as never,
        p_escluse: risultato.escluse as never,
        p_avvisi: risultato.avvisi as never,
        p_computo: scelto?.id,
      });
      if (error) throw error;
      const esito = data as { inserite: number; sostituite: number; saltate: number };
      toast.success(`${esito.inserite} materiali salvati nelle fasi`, {
        description: [esito.sostituite ? `${esito.sostituite} righe generate prima sostituite` : null,
          esito.saltate ? `${esito.saltate} già in offerta o in un ordine, lasciate com'erano` : null].filter(Boolean).join(" · ") || undefined,
      });
      qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
      qc.invalidateQueries({ queryKey: ["order-work-phases"] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Materiali non salvati", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const capitoli = [...new Set(vociComputo.map((v) => capitoloVoce(v as never)))];
  const nienteDaLeggere = !caricamento && !letti.length && !(dati.data?.conteggi.length);
  const fasiNuove = dati.data ? fasiDaCreare(vociComputo, propostaFasi(vociComputo, dati.data.fasi)) : [];

  const riprovaUltimo = nonLetto && (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-rose-50/60 p-2 text-xs text-rose-700">
      <span className="min-w-0 flex-1">L'ultimo file («{nonLetto.file_name}») non si è letto: {nonLetto.extraction_error || "riprova con il PDF di PriMus o l'XPWE"}.</span>
      <Button type="button" size="sm" variant="outline" className="h-7 bg-white" disabled={riprova.isPending}
        onClick={() => riprova.mutate(nonLetto.id, { onError: (e) => toast.error(e instanceof Error ? e.message : "Lettura non riuscita.") })}>
        {riprova.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}Riprova la lettura
      </Button>
    </div>
  );

  if (importaAperta) {
    return (
      <ImportaVociDialog
        open
        onOpenChange={(o) => { if (!o) chiudiImporta(); }}
        onAggiungi={daImporta}
        vociPresenti={0}
        consentiAi
        titolo="Genera dal computo"
        descrizione={scelto
          ? `Carica un altro computo: le voci si leggono da sole, le rivedi e poi vedi i materiali da comprare. «${scelto.titolo || scelto.file_name}» resta archiviato, non cancellato.`
          : "Carica il computo della commessa: le voci si leggono da sole, le rivedi e poi vedi i materiali da comprare, divisi per fase. Niente è salvato come materiale finché non premi «Salva i materiali»."}
        etichettaConferma={(n) => `Avanti: materiali da ${n} ${n === 1 ? "voce" : "voci"}`}
        altreFonti={<div className="space-y-2">
          {riprovaUltimo}
          <p className="text-xs text-muted-foreground">Senza computo puoi partire dalle tavole: «Tavole» nella barra degli articoli.</p>
        </div>}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Genera dal computo</DialogTitle>
          <DialogDescription>
            I materiali da comprare letti dal computo e dalle tavole contate, divisi per fase: per ognuno vedi da quale voce viene e quanto è sicuro. Niente è salvato finché non premi «Salva i materiali». Le righe generate prima e non ancora ordinate vengono sostituite; quelle inserite a mano restano.
          </DialogDescription>
        </DialogHeader>

        {/* Il computo: da qui si apre per intero o se ne carica un altro. */}
        <section aria-label="Il computo" className="space-y-2 rounded-lg border bg-slate-50/60 p-3 text-sm">
          {salvaComputo.isPending ? (
            <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />Salvo il computo nella commessa…</p>
          ) : inLettura ? (
            <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
              Sto leggendo «{inLettura.titolo || inLettura.file_name}»{inLettura.progresso ? ` (${inLettura.progresso})` : ""}: appena finito compare qui sotto l'anteprima dei materiali.</p>
          ) : scelto ? (
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1"><span className="font-medium">{scelto.titolo || scelto.file_name}</span>
                <span className="text-muted-foreground"> · {scelto.stato}{voci.data ? ` · ${voci.data.length} voci` : ""}</span></span>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setApriComputo(true)}>Apri il computo</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setImporta(true)}><Upload className="mr-1 h-3.5 w-3.5" aria-hidden />Carica un altro</Button>
            </div>
          ) : !computi.isLoading && companyId ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">Nessun computo nella commessa: i materiali vengono dalle tavole contate.</span>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setImporta(true)}><Upload className="mr-1 h-3.5 w-3.5" aria-hidden />Carica il computo</Button>
            </div>
          ) : null}
          {riprovaUltimo}
        </section>

        {caricamento && <p className="text-sm text-slate-500">Leggo computo, scomposizioni, articoli e conteggi…</p>}

        {!caricamento && risultato && !nienteDaLeggere && (
          <div className="space-y-4 text-sm">
            {letti.length > 1 && (
              <label className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Computo</span>
                <Select value={scelto?.id} onValueChange={(id) => { setComputoId(id); setScelte({}); setAccese({}); }}>
                  <SelectTrigger className="h-8 w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {letti.map((c) => <SelectItem key={c.id} value={c.id}>{c.titolo || c.file_name} · {c.stato}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            )}

            {capitoli.length > 0 && (
              <details className="rounded border" open={capitoli.length <= 6}>
                <summary className="cursor-pointer px-2 py-1.5 font-semibold">Capitolo del computo → fase della commessa ({capitoli.length})</summary>
                {fasiNuove.length > 0 && !(dati.data?.fasi.length) && (
                  <p className="px-2 pb-2 text-xs text-slate-600">La commessa non ha fasi: le creo dai capitoli del computo (puoi cambiarle).</p>
                )}
                {suggerimentiAI.isFetching && <p className="px-2 pb-2 text-xs text-slate-600">L'AI sta proponendo la fase per {incerti.length} capitoli senza abbinamento sicuro…</p>}
                {suggerimentiAI.isError && <p className="px-2 pb-2 text-xs text-amber-800">Proposta dell'AI non disponibile: resta il confronto per parole, scegli tu la fase.</p>}
                <ul className="divide-y border-t">
                  {capitoli.map((c) => {
                    const s = suggerimenti.find((x) => x.capitolo === c);
                    const nuovaAI = s?.nuova_fase && s.nuova_fase !== c ? s.nuova_fase : null;
                    return (
                      <li key={c} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate">{c}</span>
                          {s && !sicuri.has(c) && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-violet-800" title="Suggerimento dell'AI: puoi cambiarlo">
                              <Sparkles className="h-3 w-3" aria-hidden />
                              AI: {s.motivo} · {Math.round(s.confidenza * 100)}%
                            </span>
                          )}
                        </div>
                        <Select value={mappa[c] ?? SENZA} onValueChange={(v) => setMappa({ ...mappa, [c]: v })}>
                          <SelectTrigger className="h-8 w-64" aria-label={`Fase per ${c}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(dati.data?.fasi ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                            {nuovaAI && <SelectItem value={NUOVA + nuovaAI}>Crea la fase «{nuovaAI}» (AI)</SelectItem>}
                            {c !== "Senza capitolo" && <SelectItem value={NUOVA + c}>Crea la fase «{c}»</SelectItem>}
                            <SelectItem value={SENZA}>{c === "Senza capitolo" ? "Dal testo della voce" : "Senza fase"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            <section aria-label="Materiali che entrano">
              <h4 className="mb-1 font-semibold">Entrano {daSalvare.length} materiali{daSalvare.length !== materiali.length ? ` su ${materiali.length}` : ""}</h4>
              <p className="mb-2 text-xs text-muted-foreground">
                {conteggiFonte.collegati ? `${conteggiFonte.collegati} collegati a un vostro articolo o listino. ` : ""}
                {conteggiFonte.daControllare ? `${conteggiFonte.daControllare} da controllare. ` : ""}
                La quantità d'acquisto è arrotondata per eccesso; quelle già modificate a mano restano. Togli la spunta a quello che non vuoi comprare.
              </p>
              {perFase.map(([fase, righe]) => (
                <details key={fase} className="mb-1 rounded border" open={perFase.length <= 3}>
                  <summary className="cursor-pointer px-2 py-1.5 font-medium">{nomeFase(fase === SENZA ? null : fase)} · {righe.filter(accesa).length}{righe.some((r) => !accesa(r)) ? ` su ${righe.length}` : ""}</summary>
                  <table className="w-full text-xs">
                    <tbody className="divide-y">
                      {righe.map((r) => (
                        <tr key={r.chiave} className={accesa(r) ? "" : "opacity-60"} data-materiale={r.descrizione}>
                          <td className="w-8 px-2 py-1 align-top">
                            <Checkbox checked={accesa(r)} aria-label={`Includi ${r.descrizione}`}
                              onCheckedChange={(v) => setAccese((a) => ({ ...a, [r.chiave]: v === true }))} />
                          </td>
                          <td className="min-w-0 px-2 py-1 align-top">
                            <span className="font-medium">{r.descrizione}</span>{r.specifiche ? <span className="text-slate-500"> · {r.specifiche}</span> : null}
                            <Provenienza origini={r.origini} />
                            {r.collegamento && (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-800">
                                <Link2 className="h-3 w-3 shrink-0" aria-hidden />
                                {r.collegamento.tipo === "articolo" ? "Articolo" : `Listino ${r.collegamento.listino ?? ""}`}: {r.collegamento.nome}
                                {r.collegamento.prezzo ? ` · ${r.collegamento.prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}/${r.collegamento.unita ?? r.unita_misura}` : ""}
                                {r.collegamento.fonte === "gia_usato" ? " · già usato in altre commesse" : r.collegamento.fonte === "codice" ? " · stesso codice" : ""}
                              </span>
                            )}
                            {r.note.map((n) => <span key={n} className="block text-[11px] text-slate-500">{n}</span>)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums">
                            {r.quantita_calcolata.toLocaleString("it-IT")} {r.unita_misura}
                            {r.sfrido ? <span className="text-slate-400"> (+{r.sfrido}%)</span> : null}
                            {r.conversione && <span className="block text-[11px] font-medium text-slate-700">{r.conversione.quantita.toLocaleString("it-IT")} {r.conversione.unita}</span>}
                          </td>
                          <td className="w-40 px-2 py-1 align-top">
                            <Sicurezza valore={r.affidabilita} />
                            <span className="mt-0.5 block text-[10px] text-slate-500">{ETICHETTA_FONTE_MATERIALE[r.fonte]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </section>

            {risultato.avvisi.length > 0 && (
              <section aria-label="Avvisi" className="rounded border border-amber-200 bg-amber-50 p-2">
                <h4 className="mb-1 font-semibold text-amber-900">Da guardare ({risultato.avvisi.length})</h4>
                <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-amber-900">
                  {risultato.avvisi.map((a, i) => <li key={i}>{a.messaggio}</li>)}
                </ul>
                {risultato.senzaScomposizione.length > 0 && (
                  <Button size="sm" variant="outline" className="mt-2 h-8 bg-white" disabled={proponendo} onClick={proponiAI}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {proponendo ? "L'AI sta proponendo…" : `Proponi con l'AI i materiali delle voci che le regole non riconoscono (${risultato.senzaScomposizione.length})`}
                  </Button>
                )}
              </section>
            )}

            {risultato.escluse.length > 0 && (
              <details className="rounded border">
                <summary className="cursor-pointer px-2 py-1.5 font-medium">Escluse {risultato.escluse.length} voci, e perché</summary>
                <ul className="max-h-56 divide-y overflow-auto text-xs">
                  {risultato.escluse.map((e) => (
                    <li key={e.voce_id} className="flex justify-between gap-2 px-2 py-1">
                      <span className="min-w-0 truncate">{e.codice ? `${e.codice} · ` : ""}{e.descrizione}</span>
                      <span className="shrink-0 text-slate-500">{e.motivo}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button disabled={!daSalvare.length || salvando || salvaComputo.isPending} onClick={salva}>
            {salvando ? "Salvo…" : `Salva i materiali (${daSalvare.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
      {apriComputo && companyId && (
        <Dialog open={apriComputo} onOpenChange={setApriComputo}>
          <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Computo metrico</DialogTitle>
              <DialogDescription>Voci, misure, controllo dei totali, lavoro pubblico e contabilità dei lavori.</DialogDescription>
            </DialogHeader>
            <Suspense fallback={<p className="p-4 text-sm text-slate-600">Carico il computo…</p>}>
              <OrderComputoTab orderId={orderId} companyId={companyId} canEdit={permessi.canEditOrders} canViewAmounts={permessi.canViewOrderAmounts} orderLabel={orderCode} />
            </Suspense>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
