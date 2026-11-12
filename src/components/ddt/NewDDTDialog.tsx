// ============================================================================
// NewDDTDialog — la bolla del fornitore, in un solo passaggio (12/11/2026)
// ----------------------------------------------------------------------------
// Prima era un percorso a 3 step (documento, trasporto, verifica) e la foto
// caricata al primo passo non si vedeva più al terzo, dove si correggevano le
// righe. Florin: «Scatto la foto, carico la bolla e poi da lì modifico e inserisco
// a mano le cose». Ora:
//   1) si carica la bolla (foto, anche più pagine, o PDF);
//   2) si sceglie: «Salva e compila dopo» (la bolla nasce col solo documento, più
//      fornitore e numero se si sanno) oppure «Compila ora», che apre la finestra
//      grande: a sinistra l'originale con lo zoom, a destra testata, righe,
//      trasporto, destinazione, ricevimento. Con l'AI i campi si riempiono da
//      soli (prezzi compresi quando sono sulla bolla), senza si scrivono a mano.
//
// Regole che restano (vedi lo storico in git):
//   · l'ordine d'acquisto NON è obbligatorio (29/10, e Florin l'11/11);
//   · le righe lette dall'AI si salvano in `ddt_righe` col loro prezzo;
//   · «in cantiere» solo con la commessa; senza magazzini, con la commessa nota,
//     si parte dal cantiere (11/11).
// Nuovo: senza magazzini la bolla «in magazzino» si registra lo stesso, col carico
// in sospeso; l'amministratore può creare il magazzino da qui. Al salvataggio la
// spunta «Carica in magazzino» fa entrare la merce in giacenza.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileCheck, FileText, Loader2, Paperclip, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useDDTRicezioneMutations,
  useDDTAttachments,
  type DDTStato,
  type DDTAttachmentKind,
  type DDTRigaNuova,
} from "@/hooks/useDDTRicezione";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { useWarehouses } from "@/hooks/useWarehouses";
import { destinazioneBollaNuova, senzaMagazzini } from "@/lib/ddt/senzaMagazzini";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { DDTAttachmentUploader } from "./DDTAttachmentUploader";
import { FinestraBollaFotoRighe, SezioneBolla } from "./FinestraBollaFotoRighe";
import { CampoConProposte } from "./CampoConProposte";
import { useProposteTrasporto } from "@/hooks/useProposteTrasporto";
import { leggiDDTdaAI, quantitaTotale } from "@/lib/ddt/letturaAI";
import { abbinaFornitore, type FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";
import { erroreVerificaDDT } from "@/lib/ddt/verificaNuovoDDT";
import { problemiBolla } from "@/lib/ddt/righeBolla";
import {
  avvisaEsitoCarico, caricaAlSalvataggio, mostraSpuntaCarico,
} from "@/lib/ddt/caricoAlSalvataggio";

/**
 * Chi ha portato la merce. Con «noi» non c'è corriere: siamo andati a ritirarla
 * col nostro furgone, e si chiedono targa e chi è andato.
 */
type TrasportoACuraDi = "fornitore" | "noi" | "terzi";

const TRASPORTI: { key: TrasportoACuraDi; label: string }[] = [
  { key: "fornitore", label: "L'ha portata il fornitore" },
  { key: "noi", label: "Siamo andati a ritirarla" },
  { key: "terzi", label: "Un corriere" },
];

const STATI: { key: DDTStato; label: string }[] = [
  { key: "ricevuto", label: "Ricevuto completo" },
  { key: "parziale", label: "Parziale" },
  { key: "verificato", label: "Verificato (controllato)" },
  { key: "non_conforme", label: "Non conforme" },
  { key: "atteso", label: "Atteso (pre-avviso)" },
];

const NOME_MAGAZZINO = "Magazzino principale";

interface NewDDTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-seleziona un ODA (usato dal dettaglio PO per "Registra DDT") */
  prefillPurchaseOrderId?: string | null;
  /** Parte già sulla commessa (la bolla caricata dalla commessa): merce in cantiere. */
  prefillOrderId?: string | null;
  /** Dopo il salvataggio resta dov'è (la commessa) invece di aprire la bolla. */
  restaQui?: boolean;
  /** Callback dopo la creazione (es. refetch) */
  onCreated?: (ddtId: string) => void;
}

