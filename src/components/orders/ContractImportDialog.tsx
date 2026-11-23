import { useContractWorkflowProfile } from "@/hooks/useContractWorkflowProfile";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
/**
 * ContractImportDialog — "Carica contratto / copia commissione".
 *
 * Upload foto/PDF → generic-doc-ai-extract (doc_type=contratto_commessa) →
 * anteprima dei dati estratti → "Applica alla commessa" (onApply).
 * L'utente rivede sempre prima di applicare (l'AI può sbagliare).
 */
// (montaggio condizionale lato CreateOrder: nasce solo all'apertura)
import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OfficeSelect } from "./OfficeSelect";
import { Upload, FileText, Image as ImageIcon, XCircle, Sparkles, Loader2, Brain, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { formatCurrency } from "@/lib/formatters";
import { parseContractExtract, reconcileContractExtract, contractImponibile, contractSommaVoci, type ContractExtract } from "@/lib/orders/contractExtract";
import { useFasiDiPartenza } from "@/hooks/useFasiDiPartenza";
import { verificaContrattoNelTesto, type VerificaNelTesto } from "@/lib/orders/contrattoNelTesto";
import { testoPaginePdf } from "@/lib/orders/testoPaginePdf";
import { integraUnitaDalPdf } from "@/lib/orders/riscontriVociPdf";
import { completaRiscontriLettura } from "@/lib/orders/completezzaLettura";
import { prepareContract, readableContractWarning, dataFirmaVerificata, contractAnalysisHint, type StoredContractFile } from "@/lib/orders/contractPreparation";
import { ContractPreparationCard } from "./ContractPreparationCard";
import { confermeDelPiano, eLavoroSingolo } from "@/lib/orders/confermeContratto";
import { RisultatoLettura } from "./contratto/RisultatoLettura";
import { ETICHETTA_PARTE, partiPresenti, soloLeParti, type ParteContratto } from "@/lib/orders/sceltaContratto";
import { REGOLA_VOCI, RILEGGI_VOCI, soloIlTotale } from "@/lib/orders/avvisiContratto";
import { useAuth } from "@/contexts/AuthContext";
import { BUCKET_ORIGINALI_AI } from "@/lib/orders/documentImportAi";
import { leggiComputoSenzaAi } from "@/lib/orders/contrattoDaComputo";
import { PianoContrattoCollegato } from "./contratto/PianoContrattoCollegato";
import { fasiOperativePerEstratto, pianoOperativoContratto } from "@/lib/orders/pianoOperativoContratto";
import { AnalisiGiaCollegataError, commessaDellaLettura, cercaLetturaContratto, contestoLetturaContratto, elencaLettureContratto, improntaFileContratto, indicazioniLetturaContratto, salvaLetturaContratto, type LetturaContrattoSalvata } from "@/lib/orders/lettureContrattoSalvate";

const ACCEPTED = [".pdf", ".xpwe", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".heic"];
const MAX_SIZE = 18 * 1024 * 1024;
const BUCKET = "order-attachments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** Il file originale viaggia insieme all'estratto: il contratto firmato
   *  deve finire nei Documenti della commessa, non sparire dopo la lettura. */
  onApply: (extract: ContractExtract, sourceFile?: File | null, source?: StoredContractFile | null) => void;
  /** Arrivando dal flusso "Importa documento intelligente" di Silvio, il PDF
   *  è GIÀ su storage: con l'id dell'analisi lo si riusa senza secondo drag
   *  né secondo upload (audit 2026-09, punto 1). */
  initialAnalysisId?: string | null;
  destinazione?: "cliente" | "appaltatore" | "generale_appalto";
  /** Commessa già creata (14/11/2026): l'originale va sotto la sua cartella. La regola del bucket
   *  (office_attachment_file_insert) accetta in order-attachments solo percorsi che iniziano con una commessa
   *  modificabile: sotto `<azienda>/ai-contratti/` il caricamento è rifiutato. */
  orderId?: string | null;
}

interface RemoteFileRef {
  bucket: string;
  path: string;
  name: string;
  mime: string;
}

