import { type ModalitaCostoFinanziaria, costoDaSottrarreAlSaldo, costoTrattenuto } from "@/lib/finanziamenti/costoFinanziaria";
import { useState, useRef } from "react";
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
import { Plus, FileBarChart2, Loader2, Download, Trash2, Sparkles, Wand2, Banknote, Check, Clock, ListChecks } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
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
import {VerbaleSalDialog} from "./VerbaleSalDialog";
import {CertificatoSal} from "./CertificatoSal";
import {certificatoDelSal,certificatoBloccato, certificatoPrecedente, leggiImportoItaliano} from "@/lib/orders/salCertificato";
import {giornoLocale} from "@/lib/orders/cronoprogramma";
import {leggiFasiPerSal} from "@/lib/orders/leggiFasiPerSal";
import {arrotondamentoAbituale, certificatoNelModulo, rataProposta, vociCheCambiano, type Arrotondamento} from "@/lib/orders/salNuovoVerbale";
import {conPercentuale, conQuantita, percentualeFaseDaSottofasi, type SottofaseSalDraft} from "@/lib/orders/salSottofasi";

interface SalVoceSottofase {
  id: string;
  sottofase_id: string | null;
  posizione: number;
  descrizione: string;
  unita: string | null;
  quantita_contratto: number | null;
  quantita_a_oggi: number | null;
  importo_contrattuale: number | null;
  percentuale_avanzamento: number;
  importo_sal: number | null;
}

interface SalVoce {
  id: string;
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
  note: string | null;
  fase_id?: string | null;
  sal_voci_sottofasi?: SalVoceSottofase[] | null;
}

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

const fmtQ = (n: number | null | undefined) => n == null ? "" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 3 });

const emptyVoce = (): VoceForm => ({
  descrizione: "",
  importo_contrattuale: "",
  percentuale_avanzamento: "",
  note: "",
});