type LocalFile = { file: File; kind: DDTAttachmentKind; id: string };

async function inBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const bottoneScelta = (attivo: boolean) =>
  cn("h-8 rounded-md border px-2.5 text-xs font-medium transition-colors", attivo ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/50");

export function NewDDTDialog({
  open,
  onOpenChange,
  prefillPurchaseOrderId,
  prefillOrderId,
  restaQui,
  onCreated,
}: NewDDTDialogProps) {
  const navigate = useNavigate();
  const { orders } = usePurchaseOrders();
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const companyId = effectiveCompany?.id ?? null;
  const [fase, setFase] = useState<"scelta" | "compila">("scelta");

  // ── Documento e testata ───────────────────────────
  const [pagine, setPagine] = useState<LocalFile[]>([]);
  const [extraFiles, setExtraFiles] = useState<LocalFile[]>([]);
  const [conAI, setConAI] = useState(true);
  const [poId, setPoId] = useState(prefillPurchaseOrderId ?? "");
  const [orderId, setOrderId] = useState<string | null>(prefillOrderId ?? null);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));

  // ── Quello che l'AI ha letto ──────────────────────
  const [lettura, setLettura] = useState<"no" | "in_corso" | "fatta" | "errore">("no");
  const [righe, setRighe] = useState<DDTRigaNuova[]>([]);
  const [aiLettura, setAiLettura] = useState<Record<string, unknown> | null>(null);
  const [aiConfidenza, setAiConfidenza] = useState<number | null>(null);
  const [aiAvvisi, setAiAvvisi] = useState<string[]>([]);
  const [fornitoreLetto, setFornitoreLetto] = useState<string | null>(null);

  // ── Trasporto ─────────────────────────────────────
  const [trasportoACuraDi, setTrasportoACuraDi] = useState<TrasportoACuraDi | null>(null);
  const [porto, setPorto] = useState<"franco" | "assegnato" | null>(null);
  const [corriere, setCorriere] = useState("");
  const [targaMezzo, setTargaMezzo] = useState("");
  const [autistaNome, setAutistaNome] = useState("");
  const [autistaTelefono, setAutistaTelefono] = useState("");
  const [oraArrivo, setOraArrivo] = useState("");
  const [oraPartenza, setOraPartenza] = useState("");

  // ── Destinazione e ricevimento ────────────────────
  const [destinazione, setDestinazioneScelta] = useState<"magazzino" | "cantiere">(prefillOrderId ? "cantiere" : "magazzino");
  const [destinazioneToccata, setDestinazioneToccata] = useState(false);
  const setDestinazione = (v: "magazzino" | "cantiere") => {
    setDestinazioneScelta(v);
    setDestinazioneToccata(true);
  };
  const elencoMagazzini = useWarehouses();
  const nessunMagazzino = senzaMagazzini({
    magazzini: elencoMagazzini.warehouses,
    caricamento: elencoMagazzini.isLoading || !elencoMagazzini.isFetched,
    errore: elencoMagazzini.error,
  });
  const [qty, setQty] = useState("");
  const [stato, setStato] = useState<DDTStato>("ricevuto");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [nomeMagazzino, setNomeMagazzino] = useState(NOME_MAGAZZINO);
  const [creandoMagazzino, setCreandoMagazzino] = useState(false);
  const [ricevutoDaNome, setRicevutoDaNome] = useState("");
  const [hasDamages, setHasDamages] = useState(false);
  const [nonConformita, setNonConformita] = useState("");
  const [note, setNote] = useState("");
  const [caricaMagazzino, setCaricaMagazzino] = useState(true);

  const { createDDT } = useDDTRicezioneMutations(poId || null);
  const { uploadMainDDT, uploadAttachments } = useDDTAttachments();
  const proposte = useProposteTrasporto(companyId, open && fase === "compila" && trasportoACuraDi === "noi");

  // La rubrica fornitori, leggera: serve a riconoscere il mittente letto sulla bolla.
  const { data: fornitori = [] } = useQuery<FornitoreInRubrica[]>({
    queryKey: ["ddt-fornitori-abbinamento", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, vat_number, fiscal_code")
        .eq("company_id", companyId!)
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as FornitoreInRubrica[];
    },
    enabled: open && !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  /**
   * Quello che l'AI ha letto, messo nei campi. I campi già scritti a mano non si
   * sovrascrivono: chi ha corretto ha ragione. Il prezzo resta vuoto se sulla
   * bolla non c'è (succede quasi sempre): si mette dopo, o arriva dalla fattura.
   */
  const applicaLetturaAI = (grezzo: unknown) => {
    const letta = leggiDDTdaAI(grezzo);
    setNumero((n) => n || letta.numero || "");
    if (letta.data) setData(letta.data);
    setCorriere((c) => c || letta.corriere || "");
    setTrasportoACuraDi((t) => t ?? letta.trasportoACuraDi ?? null);
    setPorto((p) => p ?? letta.porto ?? null);
    setTargaMezzo((t) => t || (letta.targaMezzo ?? "").toUpperCase());
    setAutistaNome((a) => a || letta.autistaNome || "");
    setOraArrivo((o) => o || letta.oraInizioTrasporto || "");
    setNote((n) => n || letta.note || "");
    setRighe((attuali) => (attuali.length ? attuali : letta.righe));
    const totale = quantitaTotale(letta.righe);
    setQty((q) => q || (totale > 0 ? String(totale) : ""));
    setAiLettura(grezzo && typeof grezzo === "object" ? (grezzo as Record<string, unknown>) : null);
    setAiConfidenza(letta.confidenza);
    setAiAvvisi(letta.avvisi);
    setFornitoreLetto(letta.fornitoreNome);
    setSupplierId((s) => s ?? abbinaFornitore(letta, fornitori)?.id);
  };

  const leggiConAI = async (file: File) => {
    if (!companyId) return;
    setLettura("in_corso");
    try {
      // Lo schema RICCO (righe con codice, unità, quantità e prezzo), non il formato piatto.
      const { data: aiData, error } = await supabase.functions.invoke("ddt-ai-extract", {
        body: { image_base64: await inBase64(file), mime_type: file.type || "image/jpeg", file_name: file.name, company_id: companyId },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Lettura non riuscita"));
      if (!aiData?.success) throw new Error(aiData?.error ?? "Lettura non riuscita");
      applicaLetturaAI(aiData.ddt ?? {});
      setLettura("fatta");
    } catch (err) {
      setLettura("errore");
      toast.error(`Lettura AI non riuscita: ${err instanceof Error ? err.message : String(err)}. Compila a mano.`);
    }
  };

  // Reset alla chiusura (con cleanup del timer).
  useEffect(() => {
    if (open) return;
    const timerId = window.setTimeout(() => {
      setFase("scelta");
      setPagine([]); setExtraFiles([]); setConAI(true);
      setPoId(prefillPurchaseOrderId ?? ""); setOrderId(prefillOrderId ?? null);
      setSupplierId(undefined); setNumero(""); setData(format(new Date(), "yyyy-MM-dd"));
      setLettura("no"); setRighe([]); setAiLettura(null); setAiConfidenza(null); setAiAvvisi([]); setFornitoreLetto(null);
      setTrasportoACuraDi(null); setPorto(null); setCorriere(""); setTargaMezzo(""); setAutistaNome("");
      setAutistaTelefono(""); setOraArrivo(""); setOraPartenza("");
      setDestinazioneScelta(prefillOrderId ? "cantiere" : "magazzino"); setDestinazioneToccata(false);
      setQty(""); setStato("ricevuto"); setWarehouseId(null); setNomeMagazzino(NOME_MAGAZZINO);
      setRicevutoDaNome(""); setHasDamages(false); setNonConformita(""); setNote(""); setCaricaMagazzino(true);
    }, 200);
    return () => window.clearTimeout(timerId);
  }, [open, prefillPurchaseOrderId, prefillOrderId]);

  const availablePOs = useMemo(() => orders.filter((o) => o.status !== "annullato"), [orders]);
  const selectedPO = useMemo(() => availablePOs.find((o) => o.id === poId) ?? null, [availablePOs, poId]);

  // «In cantiere» si può dire solo se si sa quale: con l'ODA la commessa arriva
  // dall'ordine, altrimenti è quella scelta a mano.
  const commessaNota = poId ? !!selectedPO?.orders?.order_code : !!orderId;
  const commessaEffettiva = poId ? selectedPO?.order_id ?? null : orderId;
  const destinazioneEffettiva = destinazioneBollaNuova({
    scelta: destinazione,
    sceltaToccata: destinazioneToccata,
    commessaNota,
    nessunMagazzino,
  });
  // Con l'ODA e «ricevuto completo» la merce la carica già l'arrivo dell'ordine.
  const caricoDallOrdine = !!poId && (stato === "ricevuto" || stato === "verificato");
  const spuntaCarico = !caricoDallOrdine && mostraSpuntaCarico({
    destinazione: destinazioneEffettiva,
    puoMagazzino: permessi.canEditWarehouse && !permessi.solaLettura,
  });

  const documento = pagine[0] ?? null;
  const erroreVerifica = erroreVerificaDDT({ data, stato, quantita: qty, righe, haDocumento: !!documento });
  const problemi = problemiBolla({ numero, data, destinazione: destinazioneEffettiva, orderId: commessaEffettiva, righe });
  const bloccata = problemi.length ? problemi.join(" · ") : erroreVerifica;

  // ── Salvataggio ───────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInCorso = useRef(false);

  const caricaFile = async (ddtId: string) => {
    if (documento) await uploadMainDDT.mutateAsync({ ddtId, file: documento.file });
    const altri = [...pagine.slice(1), ...extraFiles];
    if (altri.length) await uploadAttachments.mutateAsync({ ddtId, files: altri.map((f) => ({ file: f.file, kind: f.kind })) });
  };

  const dopoIlSalvataggio = (id: string, etichetta: string) => {
    onCreated?.(id);
    onOpenChange(false);
    if (restaQui) {
      toast.success(`Bolla ${etichetta} caricata`, {
        action: { label: "Apri", onClick: () => navigate(`/azienda/ddt/${id}`) },
      });
    } else {
      navigate(`/azienda/ddt/${id}`);
    }
  };

  /** Doppio clic: due bolle. Il guardiano nel ref chiude la finestra fra i due clic. */
  const conGuardia = async (lavoro: () => Promise<void>) => {
    if (submitInCorso.current) return;
    submitInCorso.current = true;
    setIsSubmitting(true);
    try {
      await lavoro();
    } catch {
      // Toast gestito dalle mutation
    } finally {
      submitInCorso.current = false;
      setIsSubmitting(false);
    }
  };

  /** «Salva e compila dopo»: il documento, più fornitore e numero se ci sono. */
  const salvaDopo = () =>
    conGuardia(async () => {
      const created = await createDDT.mutateAsync({
        soloDocumento: true,
        numeroFacoltativo: true,
        magazzinoFacoltativo: true,
        purchase_order_id: poId || null,
        order_id: poId ? null : orderId,
        supplier_id: poId ? null : supplierId ?? null,
        destinazione: destinazioneEffettiva,
        numero_ddt: numero.trim(),
        data_ricezione: data,
        quantita_ricevuta: 0,
        stato: "ricevuto",
        righe: [],
      });
      await caricaFile(created.id);
      dopoIlSalvataggio(created.id, numero.trim() || "da compilare");
    });

  const registra = () => {
    if (bloccata) {
      toast.error(bloccata);
      return;
    }
    return conGuardia(async () => {
      const created = await createDDT.mutateAsync({
        purchase_order_id: poId || null,
        order_id: poId ? null : orderId,
        supplier_id: poId ? null : supplierId ?? null,
        destinazione: destinazioneEffettiva,
        magazzinoFacoltativo: nessunMagazzino,
        trasporto_a_cura_di: trasportoACuraDi,
        porto,
        righe,
        ai_lettura: aiLettura,
        ai_confidenza: aiConfidenza,
        ai_avvisi: aiAvvisi,
        numero_ddt: numero.trim(),
        data_ricezione: data,
        quantita_ricevuta: parseFloat(qty) || quantitaTotale(righe) || 0,
        stato,
        note: note.trim() || null,
        warehouse_id: warehouseId,
        corriere: corriere.trim() || null,
        targa_mezzo: targaMezzo.trim() || null,
        autista_nome: autistaNome.trim() || null,
        autista_telefono: autistaTelefono.trim() || null,
        ora_arrivo: oraArrivo ? new Date(`${data}T${oraArrivo}`).toISOString() : null,
        ora_partenza: oraPartenza ? new Date(`${data}T${oraPartenza}`).toISOString() : null,
        ricevuto_da_nome: ricevutoDaNome.trim() || null,
        non_conformita: nonConformita.trim() || null,
        has_damages: hasDamages,
      });
      await caricaFile(created.id);
      if (spuntaCarico && caricaMagazzino) avvisaEsitoCarico(await caricaAlSalvataggio(created.id), numero.trim());
      dopoIlSalvataggio(created.id, numero.trim());
    });
  };

  const compilaOra = () => {
    setFase("compila");
    if (conAI && documento && lettura === "no") void leggiConAI(documento.file);
  };

  const creaMagazzino = async () => {
    setCreandoMagazzino(true);
    try {
      const creato = await elencoMagazzini.createWarehouse({
        name: nomeMagazzino.trim() || NOME_MAGAZZINO,
        type: "main",
        is_active: true,
        is_default: true,
        position: 0,
      });
      setWarehouseId(creato.id);
    } catch {
      // toast dal hook
    } finally {
      setCreandoMagazzino(false);
    }
  };

  const files = useMemo(() => pagine.map((p) => p.file), [pagine]);

  // ── La prima finestra: il documento e la scelta ───
  return (
    <>
      <Dialog open={open && fase === "scelta"} onOpenChange={(v) => { if (!isSubmitting) onOpenChange(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-5 w-5 text-primary" />
              Nuovo DDT fornitore
            </DialogTitle>
            <DialogDescription className="text-xs">
              Carica la bolla, poi registrala subito col solo documento o compilala ora guardando la foto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {pagine.length === 0 ? (
              <DDTAttachmentUploader
                title="Carica la bolla"
                description="Foto (anche più pagine) o PDF."
                defaultKind="ddt"
                multiple
                onFilesSelected={(nuovi) =>
                  setPagine(nuovi.map((n, i) => ({ file: n.file, kind: i === 0 ? "ddt" : "bolla", id: crypto.randomUUID() })))
                }
              />
            ) : (
              <ul className="space-y-1" aria-label="Pagine della bolla">
                {pagine.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md border bg-primary/5 px-2 py-1.5 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                    <span className="text-[11px] text-muted-foreground">{(p.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    <Button
                      type="button" size="icon" variant="ghost" className="h-7 w-7"
                      aria-label={`Togli ${p.file.name}`}
                      onClick={() => {
                        setPagine((x) => x.filter((_, j) => j !== i).map((f, j) => ({ ...f, kind: j === 0 ? "ddt" : "bolla" })));
                        setLettura("no");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {documento && (
              <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  Leggi con l'AI
                  <span className="text-xs text-muted-foreground">compila i campi da sola</span>
                </span>
                <Switch checked={conAI} onCheckedChange={setConAI} aria-label="Leggi con l'AI" />
              </label>
            )}

            {selectedPO ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                Dall'ordine <span className="font-medium">{selectedPO.oda_number}</span>
                {selectedPO.suppliers?.name ? ` · ${selectedPO.suppliers.name}` : ""}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Numero DDT</Label>
                <Input aria-label="Numero DDT" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Se lo sai" className="h-9 font-mono" />
              </div>
              {!poId && (
                <div className="space-y-1">
                  <Label className="text-xs">Fornitore</Label>
                  <SupplierSelect
                    searchable
                    value={supplierId}
                    onValueChange={(v) => setSupplierId(v)}
                    placeholder="Se lo sai"
                    fallbackCompanyId={companyId ?? undefined}
                  />
                </div>
              )}
            </div>

            <AltriAllegati files={extraFiles} onChange={setExtraFiles} />
          </div>

          <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="mr-auto text-muted-foreground">
              Annulla
            </Button>
            <Button variant="outline" onClick={() => void salvaDopo()} disabled={!documento || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Salva e compila dopo
            </Button>
            <Button onClick={compilaOra} disabled={isSubmitting}>
              Compila ora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FinestraBollaFotoRighe
        open={open && fase === "compila"}
        onOpenChange={(v) => { if (!v) setFase("scelta"); }}
        titolo="Nuovo DDT fornitore"
        files={files}
        companyId={companyId}
        testata={{ numero, data, supplierId: supplierId ?? null, orderId: commessaEffettiva, destinazione: destinazioneEffettiva }}
        onTestataChange={(p) => {
          if (p.numero !== undefined) setNumero(p.numero);
          if (p.data !== undefined) setData(p.data);
          if (p.supplierId !== undefined) setSupplierId(p.supplierId ?? undefined);
          if (p.orderId !== undefined) setOrderId(p.orderId);
        }}
        righe={righe}
        onRigheChange={setRighe}
        fornitoreLetto={supplierId ? null : fornitoreLetto}
        ordineAcquisto={selectedPO ? `${selectedPO.oda_number}${selectedPO.suppliers?.name ? ` · ${selectedPO.suppliers.name}` : ""}` : null}
        testataExtra={
          !prefillPurchaseOrderId && availablePOs.length > 0 ? (
            <div className="col-span-2 space-y-1 text-xs font-medium text-muted-foreground sm:col-span-4">
              Ordine d'acquisto (facoltativo)
              <Select value={poId || "nessuno"} onValueChange={(v) => setPoId(v === "nessuno" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm text-foreground" aria-label="Ordine d'acquisto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="nessuno">Nessun ordine</SelectItem>
                  {availablePOs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.oda_number} · {o.suppliers?.name || "Fornitore ignoto"}{o.orders?.order_code ? ` · ${o.orders.order_code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
        stato={
          lettura === "in_corso" ? (
            <p role="status" className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Sto leggendo la bolla: i campi si riempiono da soli. Intanto puoi scrivere.
            </p>
          ) : lettura === "fatta" ? (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              Letta dall'AI: {righe.length} {righe.length === 1 ? "riga" : "righe"}. Controlla e correggi guardando l'originale.
            </p>
          ) : lettura === "errore" ? (
            <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Lettura non riuscita: scrivi i dati guardando l'originale.
            </p>
          ) : null
        }
        carico={{ visibile: spuntaCarico, valore: caricaMagazzino, onChange: setCaricaMagazzino }}
        conferma={{ etichetta: "Registra DDT", onConferma: () => void registra(), inCorso: isSubmitting, bloccata }}
        etichettaChiudi="Indietro"
      >
        <SezioneBolla titolo="Trasporto">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chi ha portato la merce">
            {TRASPORTI.map((t) => (
              <button key={t.key} type="button" aria-pressed={trasportoACuraDi === t.key} className={bottoneScelta(trasportoACuraDi === t.key)}
                onClick={() => setTrasportoACuraDi(trasportoACuraDi === t.key ? null : t.key)}>
                {t.label}
              </button>
            ))}
            <span className="mx-1 self-center text-xs text-muted-foreground">Porto</span>
            {(["franco", "assegnato"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={porto === p} className={bottoneScelta(porto === p)}
                title={p === "franco" ? "Compreso nel prezzo: in fattura non arriva" : "A nostro carico: in fattura c'è anche il trasporto"}
                onClick={() => setPorto(porto === p ? null : p)}>
                {p === "franco" ? "Franco" : "Assegnato"}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {trasportoACuraDi !== "noi" && (
              <label className="col-span-2 space-y-1 text-xs text-muted-foreground">
                {trasportoACuraDi === "terzi" ? "Corriere" : "Chi l'ha portata"}
                <Input aria-label="Corriere" value={corriere} onChange={(e) => setCorriere(e.target.value)} placeholder="GLS, DHL, il fornitore…" className="h-9 text-sm text-foreground" />
              </label>
            )}
            <div className="space-y-1 text-xs text-muted-foreground">
              {trasportoACuraDi === "noi" ? "Targa del nostro mezzo" : "Targa mezzo"}
              <CampoConProposte
                ariaLabel="Targa mezzo"
                valore={targaMezzo}
                onChange={setTargaMezzo}
                proposte={trasportoACuraDi === "noi" ? proposte.data?.mezzi ?? [] : []}
                placeholder={trasportoACuraDi === "noi" ? "Cerca fra i mezzi o scrivi" : "AB123CD"}
                maiuscolo
              />
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {trasportoACuraDi === "noi" ? "Chi è andato" : "Autista"}
              <CampoConProposte
                ariaLabel="Autista"
                valore={autistaNome}
                onChange={setAutistaNome}
                proposte={trasportoACuraDi === "noi" ? proposte.data?.autisti ?? [] : []}
                placeholder={trasportoACuraDi === "noi" ? "Cerca fra il personale o scrivi" : "Mario Rossi"}
              />
            </div>
            {trasportoACuraDi !== "noi" && (
              <label className="space-y-1 text-xs text-muted-foreground">
                Telefono autista
                <Input type="tel" aria-label="Telefono autista" value={autistaTelefono} onChange={(e) => setAutistaTelefono(e.target.value)} className="h-9 text-sm text-foreground" />
              </label>
            )}
            <label className="space-y-1 text-xs text-muted-foreground">
              Ora arrivo
              <Input type="time" aria-label="Ora arrivo" value={oraArrivo} onChange={(e) => setOraArrivo(e.target.value)} className="h-9 text-sm text-foreground" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Ora partenza
              <Input type="time" aria-label="Ora partenza" value={oraPartenza} onChange={(e) => setOraPartenza(e.target.value)} className="h-9 text-sm text-foreground" />
            </label>
          </div>
        </SezioneBolla>

        <SezioneBolla titolo="Dove va la merce">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dove va la merce">
            <button type="button" aria-pressed={destinazioneEffettiva === "magazzino"} className={bottoneScelta(destinazioneEffettiva === "magazzino")} onClick={() => setDestinazione("magazzino")}>
              In magazzino
            </button>
            <button type="button" aria-pressed={destinazioneEffettiva === "cantiere"} disabled={!commessaNota} className={cn(bottoneScelta(destinazioneEffettiva === "cantiere"), "disabled:opacity-40")}
              title={commessaNota ? "Non passa dal magazzino: è già sul posto" : "Serve prima la commessa"} onClick={() => setDestinazione("cantiere")}>
              Direttamente in cantiere
            </button>
            {!commessaNota && <span className="text-[11px] text-muted-foreground">Per il cantiere scegli prima la commessa.</span>}
          </div>
          {destinazioneEffettiva === "magazzino" && (
            <div className="mt-2">
              {!nessunMagazzino ? (
                <WarehouseSelect value={warehouseId} onChange={setWarehouseId} placeholder="Default (dal fornitore o dall'ODA)" />
              ) : warehouseId ? (
                <p className="text-xs text-emerald-800 dark:text-emerald-300">Magazzino creato: la merce entra lì.</p>
              ) : permessi.isAdmin ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="w-full text-xs text-muted-foreground">Non hai ancora un magazzino: crealo ora, oppure registra la bolla e il carico resta in sospeso.</p>
                  <Input aria-label="Nome del magazzino" value={nomeMagazzino} onChange={(e) => setNomeMagazzino(e.target.value)} className="h-9 max-w-xs text-sm" />
                  <Button type="button" size="sm" variant="outline" disabled={creandoMagazzino} onClick={() => void creaMagazzino()}>
                    {creandoMagazzino && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    Crea il magazzino
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Non hai magazzini: la bolla si registra lo stesso, e il carico resta in sospeso finché l'amministratore non ne crea uno (Impostazioni, Magazzini). Poi lo confermi dalla pagina della bolla.
                </p>
              )}
            </div>
          )}
        </SezioneBolla>

        <SezioneBolla titolo="Ricevimento">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              Stato
              <Select value={stato} onValueChange={(v) => setStato(v as DDTStato)}>
                <SelectTrigger className="h-9 text-sm text-foreground" aria-label="Stato DDT"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATI.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Quantità ricevuta
              <Input type="number" min="0" step="0.01" aria-label="Quantità ricevuta" value={qty} onChange={(e) => setQty(e.target.value)}
                placeholder={righe.length ? String(quantitaTotale(righe)) : "0"} className="h-9 text-right text-sm text-foreground" />
            </label>
            <label className="col-span-2 space-y-1 text-xs text-muted-foreground">
              Ricevuto da
              <Input aria-label="Ricevuto da" value={ricevutoDaNome} onChange={(e) => setRicevutoDaNome(e.target.value)} placeholder="Chi ha preso la merce" className="h-9 text-sm text-foreground" />
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Switch checked={hasDamages} onCheckedChange={setHasDamages} aria-label="Danni o non conformità" />
            Danni o non conformità
          </label>
          {hasDamages && (
            <Textarea aria-label="Descrizione non conformità" value={nonConformita} onChange={(e) => setNonConformita(e.target.value)} rows={2}
              placeholder="Pezzi mancanti, articoli danneggiati, imballo rotto…" className="mt-2 text-sm" />
          )}
          <Textarea aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note interne (facoltative)" className="mt-2 text-sm" />
        </SezioneBolla>
      </FinestraBollaFotoRighe>
    </>
  );
}

// ─── Allegati in più: packing list, foto dei danni, firma ──────────────────
function AltriAllegati({ files, onChange }: { files: LocalFile[]; onChange: (f: LocalFile[]) => void }) {
  const [pickerKind, setPickerKind] = useState<DDTAttachmentKind>("packing_list");
  return (
    <details className="rounded-md border bg-muted/10">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        Altri allegati (facoltativi){files.length > 0 ? ` · ${files.length}` : ""}
      </summary>
      <div className="space-y-2 border-t p-3">
        <Select value={pickerKind} onValueChange={(v) => setPickerKind(v as DDTAttachmentKind)}>
          <SelectTrigger className="h-8 text-xs" aria-label="Tipo di allegato"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="packing_list">Packing list</SelectItem>
            <SelectItem value="danni">Foto danni / non conformità</SelectItem>
            <SelectItem value="firma">Firma ricevente</SelectItem>
            <SelectItem value="altro">Altro</SelectItem>
          </SelectContent>
        </Select>
        <DDTAttachmentUploader
          compact
          defaultKind={pickerKind}
          multiple
          onFilesSelected={(added) => onChange([...files, ...added.map((a) => ({ file: a.file, kind: a.kind, id: crypto.randomUUID() }))])}
        />
        {files.map((f) => (
          <p key={f.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{f.file.name} · {f.kind}</span>
            <button type="button" className="text-rose-600 hover:underline" onClick={() => onChange(files.filter((x) => x.id !== f.id))}>Rimuovi</button>
          </p>
        ))}
      </div>
    </details>
  );
}