function safeName(name: string): string {
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  const base = name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "contratto"}${ext.toLowerCase()}`;
}
function fmtBytes(b: number): string {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContractImportDialog({ open, onOpenChange, companyId, onApply, initialAnalysisId, destinazione = "cliente", orderId = null }: Props) {
  const { effectiveCompany, user } = useAuth();
  const t = useT();
  const queryClient = useQueryClient();
  const workflowProfilo = useContractWorkflowProfile();
  const { perContratto: modelliFasi } = useFasiDiPartenza();
  const [file, setFile] = useState<File | null>(null);
  // Il file dell'analisi Silvio (se si arriva da lì): riusato da storage.
  const { data: remoteFileDaSilvio = null } = useQuery<RemoteFileRef | null>({
    queryKey: ["contract-import-analysis-file", companyId, orderId, initialAnalysisId],
    enabled: !!initialAnalysisId && !!companyId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_analysis_results")
        .select("storage_bucket, storage_path, file_name, mime_type, company_id, structured_fields")
        .eq("id", initialAnalysisId!)
        .maybeSingle();
      if (!data || data.company_id !== companyId) return null;
      const collegata = commessaDellaLettura(data.structured_fields);
      if (collegata && collegata !== orderId) throw new AnalisiGiaCollegataError(collegata);
      return {
        bucket: data.storage_bucket,
        path: data.storage_path,
        name: data.file_name ?? "documento.pdf",
        mime: data.mime_type ?? "application/pdf",
      };
    },
  });
  // Indicazioni scritte dall'utente per l'AI ("l'IVA è al 10%", "è un'offerta
  // fornitore, il cliente finale è Rossi"): chi carica conosce il documento
  // meglio del modello — le note entrano nel prompt con priorità.
  const [noteAi, setNoteAi] = useState("");
  const [remoteFileSalvato, setRemoteFileSalvato] = useState<RemoteFileRef | null>(null);
  const remoteFile = remoteFileSalvato ?? remoteFileDaSilvio;
  const contesto = contestoLetturaContratto(destinazione, effectiveCompany?.name, noteAi);
  const [analisiSalvata, setAnalisiSalvata] = useState<LetturaContrattoSalvata | null>(null);
  const [erroreArchivio, setErroreArchivio] = useState(false);
  const { data: analisiRecenti = [] } = useQuery({
    queryKey: ["letture-contratto-salvate", companyId, contesto, orderId],
    enabled: open && !!companyId,
    queryFn: () => elencaLettureContratto(companyId!, contesto, orderId),
    staleTime: 30_000,
  });
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commessaCollegata, setCommessaCollegata] = useState<string | null>(null);
  const [extract, setExtract] = useState<ContractExtract | null>(null);
  // Le parti che entrano nella commessa: ogni scheda ha la sua spunta (17/11/2026). Partono tutte spuntate.
  const [scelte, setScelte] = useState<Set<ParteContratto>>(new Set());
  // Il contratto letto, ricontrollato sul testo del PDF (17/11/2026): pagina per ogni valore trovato.
  const [verifica, setVerifica] = useState<VerificaNelTesto | null>(null);
  // Il testo del PDF: serve anche a capire se l'avviso «istruzioni rivolte all'AI» è vero (17/11/2026).
  const [testoDocumento, setTestoDocumento] = useState<string | null>(null);
  const [rileggo, setRileggo] = useState(false);
  const [firmaVerificata, setFirmaVerificata] = useState(false);
  const [dataFirma, setDataFirma] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // "bucket/path" del documento analizzato: diventa l'allegato della risposta
  // RDO, così dal confronto si riapre l'offerta originale.
  const [pathAnalizzato, setPathAnalizzato] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null); setBusy(false); setError(null); setExtract(null); setCommessaCollegata(null);
    setPathAnalizzato(null); setFirmaVerificata(false); setDataFirma("");
    setRemoteFileSalvato(null); setAnalisiSalvata(null); setErroreArchivio(false);
  }, []);

  const pick = (f: File) => {
    if (busy) return;
    const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
    if (!ACCEPTED.includes(ext)) { toast.error(t("Formato non supportato. Usa PDF, XPWE, Excel .xlsx o immagine.")); return; }
    if (f.size === 0) { toast.error(t("Il file è vuoto. Carica un documento leggibile.")); return; }
    if (f.size > MAX_SIZE) { toast.error(t("File troppo grande (max {max}).", { max: fmtBytes(MAX_SIZE) })); return; }
    setFile(f); setError(null); setCommessaCollegata(null); setExtract(null); setPathAnalizzato(null); setFirmaVerificata(false); setDataFirma("");
    setRemoteFileSalvato(null); setAnalisiSalvata(null); setErroreArchivio(false);
  };

  const riprendiAnalisi = (lettura: LetturaContrattoSalvata) => {
    const indicazioni = indicazioniLetturaContratto(lettura.contesto);
    if (indicazioni !== null) setNoteAi(indicazioni);
    setExtract(lettura.estratto); setScelte(new Set(partiPresenti(lettura.estratto)));
    setPathAnalizzato(`${lettura.originale.bucket}/${lettura.originale.path}`);
    setRemoteFileSalvato(lettura.originale); setAnalisiSalvata(lettura); setErroreArchivio(false);
    setVerifica(null); setTestoDocumento(null); setError(null);
    setFirmaVerificata(false); setDataFirma("");
  };

  const archiviaAnalisi = async (estratto: ContractExtract, originale: StoredContractFile, locale: File | null) => {
    try {
      let documento = locale;
      if (!documento) {
        const { data, error } = await supabase.storage.from(originale.bucket).download(originale.path);
        if (error || !data) throw new Error("Originale non recuperato per il salvataggio dell'analisi.");
        documento = new File([data], originale.name, { type: originale.mime });
      }
      const salvata = await salvaLetturaContratto({ companyId: companyId!, hash: await improntaFileContratto(documento),
        contesto, estratto, originale, uploadedBy: user?.id ?? null, orderId });
      setAnalisiSalvata(salvata); setErroreArchivio(false);
      void queryClient.invalidateQueries({ queryKey: ["letture-contratto-salvate", companyId] });
    } catch {
      setErroreArchivio(true);
      toast.warning(t("Lettura disponibile, ma analisi non archiviata. Conserva la bozza e riprova il salvataggio prima di chiudere."));
    }
  };

  const caricaOriginale = async (originale: File): Promise<StoredContractFile> => {
    if (!companyId) throw new Error(t("Azienda non disponibile: ricarica la pagina."));
    const buf = await originale.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    const sha = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const path = `${orderId ?? companyId}/ai-contratti/${sha.slice(0, 32)}-${safeName(originale.name)}`;
    // Senza commessa l'originale aspetta in documenti-smart: order-attachments accetta solo cartelle di
    // commesse esistenti. Alla creazione collegaOriginaleAi lo copia nei documenti della commessa.
    const bucket = orderId ? BUCKET : BUCKET_ORIGINALI_AI;
    // Lo stesso contenuto riusa il riferimento privato senza sovrascriverlo.
    const {error} = await supabase.storage.from(bucket).upload(path,originale,{upsert:false});
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Upload: ${error.message}`);
    // Commessa già creata: l'originale entra subito nei suoi documenti (non visibile al cliente). Serve anche per
    // leggerlo: la regola office_attachment_file_read lascia leggere in order-attachments solo i file registrati.
    if (orderId && user) {
      const { data: gia } = await supabase.from("order_attachments").select("id").eq("order_id", orderId).eq("file_url", path).limit(1);
      if (!gia?.length) {
        const { error: eDoc } = await supabase.from("order_attachments").insert({
          order_id: orderId, file_name: originale.name, file_url: path, file_type: originale.type || "application/octet-stream",
          file_size: originale.size, uploaded_by: user.id, visible_to_customer: false,
          // Senza, vale «riservato» (solo amministratori): il contratto è un documento di vendita, come gli importi.
          access_scope: "vendita",
        } as never);
        if (eDoc) throw new Error(`Documenti della commessa: ${eDoc.message}`);
      }
    }
    return {bucket,path,name:originale.name,mime:originale.type || "application/pdf",size:originale.size,sha256:sha};
  };

  const analyze = async (notaExtra = "") => {
    if ((!file && !remoteFile) || !companyId) return;
    const note = [noteAi, notaExtra].filter(Boolean).join(" ");
    setBusy(true); setError(null); setCommessaCollegata(null);
    try {
      // La lettura strutturata avviene prima di qualsiasi upload: il computo resta sul dispositivo
      // finché l'utente conferma «Applica». Anche una demo senza credito AI può leggerlo.
      if (destinazione === "cliente" && file) {
        const daComputo = await leggiComputoSenzaAi(file);
        if (daComputo) {
          setExtract({ ...daComputo, warnings: [...daComputo.warnings,
            ...(/\bsal\b|finale|consuntiv/i.test(file.name) ? ["Il nome del file indica un SAL o un consuntivo: verifica quali lavori sono già eseguiti prima di pianificare nuovi acquisti."] : [])] });
          setScelte(new Set(partiPresenti(daComputo)));
          setVerifica(null); setTestoDocumento(null);
          return;
        }
      }
      // Stesso contenuto e stesse indicazioni, anche con un nome diverso: nessun nuovo invio al modello.
      if (file && !notaExtra) {
        const precedente = await cercaLetturaContratto(companyId, await improntaFileContratto(file), contesto, orderId);
        if (precedente) { riprendiAnalisi(precedente); return; }
      }
      let bucket: string, path: string, fileName: string, mime: string;
      if (file) {
        // Path = hash del contenuto (audit 2026-09, punto 2): lo stesso file
        // ricaricato finisce sullo STESSO path → stessa chiave di idempotenza
        // → l'aiRouter risponde dalla cache e il retry non costa nulla.
        // (Prima era Date.now(): ogni tentativo una chiamata a pagamento.)
        const originale = await caricaOriginale(file);
        bucket = originale.bucket;
        path = originale.path;
        fileName = originale.name;
        mime = originale.mime;
      } else {
        // File già su storage dal flusso Silvio: zero upload, zero drag.
        bucket = remoteFile!.bucket;
        path = remoteFile!.path;
        fileName = remoteFile!.name;
        mime = remoteFile!.mime;
      }

      // Un computo (PDF di PriMus, .xpwe, .xlsx) si legge qui, esatto e gratis: all'AI 167-226 voci non stanno
      // in una risposta, e la lettura usciva tronca e pagata (17/11/2026). Gli altri documenti vanno all'AI.
      if (destinazione === "cliente") {
        const originale = file ?? await (async () => {
          const { data: blob } = await supabase.storage.from(bucket).download(path);
          return blob ? new File([blob], fileName, { type: mime }) : null;
        })();
        const daComputo = originale ? await leggiComputoSenzaAi(originale) : null;
        if (daComputo) {
          setPathAnalizzato(`${bucket}/${path}`);
          setExtract(daComputo);
          setScelte(new Set(partiPresenti(daComputo)));
          setVerifica(null);
          setTestoDocumento(null);
          return;
        }
      }

      const leggi = async (nota: string) => {
        const { data, error: fnErr } = await supabase.functions.invoke("generic-doc-ai-extract", {
          body: {
            storage_bucket: bucket,
            storage_path: path,
            file_name: fileName,
            mime_type: mime,
            company_id: companyId,
            doc_type: "contratto_commessa",
            // La regola delle voci va sempre, dopo le note di chi carica (17/11/2026: con la regola 12 letture su 12
            // complete, senza 11 su 12 e una volta una riga sola su 56). Se la nota è lunga, si taglia la regola.
            user_hint: destinazione === "cliente" ? contractAnalysisHint(effectiveCompany?.id === companyId ? effectiveCompany.name : null, noteAi, notaExtra || (nota.includes(RILEGGI_VOCI) ? RILEGGI_VOCI : REGOLA_VOCI)) : `Destinazione: ${destinazione}. Azienda importatrice: ${effectiveCompany?.name?.slice(0,80) ?? ""}. Estrai dati_appalto, corpo/misura, stima e tetto, base prima del ribasso, sicurezza e condizioni SAL solo esplicite. Distingui totale RTI e quota azienda. Non inventare IVA, tariffe, date, firme o incassi. ${nota}`.slice(0,600),
          },
        });
        if (fnErr) throw new Error(await edgeErrorMessage(fnErr, t("Analisi AI fallita")));
        if (data?.error) throw new Error(String(data.error));
        return reconcileContractExtract(parseContractExtract(data?.extracted ?? data));
      };
      let parsed = await leggi(note);
      if (!parsed.cliente.nome_completo && !parsed.descrizione_lavori && contractImponibile(parsed) == null && !parsed.voci.length && parsed.dati_appalto?.importo_base_eur == null && parsed.dati_appalto?.stima_eur == null) {
        throw new Error(t("Non sono stati letti dati utili del contratto. Controlla il documento e riprova: i campi della commessa non sono stati modificati."));
      }
      // Il testo del PDF (gratis, nel browser): serve al controllo dei valori e a capire se l'AI ha letto
      // solo il totale. In quel caso si rilegge da soli una volta, con l'indicazione delle voci.
      let pagine: string[] | null = null;
      if (/pdf/i.test(mime) || /\.pdf$/i.test(fileName)) {
        try {
          const dati = file ? await file.arrayBuffer() : await (await supabase.storage.from(bucket).download(path)).data?.arrayBuffer();
          if (dati) pagine = await testoPaginePdf(dati);
        } catch { /* controllo facoltativo */ }
      }
      const testo = pagine ? pagine.join("\n") : null;
      if (destinazione === "cliente" && !notaExtra && soloIlTotale(parsed, testo)) {
        setRileggo(true);
        try {
          const seconda = await leggi([note, RILEGGI_VOCI].filter(Boolean).join(" "));
          if (seconda.voci.length > parsed.voci.length) parsed = seconda;
        } catch { /* resta la prima lettura, con l'avviso e il bottone «Rileggi» */ }
        finally { setRileggo(false); }
      }
      setPathAnalizzato(`${bucket}/${path}`);
      if (pagine) parsed = completaRiscontriLettura(integraUnitaDalPdf(parsed, pagine).estratto, pagine);
      setExtract(parsed);
      setScelte(new Set(partiPresenti(parsed)));
      setVerifica(pagine ? verificaContrattoNelTesto(parsed, pagine) : null);
      setTestoDocumento(testo);
      await archiviaAnalisi(parsed, { bucket, path, name: fileName, mime, size: file?.size }, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof AnalisiGiaCollegataError) setCommessaCollegata(e.orderId);
    } finally {
      setBusy(false);
    }
  };

  const navigate = useNavigate();
  const [creandoOda, setCreandoOda] = useState(false);
  const [registrandoRdo, setRegistrandoRdo] = useState(false);
  // "nuova" = crea una RDO da questa offerta; altrimenti l'id della RDO
  // aperta a cui agganciare l'offerta come risposta del fornitore.
  const [rdoTarget, setRdoTarget] = useState<string>("nuova");

  // RDO aperte dell'azienda: servono solo quando il documento è un'offerta
  // fornitore (per agganciarla come risposta a una richiesta esistente).
  const { data: rdoAperte = [] } = useQuery({
    queryKey: ["rdo-aperte-import", companyId],
    enabled: !!companyId && !!extract && extract.natura_documento === "offerta_fornitore",
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("supplier_rfqs")
        .select("id, rfq_number, titolo, status")
        .eq("company_id", companyId!)
        .in("status", ["bozza", "inviata", "in_valutazione"])
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as { id: string; rfq_number: string; titolo: string; status: string }[];
    },
  });

  /** Fornitore per nome: find-or-create (condiviso da OdA e RDO). */
  const trovaOCreaFornitore = async (nomeFornitore: string): Promise<string> => {
    const { data: esistenti } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId!)
      .ilike("name", nomeFornitore);
    const match = esistenti?.find((s) => s.name?.trim().toLowerCase() === nomeFornitore.toLowerCase())?.id ?? esistenti?.[0]?.id ?? null;
    if (match) return match;
    const { data: nuovo, error: supErr } = await supabase
      .from("suppliers")
      .insert({ company_id: companyId!, name: nomeFornitore } as never)
      .select("id")
      .single();
    if (supErr) throw new Error(`Fornitore: ${supErr.message}`);
    toast.success(t("Fornitore \"{nome}\" creato in anagrafica", { nome: nomeFornitore }));
    return (nuovo as { id: string }).id;
  };

  /**
   * Offerta AI → risposta RDO (richiesta utente 2026-09): due offerte di due
   * fornitori per lo stesso lavoro sono un CONFRONTO, non due ordini. La
   * prima offerta puo' CREARE la RDO (le sue voci diventano le righe
   * richieste); le successive si AGGANCIANO a una RDO aperta: fornitore in
   * tabella con stato 'risposta', prezzi per riga in supplier_rfq_quotes
   * (match per descrizione, fallback per posizione) — e il confronto
   * righe×fornitori dell'area RDO fa il resto.
   */
  const registraRispostaRdo = async () => {
    if (!extract || !companyId || registrandoRdo) return;
    if (extract.valuta && extract.valuta !== "EUR") {
      toast.error(t("L'offerta è in {valuta}: converti gli importi prima di registrarla.", { valuta: extract.valuta }));
      return;
    }
    const nomeFornitore = extract.fornitore_emittente?.trim();
    if (!nomeFornitore) {
      toast.error(t("Fornitore emittente non rilevato: scrivilo nelle indicazioni per l'AI e rianalizza."));
      return;
    }
    setRegistrandoRdo(true);
    // Se la RDO nasce in questa chiamata e un passo successivo fallisce, va
    // eliminata (la cascade porta via anche le righe): niente RDO orfane.
    let rfqCreataQui: string | null = null;
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const supplierId = await trovaOCreaFornitore(nomeFornitore);

      let rfqId = rdoTarget;
      let itemsRdo: { id: string; descrizione: string; posizione: number | null }[] = [];
      if (rdoTarget === "nuova") {
        const titolo = (extract.descrizione_lavori || "Fornitura da offerta").slice(0, 90);
        const { data: rfq, error: rfqErr } = await supabase
          .from("supplier_rfqs")
          .insert({
            company_id: companyId,
            titolo,
            descrizione: `Creata dall'offerta "${file?.name ?? remoteFile?.name ?? "documento"}" letta dall'AI.`,
            created_by: user?.id,
          } as never)
          .select("id")
          .single();
        if (rfqErr) throw rfqErr;
        rfqId = (rfq as { id: string }).id;
        rfqCreataQui = rfqId;
        const { data: nuoviItems, error: itErr } = await supabase
          .from("supplier_rfq_items")
          .insert(extract.voci.map((v, idx) => ({
            rfq_id: rfqId,
            company_id: companyId,
            descrizione: v.descrizione,
            quantita: v.quantita || 1,
            unita_misura: "pz",
            posizione: idx,
          })) as never)
          .select("id, descrizione, posizione");
        if (itErr) throw itErr;
        itemsRdo = (nuoviItems ?? []) as typeof itemsRdo;
      } else {
        const { data: esistenti, error: itErr } = await supabase
          .from("supplier_rfq_items")
          .select("id, descrizione, posizione")
          .eq("rfq_id", rfqId)
          .order("posizione");
        if (itErr) throw itErr;
        itemsRdo = (esistenti ?? []) as typeof itemsRdo;
      }

      // Validità offerta: "valida 15 giorni" ancorata alla data del documento
      // (o a oggi se il documento non la stampa).
      let validitaOfferta: string | null = null;
      if (extract.validita_offerta_giorni != null) {
        const ancora = extract.data_documento ? new Date(`${extract.data_documento}T00:00:00`) : new Date();
        ancora.setDate(ancora.getDate() + extract.validita_offerta_giorni);
        validitaOfferta = ancora.toLocaleDateString("en-CA");
      }
      const rispostaBase: Record<string, unknown> = {
        status: "risposta",
        risposta_at: new Date().toISOString(),
        totale_offerto: contractImponibile(extract),
        aggancio_da: "ai_pdf",
        aggancio_confidenza: extract.confidence || null,
        aggancio_da_confermare: false,
        allegato_url: pathAnalizzato,
        note: `Offerta letta dall'AI dal file "${file?.name ?? remoteFile?.name ?? "documento"}"${extract.sconto_globale_pct != null ? ` — sconto ${extract.sconto_globale_pct}%` : ""}.`,
      };
      // Solo se il documento li dice: null qui cancellerebbe dati inseriti a mano.
      if (extract.consegna_giorni != null) rispostaBase.giorni_consegna = extract.consegna_giorni;
      if (validitaOfferta) rispostaBase.validita_offerta = validitaOfferta;
      if (extract.modalita_pagamento) rispostaBase.condizioni_pagamento = extract.modalita_pagamento;

      // Fornitore già sulla RDO (es. offerta ricaricata dopo una correzione):
      // si AGGIORNA la sua risposta — l'UNIQUE (rfq_id, supplier_id) altrimenti
      // farebbe esplodere l'insert con un errore grezzo.
      const { data: giaPresente } = await supabase
        .from("supplier_rfq_suppliers")
        .select("id")
        .eq("rfq_id", rfqId)
        .eq("supplier_id", supplierId)
        .maybeSingle();
      let rfqSupplierId: string;
      const aggiornata = !!giaPresente;
      if (giaPresente) {
        rfqSupplierId = (giaPresente as { id: string }).id;
        const { error: updErr } = await supabase
          .from("supplier_rfq_suppliers")
          .update(rispostaBase as never)
          .eq("id", rfqSupplierId);
        if (updErr) throw new Error(`Fornitore su RDO: ${updErr.message}`);
        // I prezzi vecchi si buttano: la nuova lettura è la risposta intera,
        // tenerne metà di prima e metà di adesso mischierebbe due offerte.
        const { error: delErr } = await supabase.from("supplier_rfq_quotes").delete().eq("rfq_supplier_id", rfqSupplierId);
        if (delErr) throw new Error(`Pulizia prezzi precedenti: ${delErr.message}`);
      } else {
        const { data: rfqSup, error: supRdoErr } = await supabase
          .from("supplier_rfq_suppliers")
          .insert({ rfq_id: rfqId, company_id: companyId, supplier_id: supplierId, ...rispostaBase } as never)
          .select("id")
          .single();
        if (supRdoErr) throw new Error(`Fornitore su RDO: ${supRdoErr.message}`);
        rfqSupplierId = (rfqSup as { id: string }).id;
      }

      // Lo sconto globale va nelle quotes SOLO se i prezzi riga sono lordi:
      // alcuni documenti mostrano prezzi già scontati, altri prezzi pieni con
      // lo sconto a parte. Decide l'ipotesi che avvicina di più la somma voci
      // al totale merce del documento — cioè l'imponibile SENZA gli altri
      // costi (imballo/trasporto arrivano dopo lo sconto: Termoplast fa
      // 8.840×0,85 + imballo + trasporto = 8.462,70).
      const sommaVoci = contractSommaVoci(extract);
      const impDoc = contractImponibile(extract);
      const altriCosti = extract.altri_costi.reduce((s, a) => s + (a.importo_eur || 0), 0);
      let scontoQuote = extract.sconto_globale_pct ?? 0;
      if (scontoQuote > 0 && sommaVoci > 0 && impDoc != null) {
        const targetMerce = impDoc - altriCosti;
        const deltaConSconto = Math.abs(sommaVoci * (1 - scontoQuote / 100) - targetMerce);
        const deltaSenza = Math.abs(sommaVoci - targetMerce);
        if (deltaSenza < deltaConSconto) scontoQuote = 0;
      }

      // Match voce offerta → riga RDO. Due fornitori descrivono la stessa
      // posizione con parole diverse ("Finestra 2 TRP Rehau…" vs "Finestra 2
      // a due ante…"): la chiave robusta è tipo+numero di posizione. Il
      // fallback per indice scatta SOLO se nessuna descrizione ha matchato
      // (offerte con numerazioni assenti): mischiato al match testuale
      // produce slittamenti che gonfiano il confronto.
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      const chiavePos = (s: string): string | null => {
        const m = norm(s).match(/^([a-z]+(?: finestra)?)\s+(?:[a-z]{1,4}\s+)?(\d{1,3})\b/);
        return m ? `${m[1]}|${m[2]}` : null;
      };
      const usati = new Set<string>();
      type Abbinata = { voce: (typeof extract.voci)[number]; itemId: string };
      const abbinate: Abbinata[] = [];
      const orfane: (typeof extract.voci)[number][] = [];
      extract.voci.forEach((v) => {
        const nv = norm(v.descrizione);
        const kv = chiavePos(v.descrizione);
        const target = itemsRdo.find((it) => {
          if (usati.has(it.id)) return false;
          const ni = norm(it.descrizione);
          if (ni === nv) return true;
          if (nv.length >= 6 && ni.length >= 6 && (ni.startsWith(nv) || nv.startsWith(ni))) return true;
          const ki = chiavePos(it.descrizione);
          return !!kv && !!ki && kv === ki;
        });
        if (target) { usati.add(target.id); abbinate.push({ voce: v, itemId: target.id }); }
        else orfane.push(v);
      });
      if (abbinate.length === 0 && itemsRdo.length === extract.voci.length) {
        // Nessun aggancio testuale ma stesso numero di righe: allineamento 1:1.
        extract.voci.forEach((v, idx) => abbinate.push({ voce: v, itemId: itemsRdo[idx].id }));
        orfane.length = 0;
      }
      const nonAbbinate = orfane.length;
      const quotes = abbinate
        .filter(({ voce }) => voce.prezzo_unitario_eur > 0) // voce non quotata ≠ quotata a 0 €
        .map(({ voce, itemId }) => ({
          rfq_supplier_id: rfqSupplierId,
          rfq_item_id: itemId,
          company_id: companyId,
          prezzo_unitario: voce.prezzo_unitario_eur,
          sconto_percentuale: scontoQuote,
          aliquota_iva: extract.iva_pct ?? 22,
          disponibile: true,
        }));
      if (quotes.length > 0) {
        const { error: qErr } = await supabase
          .from("supplier_rfq_quotes")
          .upsert(quotes as never, { onConflict: "rfq_supplier_id,rfq_item_id" });
        if (qErr) throw new Error(`Prezzi: ${qErr.message}`);
      }

      toast.success(
        rdoTarget === "nuova"
          ? t("RDO creata con la risposta di {nome} ({n} prezzi)", { nome: nomeFornitore, n: quotes.length })
          : nonAbbinate
            ? t(aggiornata ? "Risposta di {nome} aggiornata sulla RDO ({n} prezzi, {m} voci non abbinate)" : "Risposta di {nome} registrata sulla RDO ({n} prezzi, {m} voci non abbinate)", { nome: nomeFornitore, n: quotes.length, m: nonAbbinate })
            : t(aggiornata ? "Risposta di {nome} aggiornata sulla RDO ({n} prezzi)" : "Risposta di {nome} registrata sulla RDO ({n} prezzi)", { nome: nomeFornitore, n: quotes.length }),
      );
      if (nonAbbinate > 0) toast.warning(t("{n} voci dell'offerta non hanno trovato la riga RDO corrispondente: controllale nel confronto.", { n: nonAbbinate }));
      onOpenChange(false);
      navigate(`/azienda/richieste-offerta/${rfqId}`);
    } catch (e) {
      if (rfqCreataQui) {
        await supabase.from("supplier_rfqs").delete().eq("id", rfqCreataQui);
      }
      toast.error(e instanceof Error ? e.message : t("Errore registrazione risposta RDO"));
    } finally {
      setRegistrandoRdo(false);
    }
  };

  /**
   * Ponte offerta fornitore → Ordine d'Acquisto (audit 2026-09, punto 3):
   * quando l'AI riconosce l'offerta di un PRODUTTORE, le voci estratte
   * diventano un OdA in bozza col fornitore agganciato (o creato) — invece
   * di morire in un avviso. I prezzi entrano già scontati dello sconto
   * rivenditore; imballaggio/trasporto come righe proprie.
   */
  const creaOdaDaOfferta = async () => {
    if (!extract || !companyId || creandoOda) return;
    if (extract.valuta && extract.valuta !== "EUR") {
      toast.error(t("L'offerta è in {valuta}: converti gli importi prima di creare l'OdA.", { valuta: extract.valuta }));
      return;
    }
    const nomeFornitore = extract.fornitore_emittente?.trim();
    if (!nomeFornitore) {
      toast.error(t("Fornitore emittente non rilevato: scrivilo nelle indicazioni per l'AI (es. \"il fornitore è Termoplast\") e rianalizza."));
      return;
    }
    setCreandoOda(true);
    try {
      const supplierId = await trovaOCreaFornitore(nomeFornitore);
      const user = (await supabase.auth.getUser()).data.user;
      const sconto = extract.sconto_globale_pct;
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          supplier_id: supplierId,
          created_by: user?.id,
          notes:
            `Generato dall'offerta "${file?.name ?? remoteFile?.name ?? "documento"}" (lettura AI)` +
            (sconto != null ? ` — prezzi già scontati del ${sconto}%` : ""),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select()
        .single();
      if (poErr) throw poErr;
      const poId = (po as { id: string }).id;

      const fattoreSconto = sconto != null ? 1 - sconto / 100 : 1;
      const ivaRiga = extract.iva_pct ?? 22;
      const righe = [
        ...extract.voci.map((v, idx) => ({
          company_id: companyId,
          purchase_order_id: poId,
          description: v.descrizione,
          quantity: v.quantita || 1,
          unit_price: Math.round(v.prezzo_unitario_eur * fattoreSconto * 100) / 100,
          vat_rate: ivaRiga,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: idx,
        })),
        ...extract.altri_costi.map((a, idx) => ({
          company_id: companyId,
          purchase_order_id: poId,
          description: a.descrizione,
          quantity: 1,
          unit_price: a.importo_eur,
          vat_rate: ivaRiga,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: extract.voci.length + idx,
        })),
      ];
      if (righe.length > 0) {
        const { error: riErr } = await supabase.from("purchase_order_items").insert(righe as never);
        if (riErr) throw riErr;
      }

      toast.success(t("Ordine d'Acquisto creato in bozza dalle voci dell'offerta"));
      onOpenChange(false);
      navigate(`/azienda/ordini-acquisto/${poId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Errore creazione OdA"));
    } finally {
      setCreandoOda(false);
    }
  };

  const apply = async () => {
    if (!extract || (destinazione === "cliente" && !workflowProfilo.data)) return;
    if (extract.valuta && extract.valuta !== "EUR") { toast.error(t("Il documento non è in euro. Converti gli importi prima di applicarlo.")); return; }
    if (firmaVerificata && !dataFirmaVerificata({ firmaConfermataIl:dataFirma }, new Date().toLocaleDateString("en-CA"))) {
      toast.error(t("Indica la data effettiva della firma, non futura."));
      return;
    }
    // Anche il file riusato da Silvio deve finire nei Documenti: se non c'è
    // un File locale, lo si scarica da storage e lo si passa come tale.
    let sorgente: File | null = file;
    if (!sorgente && remoteFile) {
      try {
        const { data: blob, error: downloadError } = await supabase.storage.from(remoteFile.bucket).download(remoteFile.path);
        if (downloadError || !blob) throw new Error("Documento originale non disponibile");
        sorgente = new File([blob], remoteFile.name, { type: remoteFile.mime });
      } catch {
        toast.error(t("Non riesco a recuperare il documento originale. Riprova o caricalo di nuovo prima di applicare i dati."));
        return;
      }
    }
    const slash = pathAnalizzato?.indexOf("/") ?? -1;
    let source: StoredContractFile | null = pathAnalizzato && slash > 0 ? { bucket: pathAnalizzato.slice(0,slash), path: pathAnalizzato.slice(slash+1), name: sorgente?.name ?? remoteFile?.name ?? "contratto.pdf", mime: sorgente?.type ?? remoteFile?.mime ?? "application/pdf" } : null;
    // Un file non caricato da questo lettore (es. quello di Silvio) si conserva tra gli originali del contratto.
    if (sorgente && (!source || source.bucket !== (orderId ? BUCKET : BUCKET_ORIGINALI_AI) || !source.path.startsWith(`${orderId ?? companyId}/ai-contratti/`))) {
      try { source = await caricaOriginale(sorgente); }
      catch { toast.error(t("Non riesco a conservare l'originale nei documenti della commessa. Riprova prima di applicare i dati.")); return; }
    }
    if (source && sorgente) source.size = sorgente.size;
    if (source && analisiSalvata) source = { ...source, sha256: analisiSalvata.originale.sha256 ?? source.sha256, analysisId: analisiSalvata.analysisId };
    // Il computo letto sul dispositivo si archivia con l'originale solo alla conferma.
    if (source && extract.origine_lettura === "computo") await archiviaAnalisi(extract, source, sorgente);
    if (source && firmaVerificata) source.firmaConfermataIl = dataFirma;
    // Solo le parti spuntate: le altre arrivano vuote, come se il documento non le avesse.
    onApply(destinazione === "cliente" ? soloLeParti(extract, scelte) : extract, sorgente, source);
    onOpenChange(false);
    toast.success(t("Dati del contratto applicati alla commessa. Rivedi e salva."));
  };

  // Il piano della commessa dal contratto: cosa si conferma dopo nel modulo.
  const pianoContratto = destinazione === "cliente" && extract && workflowProfilo.data ? prepareContract(extract, modelliFasi, workflowProfilo.data) : null;
  const conferme = pianoContratto ? confermeDelPiano(pianoContratto) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ampiezza="spazio" struttura="scorrevole">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-orange-500" />
            {t("Carica contratto / copia commissione / computo metrico")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("Carica una foto o un PDF (anche il computo metrico): l'AI legge i dati e precompila la commessa. Rivedi sempre prima di salvare.")}
          </DialogDescription>
        </DialogHeader>

        {!extract ? (
          <div className="space-y-4">
            {!file && analisiRecenti.length > 0 && <div className="space-y-2 rounded-lg border p-3" aria-label={t("Analisi salvate")}>
              <p className="text-sm font-medium">{orderId ? t("Documenti di questa commessa") : t("Documenti da completare")}</p>
              <p className="text-xs text-muted-foreground">{orderId ? t("Riapri le ultime tre letture senza consumare AI.") : t("Ultime tre letture ancora da collegare. Dopo la creazione restano nella loro commessa.")}</p>
              {analisiRecenti.map((lettura) => <Button key={`${lettura.originale.path}-${lettura.contesto}`} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" disabled={busy} onClick={() => riprendiAnalisi(lettura)}>
                {lettura.originale.name} · {new Date(lettura.salvata_il).toLocaleString(intlCampo())}
              </Button>)}
            </div>}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pick(f); }}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" className="hidden" aria-label={t("File contratto")} disabled={busy} accept={ACCEPTED.join(",")}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
              {file ? (
                <div className="flex items-center gap-3 justify-center">
                  {file.type.startsWith("image/") ? <ImageIcon className="h-8 w-8 text-purple-500" /> : <FileText className="h-8 w-8 text-red-500" />}
                  <div className="text-left">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}</p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={busy} aria-label={t("Rimuovi file contratto")} onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  {remoteFile ? (
                    <p className="text-sm font-medium">
                      <FileText className="mb-0.5 mr-1 inline h-4 w-4 text-emerald-600" />
                      {t("Uso il file già caricato:")} <span className="font-semibold" dir="auto">{remoteFile.name}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{t("oppure trascina qui un altro documento")}</span>
                    </p>
                  ) : (
                  <p className="text-sm font-medium">{t("Trascina qui il contratto")}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{t("PDF, XPWE, Excel .xlsx o immagine — max {max}. I computi strutturati si leggono sul dispositivo.", { max: fmtBytes(MAX_SIZE) })}</p>
                </>
              )}
            </div>

            {/* Note per l'AI: chi carica sa cose che il documento non dice
                chiaramente. Entrano nel prompt con priorità sulle deduzioni. */}
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="note-ai-contratto">
                {t("Indicazioni per l'AI (facoltative)")}
              </label>
              <textarea
                id="note-ai-contratto"
                disabled={busy}
                value={noteAi}
                onChange={(e) => setNoteAi(e.target.value.slice(0, 120))}
                maxLength={120}
                rows={2}
                placeholder={t("Es. L'IVA è al 10% · È un'offerta del fornitore, il cliente finale è Rossi · I prezzi sono per pezzo, non totali")}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("{n}/120 caratteri", { n: noteAi.length })}</p>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div><span>{error}</span>{commessaCollegata && <Button type="button" variant="outline" size="sm" className="mt-2 block" onClick={() => navigate(`/azienda/ordini/${commessaCollegata}`)}>{t("Apri commessa collegata")}</Button>}</div>
              </div>
            )}

          </div>
        ) : (
          <div className="space-y-3">
            {analisiSalvata && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
              <span className="flex-1">{orderId ? t("Lettura recuperata · {data} · di questa commessa", { data: new Date(analisiSalvata.salvata_il).toLocaleString(intlCampo()) }) : t("Lettura recuperata · {data} · si collega quando crei la commessa", { data: new Date(analisiSalvata.salvata_il).toLocaleString(intlCampo()) })}</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void analyze(`${REGOLA_VOCI} Nuova lettura richiesta dall’utente: ${new Date().toISOString()}.`)}>{busy ? t("Rilettura…") : t("Aggiorna con l’AI")}</Button>
            </div>}
            {erroreArchivio && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{t("Questa analisi non è stata archiviata: i dati sono disponibili nell’anteprima, ma il recupero dopo la chiusura non è garantito.")}</p>}
            {destinazione === "cliente" && !workflowProfilo.data && <p role="status" className="text-sm text-muted-foreground">{workflowProfilo.isError ? t("Configurazione aziendale non disponibile. Riprova prima di applicare il contratto.") : t("Caricamento configurazione aziendale…")}</p>}
            {destinazione === "cliente" && pianoContratto && !eLavoroSingolo(pianoContratto) && <ContractPreparationCard piano={pianoContratto} />}
            {soloIlTotale(extract, testoDocumento) && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{extract.voci.length === 1 ? t("Il documento ha un elenco di voci con i prezzi, ma l'AI ha letto solo la riga del totale.") : t("Il documento ha un elenco di voci con i prezzi, ma l'AI ha letto solo {n} righe.", { n: extract.voci.length })}</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void analyze(RILEGGI_VOCI)}>
                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{t("Rileggi con tutte le voci")}
                </Button>
              </div>
            )}
            <RisultatoLettura extract={extract.origine_lettura === "computo" ? extract : { ...extract, fasi_lavoro: fasiOperativePerEstratto(pianoOperativoContratto(extract)) }} verifica={verifica} testoDocumento={testoDocumento}
              pianoCollegato={companyId && destinazione === "cliente" && extract.origine_lettura !== "computo" ? <PianoContrattoCollegato extract={extract} companyId={companyId} orderId={orderId} /> : undefined}
              scelte={destinazione === "cliente" && extract.natura_documento !== "offerta_fornitore" ? scelte : undefined}
              onModifica={(e) => {
                // Una parte che era vuota e ora ha qualcosa (fasi aggiunte a mano) si spunta da sola.
                const prima = new Set(partiPresenti(extract));
                const nuove = partiPresenti(e).filter((p) => !prima.has(p));
                if (nuove.length) setScelte((s) => new Set([...s, ...nuove]));
                setExtract(e);
              }}
              onScelta={(parte, si) => setScelte((prima) => { const dopo = new Set(prima); if (si) dopo.add(parte); else dopo.delete(parte); return dopo; })}
              daConfermare={conferme?.brevi ?? []}
              extraAvvisi={[...(conferme?.altre ?? []), ...(extract.appalto_pubblico?.informazioni_da_confermare ?? []).map(readableContractWarning)]}
              dopoDati={<>
                {destinazione !== "cliente" && <p className="rounded-lg border bg-muted/30 p-3 text-sm">{destinazione === "appaltatore" ? t("Proposta per il lavoro in appalto. Conferma committente, corpo/misura e contratto/listino nel modulo esistente. La stima a misura non genera rate.") : t("Proposta per Contratto e SAL. Verifica base, ribasso, sicurezza e quota dell’azienda: il totale RTI non viene attribuito automaticamente.")}</p>}
                {destinazione !== "cliente" && extract.dati_appalto && <dl className="grid gap-x-4 gap-y-1 rounded-lg border p-3 text-sm sm:grid-cols-2" aria-label={t("Dati del contratto in appalto")}>{[
                  [t("Valorizzazione"), extract.dati_appalto.valorizzazione === "a_corpo" ? t("A corpo") : extract.dati_appalto.valorizzazione === "a_misura" ? t("A misura") : t("Da confermare")],
                  [t("Base soggetta a ribasso"), extract.dati_appalto.importo_base_eur == null ? t("Da confermare") : formatCurrency(extract.dati_appalto.importo_base_eur)],
                  [t("Stima"), extract.dati_appalto.stima_eur == null ? t("Non dichiarata") : formatCurrency(extract.dati_appalto.stima_eur)],
                  [t("Tetto"), extract.dati_appalto.tetto_eur == null ? t("Non dichiarato") : formatCurrency(extract.dati_appalto.tetto_eur)],
                  [t("Ribasso"), extract.dati_appalto.ribasso_pct == null ? t("Da confermare") : `${extract.dati_appalto.ribasso_pct}%`],
                  [t("Sicurezza"), extract.dati_appalto.oneri_sicurezza_eur == null ? t("Da confermare") : formatCurrency(extract.dati_appalto.oneri_sicurezza_eur)],
                  [t("Anticipazione"), extract.dati_appalto.anticipazione_pct == null ? t("Da confermare") : `${extract.dati_appalto.anticipazione_pct}%`],
                  [t("Ritenuta"), extract.dati_appalto.ritenuta_pct == null ? t("Da confermare") : `${extract.dati_appalto.ritenuta_pct}%`],
                ].map(([nome, valore]) => <div key={nome}><dt className="text-muted-foreground">{nome}</dt><dd className="font-medium">{valore}</dd></div>)}</dl>}
              </>} />

            {destinazione === "cliente" && extract.natura_documento === "offerta_fornitore" && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-sky-900">{t("Confronto fornitori (RDO)")}</p>
                <p className="text-[11px] text-sky-800">{t("Se hai più offerte per lo stesso lavoro, registrale come risposte a una richiesta d'offerta: le confronti riga per riga prima di ordinare.")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <OfficeSelect
                    label={t("Richiesta d'offerta di destinazione")}
                    value={rdoTarget}
                    onValueChange={setRdoTarget}
                    className="h-8 max-w-[280px] text-xs"
                    options={[
                      { value: "nuova", label: t("— Crea nuova RDO da questa offerta —") },
                      ...rdoAperte.map((r) => ({
                        value: r.id,
                        label: `${r.rfq_number} · ${r.titolo}`,
                      })),
                    ]}
                  />
                  <Button size="sm" variant="outline" onClick={registraRispostaRdo} disabled={registrandoRdo} className="gap-1 h-8">
                    {registrandoRdo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {t("Registra come risposta RDO")}
                  </Button>
                </div>
              </div>
            )}

            {extract.natura_documento !== "offerta_fornitore" && <fieldset className="space-y-2 rounded-lg border p-3">
              {/* L'AI che vede la firma non basta: la firma fa partire le scadenze, la conferma resta di chi carica.
                  Ma diventa un clic, con la data già scritta (17/11/2026). */}
              {extract.firma?.presente && !firmaVerificata && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span dir="auto">{(() => {
                    const firmatario = extract.firma?.firmatario;
                    const data = extract.firma?.data ? extract.firma.data.split("-").reverse().join("/") : null;
                    if (firmatario && data) return t("L'AI vede la firma di {firmatario} del {data}.", { firmatario, data });
                    if (firmatario) return t("L'AI vede la firma di {firmatario}.", { firmatario });
                    if (data) return t("L'AI vede la firma del {data}.", { data });
                    return t("L'AI vede la firma.");
                  })()}</span>
                  <Button type="button" size="sm" variant="outline" className="h-7"
                    onClick={() => { setFirmaVerificata(true); if (extract.firma?.data) setDataFirma(extract.firma.data); }}>
                    {t("Confermo: è firmato")}
                  </Button>
                </div>
              )}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={firmaVerificata} onChange={e=>setFirmaVerificata(e.target.checked)} className="mt-1" /><span>{t("Ho verificato che il documento è firmato dalle parti")}</span></label>
              {firmaVerificata && <label className="block text-sm">{t("Data effettiva della firma")}<input type="date" className="mt-1 block rounded-md border bg-background px-3 py-2" value={dataFirma} max={new Date().toLocaleDateString("en-CA")} onChange={e=>setDataFirma(e.target.value)} /></label>}
              <p className="text-xs text-muted-foreground">{t("Senza questa conferma il file resta un allegato e non attiva le scadenze legate alla firma. La data del documento non viene usata come data di firma.")}</p>
            </fieldset>}
          </div>
        )}
        <DialogFooter className="flex-wrap justify-between gap-2">
          {!extract ? (
            <Button onClick={() => analyze()} disabled={(!file && !remoteFile) || busy || !companyId}>
              {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {rileggo ? t("Rileggo le voci, la prima lettura era incompleta…") : t("L'AI sta leggendo…")}</> : <><Sparkles className="h-4 w-4 mr-1" /> {t("Analizza con l'AI")}</>}
            </Button>
          ) : <>
              <Button variant="outline" disabled={busy} onClick={reset}>{t("Ricarica un altro")}</Button>
              {destinazione === "cliente" && extract.natura_documento !== "offerta_fornitore" && (
                <span className="min-w-0 flex-1 self-center text-xs text-muted-foreground">
                  {scelte.size ? t("Entrano nella commessa: {parti}", { parti: [...scelte].map((p) => t(ETICHETTA_PARTE[p]).toLowerCase()).join(", ") }) : t("Non hai scelto niente da applicare")}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                {destinazione === "cliente" && extract.natura_documento === "offerta_fornitore" && (
                  <Button variant="brand" onClick={creaOdaDaOfferta} disabled={creandoOda} className="gap-1">
                    {creandoOda ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t("Crea Ordine d'Acquisto")}
                  </Button>
                )}
                <Button onClick={apply} disabled={busy || (destinazione === "cliente" && (!workflowProfilo.data || (extract.natura_documento !== "offerta_fornitore" && scelte.size === 0))) || (firmaVerificata && !dataFirmaVerificata({firmaConfermataIl:dataFirma},new Date().toLocaleDateString("en-CA")))} className="gap-1"><CheckCircle2 className="h-4 w-4" />{destinazione === "appaltatore" ? t("Applica al lavoro") : destinazione === "generale_appalto" ? t("Applica al contratto") : t("Applica alla commessa")}</Button>
              </div>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


