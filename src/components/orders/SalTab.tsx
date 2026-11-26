import "./sal-records.css";
import "./sal-draft-dialog.css";
import { type ModalitaCostoFinanziaria, costoDaSottrarreAlSaldo, costoTrattenuto } from "@/lib/finanziamenti/costoFinanziaria";
import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FileBarChart2, ChevronRight, Loader2, Download, Trash2, Wand2, Banknote, Check, Clock, ListChecks, Receipt, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { maturatoPrecedente, nettoSal } from "@/lib/orders/salNetto";
import { vociSalDaFasi, collegaVociAFasi, percentualiPrecedenti, percentualePrecedenteVoce, vociSottoIlPrecedente, type FasePerSal } from "@/lib/orders/salDaFasi";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import type { Installment } from "@/lib/orderUtils";
import { queryKeys } from "@/lib/queryKeys";
import { useSalMatura } from "@/hooks/useSalMatura";
import { useSostituisciRate } from "@/hooks/usePianoPagamenti";
import { rataPerServer } from "@/lib/orders/modelliPagamento";
import { salMaturato } from "@/lib/orders/salMaturazione";
import { numeroNuovoSal, prossimoStatoSal, rataDaAllineareAlSal, rataDaSal, rateSalDaEmettere } from "@/lib/orders/salRate";
import {usePermissions} from "@/hooks/usePermissions";
import {prepareSalLines,salNumber,salLineAmount,salListIssues,salEmissionIssue} from "@/lib/orders/salDraft";
import {saveSalDraft,SalSaveError} from "@/lib/orders/saveSalDraft";
import {SalPlanInfo} from "./SalPlanInfo";
import { FORMATI_VERBALE_SAL, type FormatoVerbaleSal } from "@/lib/orders/formatiVerbaleSal";
import { VerbaleSalDialog } from "./VerbaleSalDialog";
import {CertificatoSal} from "./CertificatoSal";
import {anticipazioneDalPiano,certificatoDelSal,certificatoBloccato, certificatoPrecedente, leggiImportoItaliano, percentualeRitenutaContratto} from "@/lib/orders/salCertificato";
import {giornoLocale} from "@/lib/orders/cronoprogramma";
import {leggiFasiPerSal} from "@/lib/orders/leggiFasiPerSal";
import {arrotondamentoAbituale, certificatoNelModulo, detrazioniDelPeriodo, rataProposta, rataSaldoPerSalFinale, vociCheCambiano, type Arrotondamento} from "@/lib/orders/salNuovoVerbale";
import { SalDraftPhases } from "./SalDraftPhases";
import { SalRecordPhases } from "./SalRecordPhases";
import type { SalVoce } from "@/lib/orders/salPeriodo";
import { OfficeSelect } from "./OfficeSelect";
import { ApriComputoCommessa } from "@/components/computo/commessa/ApriComputoCommessa";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import {conPercentuale, conQuantita, percentualeFaseDaSottofasi, type SottofaseSalDraft} from "@/lib/orders/salSottofasi";

interface SalRecord {
  id: string;
  numero_sal: number;
  data_emissione: string;
  stato: "bozza" | "emesso" | "approvato" | "firmato";
  importo_totale: number;
  note: string | null;
  /** Rata del piano pagamenti che questo verbale certifica (SAL = rata). */
  installment_id: string | null;
  sal_voci: SalVoce[];
  sal_certificati?: unknown;
}

const STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  emesso: "Emesso",
  approvato: "Approvato",
  firmato: "Firmato dal cliente",
};

const STATO_COLORS: Record<string, string> = {
  bozza: "secondary",
  emesso: "default",
  approvato: "outline",
  firmato: "default",
};

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

interface SalTabProps {
  orderId: string;
  companyId: string;
  orderTotalAmount?: number;
  /** Piano rate della commessa: se presente mostra l'avanzamento incassi in
      cima alla sezione (stesso riepilogo impostato in creazione/modifica). */
  installments?: Installment[];
  vatRate?: number;
  /** Costo finanziaria già "gated" dal chiamante (0 se non financing). */
  financingCost?: number;
  financingCostMode?: ModalitaCostoFinanziaria | null;
  showPaymentProgress?: boolean;
  onApriBozzaFattura?: (id: string) => void;
}

interface VoceForm {
  descrizione: string;
  importo_contrattuale: string;
  percentuale_avanzamento: string;
  note: string;
  /** Fase della commessa da cui nasce la voce; assente = voce libera. */
  fase_id?: string | null;
  /** Dettaglio per sottofase: la % della voce è la loro media pesata. */
  sottofasi?: SottofaseSalDraft[];
}

/** Le fasi uguali al SAL precedente: nel modulo stanno nascoste, e si salvano così. */
const fasiSenzaCambi = (voci: ReadonlyArray<VoceForm>, prec: ReturnType<typeof percentualiPrecedenti>) => {
  const cambia = vociCheCambiano(voci, prec);
  return new Set(voci.flatMap((v, i) => (!cambia[i] && v.fase_id ? [v.fase_id] : [])));
};


const emptyVoce = (): VoceForm => ({
  descrizione: "",
  importo_contrattuale: "",
  percentuale_avanzamento: "",
  note: "",
});

