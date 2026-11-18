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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
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
import { generaDistinta, type ConteggioConfermato, type Scomposizione } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import {
  aliasDaRicordare, articoloDaMateriale, collegaMateriali, prezzoRiga, rigaDaSalvare,
  type AliasMateriale, type ArticoloCatalogo, type DatiCatalogo, type MaterialeCollegato, type MaterialeGiaUsato, type SceltaArticolo, type VoceMagazzino,
} from "@/lib/distinta/collegaArticoli";
import { MaterialiProposti } from "./MaterialiProposti";
import { computoDelPreventivo } from "@/lib/distinta/computoDelPreventivo";
import { controllaComputo, importoInGioco, voceDaCommessa } from "@/lib/computo/controlloComputo";
import { ETICHETTA_SERVIZIO, serviziDelComputo } from "@/lib/distinta/serviziComputo";
import { avvisiCosto as calcolaAvvisiCosto, type VoceConImporto } from "@/lib/distinta/controlloCostiVoci";
import { capitoloVoce, faseDaTesto, fasiDaCreare, propostaFasi } from "@/lib/distinta/fasiMateriali";
import { eNonLavoro } from "@/lib/computo/vociNonLavori";
import { sceltePerRicordare, testoRicordi, type SceltePerRicordare } from "@/lib/distinta/ricordaScelte";
import { capitoliIncerti, fondiProposte, leggiSuggerimentiFase, VALORE_NUOVA, VALORE_SENZA, type SuggerimentoFase } from "@/lib/distinta/faseProposta";

const OrderComputoTab = lazy(() => import("@/components/computo/commessa/OrderComputoTab"));

const NUOVA = VALORE_NUOVA;
const SENZA = VALORE_SENZA;

/** Le scomposizioni attive dell'azienda e, a parte, quelle proposte dall'AI e non ancora approvate. */
async function caricaScomposizioni(companyId: string): Promise<{ attive: Scomposizione[]; proposteAI: Scomposizione[] }> {
  const { data, error } = await supabase
    .from("scomposizioni_voce")
    .select("id, nome, codice_prezzario, codice_standard, parole_chiave, unita_misura, categoria, attiva, origine, componenti:scomposizioni_voce_componenti(descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria, article_template_id, supplier_id, ordine)")
    .eq("company_id", companyId)
    .or("attiva.eq.true,origine.eq.ai");
  if (error) throw error;
  const tutte = (data ?? []).map((s) => ({
    ...s,
    componenti: [...((s as { componenti?: { ordine: number }[] }).componenti ?? [])].sort((a, b) => a.ordine - b.ordine),
  })) as unknown as (Scomposizione & { origine?: string | null })[];
  return { attive: tutte.filter((s) => s.attiva), proposteAI: tutte.filter((s) => !s.attiva && s.origine === "ai") };
}

/**
 * Scrive le scelte da ricordare (14/11/2026): proposte dell'AI approvate, scomposizioni
 * della libreria senza i materiali tolti. Se l'azienda ha già quella scomposizione
 * standard (importata e non approvata), si aggiorna quella: il codice è unico per azienda.
 */
async function ricordaScelte(companyId: string, r: SceltePerRicordare, alias: AliasMateriale[] = []): Promise<number> {
  let fatte = 0;
  if (alias.length) {
    const { error } = await supabase.from("product_aliases").insert(alias.map((a) => ({
      // alias_normalized lo calcola il database (colonna generata).
      company_id: companyId, alias_text: a.alias_text,
      article_template_id: a.article_template_id, learned_from: "voce_computo", confidence: 0.9,
    })));
    if (error) throw error;
    fatte += alias.length;
  }
  if (r.approvaAI.length) {
    const { error } = await supabase.from("scomposizioni_voce").update({ attiva: true })
      .eq("company_id", companyId).in("id", r.approvaAI.map((a) => a.id));
    if (error) throw error;
    fatte += r.approvaAI.length;
  }
  for (const l of r.libreria) {
    const s = l.standard;
    const testata = {
      company_id: companyId, nome: s.nome, codice_standard: s.id, parole_chiave: s.parole_chiave ?? [],
      unita_misura: s.unita_misura ?? null, categoria: s.categoria ?? null, attiva: true,
      note: `Dalla libreria standard, senza ${l.tolti.join(", ")}: scelta in «Genera dal computo» il ${new Date().toLocaleDateString("it-IT")}.`,
    };
    const { data: gia, error: errGia } = await supabase.from("scomposizioni_voce").select("id")
      .eq("company_id", companyId).eq("codice_standard", s.id).limit(1);
    if (errGia) throw errGia;
    let id = gia?.[0]?.id as string | undefined;
    if (id) {
      const { error } = await supabase.from("scomposizioni_voce").update(testata).eq("id", id);
      if (error) throw error;
      const { error: e2 } = await supabase.from("scomposizioni_voce_componenti").delete().eq("scomposizione_id", id);
      if (e2) throw e2;
    } else {
      const { data, error } = await supabase.from("scomposizioni_voce").insert({ ...testata, origine: "manuale" }).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    const { error: e3 } = await supabase.from("scomposizioni_voce_componenti").insert(l.tenuti.map((c, i) => ({
      scomposizione_id: id!, company_id: companyId, ordine: i, descrizione: c.descrizione, specifiche: c.specifiche ?? null,
      unita_misura: c.unita_misura || "pz", quantita_per_unita: Number(c.quantita_per_unita), sfrido_percentuale: Number(c.sfrido_percentuale ?? 0),
      categoria: c.categoria ?? null,
    })));
    if (e3) throw e3;
    fatte++;
  }
  return fatte;
}

/** Articoli, voci dei listini in corso e materiali già comprati: per collegare i materiali proposti. */
type Catalogo = DatiCatalogo & { fornitori: Map<string, string> };

/** Gli errori di Supabase sono oggetti, non Error: si legge il loro messaggio. */
const messaggioErrore = (e: unknown) => e instanceof Error ? e.message
  : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);