export function SalTab({ orderId, companyId, orderTotalAmount, installments, vatRate = 22, financingCost = 0, financingCostMode, showPaymentProgress = true }: SalTabProps) {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const confirm = useConfirm();
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
  const [certNota, setCertNota] = useState("");
  // null = come il certificato prima (chi arrotonda a 100 € lo fa ogni volta).
  const [certArrotonda, setCertArrotonda] = useState<Arrotondamento | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportingSalId, setExportingSalId] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [verbaleDi, setVerbaleDi] = useState<SalRecord | null>(null);
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

  // Quando matura la rata di un SAL (lo sceglie l'azienda) e come si cambia una rata dal verbale.
  const salMatura = useSalMatura(companyId);
  const sostituisciRate = useSostituisciRate(orderId);

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
      if(!permissions.canEditOrders || !dialogOpen)throw new Error("Non hai il permesso di compilare il SAL.");
      const revision=draftRevision.current;
      const nextNumero = numeroNuovoSal((installments??[]).find(i=>i.id===rataCollegata)??null,salList);
      const { data, error } = await supabase.functions.invoke("suggerisci-sal-ai", {
        body: { order_id: orderId, company_id: companyId, numero_sal: nextNumero },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Suggerimento fallito");
      return {...data,draftRevision:revision};
    },
    onSuccess: (data) => {
      if(!dialogOpen || draftRevision.current!==data.draftRevision){toast.info("Bozza modificata: il suggerimento AI non ha sostituito i tuoi dati.");return;}
      const voci_suggerite: Array<{
        descrizione: string;
        importo_contrattuale: number;
        perc_suggerita: number;
      }> = data?.suggerimenti?.voci_suggerite ?? [];
      if (voci_suggerite.length === 0) {
        toast.info("L'AI non ha trovato voci da suggerire");
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
        `Compilate ${voci_suggerite.length} voci · % globale ${data?.suggerimenti?.percentuale_globale_suggerita ?? "—"}`,
      );
      const warnings: string[] = data?.suggerimenti?.warnings ?? [];
      warnings.forEach((w) => toast.warning(w, { duration: 6000 }));
    },
    onError: (err) => toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`),
  });

  const createSalMutation = useMutation({
    mutationFn: async ({emetti}:{emetti:boolean}) => {
      if(!permissions.canEditOrders || !review || blocked || saveBlocked)throw new Error("Controlla lo storico e il riepilogo prima di salvare.");
      if(vociInDiscesa.length>0 && !rettifica)throw new Error("Alcune voci scendono sotto il SAL precedente: conferma che è una rettifica o correggi le percentuali.");
      if(rataCollegata && (!(installments??[]).some(i=>i.id===rataCollegata) || salList.some(s=>s.installment_id===rataCollegata)))
        throw new Error("La rata non è disponibile o ha già un verbale SAL.");
      if(conCertificato && !certificatoNuovo)throw new Error("Controlla ritenuta e detrazioni del certificato.");
      if(emetti && !salMatura)throw new Error("Regola di maturazione del SAL non verificata: salva la bozza ed emettila dalla scheda.");
      const numero=numeroNuovoSal((installments??[]).find(i=>i.id===rataCollegata)??null,salList);
      if(emetti){const problema=salEmissionIssue({id:"nuovo",numero_sal:numero,stato:"bozza"},salList);if(problema)throw new Error(problema);}
      const {id}=await saveSalDraft(supabase,{orderId,companyId,number:numero,
        date:giornoLocale(new Date().toISOString()),note,installmentId:rataCollegata||null,lines:voci,contractNet:orderTotalAmount});
      // La bozza c'è: da qui in poi un errore non la annulla (rifarla creerebbe un doppione), lo si dice.
      const avvisi:string[]=[];
      let certificatoOk=true;
      if(conCertificato && certificatoNuovo){
        const {error}=await supabase.from("sal_certificati").upsert({sal_id:id,order_id:orderId,company_id:companyId,...certificatoNuovo});
        if(error){certificatoOk=false;avvisi.push(`Certificato non salvato (${error.message}): aggiungilo dalla scheda del SAL.`);}
      }
      let emesso=false;
      if(emetti && certificatoOk){
        const {data,error}=await supabase.from("sal_records").update({stato:"emesso",data_emissione:giornoLocale(new Date().toISOString())})
          .eq("id",id).eq("order_id",orderId).eq("company_id",companyId).eq("stato","bozza").select("id,stato");
        if(error || data?.length!==1)avvisi.push("Il SAL è salvato in bozza ma non emesso: emettilo dalla scheda.");
        else emesso=true;
      }else if(emetti)avvisi.push("Il SAL resta in bozza finché il certificato non è salvato.");
      return {id,emesso,avvisi};
    },
    onSuccess: ({emesso,avvisi}) => {
      if(avvisi.length)avvisi.forEach(a=>toast.warning(a,{duration:9000}));
      else toast.success(emesso ? "SAL emesso. Nessuna fattura o email generata." : "Bozza SAL salvata. Nessuna fattura o email generata.");
      refreshSal();setDialogOpen(false);setNote("");setRataCollegata("");setVoci([emptyVoce()]);setReview(false);setRettifica(false);
    },
    onError: (error:Error) => {
      setFormError(error.message);setSaveBlocked(error instanceof SalSaveError && error.uncertain);
      refreshSal();toast.error(error.message);
    },
    onSettled:()=>{saving.current=false;},
  });
  const deleteSalMutation = useMutation({
    mutationFn: async (salId:string) => {
      const row=salList.find(s=>s.id===salId);
      if(!permissions.canEditOrders || blocked || row?.stato!=="bozza")throw new Error("Si può eliminare solo una bozza SAL.");
      const {data,error}=await supabase.from("sal_records").delete().eq("id",salId).eq("order_id",orderId).eq("company_id",companyId).eq("stato","bozza").select("id");
      if(error || data?.length!==1)throw new Error("Eliminazione non confermata: il SAL potrebbe essere stato modificato.");
    },
    onSuccess:()=>{toast.success("Bozza SAL eliminata");refreshSal();},
    onError:(error:Error)=>{toast.error(error.message);refreshSal();},
  });
  const cambiaStato = useMutation({
    mutationFn: async ({id,stato:next}:{id:string;stato:"emesso"|"approvato"}) => {
      const row=salList.find(s=>s.id===id);
      if(!permissions.canEditOrders || blocked || !salMatura || !row || prossimoStatoSal(row.stato)?.stato!==next)throw new Error("Passaggio non consentito o regola SAL non verificata.");
      const sequenceIssue=salEmissionIssue(row,salList);
      if(sequenceIssue)throw new Error(sequenceIssue);
      const prepared=prepareSalLines((row.sal_voci??[]).map(v=>({descrizione:v.descrizione,importo_contrattuale:String(v.importo_contrattuale),percentuale_avanzamento:String(v.percentuale_avanzamento),note:v.note??""})),orderTotalAmount);
      if(Math.abs(prepared.total-Number(row.importo_totale))>0.01)throw new Error("Totale SAL diverso dalle voci: verifica la bozza prima di emetterla.");
      const patch=next==="emesso" ? {stato:next,data_emissione:giornoLocale(new Date().toISOString())} : {stato:next};
      const {data,error}=await supabase.from("sal_records").update(patch).eq("id",id).eq("order_id",orderId).eq("company_id",companyId).eq("stato",row.stato).select("id,stato");
      if(error || data?.length!==1 || data[0].stato!==next)throw new Error("Passaggio non confermato: aggiorna lo storico SAL.");
    },
    onSuccess:(_data,{stato:next})=>{toast.success(next==="emesso"?"SAL emesso, non incassato":"Approvazione registrata, non firma del cliente");refreshSal();},
    onError:(error:Error)=>{toast.error(error.message);refreshSal();},
  });

  const handleExportPdf = async (sal: SalRecord, fotoIds: string[] = [], allegati: string[] = [], dettaglioSottofasi = true) => {
    setIsExporting(true);
    setExportingSalId(sal.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sal-pdf", {
        body: { sal_id: sal.id, company_id: companyId, prepare_signature:false, foto_ids: fotoIds, allegati, dettaglio_sottofasi: dettaglioSottofasi },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto generato");
      setPrintTitle(`SAL n. ${sal.numero_sal}`);
      setPrintHtml(data.html);
      setVerbaleDi(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
    } finally {
      setIsExporting(false);
      setExportingSalId(null);
    }
  };

  const updateVoce = (index: number, field: keyof VoceForm, value: string) => {
    draftRevision.current++;
    setVoci((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  // Una sottofase cambia: la % della fase è la loro media (pesata sugli importi o sul peso).
  const updateSottofase = (index: number, j: number, campo: "percentuale" | "quantita", valore: string) => {
    draftRevision.current++;
    setVoci((prev) => prev.map((v, i) => {
      if (i !== index || !v.sottofasi) return v;
      const sottofasi = v.sottofasi.map((d, k) => (k !== j ? d : campo === "quantita" ? conQuantita(d, valore) : conPercentuale(d, valore)));
      const media = percentualeFaseDaSottofasi(sottofasi);
      return { ...v, sottofasi, percentuale_avanzamento: media != null ? String(media) : v.percentuale_avanzamento };
    }));
  };

  const addVoce = () => {draftRevision.current++;setVoci((prev) => [...prev, emptyVoce()]);};

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
  const certificatoValido = (ritenutaScritta === null || (Number.isFinite(ritenutaScritta) && ritenutaScritta >= 0 && ritenutaScritta <= 100))
    && (altreScritte === null || (Number.isFinite(altreScritte) && altreScritte >= 0));
  const certificatoCalcolato = certificatoValido
    ? certificatoNelModulo({ cumulativo: totalDialogImporto, precedente: certificatoPrima, giaMaturato: precedenteNuovo, ritenutaPct: ritenutaScritta, altreDetrazioni: altreScritte, nota: certNota, arrotonda: arrotondamento })
    : null;
  // Un netto negativo non è un certificato da pagare: il verbale abbassa il già certificato (rettifica).
  const certificatoNegativo = !!certificatoCalcolato && certificatoCalcolato.netto < 0;
  const certificatoNuovo = certificatoNegativo ? null : certificatoCalcolato;
  const vociNascoste = mostraTutte ? 0 : voci.filter((v) => v.fase_id && fasiInvariate.has(v.fase_id)).length;
  const nomeFase = (id?: string | null) => (id ? fasiSal.find((f) => f.id === id)?.name ?? null : null);

  const listIssues=salListIssues(salList);
  const blocked=isLoading || isError || isFetching || listIssues.length>0;
  const refreshSal=()=>{
    void queryClient.invalidateQueries({queryKey:["sal-records",orderId]});
    void queryClient.invalidateQueries({queryKey:["sal-legami",orderId]});
    void queryClient.invalidateQueries({queryKey:queryKeys.orders.installments(orderId)});
    void queryClient.invalidateQueries({queryKey:["order-installments",orderId]});
  };
  const openComposer=(installmentId="")=>{
    if(!permissions.canEditOrders || blocked)return;
    if(saveBlocked){toast.error("Un salvataggio precedente resta da verificare: ricarica lo storico prima di creare un altro SAL.");return;}
    // Senza una rata scelta si propone la prima che il piano aspetta da un SAL: «Nessuna» resta una scelta.
    const rata=installmentId || rataProposta(installments??[],salList);
    const haCertificati=salList.some(s=>certificatoDelSal(s.sal_certificati));
    draftRevision.current++;const apertura=draftRevision.current;setNote("");setVoci([emptyVoce()]);setRataCollegata(rata);setReview(false);setRettifica(false);setFormError("");
    setFasiInvariate(new Set());setMostraTutte(false);setConCertificato(haCertificati);setCertRitenuta("");setCertAltre("");setCertNota("");setCertArrotonda(null);setDialogOpen(true);
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
    catch(e){setFormError(e instanceof Error ? e.message : "Controlla le voci del SAL.");setMostraTutte(true);}
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
    .map((inst) => ({ inst, amount: isSaldoFinale(inst) ? balanceAmount : inst.type === "financing" && financingCostMode === "trattenuto" ? Math.max(0, inst.amount - financingCost) : inst.amount }))
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
    try { return new Date(d).toLocaleDateString("it-IT"); } catch { return d; }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if(isError || listIssues.length)return <div role="alert" className="rounded-lg border p-4 text-sm space-y-2"><p>{listIssues[0] || "Storico SAL non disponibile. Non vengono calcolati importi su uno storico incompleto."}</p><Button variant="outline" size="sm" onClick={()=>void refetch()}>Riprova SAL</Button></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileBarChart2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Verbali SAL (documenti)</h3>
          {salList.length > 0 && (
            <Badge variant="secondary">{salList.length}</Badge>
          )}
        </div>
        {/* Con la lista vuota il CTA vive nell'empty state qui sotto:
            due bottoni identici nella stessa card erano solo rumore. */}
        {permissions.canEditOrders && salList.length > 0 && (
          <Button size="sm" disabled={blocked} onClick={() => openComposer()}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Nuovo verbale
          </Button>
        )}
      </div>

      {(() => {
        const ultimo = salList.find((x) => x.stato !== "bozza");
        if (!ultimo) return null;
        const contrattuale = (ultimo.sal_voci ?? []).reduce((t, v) => t + Number(v.importo_contrattuale), 0);
        const eseguito = Number(ultimo.importo_totale);
        const numero = (titolo: string, valore: string, nota?: string) => (
          <div><dt className="text-xs text-muted-foreground">{titolo}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{valore}</dd>{nota && <dd className="text-[11px] text-muted-foreground">{nota}</dd>}</div>
        );
        return (
          <dl aria-label="Riepilogo dei SAL" className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-4">
            {numero("Voci del contratto", formatCurrency(contrattuale))}
            {numero("Eseguito a tutto l'ultimo SAL", formatCurrency(eseguito), `verbale ${ultimo.numero_sal}`)}
            {numero("Avanzamento", contrattuale > 0 ? `${Math.round((eseguito / contrattuale) * 1000) / 10}%` : "—")}
            {numero("Resta da eseguire", formatCurrency(Math.max(0, contrattuale - eseguito)))}
          </dl>
        );
      })()}

      {/* Il punto che vale tutto il capitolo: il SAL è una misura del lavoro
          eseguito, non una scadenza sul calendario. */}
      <details className="rounded-lg border bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground">Come funziona il SAL e quando matura la rata</summary>
        <div className="px-3 pb-3"><SalPlanInfo companyId={companyId} installments={installments ?? []}/></div>
      </details>

      {/* Avanzamento incassi: riporta qui il piano rate della commessa (lo
          stesso Riepilogo Finanziario di creazione/modifica) così lo stato
          finanziario è visibile direttamente nella sezione SAL. */}
      {showPaymentProgress && recapRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" aria-hidden="true" />
                Avanzamento incassi
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {rateIncassate}/{recapRows.length} rate incassate
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  Incassato {formatCurrency(incassato)} su {formatCurrency(incassoTarget)}
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
                          title={`Verbale SAL n. ${salRata.numero_sal} — ${STATO_LABELS[salRata.stato]}`}
                        >
                          <FileBarChart2 className="h-3 w-3" aria-hidden="true" />
                          SAL {salRata.numero_sal}
                          {salMaturato(salMatura, salRata.stato) ? " · maturata" : ""}
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-medium">{formatCurrency(amount)}</span>
                    {inst.is_paid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Pagato{inst.paid_date ? ` il ${fmtDateIt(inst.paid_date)}` : ""}
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
                        {scaduta ? "Scaduta" : "Non pagato"}
                        {inst.expected_date ? ` · prev. ${fmtDateIt(inst.expected_date)}` : ""}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Per segnare una rata come pagata usa i bottoni Pagato/Non pagato nel Riepilogo Finanziario (sezione Pagamenti).
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
                SAL da emettere
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 max-sm:p-3 max-sm:pt-0">
              {attesi.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {inst.trigger_numero ? `SAL n. ${inst.trigger_numero}` : "SAL"} <span className="text-muted-foreground">· {inst.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{formatCurrency(inst.amount)}</span>
                    {permissions.canEditOrders && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={blocked} onClick={() => openComposer(inst.id ?? "")}>
                      Prepara SAL
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
              <span>Nessun verbale. Crea una bozza dalle fasi oppure compila le voci a mano.</span>
            </p>
            {permissions.canEditOrders && <Button size="sm" variant="outline" disabled={blocked} onClick={() => openComposer()}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Crea verbale
            </Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {salList.map((sal) => (
            <Card key={sal.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      SAL #{sal.numero_sal}
                      <Badge variant={STATO_COLORS[sal.stato] as "secondary" | "default" | "outline" | "destructive"}>
                        {STATO_LABELS[sal.stato]}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sal.stato==="bozza" ? "Bozza del" : "Emesso il"} {fmtDate(sal.data_emissione)} · Cumulativo netto: {formatCurrency(sal.importo_totale)}
                    </p>
                    {salEmissionIssue(sal,salList) && <p className="text-xs text-amber-700 mt-1 max-w-xl">{salEmissionIssue(sal,salList)}</p>}
                    <CertificatoSal salId={sal.id} orderId={orderId} companyId={companyId} numero={sal.numero_sal} cumulativo={sal.importo_totale}
                      certificato={certificatoDelSal(sal.sal_certificati)}
                      precedente={certificatoPrecedente(sal,salList)}
                      giaMaturato={maturatoPrecedente(sal,salList)}
                      bloccato={certificatoBloccato(sal,salList,installments ?? [])}
                      puoModificare={permissions.canEditOrders && !blocked}/>
                    {(() => {
                      const precedente = maturatoPrecedente(sal, salList);
                      if (precedente <= 0) return null;
                      const certificato = certificatoDelSal(sal.sal_certificati);
                      const daFatturare = certificato ? Number(certificato.netto) : nettoSal(sal.importo_totale, precedente).daFatturare;
                      return (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ultimo cumulativo precedente: {formatCurrency(precedente)} ·{" "}
                          <span className={daFatturare < 0 ? "font-medium text-rose-600" : "font-medium text-foreground"}>
                            {daFatturare < 0 ? "Rettifica da verificare" : certificato ? "Da fatturare (netto del certificato)" : "Quota nuova del SAL"}: {formatCurrency(daFatturare)}
                          </span>
                        </p>
                      );
                    })()}
                    {(() => {
                      // La rata certificata da questo verbale (SAL = rata): quando matura è da incassare; se vale
                      // altro del SAL (con l'IVA), si propone di allinearla.
                      const rata = sal.installment_id ? (installments ?? []).find((i) => i.id === sal.installment_id) : undefined;
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
                            Rata «{rata.label}»: {formatCurrency(mostrato)}
                            {salMaturato(salMatura, sal.stato) && !rata.is_paid ? " · da incassare" : ""}
                          </span>
                          {permissions.canEditOrders && proposta !== null && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              disabled={sostituisciRate.isPending}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `Portare la rata a ${formatCurrency(proposta)}?`,
                                  description: `La quota nuova di questo SAL vale ${formatCurrency(proposta)} con l'IVA. Verifica separatamente approvazione, acconti e fatture già emesse. Le provvigioni sulla rata si ricalcolano sul nuovo importo.`,
                                  confirmLabel: "Cambia la rata",
                                });
                                if (ok) {
                                  sostituisciRate.mutate((installments ?? []).map((r) => rataPerServer(r.id === rata.id ? { ...r, amount: proposta } : r)));
                                }
                              }}
                            >
                              Imposta la rata a {formatCurrency(proposta)}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(() => {
                      const prossimo = prossimoStatoSal(sal.stato);
                      if (!prossimo || !permissions.canEditOrders) return null;
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={cambiaStato.isPending || blocked || !salMatura || !sal.sal_voci?.length || !!salEmissionIssue(sal,salList)}
                          onClick={async () => {
                            const ok=await confirm({title:prossimo.stato==="emesso" ? `Emettere il SAL #${sal.numero_sal}?` : `Registrare l'approvazione del SAL #${sal.numero_sal}?`,description:prossimo.stato==="emesso" ? "Il verbale esce dalla bozza. La rata può maturare secondo la regola aziendale, ma non viene creata una fattura, inviata un'email o registrato un incasso." : "Registra solo un'approvazione realmente ottenuta. Questo comando non appone la firma del cliente e può far maturare la rata collegata.",confirmLabel:prossimo.etichetta});
                            if(ok)cambiaStato.mutate({id:sal.id,stato:prossimo.stato});
                          }}
                        >
                          {prossimo.etichetta}
                        </Button>
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setVerbaleDi(sal)}
                      aria-label="Anteprima e stampa SAL"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Verbale PDF
                    </Button>
                    {permissions.canEditOrders && sal.stato === "bozza" && <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Eliminare il SAL #${sal.numero_sal}?`,
                            description:
                              "Lo stato avanzamento lavori verrà rimosso definitivamente. L'operazione non può essere annullata.",
                            confirmLabel: "Elimina",
                            variant: "destructive",
                          })
                        ) {
                          deleteSalMutation.mutate(sal.id);
                        }
                      }}
                      disabled={deleteSalMutation.isPending}
                      aria-label="Elimina SAL"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>}
                    {permissions.canEditOrders && ["emesso","approvato"].includes(sal.stato) && <Button variant="outline" size="sm" disabled={signatureBusy || blocked} onClick={async()=>{
                      if(signatureBusy)return;setSignatureBusy(true);
                      try{const {data,error}=await supabase.functions.invoke("generate-sal-pdf",{body:{sal_id:sal.id,company_id:companyId,prepare_signature:true}});
                        if(error || typeof data?.signature_url!=="string" || !/^https:\/\//.test(data.signature_url))throw new Error("Link cliente non confermato.");
                        setSignatureUrl(data.signature_url);
                      }catch(e){toast.error(e instanceof Error?e.message:"Link non disponibile");}finally{setSignatureBusy(false);}
                    }}>Prepara link cliente</Button>}
                  </div>
                </div>
              </CardHeader>
              {sal.sal_voci?.length > 0 && (
                <CardContent className="pt-0">
                  <details open={sal.id === salList[0]?.id}>
                  <summary className="mb-2 cursor-pointer text-xs font-medium text-muted-foreground">Voci del verbale ({sal.sal_voci.length})</summary>
                  <div className="border rounded overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left p-2 font-medium">Voce</th>
                          <th className="text-right p-2 font-medium">Contrattuale</th>
                          <th className="text-right p-2 font-medium">Avanz.</th>
                          <th className="text-right p-2 font-medium">SAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sal.sal_voci.flatMap((v) => [
                          <tr key={v.id} className="border-b last:border-0">
                            <td className={`p-2${v.sal_voci_sottofasi?.length ? " font-medium" : ""}`}>{v.descrizione}</td>
                            <td className="p-2 text-right">{formatCurrency(v.importo_contrattuale)}</td>
                            <td className="p-2 text-right">{v.percentuale_avanzamento}%</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(v.importo_sal)}</td>
                          </tr>,
                          ...[...(v.sal_voci_sottofasi ?? [])].sort((a, b) => a.posizione - b.posizione).map((d) => (
                            <tr key={d.id} className="border-b text-muted-foreground last:border-0">
                              <td className="py-1 pl-6 pr-2">
                                {d.descrizione}
                                {d.quantita_contratto ? <span className="ml-1 tabular-nums">· {fmtQ(d.quantita_a_oggi)} / {fmtQ(d.quantita_contratto)} {d.unita ?? ""}</span> : null}
                              </td>
                              <td className="py-1 px-2 text-right">{d.importo_contrattuale != null ? formatCurrency(d.importo_contrattuale) : ""}</td>
                              <td className="py-1 px-2 text-right">{d.percentuale_avanzamento}%</td>
                              <td className="py-1 px-2 text-right">{d.importo_contrattuale != null ? formatCurrency(d.importo_sal ?? 0) : ""}</td>
                            </tr>
                          )),
                        ])}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/30 font-semibold">
                          <td className="p-2" colSpan={3}>Avanzamento cumulativo netto</td>
                          <td className="p-2 text-right">{formatCurrency(sal.importo_totale)}</td>
                        </tr>
                        {maturatoPrecedente(sal, salList) > 0 && (
                          <>
                            <tr className="border-t text-muted-foreground">
                              <td className="p-2" colSpan={3}>Ultimo cumulativo precedente</td>
                              <td className="p-2 text-right">− {formatCurrency(maturatoPrecedente(sal, salList))}</td>
                            </tr>
                            <tr className="bg-muted/30 font-semibold">
                              <td className="p-2" colSpan={3}>Quota nuova del SAL, da verificare prima della fattura</td>
                              <td className="p-2 text-right">{formatCurrency(nettoSal(sal.importo_totale, maturatoPrecedente(sal, salList)).daFatturare)}</td>
                            </tr>
                          </>
                        )}
                      </tfoot>
                    </table>
                  </div>
                  {sal.note && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{sal.note}</p>
                  )}
                  </details>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create SAL Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open=>{if(saving.current||createSalMutation.isPending)return;setDialogOpen(open);if(!open)draftRevision.current++;}}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b p-4 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <FileBarChart2 className="h-5 w-5" aria-hidden="true" />
              {review ? "Controlla il SAL" : "Nuova bozza SAL"}
            </DialogTitle>
            <DialogDescription>Le voci nascono dalle fasi della commessa. Indica l'avanzamento complessivo fino a oggi, non solo quello di questo periodo. Si salva una bozza: nessuna fattura o invio automatico.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto p-4 space-y-4">
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          {review && <Button variant="outline" size="sm" disabled={createSalMutation.isPending} onClick={()=>{setReview(false);setRettifica(false);}}>Modifica bozza</Button>}
          <fieldset className="space-y-4 min-w-0" disabled={review || createSalMutation.isPending || !permissions.canEditOrders}>
            <p className="rounded-lg border bg-muted/20 p-3 text-sm">Stato iniziale: <strong>Bozza</strong>. L'emissione è un passaggio successivo, dopo la verifica delle voci.</p>

            {/* Rata certificata: il piano rate nasce dagli importi del
                contratto, e ogni verbale SAL matura la sua rata. Facoltativo
                per non bloccare chi usa i SAL come soli documenti. */}
            {(installments ?? []).length > 0 && (
              <div className="space-y-2">
                <Label>Rata certificata da questo verbale</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {draftRevision.current++;setRataCollegata("");setFasiInvariate(new Set());}}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      rataCollegata === ""
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    Nessuna
                  </button>
                  {recapRows.map(({ inst, amount }) => (
                    <button
                      key={inst.position}
                      type="button"
                      disabled={!inst.id || salList.some(s=>s.installment_id===inst.id)}
                      onClick={() => {draftRevision.current++;if(inst.id){setRataCollegata(inst.id);setFasiInvariate(new Set());}}}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                        rataCollegata === inst.id
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {inst.label} · {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {rataScelta && (() => {
              const mostrato = recapRows.find((r) => r.inst.id === rataScelta.id)?.amount ?? rataScelta.amount;
              const netto = nettoSal(totalDialogImporto, precedenteNuovo).daFatturare;
              return (
                <p className="text-xs text-muted-foreground">
                  SAL n. {numeroNuovo}. La rata «{rataScelta.label}» vale {formatCurrency(mostrato)} (IVA inclusa).{" "}
                  {netto<0 ? `Rettifica netta da verificare: ${formatCurrency(netto)}. Nessun cambio automatico della rata.` : `Quota nuova: ${formatCurrency(netto)} + IVA (${formatCurrency(rataDaSal(netto,vatRate))}). Verifica prima della fatturazione.`}
                </p>
              );
            })()}

            {/* Voci */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>Voci di avanzamento</Label>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => { const v=vociSalDaFasi(fasiSal,precedentiVoci);if(!v.length)return;
                      const hasInput=voci.some(v=>v.descrizione.trim() || v.importo_contrattuale.trim());
                      if(hasInput && !(await confirm({title:"Sostituire le voci della bozza?",description:"I dati già scritti saranno sostituiti dalle lavorazioni della commessa.",confirmLabel:"Usa le fasi"})))return;
                      draftRevision.current++;setVoci(v);setFasiInvariate(fasiSenzaCambi(v,precedentiVoci)); }}
                    disabled={fasiSal.length === 0}
                    className="gap-1"
                    title="Compila le voci dalle fasi di lavorazione: descrizione e % di avanzamento dichiarate in cantiere"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    Dalle fasi
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => aiSuggestMutation.mutate()}
                    disabled={aiSuggestMutation.isPending}
                    className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                    title="Suggerisci voci e % avanzamento dall'AI"
                  >
                    {aiSuggestMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    <Sparkles className="h-3 w-3" />
                    Suggerisci AI
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={addVoce}>
                    <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Aggiungi voce
                  </Button>
                </div>
              </div>
              {fasiError && <p role="alert" className="text-xs text-destructive">Fasi non disponibili: compila a mano o <button type="button" className="underline" onClick={()=>void refetchFasi()}>riprova le fasi</button>.</p>}
              <p className="text-xs text-muted-foreground">Le percentuali arrivano dal cantiere; gli importi sono il venduto netto delle lavorazioni, non il costo degli operai. Completa gli importi mancanti prima di salvare.</p>

              {vociNascoste > 0 && (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  {vociNascoste === 1 ? "1 voce è uguale" : `${vociNascoste} voci sono uguali`} al SAL n. {precedentiVoci.numero}: non le mostro, e si salvano così.{" "}
                  <button type="button" className="font-medium text-foreground underline" onClick={() => setMostraTutte(true)}>Mostra tutte le voci</button>
                </p>
              )}
              {voci.map((v, i) => !mostraTutte && v.fase_id && fasiInvariate.has(v.fase_id) ? null : (
                <div key={i} className="border rounded-lg p-3 space-y-2 relative">
                  {voci.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeVoce(i)}
                      aria-label="Rimuovi voce"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor={`sal-desc-${i}`} className="text-xs">Descrizione *</Label>
                    <Input
                      id={`sal-desc-${i}`}
                      value={v.descrizione}
                      onChange={(e) => updateVoce(i, "descrizione", e.target.value)}
                      placeholder="es. Fondazioni, Muratura, Impianti..."
                      className="h-8 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {v.fase_id ? <>Fase: <span className="font-medium text-foreground">{nomeFase(v.fase_id) ?? "della commessa"}</span></> : "Voce libera, fuori dalle fasi"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`sal-amount-${i}`} className="text-xs">Importo contrattuale netto (€)</Label>
                      <Input
                        id={`sal-amount-${i}`}
                        inputMode="decimal"
                        value={v.importo_contrattuale}
                        onChange={(e) => updateVoce(i, "importo_contrattuale", e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-sm"
                      />
                      {v.fase_id && !v.importo_contrattuale.trim() && (
                        <p className="text-[11px] font-medium text-amber-700">La fase non ha il venduto: scrivi l'importo netto di contratto.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`sal-pct-${i}`} className="text-xs">Avanzamento cumulativo (%)</Label>
                      <Input
                        id={`sal-pct-${i}`}
                        inputMode="decimal"
                        value={v.percentuale_avanzamento}
                        onChange={(e) => updateVoce(i, "percentuale_avanzamento", e.target.value)}
                        placeholder="0"
                        className="h-8 text-sm"
                        readOnly={!!v.sottofasi?.length}
                        title={v.sottofasi?.length ? "Media delle sottofasi: si cambia dalle sottofasi qui sotto" : undefined}
                      />
                      {(() => {
                        const prima = percentualePrecedenteVoce(v, precedentiVoci);
                        if (prima === null || precedentiVoci.numero === null) return null;
                        const scende = vociInDiscesa.some((d) => d.descrizione === v.descrizione.trim() && d.precedente === prima);
                        return <p className={`text-[11px] ${scende ? "font-medium text-amber-700" : "text-muted-foreground"}`}>SAL n. {precedentiVoci.numero}: {prima}%{scende ? " · scende" : ""}</p>;
                      })()}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Importo SAL</Label>
                      <div className="h-8 flex items-center px-3 bg-muted/50 rounded-md text-sm font-medium text-primary">
                        {formatCurrency(computedImporto(v))}
                      </div>
                    </div>
                  </div>
                  {!!v.sottofasi?.length && (
                    <div className="rounded-md border bg-muted/20">
                      <p className="border-b px-2 py-1 text-[11px] font-medium text-muted-foreground">Sottofasi · la % della fase è la loro media{v.sottofasi.every((d) => d.importo_contrattuale) ? " pesata sugli importi" : ""}</p>
                      <ul className="divide-y">
                        {v.sottofasi.map((d, j) => {
                          const prima = d.sottofase_id ? precedentiVoci.perSottofase.get(d.sottofase_id) ?? null : null;
                          const pct = Number(String(d.percentuale_avanzamento).replace(",", "."));
                          const scende = prima != null && Number.isFinite(pct) && pct < prima;
                          return (
                            <li key={d.sottofase_id ?? j} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-xs">
                              <span className="min-w-0 flex-1 truncate" title={d.descrizione}>{d.descrizione}</span>
                              {d.importo_contrattuale != null && <span className="tabular-nums text-muted-foreground">{formatCurrency(d.importo_contrattuale)}</span>}
                              {d.quantita_contratto ? (
                                <span className="flex items-center gap-1">
                                  <Input inputMode="decimal" className="h-7 w-20 text-xs" value={d.quantita_a_oggi} aria-label={`Quantità a oggi di ${d.descrizione}`}
                                    onChange={(e) => updateSottofase(i, j, "quantita", e.target.value)} />
                                  <span className="text-muted-foreground">/ {fmtQ(d.quantita_contratto)} {d.unita ?? ""}</span>
                                </span>
                              ) : null}
                              <span className="flex items-center gap-1">
                                <Input inputMode="decimal" className="h-7 w-16 text-xs" value={d.percentuale_avanzamento} aria-label={`Avanzamento di ${d.descrizione}`}
                                  onChange={(e) => updateSottofase(i, j, "percentuale", e.target.value)} />
                                <span className="text-muted-foreground">%</span>
                              </span>
                              {prima != null && precedentiVoci.numero != null && (
                                <span className={scende ? "font-medium text-amber-700" : "text-muted-foreground"}>SAL n. {precedentiVoci.numero}: {prima}%{scende ? " · scende" : ""}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor={`sal-note-${i}`} className="text-xs">Note voce · visibili al cliente</Label>
                    <Input
                      id={`sal-note-${i}`}
                      value={v.note}
                      onChange={(e) => updateVoce(i, "note", e.target.value)}
                      placeholder="Opzionale"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}

              <div className="flex justify-end text-sm font-semibold text-primary bg-muted/30 rounded-lg p-2">
                Avanzamento cumulativo netto: {formatCurrency(totalDialogImporto)}
              </div>
              {precedenteNuovo > 0 && (
                <div className="space-y-1 rounded-lg bg-muted/30 p-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Ultimo cumulativo precedente</span>
                    <span>− {formatCurrency(precedenteNuovo)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-primary">
                    <span>{totalDialogImporto<precedenteNuovo ? "Rettifica da verificare" : "Quota nuova del SAL, non ancora fatturata"}</span>
                    <span>{formatCurrency(nettoSal(totalDialogImporto, precedenteNuovo).daFatturare)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Certificato di pagamento: nello stesso modulo, non più un passaggio a parte (lotto C). */}
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={conCertificato} onChange={(e) => {draftRevision.current++;setConCertificato(e.target.checked);}} />
                Certificato di pagamento
              </label>
              {conCertificato && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="cert-nuovo-ritenuta" className="text-xs">Ritenuta di garanzia %</Label>
                      <Input id="cert-nuovo-ritenuta" inputMode="decimal" className="h-8 text-sm" value={certRitenuta}
                        placeholder={String(certificatoNuovo?.ritenuta_pct ?? certificatoPrima?.ritenuta_pct ?? 10)}
                        onChange={(e) => {draftRevision.current++;setCertRitenuta(e.target.value);}} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cert-nuovo-altre" className="text-xs">Altre detrazioni (totale a oggi)</Label>
                      <Input id="cert-nuovo-altre" inputMode="decimal" className="h-8 text-sm" value={certAltre}
                        placeholder={String(certificatoPrima?.altre_detrazioni ?? 0)}
                        onChange={(e) => {draftRevision.current++;setCertAltre(e.target.value);}} />
                    </div>
                    <div className="col-span-2 space-y-1 sm:col-span-1">
                      <Label htmlFor="cert-nuovo-nota" className="text-xs">Motivo delle detrazioni</Label>
                      <Input id="cert-nuovo-nota" className="h-8 text-sm" value={certNota} placeholder={certificatoPrima?.altre_detrazioni_nota ?? ""}
                        onChange={(e) => {draftRevision.current++;setCertNota(e.target.value);}} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="mr-1 text-muted-foreground">Arrotonda il netto</span>
                    {([0, 10, 100] as const).map((passo) => (
                      <button key={passo} type="button" aria-pressed={arrotondamento === passo}
                        onClick={() => {draftRevision.current++;setCertArrotonda(passo);}}
                        className={`rounded-md border px-2 py-1 ${arrotondamento === passo ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>
                        {passo === 0 ? "No" : `a ${passo} €`}
                      </button>
                    ))}
                  </div>
                  {certificatoNuovo ? (
                    <dl aria-label="Certificato di pagamento" className="space-y-0.5 text-sm">
                      {([
                        ["Lavori a tutto il SAL", certificatoNuovo.lavori_contrattuali + certificatoNuovo.varianti],
                        [`Ritenuta ${certificatoNuovo.ritenuta_pct.toLocaleString("it-IT")}%`, -certificatoNuovo.ritenuta],
                        ...(certificatoNuovo.recupero_anticipazione > 0 ? [["Recupero anticipazione", -certificatoNuovo.recupero_anticipazione] as [string, number]] : []),
                        ...(certificatoNuovo.altre_detrazioni > 0 ? [["Altre detrazioni", -certificatoNuovo.altre_detrazioni] as [string, number]] : []),
                        ["Acconti già certificati", -certificatoNuovo.acconti_precedenti],
                        ...(Number(certificatoNuovo.rinviato) > 0 ? [["Rinviato al prossimo certificato", -Number(certificatoNuovo.rinviato)] as [string, number]] : []),
                      ] as Array<[string, number]>).map(([t, v]) => (
                        <div key={t} className="flex justify-between text-muted-foreground"><dt>{t}</dt><dd className="tabular-nums">{formatCurrency(v)}</dd></div>
                      ))}
                      <div className="flex justify-between font-semibold"><dt>Netto del certificato</dt><dd className="tabular-nums">{formatCurrency(certificatoNuovo.netto)}</dd></div>
                      <div className="flex justify-between text-muted-foreground"><dt>Con l'IVA {vatRate}%</dt><dd className="tabular-nums">{formatCurrency(rataDaSal(certificatoNuovo.netto, vatRate))}</dd></div>
                    </dl>
                  ) : <p role="alert" className="text-xs text-destructive">{certificatoNegativo
                    ? `Il netto del certificato viene ${formatCurrency(certificatoCalcolato!.netto)}: ritenuta, detrazioni e acconti superano i lavori di questo verbale. Controlla le voci e le detrazioni, oppure togli il certificato se è una rettifica.`
                    : "Ritenuta tra 0 e 100%, detrazioni non negative."}</p>}
                  <p className="text-[11px] text-muted-foreground">Gli acconti sono il netto dei certificati prima{certificatoPrima ? "" : " (o il cumulativo dei SAL emessi)"}: non si riscrivono a mano. Quello che l'arrotondamento toglie torna nel certificato dopo.</p>
                </>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="sal-notes">Note SAL · visibili al cliente</Label>
              <Textarea
                id="sal-notes"
                value={note}
                onChange={(e) => {draftRevision.current++;setNote(e.target.value);}}
                placeholder="Condizioni o annotazioni per il cliente. Non inserire costi o note riservate."
                rows={2}
                className="resize-none"
              />
            </div>
          </fieldset>
          {review && vociInDiscesa.length > 0 && (
            <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">Queste voci scendono sotto il SAL n. {precedentiVoci.numero}:</p>
              <ul className="list-disc pl-5 text-xs">
                {vociInDiscesa.map((d, i) => <li key={i}>{d.descrizione}: dal {d.precedente}% al {d.attuale}%</li>)}
              </ul>
              <p className="text-xs">Il verbale è cumulativo: abbassare una voce riduce il già certificato. Salvalo solo se è una rettifica.</p>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={rettifica} onChange={(e) => setRettifica(e.target.checked)} disabled={createSalMutation.isPending} />
                È una rettifica: le percentuali più basse sono corrette
              </label>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Gli acconti e le fatture già emesse vanno verificati prima di fatturare la quota nuova. Il SAL non li riconcilia automaticamente.</p>
          </div>

          <DialogFooter className="shrink-0 border-t p-4 gap-2">
            <Button className="h-auto min-h-11 whitespace-normal" variant="outline" disabled={createSalMutation.isPending} onClick={() => {draftRevision.current++;setDialogOpen(false);}}>Annulla</Button>
            <Button
              className="h-auto min-h-11 whitespace-normal"
              variant={review ? "outline" : "default"}
              onClick={() => {if(!review){reviewDraft();return;}if(saving.current)return;saving.current=true;createSalMutation.mutate({emetti:false});}}
              disabled={createSalMutation.isPending || aiSuggestMutation.isPending || blocked || saveBlocked || !permissions.canEditOrders || (review && vociInDiscesa.length > 0 && !rettifica) || (review && conCertificato && !certificatoNuovo)}
            >
              {createSalMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> Salvataggio...</>
              ) : (
                review ? "Salva bozza SAL" : "Controlla riepilogo"
              )}
            </Button>
            {review && (
              <Button
                className="h-auto min-h-11 whitespace-normal"
                onClick={async () => {
                  if (saving.current) return;
                  const ok = await confirm({ title: `Emettere il SAL n. ${numeroNuovo}?`, description: "Il verbale esce dalla bozza insieme al suo certificato. La rata può maturare secondo la regola aziendale, ma non viene creata una fattura, inviata un'email o registrato un incasso.", confirmLabel: "Emetti" });
                  if (!ok || saving.current) return;
                  saving.current = true; createSalMutation.mutate({ emetti: true });
                }}
                disabled={createSalMutation.isPending || blocked || saveBlocked || !permissions.canEditOrders || !salMatura || (vociInDiscesa.length > 0 && !rettifica) || (conCertificato && !certificatoNuovo) || !!salEmissionIssue({ id: "nuovo", numero_sal: numeroNuovo, stato: "bozza" }, salList)}
              >
                Salva ed emetti
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!signatureUrl} onOpenChange={open=>{if(!open)setSignatureUrl(null);}}><DialogContent><DialogHeader><DialogTitle>Link per il cliente</DialogTitle><DialogDescription>Il link consente di approvare il SAL. Non è stata inviata alcuna email.</DialogDescription></DialogHeader><Input readOnly aria-label="Link cliente SAL" value={signatureUrl??""}/><Button onClick={async()=>{try{await navigator.clipboard.writeText(signatureUrl!);toast.success("Link copiato");}catch{toast.error("Copia non riuscita: seleziona e copia il link dal campo.");}}}>Copia link</Button></DialogContent></Dialog>

      {verbaleDi && (() => {
        // salList è dal più recente: il precedente è il primo con un numero più basso e già emesso.
        const precedente = salList.find((x) => x.numero_sal < verbaleDi.numero_sal && x.stato !== "bozza");
        return <VerbaleSalDialog numero={verbaleDi.numero_sal} orderId={orderId} companyId={companyId}
          dal={precedente?.data_emissione ?? null} al={verbaleDi.data_emissione} inCorso={isExporting}
          conSottofasi={(verbaleDi.sal_voci ?? []).some((v) => (v.sal_voci_sottofasi?.length ?? 0) > 0)}
          onGenera={(fotoIds, allegati, dettaglio) => void handleExportPdf(verbaleDi, fotoIds, allegati, dettaglio)} onClose={() => setVerbaleDi(null)} />;
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