export function SalTab({ orderId, companyId, orderTotalAmount, installments, vatRate = 22, financingCost = 0, financingCostMode, showPaymentProgress = true, onApriBozzaFattura }: SalTabProps) {
  const tr = useT();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  // I SAL sono di chi ha «Venduto e importi» (15/11/2026): gli altri li vedono, senza importi, e non li fanno.
  const vedeImporti = permissions.canViewOrderAmounts !== false;
  const puoFareSal = permissions.canEditOrders && vedeImporti;
  const euro = (n: number | null | undefined) => (!vedeImporti || n == null ? "—" : formatCurrency(n));
  const confirm = useConfirm();
  const [salSearch, setSalSearch] = useState("");
  const [salStatus, setSalStatus] = useState("tutti");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [review,setReview]=useState(false);
  const [formError,setFormError]=useState("");
  const [saveBlocked,setSaveBlocked]=useState(false);
  const saving=useRef(false);
  const draftRevision=useRef(0);
  // Il modello: le rate nascono dal contratto, ogni SAL certifica la sua rata.
  const [rataCollegata, setRataCollegata] = useState<string>("");
  const [voci, setVoci] = useState<VoceForm[]>([emptyVoce()]);
  // Una voce sotto il SAL precedente abbassa il certificato: si salva solo se dichiarata rettifica.
  const [rettifica, setRettifica] = useState(false);
  // Lotto C (10/11/2026): le voci che non cambiano dal SAL precedente stanno nascoste (si salvano lo stesso),
  // e il certificato di pagamento si compila nello stesso modulo.
  const [fasiInvariate, setFasiInvariate] = useState<Set<string>>(new Set());
  const [mostraTutte, setMostraTutte] = useState(false);
  const [conCertificato, setConCertificato] = useState(false);
  const [certRitenuta, setCertRitenuta] = useState("");
  const [certAltre, setCertAltre] = useState("");
  const [certRecupero, setCertRecupero] = useState("");
  const [certNota, setCertNota] = useState("");
  // null = come il certificato prima (chi arrotonda a 100 € lo fa ogni volta).
  const [certArrotonda, setCertArrotonda] = useState<Arrotondamento | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [verbaleDi, setVerbaleDi] = useState<SalRecord | null>(null);
  const [dettaglioSalId, setDettaglioSalId] = useState<string | null>(null);
  const pulsanteDettaglioSal = useRef<HTMLButtonElement | null>(null);
  const [printTitle, setPrintTitle] = useState("");
  const [signatureUrl,setSignatureUrl]=useState<string|null>(null);
  const [signatureBusy,setSignatureBusy]=useState(false);

  const { data: salList = [], isLoading, isError, isFetching, refetch } = useQuery<SalRecord[]>({
    queryKey: ["sal-records", orderId, companyId],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("sal_records")
        .select("*, sal_voci(id, descrizione, importo_contrattuale, percentuale_avanzamento, importo_sal, note, fase_id, sal_voci_sottofasi(id, sottofase_id, posizione, descrizione, unita, quantita_contratto, quantita_a_oggi, importo_contrattuale, percentuale_avanzamento, importo_sal)), sal_certificati(*)",{count:"exact"})
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .order("numero_sal", { ascending: false });
      if (error) throw error;
      if(typeof count==="number" && count>(data?.length??0))throw new Error("Storico SAL incompleto: non vengono calcolati importi su risultati troncati.");
      return (data || []) as SalRecord[];
    },
    enabled: !!orderId && !!companyId,
  });

  const dettaglioSal = salList.find((sal) => sal.id === dettaglioSalId);
  const precedenteDettaglio = dettaglioSal ? maturatoPrecedente(dettaglioSal, salList) : 0;
  const salPrimaDelDettaglio = dettaglioSal && salList.find((sal) => sal.numero_sal < dettaglioSal.numero_sal && sal.stato !== "bozza");

  // Quando matura la rata di un SAL (lo sceglie l'azienda) e come si cambia una rata dal verbale.
  const salMatura = useSalMatura(companyId);
  // La ritenuta concordata nel contratto (orders.ritenuta_garanzia, dal preventivo): il primo certificato parte da lì.
  const { data: ritenutaContratto = null } = useQuery({
    queryKey: ["order-ritenuta-garanzia", orderId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("ritenuta_garanzia").eq("id", orderId).eq("company_id", companyId).maybeSingle();
      if (error) return null;
      return percentualeRitenutaContratto(data?.ritenuta_garanzia);
    },
    enabled: !!orderId && !!companyId,
  });
  // L'acconto già fatturato o incassato, senza IVA: ogni certificato ne recupera la sua parte.
  const anticipazione = anticipazioneDalPiano(installments ?? [], vatRate);
  // Un lavoro pubblico ha la sua contabilità (libretto delle misure, SAL e certificato sul computo): qui la si
  // indica, invece di lasciarla sotto Articoli → Apri computo dove nessuno la trovava (15/11/2026).
  const { data: lavoroPubblico = false } = useQuery({
    queryKey: ["computo-lavoro-pubblico", orderId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("computo_uploads").select("id").eq("order_id", orderId).eq("company_id", companyId).eq("lavoro_pubblico", true).limit(1);
      return !error && (data ?? []).length > 0;
    },
    enabled: !!orderId && !!companyId,
    staleTime: 5 * 60 * 1000,
  });
  const sostituisciRate = useSostituisciRate(orderId);
  // La ritenuta dei certificati nel registro delle ritenute (15/11/2026): la scrive l'emissione, se emette un
  // amministratore; altrimenti resta fuori e qui si vede. Il registro lo legge solo l'amministratore.
  const { data: salNelRegistro } = useQuery({
    queryKey: ["sal-ritenute-registro", orderId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ritenute_garanzia").select("sal_record_id").eq("order_id", orderId).eq("company_id", companyId).not("sal_record_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.sal_record_id as string));
    },
    enabled: !!orderId && !!companyId && permissions.isAdmin,
  });
  const registraRitenuta = useMutation({
    mutationFn: async (salId: string) => {
      const { data, error } = await supabase.rpc("sal_ritenuta_nel_registro", { p_sal: salId });
      if (error) throw new Error(error.message);
      if (!data) throw new Error(tr("Niente da registrare: la ritenuta di questo SAL è già tolta dai certificati prima."));
    },
    onSuccess: () => {
      toast.success(tr("Ritenuta registrata: la trovi in Ritenute a garanzia, da svincolare."));
      void queryClient.invalidateQueries({ queryKey: ["sal-ritenute-registro", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fasi di lavorazione della commessa, con sottofasi e voci: per compilare il verbale
  // dall'avanzamento dichiarato in cantiere (src/lib/orders/leggiFasiPerSal.ts).
  const leggiFasi = (): Promise<FasePerSal[]> => leggiFasiPerSal(supabase, orderId, companyId);
  const chiaveFasi = ["sal-fasi-commessa", orderId, companyId];
  const { data: fasiSal = [], isError: fasiError, refetch: refetchFasi } = useQuery<FasePerSal[]>({
    queryKey: chiaveFasi,
    queryFn: leggiFasi,
    enabled: !!orderId && !!companyId && dialogOpen,
  });

  // AI: suggerisce % avanzamento dalle voci ordine + storico SAL + rapportini
  const aiSuggestMutation = useMutation({
    mutationFn: async () => {
      if(!puoFareSal || !dialogOpen)throw new Error(tr("Non hai il permesso di compilare il SAL."));
      const revision=draftRevision.current;
      const nextNumero = numeroNuovoSal((installments??[]).find(i=>i.id===rataCollegata)??null,salList);
      const { data, error } = await supabase.functions.invoke("suggerisci-sal-ai", {
        body: { order_id: orderId, company_id: companyId, numero_sal: nextNumero },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? tr("Suggerimento fallito"));
      return {...data,draftRevision:revision};
    },
    onSuccess: (data) => {
      if(!dialogOpen || draftRevision.current!==data.draftRevision){toast.info(tr("Bozza modificata: il suggerimento AI non ha sostituito i tuoi dati."));return;}
      const voci_suggerite: Array<{
        descrizione: string;
        importo_contrattuale: number;
        perc_suggerita: number;
      }> = data?.suggerimenti?.voci_suggerite ?? [];
      if (voci_suggerite.length === 0) {
        toast.info(tr("L'AI non ha trovato voci da suggerire"));
        return;
      }
      // Le voci dell'AI sono nuove: si mostrano tutte.
      setFasiInvariate(new Set());
      setVoci(collegaVociAFasi(voci_suggerite.map((v) => ({
        descrizione: v.descrizione ?? "",
        importo_contrattuale: String(v.importo_contrattuale ?? 0),
        percentuale_avanzamento: String(v.perc_suggerita ?? 0),
        note: "",
      })), fasiSal));
      const noteDraft = data?.suggerimenti?.note_sal_draft;
      if (noteDraft && !note) setNote(noteDraft);
      toast.success(
        tr("Compilate {n} voci · % globale {pct}", { n: voci_suggerite.length, pct: data?.suggerimenti?.percentuale_globale_suggerita ?? "—" }),
      );
      const warnings: string[] = data?.suggerimenti?.warnings ?? [];
      warnings.forEach((w) => toast.warning(w, { duration: 6000 }));
    },
    onError: (err) => toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`),
  });

  const createSalMutation = useMutation({
    mutationFn: async ({emetti}:{emetti:boolean}) => {
      if(!puoFareSal || !review || blocked || saveBlocked)throw new Error(tr("Controlla lo storico e il riepilogo prima di salvare."));
      if(vociInDiscesa.length>0 && !rettifica)throw new Error(tr("Alcune voci scendono sotto il SAL precedente: conferma che è una rettifica o correggi le percentuali."));
      if(rataCollegata && (!(installments??[]).some(i=>i.id===rataCollegata) || salList.some(s=>s.installment_id===rataCollegata)))
        throw new Error(tr("La rata non è disponibile o ha già un verbale SAL."));
      if(conCertificato && !certificatoNuovo)throw new Error(tr("Controlla ritenuta e detrazioni del certificato."));
      if(emetti && !salMatura)throw new Error(tr("Regola di maturazione del SAL non verificata: salva la bozza ed emettila dalla scheda."));
      const numero=numeroNuovoSal((installments??[]).find(i=>i.id===rataCollegata)??null,salList);
      if(emetti){const problema=salEmissionIssue({id:"nuovo",numero_sal:numero,stato:"bozza"},salList);if(problema)throw new Error(problema);}
      const {id}=await saveSalDraft(supabase,{orderId,companyId,number:numero,
        date:giornoLocale(new Date().toISOString()),note,installmentId:rataCollegata||null,lines:voci,contractNet:orderTotalAmount});
      // La bozza c'è: da qui in poi un errore non la annulla (rifarla creerebbe un doppione), lo si dice.
      const avvisi:string[]=[];
      let certificatoOk=true;
      if(conCertificato && certificatoNuovo){
        const {error}=await supabase.from("sal_certificati").upsert({sal_id:id,order_id:orderId,company_id:companyId,...certificatoNuovo});
        if(error){certificatoOk=false;avvisi.push(tr("Certificato non salvato ({errore}): aggiungilo dalla scheda del SAL.", { errore: error.message }));}
      }
      let emesso=false;
      if(emetti && certificatoOk){
        const {data,error}=await supabase.from("sal_records").update({stato:"emesso",data_emissione:giornoLocale(new Date().toISOString())})
          .eq("id",id).eq("order_id",orderId).eq("company_id",companyId).eq("stato","bozza").select("id,stato");
        if(error || data?.length!==1)avvisi.push(tr("Il SAL è salvato in bozza ma non emesso: emettilo dalla scheda."));
        else emesso=true;
      }else if(emetti)avvisi.push(tr("Il SAL resta in bozza finché il certificato non è salvato."));
      return {id,emesso,avvisi};
    },
    onSuccess: ({emesso,avvisi}) => {
      if(avvisi.length)avvisi.forEach(a=>toast.warning(a,{duration:9000}));
      else toast.success(emesso ? tr("SAL emesso. Nessuna fattura o email generata.") : tr("Bozza SAL salvata. Nessuna fattura o email generata."));
      refreshSal();setDialogOpen(false);setNote("");setRataCollegata("");setVoci([emptyVoce()]);setReview(false);setRettifica(false);
    },
    onError: (error:Error) => {
      setReview(false);
      setFormError(error.message);setSaveBlocked(error instanceof SalSaveError && error.uncertain);
      refreshSal();toast.error(error.message);
    },
    onSettled:()=>{saving.current=false;},
  });
  const deleteSalMutation = useMutation({
    mutationFn: async (salId:string) => {
      const row=salList.find(s=>s.id===salId);
      if(!puoFareSal || blocked || row?.stato!=="bozza")throw new Error(tr("Si può eliminare solo una bozza SAL."));
      const {data,error}=await supabase.from("sal_records").delete().eq("id",salId).eq("order_id",orderId).eq("company_id",companyId).eq("stato","bozza").select("id");
      if(error || data?.length!==1)throw new Error(tr("Eliminazione non confermata: il SAL potrebbe essere stato modificato."));
    },
    onSuccess:()=>{toast.success(tr("Bozza SAL eliminata"));refreshSal();},
    onError:(error:Error)=>{toast.error(error.message);refreshSal();},
  });
  const cambiaStato = useMutation({
    mutationFn: async ({id,stato:next}:{id:string;stato:"emesso"|"approvato"}) => {
      const row=salList.find(s=>s.id===id);
      if(!puoFareSal || blocked || !salMatura || !row || prossimoStatoSal(row.stato)?.stato!==next)throw new Error(tr("Passaggio non consentito o regola SAL non verificata."));
      const sequenceIssue=salEmissionIssue(row,salList);
      if(sequenceIssue)throw new Error(sequenceIssue);
      const prepared=prepareSalLines((row.sal_voci??[]).map(v=>({descrizione:v.descrizione,importo_contrattuale:String(v.importo_contrattuale),percentuale_avanzamento:String(v.percentuale_avanzamento),note:v.note??""})),orderTotalAmount);
      if(Math.abs(prepared.total-Number(row.importo_totale))>0.01)throw new Error(tr("Totale SAL diverso dalle voci: verifica la bozza prima di emetterla."));
      const patch=next==="emesso" ? {stato:next,data_emissione:giornoLocale(new Date().toISOString())} : {stato:next};
      const {data,error}=await supabase.from("sal_records").update(patch).eq("id",id).eq("order_id",orderId).eq("company_id",companyId).eq("stato",row.stato).select("id,stato");
      if(error || data?.length!==1 || data[0].stato!==next)throw new Error(tr("Passaggio non confermato: aggiorna lo storico SAL."));
    },
    onSuccess:(_data,{stato:next})=>{toast.success(next==="emesso"?tr("SAL emesso, non incassato"):tr("Approvazione registrata, non firma del cliente"));refreshSal();},
    onError:(error:Error)=>{toast.error(error.message);refreshSal();},
  });

  const handleExportPdf = async (sal: SalRecord, fotoIds: string[] = [], allegati: string[] = [], formato: FormatoVerbaleSal = "completo", download = false) => {
    if (!vedeImporti || isExporting) return;
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sal-pdf", {
        body: { sal_id: sal.id, company_id: companyId, prepare_signature:false, foto_ids: fotoIds, allegati, formato },
      });
      if (error) throw new Error(await edgeErrorMessage(error, tr("Errore nella generazione del PDF")));
      if (typeof data?.html !== "string" || !data.html.trim()) throw new Error(tr("Nessun contenuto generato"));
      if (download && formato !== "sintetico") {
        const { generaVerbaleSalScaricabile } = await import("@/lib/orders/scaricaVerbaleSal");
        const pdf = await generaVerbaleSalScaricabile(data.html, formato);
        const versione = formato === "periodo" ? "solo-periodo" : "cumulativo";
        await downloadQuotePdf(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), `SAL-${sal.numero_sal}-${versione}.pdf`);
        return;
      }
      setPrintTitle(`SAL n. ${sal.numero_sal} · ${FORMATI_VERBALE_SAL[formato].titolo}`);
      setPrintHtml(data.html);
      setVerbaleDi(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : tr("Errore nell'esportazione"));
    } finally {
      setIsExporting(false);
    }
  };

  const updateVoce = (index: number, field: keyof VoceForm, value: string) => {
    draftRevision.current++;
    const fase = voci[index]?.fase_id;
    if (fase) setFasiInvariate(current => { const next = new Set(current); next.delete(fase); return next; });
    setVoci((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  // Una sottofase cambia: la % della fase è la loro media (pesata sugli importi o sul peso).
  const updateSottofase = (index: number, j: number, campo: "percentuale" | "quantita", valore: string) => {
    draftRevision.current++;
    const fase = voci[index]?.fase_id;
    if (fase) setFasiInvariate(current => { const next = new Set(current); next.delete(fase); return next; });
    setVoci((prev) => prev.map((v, i) => {
      if (i !== index || !v.sottofasi) return v;
      const sottofasi = v.sottofasi.map((d, k) => (k !== j ? d : campo === "quantita" ? conQuantita(d, valore) : conPercentuale(d, valore)));
      const media = percentualeFaseDaSottofasi(sottofasi);
      return { ...v, sottofasi, percentuale_avanzamento: media != null ? String(media) : v.percentuale_avanzamento };
    }));
  };

  const addVoce = () => {draftRevision.current++;setMostraTutte(true);setVoci((prev) => [...prev, emptyVoce()]);};

  const removeVoce = (index: number) => {
    draftRevision.current++;
    if (voci.length === 1) return;
    setVoci((prev) => prev.filter((_, i) => i !== index));
  };

  const computedImporto = (v: VoceForm) => {
    const contrattuale=salNumber(v.importo_contrattuale),perc=salNumber(v.percentuale_avanzamento);
    return contrattuale!==null && perc!==null && perc<=100 ? salLineAmount(contrattuale,perc) : 0;
  };

  const totalDialogImporto = voci.reduce((cents, v) => cents + Math.round(computedImporto(v)*100), 0)/100;
  const rataScelta = (installments ?? []).find((i) => i.id === rataCollegata) ?? null;
  const numeroNuovo = numeroNuovoSal(rataScelta, salList);
  const precedenteNuovo = maturatoPrecedente({ id: "nuovo", numero_sal: numeroNuovo }, salList);
  // Il verbale è cumulativo: ogni voce riparte dalla % del SAL emesso prima di questo.
  const precedentiVoci = percentualiPrecedenti(numeroNuovo, salList);
  const vociInDiscesa = vociSottoIlPrecedente(voci, precedentiVoci);
  // Il certificato nello stesso modulo: ritenuta del certificato prima, acconti = già maturato.
  const certificatoPrima = certificatoPrecedente({ numero_sal: numeroNuovo }, salList);
  const arrotondamento: Arrotondamento = certArrotonda ?? arrotondamentoAbituale(certificatoPrima);
  const ritenutaScritta = certRitenuta.trim() ? leggiImportoItaliano(certRitenuta) : null;
  const altreScritte = certAltre.trim() ? leggiImportoItaliano(certAltre) : null;
  const recuperoScritto = certRecupero.trim() ? leggiImportoItaliano(certRecupero) : null;
  const certificatoValido = (ritenutaScritta === null || (Number.isFinite(ritenutaScritta) && ritenutaScritta >= 0 && ritenutaScritta <= 100))
    && (altreScritte === null || (Number.isFinite(altreScritte) && altreScritte >= 0))
    && (recuperoScritto === null || (Number.isFinite(recuperoScritto) && recuperoScritto >= 0));
  const certificatoCalcolato = certificatoValido
    ? certificatoNelModulo({ cumulativo: totalDialogImporto, precedente: certificatoPrima, giaMaturato: precedenteNuovo, ritenutaPct: ritenutaScritta, altreDetrazioni: altreScritte, recupero: recuperoScritto, nota: certNota, arrotonda: arrotondamento, anticipazione, contratto: orderTotalAmount, ritenutaContratto })
    : null;
  // Un netto negativo non è un certificato da pagare: il verbale abbassa il già certificato (rettifica).
  const certificatoNegativo = !!certificatoCalcolato && certificatoCalcolato.netto < 0;
  const certificatoNuovo = certificatoNegativo ? null : certificatoCalcolato;
  const nuoviLavori = nettoSal(totalDialogImporto, precedenteNuovo).daFatturare;
  const daPagare = conCertificato ? certificatoNuovo?.netto ?? null : nuoviLavori;
  const salPrecedente = salList.find(s => s.numero_sal === precedentiVoci.numero);
  const detrazioni = conCertificato && certificatoNuovo
    ? detrazioniDelPeriodo(nuoviLavori, certificatoNuovo, certificatoDelSal(salPrecedente?.sal_certificati), !!salPrecedente)
    : [];
  const rataSuggerita = !rataScelta && (rataProposta(installments ?? [], salList)
    || rataSaldoPerSalFinale(installments ?? [], salList, totalDialogImporto, orderTotalAmount));
  const impostaRata = (id: string) => {
    draftRevision.current++;
    setRataCollegata(id);
    const numero = numeroNuovoSal((installments ?? []).find(r => r.id === id) ?? null, salList);
    setFasiInvariate(fasiSenzaCambi(voci, percentualiPrecedenti(numero, salList)));
  };
  const vociNascoste = mostraTutte ? 0 : voci.filter((v) => v.fase_id && fasiInvariate.has(v.fase_id)).length;
  const contrattualeVoci = voci.reduce((c, v) => c + Math.round((salNumber(v.importo_contrattuale) ?? 0) * 100), 0) / 100;

  const listIssues=salListIssues(salList);
  const blocked=isLoading || isError || isFetching || listIssues.length>0;
  const refreshSal=()=>{
    void queryClient.invalidateQueries({queryKey:["sal-records",orderId]});
    void queryClient.invalidateQueries({queryKey:["sal-legami",orderId]});
    void queryClient.invalidateQueries({queryKey:["sal-ritenute-registro",orderId]});
    void queryClient.invalidateQueries({queryKey:queryKeys.orders.installments(orderId)});
    void queryClient.invalidateQueries({queryKey:["order-installments",orderId]});
  };
  const openComposer=(installmentId="")=>{
    if(!puoFareSal || blocked)return;
    if(saveBlocked){toast.error(tr("Un salvataggio precedente resta da verificare: ricarica lo storico prima di creare un altro SAL."));return;}
    const rata = installmentId;
    // Il certificato si propone da sé quando c'è da togliere qualcosa: acconto da recuperare o ritenuta del contratto.
    const haCertificati=salList.some(s=>certificatoDelSal(s.sal_certificati)) || anticipazione>0 || (ritenutaContratto ?? 0)>0;
    draftRevision.current++;const apertura=draftRevision.current;setNote("");setVoci([emptyVoce()]);setRataCollegata(rata);setReview(false);setRettifica(false);setFormError("");
    setFasiInvariate(new Set());setMostraTutte(false);setConCertificato(haCertificati);setCertRitenuta("");setCertAltre("");setCertRecupero("");setCertNota("");setCertArrotonda(null);setDialogOpen(true);
    // Il verbale nasce dalle fasi della commessa: appena arrivano, la bozza ancora
    // intatta si compila (nome, venduto, % dal cantiere ma mai sotto il SAL
    // precedente). Se nel frattempo l'ufficio ha scritto qualcosa, non si tocca.
    const numero=numeroNuovoSal((installments??[]).find(i=>i.id===rata)??null,salList);
    void queryClient.fetchQuery({queryKey:chiaveFasi,queryFn:leggiFasi}).then(fasi=>{
      if(draftRevision.current!==apertura)return;
      const prec=percentualiPrecedenti(numero,salList);
      const daFasi=vociSalDaFasi(fasi,prec);
      if(!daFasi.length)return;
      draftRevision.current++;setVoci(daFasi);setFasiInvariate(fasiSenzaCambi(daFasi,prec));

    }).catch(()=>{/* fasi non disponibili: il modulo lo dice e si compila a mano */});
  };
  const reviewDraft=()=>{
    try{prepareSalLines(voci,orderTotalAmount);setFormError("");setReview(true);}
    catch(e){setFormError(e instanceof Error ? e.message : tr("Controlla le voci del SAL."));setMostraTutte(true);}
  };

  // ── Avanzamento incassi (piano rate della commessa) ─────────────────
  // Stessa matematica di FinancialSummaryReadOnly: il saldo è il residuo del
  // totale ivato al netto delle altre rate e del costo finanziaria.
  const totalWithVat = (orderTotalAmount ?? 0) * (1 + vatRate / 100);
  // Piani a 3+ rate: SAL intermedi e saldo arrivano ENTRAMBI come 'balance'
  // (il tipo rata non conosce altro). Solo l'ULTIMA balance è il residuo
  // calcolato: le intermedie valgono il loro importo — prima ogni riga
  // 'balance' mostrava l'intero residuo (68.000 € su due righe diverse).
  const posSaldoFinale = (installments ?? []).reduce<number | null>(
    (acc, i) => (i.type === "balance" ? Math.max(acc ?? i.position, i.position) : acc),
    null,
  );
  const isSaldoFinale = (i: { type: string; position: number }) =>
    i.type === "balance" && i.position === posSaldoFinale;
  const sommaAltreRate = (installments ?? [])
    .filter((i) => !isSaldoFinale(i))
    .reduce((s, i) => s + i.amount, 0);
  const balanceAmount = Math.max(0, totalWithVat - sommaAltreRate - costoDaSottrarreAlSaldo(financingCost, financingCostMode));
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const recapRows = (installments ?? [])
    .map((inst) => ({ inst, amount: inst.documento_quota_lorda != null ? Number(inst.documento_quota_lorda) : isSaldoFinale(inst) ? balanceAmount : inst.type === "financing" && financingCostMode === "trattenuto" ? Math.max(0, inst.amount - financingCost) : inst.amount }))
    .filter(({ inst, amount }) => amount > 0 || inst.type === "balance")
    .map((row) => ({
      ...row,
      scaduta: !row.inst.is_paid && !!row.inst.expected_date && new Date(row.inst.expected_date) < oggi,
    }));
  const incassato = recapRows.filter((r) => r.inst.is_paid).reduce((s, r) => s + r.amount, 0);
  const incassoTarget = Math.max(0, totalWithVat - costoTrattenuto(financingCost, financingCostMode));
  const incassoPct = incassoTarget > 0 ? Math.round((incassato / incassoTarget) * 100) : 0;
  const rateIncassate = recapRows.filter((r) => r.inst.is_paid).length;
  const fmtDateIt = (d: string) => {
    try { return new Date(d).toLocaleDateString(intlCampo()); } catch { return d; }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if(isError || listIssues.length)return <div role="alert" className="rounded-lg border p-4 text-sm space-y-2"><p>{listIssues[0] || tr("Storico SAL non disponibile. Non vengono calcolati importi su uno storico incompleto.")}</p><Button variant="outline" size="sm" onClick={()=>void refetch()}>{tr("Riprova SAL")}</Button></div>;

  const searchSal = salSearch.trim().toLocaleLowerCase("it");
  // Si filtra solo la vista: precedenti, quote e numerazione usano sempre lo storico completo.
  const visibleSal = salList.filter(sal => {
    const rata = installments?.find(i => i.id === sal.installment_id);
    const text = [`SAL ${sal.numero_sal}`, `SAL #${sal.numero_sal}`, fmtDate(sal.data_emissione), sal.data_emissione, STATO_LABELS[sal.stato], sal.note, rata?.label, ...(sal.sal_voci ?? []).map(v => v.descrizione)].join(" ").toLocaleLowerCase("it");
    return (salStatus === "tutti" || salStatus === sal.stato) && (!searchSal || text.includes(searchSal));
  });

  return (
    <div className="sal-workspace space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileBarChart2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">{tr("Verbali SAL (documenti)")}</h3>
          {salList.length > 0 && (
            <Badge variant="secondary">{salList.length}</Badge>
          )}
        </div>
        {/* Con la lista vuota il CTA vive nell'empty state qui sotto:
            due bottoni identici nella stessa card erano solo rumore. */}
        {puoFareSal && salList.length > 0 && (
          <Button size="sm" disabled={blocked} onClick={() => openComposer()}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> {tr("Nuovo verbale")}
          </Button>
        )}
      </div>

      {(() => {
        const ultimo = salList.find((x) => x.stato !== "bozza");
        if (!ultimo || !vedeImporti) return null;
        const contrattuale = (ultimo.sal_voci ?? []).reduce((t, v) => t + Number(v.importo_contrattuale), 0);
        const eseguito = Number(ultimo.importo_totale);
        const numero = (titolo: string, valore: string, nota?: string) => (
          <div><dt className="text-xs text-muted-foreground">{titolo}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{valore}</dd>{nota && <dd className="text-[11px] text-muted-foreground">{nota}</dd>}</div>
        );
        return (
          <dl aria-label={tr("Riepilogo dei SAL")} className="sal-workspace-overview grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-4">
            {numero(tr("Voci del contratto"), formatCurrency(contrattuale))}
            {numero(tr("Eseguito a tutto l'ultimo SAL"), formatCurrency(eseguito), tr("verbale {n}", { n: ultimo.numero_sal }))}
            {numero(tr("Avanzamento"), contrattuale > 0 ? `${Math.round((eseguito / contrattuale) * 1000) / 10}%` : "—")}
            {numero(tr("Resta da eseguire"), formatCurrency(Math.max(0, contrattuale - eseguito)))}
          </dl>
        );
      })()}

      {lavoroPubblico && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span>{tr("Lavoro pubblico: libretto delle misure, SAL e certificati di pagamento si fanno nella contabilità del computo.")}</span>
          <ApriComputoCommessa orderId={orderId} />
        </div>
      )}

      {!vedeImporti && (
        <p role="note" className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {tr("I SAL li prepara ed emette chi ha il permesso «Venduto e importi»: qui li vedi con le percentuali, senza importi.")}
        </p>
      )}

      {/* Il punto che vale tutto il capitolo: il SAL è una misura del lavoro
          eseguito, non una scadenza sul calendario. */}
      <details className="rounded-lg border bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground">{tr("Come funziona il SAL e quando matura la rata")}</summary>
        <div className="px-3 pb-3"><SalPlanInfo companyId={companyId} installments={installments ?? []}/></div>
      </details>

      {/* Avanzamento incassi: riporta qui il piano rate della commessa (lo
          stesso Riepilogo Finanziario di creazione/modifica) così lo stato
          finanziario è visibile direttamente nella sezione SAL. */}
      {showPaymentProgress && vedeImporti && recapRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" aria-hidden="true" />
                {tr("Avanzamento incassi")}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {tr("{incassate}/{totale} rate incassate", { incassate: rateIncassate, totale: recapRows.length })}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {tr("Incassato {incassato} su {totale}", { incassato: formatCurrency(incassato), totale: formatCurrency(incassoTarget) })}
                </span>
                <span className="font-semibold">{Math.min(100, incassoPct)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${Math.min(100, incassoPct)}%` }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              {recapRows.map(({ inst, amount, scaduta }) => (
                <div key={inst.position} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-muted-foreground truncate">{inst.label}</span>
                    {(() => {
                      // Il verbale collegato alla rata: quando matura (emesso, o approvato dal
                      // cliente: lo sceglie l'azienda) la rata è MATURATA — via libera alla fattura.
                      const salRata = inst.id ? salList.find((sr) => sr.installment_id === inst.id) : undefined;
                      if (!salRata) return null;
                      return (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            salMaturato(salMatura, salRata.stato)
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                          }`}
                          title={tr("Verbale SAL n. {n} — {stato}", { n: salRata.numero_sal, stato: tr(STATO_LABELS[salRata.stato]) })}
                        >
                          <FileBarChart2 className="h-3 w-3" aria-hidden="true" />
                          SAL {salRata.numero_sal}
                          {salMaturato(salMatura, salRata.stato) ? ` · ${tr("maturata")}` : ""}
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-medium">{formatCurrency(amount)}</span>
                    {inst.is_paid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        {inst.paid_date ? tr("Pagato il {data}", { data: fmtDateIt(inst.paid_date) }) : tr("Pagato")}
                      </span>
                    ) : (
                      <span
                        className={
                          scaduta
                            ? "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300"
                            : "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        }
                      >
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {scaduta ? tr("Scaduta") : tr("Non pagato")}
                        {inst.expected_date ? ` · ${tr("prev. {data}", { data: fmtDateIt(inst.expected_date) })}` : ""}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tr("Per segnare una rata come pagata usa i bottoni Pagato/Non pagato nel Riepilogo Finanziario (sezione Pagamenti).")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* SAL = rata: il piano rate aspetta questi verbali. «Emetti» apre il verbale già legato alla sua rata. */}
      {(() => {
        const attesi = rateSalDaEmettere(installments ?? [], salList);
        if (attesi.length === 0) return null;
        return (
          <Card className="border-dashed">
            <CardHeader className="pb-2 max-sm:p-3 max-sm:pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileBarChart2 className="h-4 w-4 text-primary" aria-hidden="true" />
                {tr("Rate previste al SAL")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 max-sm:p-3 max-sm:pt-0">
              {attesi.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {inst.trigger_numero ? tr("SAL n. {n}", { n: inst.trigger_numero }) : "SAL"} <span className="text-muted-foreground">· {inst.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{euro(inst.amount)}</span>
                    {puoFareSal && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={blocked} onClick={() => openComposer(inst.id ?? "")}>
                      {tr("Prepara SAL")}
                    </Button>}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {salList.length === 0 ? (
        /* Empty state compatto: per gli incassi c'è già la card qui sopra.
           I verbali servono solo a bonus edilizi, banche e appalti — una riga
           informativa basta, senza rubare spazio alla pagina. */
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground flex items-center gap-2 min-w-0">
              <FileBarChart2 className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              <span>{puoFareSal ? tr("Nessun verbale. Crea una bozza dalle fasi oppure compila le voci a mano.") : tr("Nessun verbale SAL su questa commessa.")}</span>
            </p>
            {puoFareSal && <Button size="sm" variant="outline" disabled={blocked} onClick={() => openComposer()}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> {tr("Crea verbale")}
            </Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="sal-records-toolbar">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input aria-label={tr("Cerca verbale SAL")} value={salSearch} onChange={e => setSalSearch(e.target.value)} placeholder={tr("Cerca numero, data, rata o lavorazione…")} className="pl-9 pr-9" />{salSearch && <button type="button" aria-label={tr("Cancella ricerca SAL")} className="absolute right-2 top-2 rounded p-1 hover:bg-muted" onClick={() => setSalSearch("")}><X className="h-4 w-4" aria-hidden="true" /></button>}</div>
            <OfficeSelect label={tr("Stato dei verbali SAL")} value={salStatus} onValueChange={setSalStatus} className="sal-status-filter" options={[
              { value: "tutti", label: tr("Tutti gli stati ({n})", { n: salList.length }) },
              ...Object.entries(STATO_LABELS).map(([value, label]) => ({ value, label: `${tr(label)} (${salList.filter(s => s.stato === value).length})` })),
            ]} />
            <p role="status" className="sal-records-count">{tr("{visibili} di {totale} verbali · più recenti prima", { visibili: visibleSal.length, totale: salList.length })}{vedeImporti ? ` · ${tr("importi netti, IVA esclusa")}` : ` · ${tr("importi riservati")}`}</p>
          </div>
          {visibleSal.length === 0 && <div className="rounded-lg border border-dashed p-5 text-center text-sm"><p className="font-medium">{tr("Nessun verbale corrisponde ai filtri.")}</p><Button variant="link" size="sm" onClick={() => { setSalSearch(""); setSalStatus("tutti"); }}>{tr("Mostra tutti i verbali")}</Button></div>}
          {visibleSal.map((sal) => {
            const precedente = maturatoPrecedente(sal, salList);
            const certificato = certificatoDelSal(sal.sal_certificati);
            const quotaNuova = nettoSal(sal.importo_totale, precedente).daFatturare;
            const rata = sal.installment_id ? installments?.find((i) => i.id === sal.installment_id) : undefined;
            const fatturaId = rata?.documento_fiscale_id;
            return (
            <Card key={sal.id} role="article" aria-label={`SAL #${sal.numero_sal}`} className="sal-record" data-stato={sal.stato}>
              <CardHeader className="sal-record-header pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      SAL #{sal.numero_sal}
                      <Badge className="sal-record-status" variant={STATO_COLORS[sal.stato] as "secondary" | "default" | "outline" | "destructive"}>
                        {tr(STATO_LABELS[sal.stato])}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sal.stato==="bozza" ? tr("Bozza del {data}", { data: fmtDate(sal.data_emissione) }) : tr("Emesso il {data}", { data: fmtDate(sal.data_emissione) })} · {tr((sal.sal_voci?.length ?? 0) === 1 ? "{n} voce" : "{n} voci", { n: sal.sal_voci?.length ?? 0 })}
                    </p>
                    {salEmissionIssue(sal,salList) && <p className="text-xs text-amber-700 mt-1 max-w-xl">{salEmissionIssue(sal,salList)}</p>}
                  </div>
                  <div className="sal-record-actions flex flex-wrap items-center gap-1">
                    {(() => {
                      const prossimo = prossimoStatoSal(sal.stato);
                      if (!prossimo || !puoFareSal) return null;
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={cambiaStato.isPending || blocked || !salMatura || !sal.sal_voci?.length || !!salEmissionIssue(sal,salList)}
                          onClick={async () => {
                            const ok=await confirm({title:prossimo.stato==="emesso" ? tr("Emettere il SAL #{n}?", { n: sal.numero_sal }) : tr("Registrare l'approvazione del SAL #{n}?", { n: sal.numero_sal }),description:prossimo.stato==="emesso" ? tr("Il verbale esce dalla bozza. La rata può maturare secondo la regola aziendale, ma non viene creata una fattura, inviata un'email o registrato un incasso.") : tr("Registra solo un'approvazione realmente ottenuta. Questo comando non appone la firma del cliente e può far maturare la rata collegata."),confirmLabel:tr(prossimo.etichetta)});
                            if(ok)cambiaStato.mutate({id:sal.id,stato:prossimo.stato});
                          }}
                        >
                          {tr(prossimo.etichetta)}
                        </Button>
                      );
                    })()}
                    {permissions.canViewBilling && vedeImporti && fatturaId && (onApriBozzaFattura && rata?.fattura?.stato === "bozza" ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => onApriBozzaFattura(fatturaId)}>
                        <Receipt className="h-3.5 w-3.5" aria-hidden />
                        {tr("Apri fattura")}
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/azienda/documenti/${fatturaId}/dettaglio`}>
                          <Receipt className="h-3.5 w-3.5" aria-hidden />
                          {tr("Apri fattura")}
                        </Link>
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setVerbaleDi(sal)}
                      aria-label={tr("Anteprima e stampa SAL")}
                      disabled={!vedeImporti || isExporting}
                      title={!vedeImporti ? tr("Il verbale contiene importi: serve il permesso Venduto e importi.") : tr("Apri le opzioni e l’anteprima del verbale")}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr("Verbale PDF")}
                    </Button>
                    {puoFareSal && sal.stato === "bozza" && <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: tr("Eliminare il SAL #{n}?", { n: sal.numero_sal }),
                            description:
                              tr("Lo stato avanzamento lavori verrà rimosso definitivamente. L'operazione non può essere annullata."),
                            confirmLabel: tr("Elimina"),
                            variant: "destructive",
                          })
                        ) {
                          deleteSalMutation.mutate(sal.id);
                        }
                      }}
                      disabled={deleteSalMutation.isPending}
                      aria-label={tr("Elimina SAL")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>}
                    {puoFareSal && ["emesso","approvato"].includes(sal.stato) && <Button variant="outline" size="sm" disabled={signatureBusy || blocked} onClick={async()=>{
                      if(signatureBusy)return;setSignatureBusy(true);
                      try{const {data,error}=await supabase.functions.invoke("generate-sal-pdf",{body:{sal_id:sal.id,company_id:companyId,prepare_signature:true}});
                        if(error || typeof data?.signature_url!=="string" || !/^https:\/\//.test(data.signature_url))throw new Error(tr("Link cliente non confermato."));
                        setSignatureUrl(data.signature_url);
                      }catch(e){toast.error(e instanceof Error?e.message:tr("Link non disponibile"));}finally{setSignatureBusy(false);}
                    }}>{tr("Prepara link cliente")}</Button>}
                  </div>
                </div>
              </CardHeader>
              {vedeImporti && <dl className="sal-record-amounts" aria-label={tr("Importi SAL {n}", { n: sal.numero_sal })}>
                <div><dt>{tr("Avanzamento cumulativo netto")}</dt><dd>{formatCurrency(sal.importo_totale)}</dd></div>
                <div><dt>{tr("Già riconosciuto nei SAL precedenti")}</dt><dd>{formatCurrency(precedente)}</dd></div>
                <div data-rettifica={quotaNuova < 0}><dt>{quotaNuova < 0 ? tr("Rettifica da verificare") : tr("Quota nuova del SAL")}</dt><dd>{formatCurrency(quotaNuova)}</dd>{certificato && <small>{tr("Prima delle detrazioni del certificato")}</small>}</div>
              </dl>}
              {vedeImporti && <div className="sal-record-support">
                    <CertificatoSal salId={sal.id} orderId={orderId} companyId={companyId} numero={sal.numero_sal} cumulativo={sal.importo_totale}
                      certificato={certificatoDelSal(sal.sal_certificati)}
                      precedente={certificatoPrecedente(sal,salList)}
                      giaMaturato={maturatoPrecedente(sal,salList)}
                      bloccato={certificatoBloccato(sal,salList,installments ?? [])}
                      opzioni={{anticipazione,contratto:orderTotalAmount,ritenutaContratto}}
                      puoModificare={puoFareSal && !blocked}/>
                    {(() => {
                      const cert = certificatoDelSal(sal.sal_certificati);
                      if (!cert || sal.stato === "bozza" || !(Number(cert.ritenuta) > 0) || !permissions.isAdmin || !salNelRegistro) return null;
                      if (salNelRegistro.has(sal.id)) return <p className="mt-0.5 text-xs text-muted-foreground">{tr("Ritenuta nel registro «Ritenute a garanzia»: torna allo svincolo.")}</p>;
                      return (
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-amber-700">
                          {tr("La ritenuta di questo SAL non è nel registro delle ritenute: senza, nessuno ricorda di farsela restituire.")}
                          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={registraRitenuta.isPending} onClick={() => registraRitenuta.mutate(sal.id)}>{tr("Registra la ritenuta")}</Button>
                        </p>
                      );
                    })()}
                    {(() => {
                      // La rata certificata da questo verbale (SAL = rata): quando matura è da incassare; se vale
                      // altro del SAL (con l'IVA), si propone di allinearla.
                      if (!rata) return null;
                      const mostrato = recapRows.find((r) => r.inst.id === rata.id)?.amount ?? rata.amount;
                      const proposta = rataDaAllineareAlSal({
                        rata,
                        saldoFinale: isSaldoFinale(rata),
                        importoMostrato: mostrato,
                        nettoDaFatturare: certificatoDelSal(sal.sal_certificati) ? Number(certificatoDelSal(sal.sal_certificati)!.netto) : nettoSal(sal.importo_totale, maturatoPrecedente(sal, salList)).daFatturare,
                        aliquotaIva: vatRate,
                      });
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {tr("Rata «{rata}»: {importo} · IVA inclusa", { rata: rata.label, importo: formatCurrency(mostrato) })}
                            {rata.is_paid ? ` · ${tr("incassata")}` : salMaturato(salMatura, sal.stato) ? ` · ${tr("da incassare")}` : ""}
                          </span>
                          {puoFareSal && proposta !== null && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              disabled={sostituisciRate.isPending}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: tr("Portare la rata a {importo}?", { importo: formatCurrency(proposta) }),
                                  description: tr("La quota nuova di questo SAL vale {importo} con l'IVA. Verifica separatamente approvazione, acconti e fatture già emesse. Le provvigioni sulla rata si ricalcolano sul nuovo importo.", { importo: formatCurrency(proposta) }),
                                  confirmLabel: tr("Cambia la rata"),
                                });
                                if (ok) {
                                  sostituisciRate.mutate((installments ?? []).map((r) => rataPerServer(r.id === rata.id ? { ...r, amount: proposta, importo_da_misurare: false } : r)));
                                }
                              }}
                            >
                              {tr("Imposta la rata a {importo}", { importo: formatCurrency(proposta) })}
                            </Button>
                          )}
                        </div>
                      );
                    })()}

              </div>}
              {sal.sal_voci?.length > 0 && (
                <CardContent className="sal-record-details pt-0">
                  <Button type="button" variant="ghost" size="sm" aria-haspopup="dialog"
                    className="w-full justify-between rounded-none border-t px-2 text-muted-foreground"
                    onClick={(event) => {
                      pulsanteDettaglioSal.current = event.currentTarget;
                      setDettaglioSalId(sal.id);
                    }}>
                    <span>{tr("Voci del verbale ({n})", { n: sal.sal_voci.length })}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </CardContent>
              )}
            </Card>
          );})}
        </div>
      )}

      {dettaglioSal && (
        <Dialog open onOpenChange={(aperto) => { if (!aperto) setDettaglioSalId(null); }}>
          <DialogContent ampiezza="modulo" struttura="contenuta" className="sal-record-dialog gap-0 p-0"
            onCloseAutoFocus={(event) => {
              if (pulsanteDettaglioSal.current?.isConnected) {
                event.preventDefault();
                pulsanteDettaglioSal.current.focus();
              }
            }}>
            <DialogHeader className="border-b px-4 py-3 pr-11">
              <DialogTitle>{tr("Voci del verbale · SAL n. {n}", { n: dettaglioSal.numero_sal })}</DialogTitle>
              <DialogDescription>
                {tr(STATO_LABELS[dettaglioSal.stato])} · {fmtDate(dettaglioSal.data_emissione)} · {tr(dettaglioSal.sal_voci.length === 1 ? "{n} voce" : "{n} voci", { n: dettaglioSal.sal_voci.length })}
              </DialogDescription>
            </DialogHeader>
            <SalRecordPhases key={dettaglioSal.id} fasi={dettaglioSal.sal_voci} totale={dettaglioSal.importo_totale}
              precedente={precedenteDettaglio} fasiPrecedenti={salPrimaDelDettaglio ? salPrimaDelDettaglio.sal_voci ?? [] : null}
              certificato={vedeImporti ? certificatoDelSal(dettaglioSal.sal_certificati) : null}
              certificatoPrima={vedeImporti ? certificatoDelSal(salPrimaDelDettaglio?.sal_certificati) : null}
              pdfInCorso={isExporting}
              onScaricaPdf={(formato) => void handleExportPdf(dettaglioSal, [], [], formato, true)}
              nota={dettaglioSal.note} vedeImporti={vedeImporti} />
          </DialogContent>
        </Dialog>
      )}

      {/* Create SAL Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open=>{if(saving.current||createSalMutation.isPending)return;setDialogOpen(open);if(!open)draftRevision.current++;}}>
        <DialogContent ampiezza="modulo" className="sal-draft-dialog max-h-[90dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b p-4 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <FileBarChart2 className="h-5 w-5" aria-hidden="true" />
              {review ? tr("Controlla il SAL") : tr("Nuova bozza SAL")}
            </DialogTitle>
            <DialogDescription>{tr("Compila i lavori eseguiti fino a oggi, poi controlla e salva il verbale.")}</DialogDescription>
            <ol aria-label={tr("Passaggi del verbale SAL")} className="sal-draft-steps">
              <li aria-current={!review ? 'step' : undefined}><span>1</span> {tr("Lavorazioni")}</li>
              <li aria-current={review ? 'step' : undefined}><span>2</span> {tr("Riepilogo e salvataggio")}</li>
            </ol>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto p-4 space-y-4">
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          {review && <Button variant="outline" size="sm" disabled={createSalMutation.isPending} onClick={()=>{setReview(false);setRettifica(false);}}>{tr("Modifica bozza")}</Button>}
            <div className="sal-draft-overview" aria-label={tr("Riepilogo economico del verbale")}>
              <div><span>{tr("Già riconosciuto")}</span><strong>{formatCurrency(precedenteNuovo)}</strong><small>{tr("Nei SAL precedenti")}</small></div>
              <div data-rettifica={nuoviLavori < 0}><span>{tr("Nuovi lavori")}</span><strong>{formatCurrency(nuoviLavori)}</strong><small>{tr("{importo} eseguiti a oggi", { importo: formatCurrency(totalDialogImporto) })}</small></div>
              <div data-rettifica={daPagare !== null && daPagare < 0}><span>{daPagare !== null && daPagare < 0 ? tr("Rettifica") : tr("Da pagare per questo SAL")}</span><strong>{daPagare === null ? tr("Da verificare") : formatCurrency(daPagare)}</strong><small>{tr("IVA esclusa")}</small></div>
            </div>
          <fieldset hidden={review} className="space-y-4 min-w-0" disabled={review || createSalMutation.isPending || !puoFareSal}>

            {Math.round(totalDialogImporto * 100) > Math.round(orderTotalAmount * 100) && orderTotalAmount > 0 && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{tr("Le voci riconoscono {differenza} in più rispetto al contratto netto di {contratto}. Verifica gli importi delle fasi e le eventuali varianti prima di emettere il SAL.", { differenza: formatCurrency(totalDialogImporto - orderTotalAmount), contratto: formatCurrency(orderTotalAmount) })}</p>}

            {orderTotalAmount > 0 && contrattualeVoci < orderTotalAmount - .01 && <p className="sal-contract-gap" role="note">{tr("{importo} del contratto netto ancora da ripartire nelle lavorazioni. Verifica gli importi prima dell’emissione.", { importo: formatCurrency(orderTotalAmount - contrattualeVoci) })}</p>}
            {/* Voci */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div><h3 className="text-sm font-semibold">{tr("Lavorazioni da certificare")}</h3><p className="text-xs text-muted-foreground">{tr("Aggiorna le quantità o le percentuali. Gli importi sono al netto dell’IVA.")}</p></div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => { const v=vociSalDaFasi(fasiSal,precedentiVoci);if(!v.length)return;
                      const hasInput=voci.some(v=>v.descrizione.trim() || v.importo_contrattuale.trim());
                      if(hasInput && !(await confirm({title:tr("Sostituire le voci della bozza?"),description:tr("I dati già scritti saranno sostituiti dalle lavorazioni della commessa."),confirmLabel:tr("Usa le fasi")})))return;
                      draftRevision.current++;setVoci(v);setFasiInvariate(fasiSenzaCambi(v,precedentiVoci)); }}
                    disabled={fasiSal.length === 0}
                    className="gap-1"
                    title={tr("Compila le voci dalle fasi di lavorazione: descrizione e % di avanzamento dichiarate in cantiere")}
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    {tr("Dalle fasi")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => aiSuggestMutation.mutate()}
                    disabled={aiSuggestMutation.isPending}
                    className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                    title={tr("Suggerisci voci e % avanzamento dall'AI")}
                  >
                    {aiSuggestMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    {tr("Suggerisci AI")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={addVoce}>
                    <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> {tr("Aggiungi voce")}
                  </Button>
                </div>
              </div>
              {fasiError && <p role="alert" className="text-xs text-destructive">{tr("Fasi non disponibili: compila a mano o")} <button type="button" className="underline" onClick={()=>void refetchFasi()}>{tr("riprova le fasi")}</button>.</p>}


              {vociNascoste > 0 && (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  {vociNascoste === 1 ? tr("1 voce è uguale al SAL n. {numero}: restano nel verbale con gli stessi importi. Puoi aprirle dalla colonna delle fasi.", { numero: precedentiVoci.numero ?? "" }) : tr("{n} voci sono uguali al SAL n. {numero}: restano nel verbale con gli stessi importi. Puoi aprirle dalla colonna delle fasi.", { n: vociNascoste, numero: precedentiVoci.numero ?? "" })}{" "}

                </p>
              )}
              <SalDraftPhases key={`${formError ? "errore" : "bozza"}-${voci.length}`} lines={voci} previous={precedentiVoci} unchanged={fasiInvariate} showAll={mostraTutte}
                onShowAll={() => setMostraTutte(true)} onChange={updateVoce} onSubphaseChange={updateSottofase} onRemove={removeVoce} />
            </div>

            <details className="sal-payment-settings">
              <summary><span>{tr("Pagamento, ritenute e note")} <small>{tr("Facoltativo · scegli la rata e controlla il netto")}</small></span><span className="text-primary">{conCertificato && certificatoNuovo ? formatCurrency(certificatoNuovo.netto) : tr("Imposta")}</span></summary>
              <div className="space-y-4 border-t p-3">
            {/* Rata certificata: il piano rate nasce dagli importi del
                contratto, e ogni verbale SAL matura la sua rata. Facoltativo
                per non bloccare chi usa i SAL come soli documenti. */}
            {(installments ?? []).length > 0 && (
              <div className="space-y-2">
                <Label>{tr("Rata collegata")} <span className="font-normal text-muted-foreground">· {tr("facoltativa")}</span></Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={rataCollegata === ""}
                    onClick={() => impostaRata("")}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      rataCollegata === ""
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {tr("Nessuna")}
                  </button>
                  {recapRows.map(({ inst, amount }) => (
                    <button
                      key={inst.position}
                      type="button"
                      aria-pressed={rataCollegata === inst.id}
                      title={!inst.id ? tr("Salva prima il piano rate.") : salList.some(s => s.installment_id === inst.id) ? tr("Già collegata al SAL n. {n}", { n: salList.find(s => s.installment_id === inst.id)?.numero_sal ?? "" }) : tr("Collega questa rata al verbale")}
                      disabled={!inst.id || salList.some(s=>s.installment_id===inst.id)}
                      onClick={() => { if (inst.id) impostaRata(inst.id); }}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                        rataCollegata === inst.id
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {inst.label} · {formatCurrency(amount)}
                      {rataSuggerita && rataSuggerita === inst.id && <span className="ml-1 text-xs text-muted-foreground">· {tr("suggerita dal piano")}</span>}
                      {salList.some(s => s.installment_id === inst.id) && <span className="ml-1 text-xs">· {tr("SAL n. {n}", { n: salList.find(s => s.installment_id === inst.id)?.numero_sal ?? "" })}</span>}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{recapRows.every(({ inst }) => !inst.id || salList.some(s => s.installment_id === inst.id)) ? tr("Le rate sono già collegate ai verbali o non ancora salvate. Puoi proseguire senza rata.") : tr("Puoi collegare una rata del piano anche quando il verbale nasce dalle lavorazioni.")}</p>
              </div>
            )}

            {rataScelta && <p className="text-xs text-muted-foreground">
              {tr("SAL n. {numero}. La rata «{rata}» vale {importo} IVA inclusa.", { numero: numeroNuovo, rata: rataScelta.label, importo: formatCurrency(recapRows.find(r => r.inst.id === rataScelta.id)?.amount ?? rataScelta.amount) })}
            </p>}

            {/* Certificato di pagamento: nello stesso modulo, non più un passaggio a parte (lotto C). */}
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={conCertificato} onChange={(e) => {draftRevision.current++;setConCertificato(e.target.checked);}} />
                {tr("Certificato di pagamento")}
              </label>
              {!conCertificato && anticipazione > 0 && <p className="text-xs text-amber-700">{tr("C'è un acconto di {importo} senza IVA già fatturato o incassato: senza certificato questo SAL lo fattura una seconda volta.", { importo: formatCurrency(anticipazione) })}</p>}
              {conCertificato && (
                <>
                  <div className="sal-certificate-layout"><div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="cert-nuovo-ritenuta" className="text-xs">{tr("Ritenuta di garanzia %")}</Label>
                      <Input id="cert-nuovo-ritenuta" inputMode="decimal" className="h-8 text-sm" value={certRitenuta}
                        placeholder={String(certificatoNuovo?.ritenuta_pct ?? certificatoPrima?.ritenuta_pct ?? ritenutaContratto ?? 0)}
                        onChange={(e) => {draftRevision.current++;setCertRitenuta(e.target.value);}} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cert-nuovo-recupero" className="text-xs">{tr("Recupero acconto (totale a oggi)")}</Label>
                      <Input id="cert-nuovo-recupero" inputMode="decimal" className="h-8 text-sm" value={certRecupero}
                        placeholder={String(certificatoNuovo?.recupero_anticipazione ?? 0)}
                        onChange={(e) => {draftRevision.current++;setCertRecupero(e.target.value);}} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cert-nuovo-altre" className="text-xs">{tr("Altre detrazioni (totale a oggi)")}</Label>
                      <Input id="cert-nuovo-altre" inputMode="decimal" className="h-8 text-sm" value={certAltre}
                        placeholder={String(certificatoPrima?.altre_detrazioni ?? 0)}
                        onChange={(e) => {draftRevision.current++;setCertAltre(e.target.value);}} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cert-nuovo-nota" className="text-xs">{tr("Motivo delle detrazioni")}</Label>
                      <Input id="cert-nuovo-nota" className="h-8 text-sm" value={certNota} placeholder={certificatoPrima?.altre_detrazioni_nota ?? ""}
                        onChange={(e) => {draftRevision.current++;setCertNota(e.target.value);}} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="mr-1 text-muted-foreground">{tr("Arrotonda il netto")}</span>
                    {([0, 10, 100] as const).map((passo) => (
                      <button key={passo} type="button" aria-pressed={arrotondamento === passo}
                        onClick={() => {draftRevision.current++;setCertArrotonda(passo);}}
                        className={`rounded-md border px-2 py-1 ${arrotondamento === passo ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>
                        {passo === 0 ? tr("No") : tr("a {n} €", { n: passo })}
                      </button>
                    ))}
                  </div>
                  </div><div className="sal-certificate-calculation">
                  {certificatoNuovo ? (
                    <dl aria-label={tr("Certificato di pagamento")} className="space-y-0.5 text-sm">
                      {([
                        [tr("Lavori a tutto il SAL"), certificatoNuovo.lavori_contrattuali + certificatoNuovo.varianti],
                        [tr("Ritenuta {pct}%", { pct: certificatoNuovo.ritenuta_pct.toLocaleString(intlCampo()) }), -certificatoNuovo.ritenuta],
                        ...(certificatoNuovo.recupero_anticipazione > 0 ? [[tr("Recupero anticipazione"), -certificatoNuovo.recupero_anticipazione] as [string, number]] : []),
                        ...(certificatoNuovo.altre_detrazioni > 0 ? [[tr("Altre detrazioni"), -certificatoNuovo.altre_detrazioni] as [string, number]] : []),
                        [tr("Acconti già certificati"), -certificatoNuovo.acconti_precedenti],
                        ...(Number(certificatoNuovo.rinviato) > 0 ? [[tr("Rinviato al prossimo certificato"), -Number(certificatoNuovo.rinviato)] as [string, number]] : []),
                      ] as Array<[string, number]>).map(([t, v]) => (
                        <div key={t} className="flex justify-between text-muted-foreground"><dt>{t}</dt><dd className="tabular-nums">{formatCurrency(v)}</dd></div>
                      ))}
                      <div className="flex justify-between font-semibold"><dt>{tr("Netto del certificato")}</dt><dd className="tabular-nums">{formatCurrency(certificatoNuovo.netto)}</dd></div>
                      <div className="flex justify-between text-muted-foreground"><dt>{tr("Con l'IVA {pct}%", { pct: vatRate })}</dt><dd className="tabular-nums">{formatCurrency(rataDaSal(certificatoNuovo.netto, vatRate))}</dd></div>
                    </dl>
                  ) : <p role="alert" className="text-xs text-destructive">{certificatoNegativo
                    ? tr("Il netto del certificato viene {importo}: ritenuta, detrazioni e acconti superano i lavori di questo verbale. Controlla le voci e le detrazioni, oppure togli il certificato se è una rettifica.", { importo: formatCurrency(certificatoCalcolato!.netto) })
                    : tr("Ritenuta tra 0 e 100%, detrazioni non negative.")}</p>}
                  </div></div>
                  {anticipazione > 0 && <p className="text-[11px] text-muted-foreground">{tr("Acconto già fatturato o incassato: {importo} senza IVA. Si recupera in proporzione ai lavori, così all'ultimo SAL è tolto tutto.", { importo: formatCurrency(anticipazione) })}</p>}
                  {!certificatoPrima && !(ritenutaContratto ?? 0) && !ritenutaScritta && <p className="text-[11px] text-muted-foreground">{tr("Il contratto non dice una ritenuta di garanzia: scrivila se l'avete concordata.")}</p>}
                  <p className="text-[11px] text-muted-foreground">{certificatoPrima ? tr("Gli acconti sono il netto dei certificati prima: non si riscrivono a mano. Quello che l'arrotondamento toglie torna nel certificato dopo.") : tr("Gli acconti sono il netto dei certificati prima (o il cumulativo dei SAL emessi): non si riscrivono a mano. Quello che l'arrotondamento toglie torna nel certificato dopo.")}</p>
                </>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="sal-notes">{tr("Note SAL · visibili al cliente")}</Label>
              <Textarea
                id="sal-notes"
                value={note}
                onChange={(e) => {draftRevision.current++;setNote(e.target.value);}}
                placeholder={tr("Condizioni o annotazioni per il cliente. Non inserire costi o note riservate.")}
                rows={2}
                className="resize-none"
              />
            </div>
              </div>
            </details>
          </fieldset>
          {review && <section aria-label={tr("Controllo del verbale SAL")} className="space-y-3">
            <h3 className="text-sm font-semibold">{tr("SAL n. {numero} · Verifica prima di salvare", { numero: numeroNuovo })}</h3>
            <div className="sal-review-payment rounded-lg border p-3 text-sm">
              <dl aria-label={tr("Calcolo del pagamento del periodo")}>
                <div><dt>{tr("Nuovi lavori")}</dt><dd>{formatCurrency(nuoviLavori)}</dd></div>
                {detrazioni.map(({ label, amount }) => <div key={label}><dt>{label}</dt><dd>{amount > 0 ? "+" : "−"} {formatCurrency(Math.abs(amount))}</dd></div>)}
                <div className="font-semibold text-primary"><dt>{daPagare !== null && daPagare < 0 ? tr("Importo della rettifica") : tr("Da pagare per questo SAL")}</dt><dd>{daPagare === null ? tr("Da verificare") : formatCurrency(daPagare)}</dd></div>
                {daPagare !== null && daPagare >= 0 && <div><dt>{tr("Con IVA {pct}%", { pct: vatRate })}</dt><dd>{formatCurrency(rataDaSal(daPagare, vatRate))}</dd></div>}
              </dl>
              {conCertificato && !certificatoNuovo && <p className="text-destructive mt-2">{tr("Il certificato va corretto. Torna alla bozza e controlla le detrazioni.")}</p>}
              <p className="mt-2"><strong>{tr("Rata collegata:")}</strong> {rataScelta ? `${rataScelta.label} · ${tr("{importo} IVA inclusa", { importo: formatCurrency(recapRows.find(r => r.inst.id === rataScelta.id)?.amount ?? rataScelta.amount) })}` : tr("Nessuna")}</p>
              {note && <p className="mt-2 whitespace-pre-wrap">{note}</p>}
            </div>
            <div className="sal-phase-table-scroll"><table className="sal-phase-table sal-review-table"><thead><tr><th>{tr("Lavorazione")}</th><th>{tr("SAL precedente")}</th><th>{tr("A oggi")}</th><th>{tr("Eseguito netto")}</th></tr></thead>
              <tbody>{voci.map((v, i) => {
                const prima = percentualePrecedenteVoce(v, precedentiVoci);
                return <tr key={i}><td>{v.descrizione}{!!v.sottofasi?.length && <small className="block text-muted-foreground">{tr(v.sottofasi.length === 1 ? "{n} voce nel verbale" : "{n} voci nel verbale", { n: v.sottofasi.length })}</small>}</td><td>{prima === null ? "—" : `${prima}%`}</td><td>{v.percentuale_avanzamento}%</td><td>{formatCurrency(computedImporto(v))}</td></tr>;
              })}</tbody>
            </table></div>
            <p className="text-xs text-muted-foreground">{tr("Salva una bozza per il controllo interno, oppure emetti il verbale per fissare il contratto e le varianti approvate a oggi.")}</p>
          </section>}
          {review && vociInDiscesa.length > 0 && (
            <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">{tr("Queste voci scendono sotto il SAL n. {numero}:", { numero: precedentiVoci.numero ?? "" })}</p>
              <ul className="list-disc pl-5 text-xs">
                {vociInDiscesa.map((d, i) => <li key={i}>{tr("{voce}: dal {prima}% al {dopo}%", { voce: d.descrizione, prima: d.precedente, dopo: d.attuale })}</li>)}
              </ul>
              <p className="text-xs">{tr("Il verbale è cumulativo: abbassare una voce riduce il già certificato. Salvalo solo se è una rettifica.")}</p>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={rettifica} onChange={(e) => setRettifica(e.target.checked)} disabled={createSalMutation.isPending} />
                {tr("È una rettifica: le percentuali più basse sono corrette")}
              </label>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{tr("Il salvataggio del verbale non crea fatture o incassi.")}</p>
          </div>

          <DialogFooter className="shrink-0 border-t p-4 gap-2">
            <Button className="h-auto min-h-11 whitespace-normal" variant="outline" disabled={createSalMutation.isPending} onClick={() => {draftRevision.current++;setDialogOpen(false);}}>{tr("Annulla")}</Button>
            <Button
              className="h-auto min-h-11 whitespace-normal"
              variant={review ? "outline" : "default"}
              onClick={() => {if(!review){reviewDraft();return;}if(saving.current)return;saving.current=true;createSalMutation.mutate({emetti:false});}}
              disabled={createSalMutation.isPending || aiSuggestMutation.isPending || blocked || saveBlocked || !puoFareSal || (review && vociInDiscesa.length > 0 && !rettifica) || (review && conCertificato && !certificatoNuovo)}
            >
              {createSalMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> {tr("Salvataggio...")}</>
              ) : (
                review ? tr("Salva bozza SAL") : tr("Controlla riepilogo")
              )}
            </Button>
            {review && (
              <Button
                className="h-auto min-h-11 whitespace-normal"
                onClick={async () => {
                  if (saving.current) return;
                  const ok = await confirm({ title: tr("Emettere il SAL n. {n}?", { n: numeroNuovo }), description: tr("Il verbale conserva il contratto e le varianti approvate al momento dell’emissione. L’eventuale rata segue il piano pagamenti della commessa."), confirmLabel: tr("Emetti") });
                  if (!ok || saving.current) return;
                  saving.current = true; createSalMutation.mutate({ emetti: true });
                }}
                disabled={createSalMutation.isPending || blocked || saveBlocked || !puoFareSal || !salMatura || (vociInDiscesa.length > 0 && !rettifica) || (conCertificato && !certificatoNuovo) || !!salEmissionIssue({ id: "nuovo", numero_sal: numeroNuovo, stato: "bozza" }, salList)}
              >
                {tr("Salva ed emetti")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!signatureUrl} onOpenChange={open=>{if(!open)setSignatureUrl(null);}}><DialogContent><DialogHeader><DialogTitle>{tr("Link per il cliente")}</DialogTitle><DialogDescription>{tr("Il link consente di approvare il SAL. Non è stata inviata alcuna email.")}</DialogDescription></DialogHeader><Input readOnly aria-label={tr("Link cliente SAL")} value={signatureUrl??""}/><Button onClick={async()=>{try{await navigator.clipboard.writeText(signatureUrl!);toast.success(tr("Link copiato"));}catch{toast.error(tr("Copia non riuscita: seleziona e copia il link dal campo."));}}}>{tr("Copia link")}</Button></DialogContent></Dialog>

      {verbaleDi && (() => {
        // salList è dal più recente: il precedente è il primo con un numero più basso e già emesso.
        const precedente = salList.find((x) => x.numero_sal < verbaleDi.numero_sal && x.stato !== "bozza");
        return <VerbaleSalDialog numero={verbaleDi.numero_sal} orderId={orderId} companyId={companyId}
          dal={precedente?.data_emissione ?? null} al={verbaleDi.data_emissione} inCorso={isExporting}
          onGenera={(fotoIds, allegati, formato) => void handleExportPdf(verbaleDi, fotoIds, allegati, formato)} onClose={() => setVerbaleDi(null)} />;
      })()}
      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName={printTitle}
          title={printTitle}
          soloPdf
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}
    </div>
  );
}