async function caricaCatalogo(companyId: string, orderId: string): Promise<Catalogo> {
  const oggi = new Date().toLocaleDateString("en-CA");
  const [articoli, listini, usati, alias, magazzino, fornitori] = await Promise.all([
    supabase.from("article_templates").select("id, name, sku, unit_of_measure, supplier_id, prezzo_acquisto_netto, standard_cost, attivo, marca, modello")
      .eq("company_id", companyId).limit(5000),
    supabase.from("listino_fornitore_voci").select("id, codice, descrizione, unita, prezzo, sconto_pct, listino:listini_fornitore!inner(nome, supplier_id, attivo, valido_dal, valido_al)")
      .eq("company_id", companyId).limit(5000),
    supabase.from("order_items").select("name, unita_misura, article_template_id, supplier_id, orders!inner(company_id)")
      .eq("orders.company_id", companyId).eq("natura_riga", "materiale").not("article_template_id", "is", null)
      // Le altre commesse: quelle di questa le ha generate la stessa proposta, e si ripeterebbero da sole.
      .neq("order_id", orderId)
      .order("created_at", { ascending: false }).limit(2000),
    // I nomi abbinati a mano a un articolo (14/11/2026): la prossima volta si ricollegano da soli.
    supabase.from("product_aliases").select("alias_text, article_template_id").eq("company_id", companyId).not("article_template_id", "is", null).limit(5000),
    supabase.from("warehouse_stock").select("id, name, internal_code, unita_misura, quantity_available").eq("company_id", companyId).gt("quantity_available", 0).limit(5000),
    supabase.from("suppliers").select("id, name").eq("company_id", companyId).limit(5000),
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
    alias: (alias.data ?? []) as AliasMateriale[],
    magazzino: (magazzino.data ?? []) as VoceMagazzino[],
    fornitori: new Map(((fornitori.data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name])),
  };
}

const RISERVA = catalogoComeScomposizioni();

type Passo = "controllo" | "fasi" | "noli" | "materiali";
const euro = (n: number) => formatCurrency(n);

/** «ECO · ISOLAMENTO TERMICO SU STRUTTURE OPACHE» → etichetta «ECO» e «Isolamento termico su strutture opache». */
function capitoloLeggibile(c: string): { tag: string | null; nome: string } {
  const m = /^([A-Z0-9]{2,8})\s*[·•-]\s*(.+)$/.exec(c.trim());
  const tag = m ? m[1] : null;
  const resto = (m ? m[2] : c).trim();
  return { tag, nome: resto === resto.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(resto) ? resto.charAt(0) + resto.slice(1).toLowerCase() : resto };
}

/** «ONERI DELLA SICUREZZA» → «Oneri della sicurezza»: il nome di una fase non si grida. */
function nomeLeggibile(nome: string): string {
  const t = nome.trim();
  return t && t === t.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

export default function GeneraMaterialiDialog({ orderId, orderCode, open, onOpenChange, onProposti }: {
  orderId: string; orderCode?: string | null; open: boolean; onOpenChange: (o: boolean) => void;
  /** Dopo il salvataggio: apre la scelta dei materiali proposti. */
  onProposti?: () => void;
}) {
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
      const [scomposizioni, fasi, conteggi, catalogo, previste] = await Promise.all([
        caricaScomposizioni(companyId),
        supabase.from("order_work_phases").select("id, name, position").eq("order_id", orderId).order("position"),
        supabase.from("planimetrie_conteggi").select("id, simbolo, descrizione_legenda, locale, quantita, documento_id, documento_nome, scomposizione_id, phase_id, unita")
          .eq("order_id", orderId).eq("confermato", true),
        caricaCatalogo(companyId, orderId).catch((): Catalogo => ({ articoli: [], listini: [], giaUsati: [], fornitori: new Map() })),
        // Le lavorazioni previste della commessa: senza, dal computo si creano anche quelle.
        supabase.from("order_work_phase_voci").select("id", { count: "exact", head: true }).eq("order_id", orderId),
      ]);
      if (fasi.error) throw fasi.error;
      if (conteggi.error) throw conteggi.error;
      return { scomposizioni, fasi: fasi.data ?? [], conteggi: (conteggi.data ?? []) as ConteggioConfermato[], catalogo,
        senzaLavorazioni: !previste.error && (previste.count ?? 0) === 0 };
    },
  });

  // ── La lettura del file: la finestra di «Importa voci» ─────────────────────
  // Si apre da sola quando la commessa non ha ancora un computo (né tavole contate),
  // o con «Carica un altro». Confermate le voci, diventano il computo della commessa.
  const [importa, setImporta] = useState(false);
  const [rinunciato, setRinunciato] = useState(false);
  const confermato = useRef(false);

  // Non si aspettano le tavole: senza computo la finestra si apre subito (le tavole contate sono rare,
  // e se ci sono si torna all'anteprima appena lette).
  const senzaComputo = !computi.isLoading && !!companyId && !letti.length && !inLettura;
  // La commessa nata da un preventivo con computo ha già le voci: si prendono da lì, senza
  // ricaricare il file (17/11/2026). Solo se non c'è ancora un computo nella commessa.
  const dalPreventivo = useQuery({
    queryKey: ["computo-del-preventivo", orderId, companyId],
    enabled: open && senzaComputo,
    staleTime: 60_000,
    queryFn: () => computoDelPreventivo(companyId, orderId),
  });
  const presoDalPreventivo = useRef(false);
  useEffect(() => {
    const c = dalPreventivo.data;
    if (!open || !senzaComputo || !c?.voci.length || presoDalPreventivo.current || salvaComputo.isPending) return;
    presoDalPreventivo.current = true;
    salvaComputo.mutate(
      { voci: c.voci, file: [], totaleDocumento: null, titolo: c.titolo, origine: "preventivo" },
      {
        onSuccess: ({ id }) => { setComputoId(id); toast.info(`Uso il computo del preventivo${c.quoteNumber ? ` ${c.quoteNumber}` : ""}`, { description: `${c.voci.length} voci, con misure e capitoli: il file non serve.` }); },
        onError: (e) => toast.error("Computo del preventivo non copiato", { description: e instanceof Error ? e.message : String(e) }),
      },
    );
  }, [open, senzaComputo, dalPreventivo.data, salvaComputo]);
  const attendoPreventivo = senzaComputo && (dalPreventivo.isLoading || !!dalPreventivo.data?.voci.length);
  const senzaNiente = senzaComputo && !attendoPreventivo && !(dati.data?.conteggi.length);
  const importaAperta = open && !salvaComputo.isPending && (importa || (senzaNiente && !rinunciato));
  const caricamento = computi.isLoading || voci.isLoading || dati.isLoading || (attendoPreventivo && !letti.length);

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
        onSuccess: ({ id, riusato, nonArchiviati }) => {
          setComputoId(id);
          setScelte({});
          if (nonArchiviati.length) toast.info("Computo salvato con le sue voci", { description: `Il file originale (${nonArchiviati.join(", ")}) non è archiviato: si conservano PDF, Excel, PriMus e foto.` });
          if (riusato) toast.info("Questo computo è già nella commessa: uso quello", { description: "Nessun doppione: i materiali generati prima e non ordinati si aggiornano quando salvi." });
        },
        onError: (e) => toast.error("Computo non salvato", { description: e instanceof Error ? e.message : String(e) }),
      },
    );
  };

  // Onorari, casse e IVA dei computi dei bonus non sono lavori: né fasi né materiali (17/11/2026).
  const vociComputo = useMemo(
    () => (voci.data ?? []).filter((v) => !eNonLavoro([v.super_categoria, v.categoria, v.sotto_categoria], v.descrizione_breve)),
    [voci.data],
  );
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
      // Un capitolo senza fase che gli somigli diventerebbe una fase nuova: prima si
      // prova la fase del mestiere della voce. Un computo senza capitoli li ha tutti in
      // «Opere edili» (il nome di riserva dell'import): senza questo, 30 materiali
      // finivano in una fase «Opere edili» da creare (prova su Demo Azienda 2, 14/11/2026).
      // Vale lo stesso per la fase che l'AI indovina per un capitolo generico: decide il
      // capitolo solo quando il suo nome somiglia a una fase o quando l'ha scelto l'utente.
      if (scelte[c] === undefined && !sicuri.has(c)) {
        const delMestiere = faseDaTesto(v, fasi);
        if (delMestiere) return delMestiere;
      }
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
  }, [dati.data, vociComputo, mappa, scelte, sicuri]);
  // L'articolo scelto a mano nella finestra, per materiale (chiave): vince sulla proposta.
  const [sceltaArticolo, setSceltaArticolo] = useState<Record<string, SceltaArticolo>>({});
  const materiali = useMemo<MaterialeCollegato[]>(
    () => (risultato && dati.data ? collegaMateriali(risultato.righe, dati.data.catalogo, sceltaArticolo) : []),
    [risultato, dati.data, sceltaArticolo],
  );
  // Righe spente: le proposte dell'AI da approvare partono spente, le altre si spengono a mano.
  const [accese, setAccese] = useState<Record<string, boolean>>({});
  const accesa = (m: MaterialeCollegato) => accese[m.chiave] ?? !m.proposta_ai;
  // Materiali che costano più della loro voce nel computo: quantità o resa da controllare.
  const avvisiCosto = useMemo(() => calcolaAvvisiCosto(materiali, vociComputo as unknown as VoceConImporto[]), [materiali, vociComputo]);
  const daSalvare = materiali.filter(accesa);
  // Quello che le scelte di questa commessa insegnano per i prossimi computi.
  const ricordi = useMemo(
    () => sceltePerRicordare(materiali, (m) => accese[m.chiave] ?? !m.proposta_ai, RISERVA, dati.data?.scomposizioni.proposteAI ?? []),
    [materiali, accese, dati.data],
  );
  // Gli articoli scelti a mano: il nome del materiale si ricorda (product_aliases).
  const aliasNuovi = useMemo(() => {
    const gia = new Set((dati.data?.catalogo.alias ?? []).map((a) => `${a.alias_text.trim().toLowerCase()}|${a.article_template_id}`));
    return aliasDaRicordare(materiali, sceltaArticolo).filter((a) => !gia.has(`${a.alias_text.trim().toLowerCase()}|${a.article_template_id}`));
  }, [materiali, sceltaArticolo, dati.data]);
  const righeRicordi = [
    ...testoRicordi(ricordi),
    ...aliasNuovi.map((a) => `«${a.alias_text}» → ${dati.data?.catalogo.articoli.find((x) => x.id === a.article_template_id)?.name ?? "articolo"}`),
  ];
  const [ricorda, setRicorda] = useState(true);
  const [conLavorazioni, setConLavorazioni] = useState(true);
  const [passo, setPasso] = useState<Passo | null>(null);
  const [vediSenza, setVediSenza] = useState(false);

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
  const stima = useMemo(() => {
    const conPrezzo = daSalvare.map(prezzoRiga).filter((p): p is NonNullable<typeof p> => !!p);
    return { totale: conPrezzo.reduce((t, p) => t + p.totale, 0), senzaPrezzo: daSalvare.length - conPrezzo.length };
  }, [daSalvare]);
  const mostraPrezzi = !!(permessi.canViewCosts || permessi.canViewOrderAmounts);

  const [proponendo, setProponendo] = useState(false);
  const proponiAI = async () => {
    if (!risultato?.senzaScomposizione.length) return;
    setProponendo(true);
    try {
      let create = 0, soloLavoro = 0;
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
        soloLavoro += ((data as { senza_materiali?: unknown[] })?.senza_materiali ?? []).length;
      }
      // L'AI può dire che una voce è solo lavoro (nolo, manodopera, oneri): va detto, non «0 proposte».
      const lavoro = soloLavoro ? `${soloLavoro} ${soloLavoro === 1 ? "voce è" : "voci sono"} solo lavoro, senza materiali da comprare.` : "";
      if (create) toast.success(`L'AI ha proposto i materiali di ${create} ${create === 1 ? "voce" : "voci"}`, { description: `Compaiono qui sotto spenti, «Da controllare»: accendili per salvarli. ${lavoro}`.trim() });
      else toast.info(soloLavoro ? "Nessun materiale da comprare" : "L'AI non ha proposto materiali", { description: lavoro || "Riprova, o aggiungi i materiali a mano." });
      qc.invalidateQueries({ queryKey: ["scomposizioni"] });
      qc.invalidateQueries({ queryKey: ["genera-materiali", orderId, companyId] });
    } catch (e) {
      toast.error("Proposta non riuscita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setProponendo(false);
    }
  };

  // «Aggiungi al catalogo» (14/11/2026): il materiale senza articolo diventa un articolo,
  // come da «Aggiungi articolo» nella commessa; poi si collega e, con «Ricorda», si ritrova.
  const aggiungiAlCatalogo = async (m: MaterialeCollegato): Promise<string | null> => {
    const a = articoloDaMateriale(m);
    const { data, error } = await supabase.from("article_templates")
      .insert({ company_id: companyId, name: a.name, unit_of_measure: a.unit_of_measure, description: a.description, supplier_id: a.supplier_id, vat_rate: 22 })
      .select("id, name, sku, unit_of_measure, supplier_id, prezzo_acquisto_netto, standard_cost, marca, modello").single();
    if (error || !data) { toast.error("Articolo non aggiunto al catalogo", { description: messaggioErrore(error) }); return null; }
    // Subito nel catalogo della finestra, senza aspettare la rilettura.
    qc.setQueryData(["genera-materiali", orderId, companyId], (d: typeof dati.data) => d ? { ...d, catalogo: { ...d.catalogo, articoli: [...d.catalogo.articoli, data as ArticoloCatalogo] } } : d);
    qc.invalidateQueries({ queryKey: ["article-templates"] });
    toast.success(`«${a.name}» aggiunto al catalogo`, { description: "Il prezzo d'acquisto lo scrivi nel catalogo, o arriva dal primo ordine." });
    return data.id;
  };
  const [salvando, setSalvando] = useState(false);
  const salva = async () => {
    if (!risultato || !materiali.length) return;
    setSalvando(true);
    try {
      // Le fasi nuove si creano prima, in fondo all'elenco, nell'ordine del computo.
      const daCreare = [...new Set(materiali.map((r) => r.phase_id).filter((v): v is string => !!v?.startsWith(NUOVA)).map((v) => v.slice(NUOVA.length)))];
      const create = new Map<string, string>();
      if (daCreare.length) {
        const base = Math.max(0, ...(dati.data?.fasi ?? []).map((f) => f.position ?? 0)) + 1;
        const { data, error } = await supabase.from("order_work_phases")
          .insert(daCreare.map((name, i) => ({ company_id: companyId, order_id: orderId, name, position: base + i })))
          .select("id, name");
        if (error) throw error;
        for (const f of data ?? []) create.set(NUOVA + f.name, f.id);
      }
      // Dal 17/11/2026 i materiali non entrano subito negli articoli: diventano PROPOSTE, che si
      // confermano nella scheda Articoli («Dal computo: N materiali da confermare»). Quelli spenti
      // qui (le proposte dell'AI da controllare) arrivano senza spunta.
      const righe = materiali.map((m) => {
        const r = rigaDaSalvare(m);
        return { ...r, consigliata: accesa(m), phase_id: r.phase_id?.startsWith(NUOVA) ? create.get(r.phase_id) ?? null : r.phase_id };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("materiali_proponi", { p_order: orderId, p_righe: righe, p_computo: scelto?.id ?? null });
      if (error) throw error;
      const esito = data as { proposti: number; gia_decisi: number; gia_articoli: number };
      toast.success(`${esito.proposti} materiali da confermare in Articoli`, {
        description: [esito.gia_articoli ? `${esito.gia_articoli} erano già negli articoli` : null,
          esito.gia_decisi ? `${esito.gia_decisi} già confermati o scartati prima` : null].filter(Boolean).join(" · ")
          || "Spunta, fase per fase, quelli da comprare e premi «Inserisci negli articoli».",
      });
      // Commessa nata senza preventivo: dal computo anche le lavorazioni (fasi, sottofasi, importi), 17/11/2026.
      if (conLavorazioni && dati.data?.senzaLavorazioni && scelto?.id) {
        const fasiScelte: Record<string, { id?: string; nome?: string }> = {};
        for (const c of capitoli) {
          const m = mappa[c];
          // Senza fase scelta, la funzione crea la fase del capitolo: col nome leggibile, non tutto maiuscolo.
          if (!m || m === SENZA) { fasiScelte[c] = { nome: nomeLeggibile(capitoloLeggibile(c).nome) }; continue; }
          if (m.startsWith(NUOVA)) { const id = create.get(m); fasiScelte[c] = id ? { id } : { nome: nomeLeggibile(m.slice(NUOVA.length)) }; }
          else fasiScelte[c] = { id: m };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lav, error: errLav } = await (supabase as any).rpc("commessa_lavorazioni_dal_computo", { p_order_id: orderId, p_computo_id: scelto.id, p_fasi: fasiScelte });
        if (errLav) toast.warning("Materiali salvati, lavorazioni non create", { description: messaggioErrore(errLav) });
        else {
          const l = lav as { fasi: number; fasi_nuove: number; voci: number; voci_con_costo: number };
          toast.success(`${l.voci} lavorazioni in ${l.fasi} fasi, con gli importi del computo`, {
            description: l.voci_con_costo ? `${l.voci_con_costo} con il costo dal listino aziendale.` : "Nessuna voce ha un costo nel listino aziendale: il costo previsto resta da scrivere.",
          });
          qc.invalidateQueries({ queryKey: ["genera-materiali", orderId, companyId] });
          // Le voci e le sottofasi nuove: costo previsto, margine e lavorazioni si rileggono.
          qc.invalidateQueries({ queryKey: ["voci-previste-fasi"] });
          qc.invalidateQueries({ queryKey: ["order_work_subphases"] });
        }
      }
      qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
      qc.invalidateQueries({ queryKey: ["order-work-phases"] });
      // I materiali sono salvati: le scelte da ricordare non devono più fermarli.
      if (ricorda && righeRicordi.length) {
        try {
          const n = await ricordaScelte(companyId, ricordi, aliasNuovi);
          toast.success(`Ricordato per i prossimi computi (${n})`, {
            description: righeRicordi.length > 3 ? `${righeRicordi.slice(0, 2).join(" · ")} · e altre ${righeRicordi.length - 2}` : righeRicordi.join(" · "),
          });
          qc.invalidateQueries({ queryKey: ["scomposizioni"] });
          qc.invalidateQueries({ queryKey: ["genera-materiali", orderId, companyId] });
        } catch (e) {
          toast.error("Scelte non ricordate", { description: messaggioErrore(e) });
        }
      }
      await qc.invalidateQueries({ queryKey: ["materiali-proposti", orderId] });
      onOpenChange(false);
      if (esito.proposti > 0) onProposti?.();
    } catch (e) {
      toast.error("Materiali non salvati", { description: messaggioErrore(e) });
    } finally {
      setSalvando(false);
    }
  };

  const capitoli = [...new Set(vociComputo.map((v) => capitoloVoce(v as never)))];
  // Il controllo del computo (17/11/2026): gli errori che diventerebbero ordini sbagliati.
  const incongruenze = useMemo(() => controllaComputo(vociComputo.map((v) => voceDaCommessa(v as never))), [vociComputo]);
  const daVerificare = incongruenze.filter((x) => x.gravita === "verifica");
  // Noli, ore e prestazioni: non materiali, ma da contrattare (17/11/2026).
  const servizi = useMemo(() => serviziDelComputo(vociComputo as never).filter((x) => x.tipo !== "trasferimento"), [vociComputo]);
  const importoServizio = (id: string) => {
    const v = vociComputo.find((x) => x.id === id) as { quantita?: number | null; prezzo_unitario_computo?: number | null } | undefined;
    return v?.quantita && v.prezzo_unitario_computo ? Math.round(v.quantita * v.prezzo_unitario_computo * 100) / 100 : null;
  };
  // Le voci senza scomposizione hanno il loro elenco: negli avvisi resterebbero due volte.
  const avvisiAltri = (risultato?.avvisi ?? []).filter((a) => a.tipo !== "senza_scomposizione");
  const totaleComputo = vociComputo.reduce((t, v) => t + (Number((v as { importo_computo?: number | null }).importo_computo) || 0) * ((v as { is_detrazione?: boolean | null }).is_detrazione ? -1 : 1), 0);
  const passiVisibili: { id: Passo; etichetta: string; conteggio: number | null; tono: "attenzione" | "ok" | null }[] = [
    { id: "controllo" as const, etichetta: "Controllo", conteggio: daVerificare.length, tono: daVerificare.length ? "attenzione" as const : "ok" as const },
    ...(capitoli.length ? [{ id: "fasi" as const, etichetta: "Fasi", conteggio: capitoli.length, tono: null }] : []),
    ...(servizi.length ? [{ id: "noli" as const, etichetta: "Noli e servizi", conteggio: servizi.length, tono: null }] : []),
    { id: "materiali" as const, etichetta: "Materiali", conteggio: daSalvare.length, tono: risultato?.senzaScomposizione.length ? "attenzione" as const : null },
  ];
  // Si apre sul primo passo che chiede attenzione: il controllo se qualcosa non torna, se no i materiali.
  const passoAttivo: Passo = passo && passiVisibili.some((p) => p.id === passo) ? passo : daVerificare.length ? "controllo" : "materiali";
  const passoDopo = passiVisibili[passiVisibili.findIndex((p) => p.id === passoAttivo) + 1] ?? null;
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
        notaDestinazione="Le voci diventano il computo della commessa."
        descrizione={scelto
          ? `Carica un altro computo: le voci si leggono da sole, le rivedi e poi vedi i materiali da comprare. «${scelto.titolo || scelto.file_name}» resta archiviato, non cancellato.`
          : "Carica il computo della commessa: le voci si leggono da sole, le rivedi e poi vedi i materiali da comprare, divisi per fase. I materiali arrivano come proposte da confermare nella scheda Articoli."}
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
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        {/* Testata in una riga: titolo, il computo e le sue azioni. La spiegazione è nel suggerimento. */}
        <DialogHeader className="space-y-1 border-b px-5 pb-3 pt-4 text-left">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-8">
            <DialogTitle className="text-base">Genera dal computo</DialogTitle>
            {salvaComputo.isPending ? (
              <span className="flex items-center gap-1.5 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Salvo il computo nella commessa…</span>
            ) : inLettura ? (
              <span className="flex items-center gap-1.5 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Sto leggendo «{inLettura.titolo || inLettura.file_name}»{inLettura.progresso ? ` (${inLettura.progresso})` : ""}</span>
            ) : scelto ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                {letti.length > 1 ? (
                  <Select value={scelto.id} onValueChange={(id) => { setComputoId(id); setScelte({}); setAccese({}); setSceltaArticolo({}); }}>
                    <SelectTrigger className="h-7 w-auto max-w-xs gap-1 border-slate-200 px-2 text-xs" aria-label="Computo"><SelectValue /></SelectTrigger>
                    <SelectContent>{letti.map((c) => <SelectItem key={c.id} value={c.id}>{c.titolo || c.file_name} · {c.stato}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <span className="min-w-0 truncate font-medium text-slate-800">{scelto.titolo || scelto.file_name}</span>}
                <span className="text-slate-500">{scelto.stato}{voci.data ? ` · ${voci.data.length} voci` : ""}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setApriComputo(true)}>Apri il computo</Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setImporta(true)}><Upload className="mr-1 h-3.5 w-3.5" aria-hidden />Carica un altro</Button>
              </div>
            ) : !computi.isLoading && companyId ? (
              <div className="flex flex-1 items-center gap-2 text-xs text-slate-600">
                <span>Nessun computo: i materiali vengono dalle tavole contate.</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setImporta(true)}><Upload className="mr-1 h-3.5 w-3.5" aria-hidden />Carica il computo</Button>
              </div>
            ) : null}
          </div>
          <DialogDescription className="text-xs">
            Salvando, il computo crea le lavorazioni e propone i materiali: li confermi tu nella scheda Articoli, spuntando quelli da comprare.
          </DialogDescription>
          {riprovaUltimo}
        </DialogHeader>

        {/* I passi (17/11/2026): una cosa per volta, coi numeri in vista. Si salta liberamente fra i passi. */}
        {!caricamento && risultato && !nienteDaLeggere && (
          <nav aria-label="Passi" role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b bg-slate-50/70 px-4 py-1.5">
            {passiVisibili.map((p, i) => {
              const attivo = p.id === passoAttivo;
              return (
                <button key={p.id} type="button" role="tab" aria-selected={attivo} onClick={() => setPasso(p.id)}
                  className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                    attivo ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/70")}>
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    attivo ? "bg-primary text-primary-foreground" : "bg-slate-200 text-slate-700")}>{i + 1}</span>
                  {p.etichetta}
                  {p.conteggio != null && (
                    <span className={cn("rounded-full px-1.5 tabular-nums text-[11px]", p.tono === "attenzione" ? "bg-amber-100 text-amber-900" : p.tono === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200/70 text-slate-700")}>
                      {p.tono === "ok" ? <Check className="h-3 w-3" aria-label="Niente da controllare" /> : p.conteggio}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {caricamento && <p className="py-6 text-sm text-slate-500">Leggo computo, scomposizioni, catalogo e magazzino…</p>}

          {!caricamento && risultato && !nienteDaLeggere && (
            <div className="space-y-3 pt-3 text-sm">
              {passoAttivo === "controllo" && (
                <section aria-label="Controllo del computo" className="space-y-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{vociComputo.length} voci lette</span>
                    {mostraPrezzi && totaleComputo > 0 && <span>· {euro(totaleComputo)}</span>}
                    <span>· {capitoli.length} capitoli</span>
                    {servizi.length > 0 && <span>· {servizi.length} noli e servizi</span>}
                  </p>
                  {daVerificare.length > 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span className="font-semibold">{daVerificare.length} voci con quantità o unità che non tornano</span>
                      {mostraPrezzi && importoInGioco(incongruenze) > 0 && <> · {euro(importoInGioco(incongruenze))} in gioco</>}
                      {" "}— controllale col progettista prima di chiedere offerte. I materiali si generano lo stesso.
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <Check className="h-3.5 w-3.5" aria-hidden />Nei numeri del computo non c'è niente che non torni.
                    </p>
                  )}
                  {incongruenze.length > 0 && (
                    <ul className="divide-y rounded-md border bg-white text-xs">
                      {incongruenze.map((x, i) => (
                        <li key={`${x.voce_id}-${x.regola}-${i}`} className="grid grid-cols-[4.5rem_1fr_auto] gap-3 px-3 py-2">
                          <span className="tabular-nums text-slate-500">voce {x.numero.length > 12 ? "varie" : x.numero}</span>
                          <span className="min-w-0">
                            <span className={cn("font-medium", x.gravita === "verifica" ? "text-amber-900" : "text-slate-700")}>{x.titolo}</span>
                            <span className="block text-slate-600">{x.messaggio}</span>
                          </span>
                          <span className="tabular-nums text-slate-700">{mostraPrezzi && x.importo ? euro(x.importo) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {passoAttivo === "fasi" && (
                <section aria-label="Capitoli e fasi" className="space-y-2">
                  <p className="text-xs text-slate-600">
                    {fasiNuove.length > 0 && !(dati.data?.fasi.length) ? "La commessa non ha fasi: ogni capitolo ne diventa una. " : "Ogni capitolo va in una fase della commessa. "}
                    Le voci di un altro mestiere vanno comunque nella loro fase.
                    {suggerimentiAI.isFetching && <span className="ml-2 inline-flex items-center gap-1 text-violet-700"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />l'AI propone {incerti.length}</span>}
                    {suggerimentiAI.isError && <span className="ml-2 text-amber-800">Proposta dell'AI non disponibile: scegli tu la fase.</span>}
                  </p>
                  <ul className="divide-y rounded-md border bg-white">
                    {capitoli.map((c) => {
                      const s = suggerimenti.find((x) => x.capitolo === c);
                      const nuovaAI = s?.nuova_fase && s.nuova_fase !== c ? s.nuova_fase : null;
                      const { tag, nome } = capitoloLeggibile(c);
                      const quante = vociComputo.filter((v) => capitoloVoce(v as never) === c).length;
                      return (
                        <li key={c} className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_auto_20rem]">
                          <span className="min-w-0" title={c}>
                            <span className="flex items-center gap-1.5">
                              {tag && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{tag}</span>}
                              <span className="truncate font-medium text-slate-900">{nome}</span>
                            </span>
                            <span className="text-xs text-slate-500">{quante} {quante === 1 ? "voce" : "voci"}</span>
                          </span>
                          <span className="text-[11px]">
                            {s && !sicuri.has(c) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-800" title={`Suggerimento dell'AI: ${s.motivo}`}>
                                <Sparkles className="h-3 w-3" aria-hidden />AI {Math.round(s.confidenza * 100)}%
                              </span>
                            )}
                          </span>
                          <Select value={mappa[c] ?? SENZA} onValueChange={(v) => setMappa({ ...mappa, [c]: v })}>
                            <SelectTrigger className="h-8 text-xs" aria-label={`Fase per ${c}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(dati.data?.fasi ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                              {nuovaAI && <SelectItem value={NUOVA + nuovaAI}>Nuova fase «{nuovaAI}» (AI)</SelectItem>}
                              {c !== "Senza capitolo" && <SelectItem value={NUOVA + c}>Nuova fase «{nome}»</SelectItem>}
                              <SelectItem value={SENZA}>{c === "Senza capitolo" ? "Dal testo della voce" : "Senza fase"}</SelectItem>
                            </SelectContent>
                          </Select>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {passoAttivo === "noli" && (
                <section aria-label="Noli, servizi e ore" className="space-y-2">
                  <p className="text-xs text-slate-600">Non sono materiali da ordinare: si contrattano con noleggiatori, imprese e professionisti, per la durata del cantiere.</p>
                  <ul className="divide-y rounded-md border bg-white text-xs">
                    {servizi.map((x) => (
                      <li key={x.voce_id} className="grid grid-cols-[7.5rem_1fr_auto] gap-3 px-3 py-2">
                        <span className="font-medium text-slate-700">{ETICHETTA_SERVIZIO[x.tipo]}{x.mesi ? ` · ${x.mesi.toLocaleString("it-IT")} mesi` : ""}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-slate-800" title={x.descrizione}>{x.numero ? `${x.numero} · ` : ""}{x.descrizione}</span>
                          <span className="block text-slate-500">{x.nota}</span>
                        </span>
                        <span className="tabular-nums text-slate-700">{mostraPrezzi && importoServizio(x.voce_id) ? euro(importoServizio(x.voce_id)!) : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {passoAttivo === "materiali" && (
                <>
                  {risultato.senzaScomposizione.length > 0 && (
                    <section aria-label="Voci senza materiali" className="rounded-md border border-violet-200 bg-violet-50/60 text-xs text-violet-950">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <Sparkles className="h-3.5 w-3.5 text-violet-700" aria-hidden />
                        <span className="font-semibold">{risultato.senzaScomposizione.length} {risultato.senzaScomposizione.length === 1 ? "voce" : "voci"} senza materiali</span>
                        <span className="text-violet-900/80">le regole non le riconoscono: l'AI propone, tu accendi.</span>
                        <button type="button" className="text-violet-800 underline underline-offset-2" onClick={() => setVediSenza((v) => !v)}>{vediSenza ? "Nascondi" : "Quali"}</button>
                        <Button size="sm" className="ml-auto h-7 text-xs" disabled={proponendo} onClick={proponiAI}>
                          {proponendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                          {proponendo ? "L'AI sta proponendo…" : "Proponi con l'AI"}
                        </Button>
                      </div>
                      {vediSenza && (
                        <ul className="max-h-40 divide-y divide-violet-100 overflow-auto border-t border-violet-100 bg-white">
                          {risultato.senzaScomposizione.map((v) => (
                            <li key={v.id} className="flex justify-between gap-2 px-3 py-1">
                              <span className="min-w-0 truncate" title={v.descrizione_breve}>{v.codice_prezzario || v.codice_voce ? `${v.codice_prezzario || v.codice_voce} · ` : ""}{v.descrizione_breve}</span>
                              <span className="shrink-0 tabular-nums text-slate-500">{v.quantita != null ? `${Number(v.quantita).toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${v.unita_misura ?? ""}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

              <MaterialiProposti
                materiali={materiali}
                accesa={accesa}
                setAccese={setAccese}
                perFase={perFase}
                nomeFase={(id) => nomeFase(id === SENZA ? null : id)}
                articoli={dati.data?.catalogo.articoli ?? []}
                listini={dati.data?.catalogo.listini ?? []}
                fornitori={dati.data?.catalogo.fornitori ?? new Map()}
                mostraPrezzi={mostraPrezzi}
                onScegliArticolo={(chiave, sc) => setSceltaArticolo((a) => ({ ...a, [chiave]: sc }))}
                // Il catalogo lo scrive solo chi ha il permesso del listino (RLS at_scrittura: can_edit_settings_pricing).
                onAggiungiAlCatalogo={permessi.canEditSettingsPricing ? aggiungiAlCatalogo : undefined}
                avvisiCosto={mostraPrezzi ? avvisiCosto : undefined}
              />

                  {avvisiAltri.length > 0 && (
                    <section aria-label="Avvisi" className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">Da guardare ({avvisiAltri.length})</span>
                      </div>
                      <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-auto pl-5">
                        {avvisiAltri.map((a, i) => <li key={i}>{a.messaggio}</li>)}
                      </ul>
                    </section>
                  )}

                  {risultato.escluse.length > 0 && (
                    <details className="rounded-md border text-xs">
                      <summary className="cursor-pointer px-3 py-1.5 font-medium">Escluse {risultato.escluse.length} voci, e perché</summary>
                      <ul className="max-h-56 divide-y overflow-auto border-t">
                        {risultato.escluse.map((e) => (
                          <li key={e.voce_id} className="flex justify-between gap-2 px-3 py-1">
                            <span className="min-w-0 truncate">{e.codice ? `${e.codice} · ` : ""}{e.descrizione}</span>
                            <span className="shrink-0 text-slate-500">{e.motivo}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Piede fisso: quanti, quanto costano, cosa si ricorda, salva. */}
        <DialogFooter className="flex-row flex-wrap items-center gap-2 border-t bg-slate-50/80 px-5 py-2.5 sm:space-x-0">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {risultato && (
            <span className="text-xs tabular-nums text-slate-700">
              <span className="font-semibold text-slate-900">{daSalvare.length} materiali da proporre</span>
              {mostraPrezzi && stima.totale > 0 && <> · stima <span className="font-semibold text-slate-900">{stima.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span></>}
              {mostraPrezzi && stima.senzaPrezzo > 0 && <span className="text-slate-500"> ({stima.senzaPrezzo} senza prezzo)</span>}
            </span>
          )}
          {risultato && !!scelto && dati.data?.senzaLavorazioni && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Checkbox checked={conLavorazioni} onCheckedChange={(v) => setConLavorazioni(!!v)} aria-label="Crea anche le lavorazioni dal computo" />
              <span><span className="font-medium text-slate-800">Crea anche le lavorazioni</span> · fasi, voci e importi del computo</span>
            </label>
          )}
          {righeRicordi.length > 0 && risultato && (
            <label className="flex min-w-0 max-w-md items-center gap-2 text-xs text-slate-600">
              <Checkbox checked={ricorda} onCheckedChange={(v) => setRicorda(!!v)} aria-label="Ricorda per i prossimi computi" />
              <span className="min-w-0 truncate" title={righeRicordi.join("\n")}>
                <span className="font-medium text-slate-800">Ricorda per i prossimi computi</span> · {righeRicordi.join(" · ")}
              </span>
            </label>
          )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Chiudi</Button>
            {passoDopo && (
              <Button size="sm" onClick={() => setPasso(passoDopo.id)}>Avanti: {passoDopo.etichetta}</Button>
            )}
            <Button size="sm" variant={passoDopo ? "outline" : "default"} disabled={!materiali.length || salvando || salvaComputo.isPending} onClick={salva}>
              {salvando ? "Salvo…" : `Salva e proponi i materiali (${daSalvare.length})`}
            </Button>
          </div>
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
