/**
 * Il lavoro extra, in tre passi (06/11/2026). Florin: «il popup delle varianti per la creazione non è troppo
 * complicato?». Prima: dodici campi, tre sezioni richiudibili, «Salva bozza», «Prepara PDF», «Crea link»,
 * «Copia link», «Invia per email», e la copia firmata dietro un dettaglio con cinque controlli.
 *
 * Ora: 1) cosa fai  2) rivedi  3) manda. Il salvataggio e il PDF li fa il passo, non l'utente; mandare al
 * cliente è un clic (salva, blocca il PDF, crea il link, manda l'email); «Firmato su carta» chiede il file,
 * il nome e la data, e basta.
 *
 * Le protezioni restano quelle di prima: il PDF si blocca quando parte, i documenti non si sovrascrivono,
 * l'approvazione vuole il permesso e una conferma, e la firma online passa sempre dal token.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { useQuery } from "@tanstack/react-query";
import { useCondizioniDocumento } from "@/hooks/useCondizioniDocumento";
import { toast } from "sonner";
import { Check, Copy, Loader2, Mail, PenLine, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVariationWorkflow, type WorkflowResponse, type WorkflowEvidence } from "@/hooks/useVariationWorkflow";
import { useRichiediFirma } from "@/hooks/useRichiediFirma";
import { eUnaFoto, fotoInPdfBase64, nomePdfDellaFoto } from "@/lib/orders/fotoFirmataInPdf";
import { emptyVariationDraft, prepareVariation, variationImpact, type VariationDraft } from "@/lib/orders/variationDraft";
import { variationDocumentContext } from "@/lib/orders/variationDocumentContext";
import { formatCurrency } from "@/lib/formatters";
import { VariationEditor, type VariationContext } from "./VariationEditor";
import { VariationTemplatePicker } from "./VariationTemplatePicker";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { OfficeSelect } from "./OfficeSelect";

type Passo = "cosa" | "rivedi" | "manda";
const PASSI: { id: Passo; titolo: string }[] = [
  { id: "cosa", titolo: "Cosa fai" },
  { id: "rivedi", titolo: "Rivedi" },
  { id: "manda", titolo: "Manda" },
];

/** `bozzaIniziale`: un lavoro extra nuovo già scritto (dal preventivo accettato): nasce da salvare, chiudere lo salva. */
interface Props { id: string; existing: boolean; order: string; company: string; context: VariationContext; canEdit: boolean; onClose: () => void; bozzaIniziale?: VariationDraft }
export function VariationLifecycleDialog({ id, existing, order, company, context, canEdit, onClose, bozzaIniziale }: Props) {
  const workflow = useVariationWorkflow(order, company);
  const [form, setForm] = useState<VariationDraft>(() => (!existing && bozzaIniziale) ? bozzaIniziale : ({ ...emptyVariationDraft(), documentCompanyName: context.companyName, documentCompanyDetails: context.companyDetails, documentCustomerName: context.customerName, documentCustomerDetails: context.customerAddress }));
  const [receipt, setReceipt] = useState<WorkflowResponse | null>(null);
  const [saved, setSaved] = useState(existing || bozzaIniziale ? "" : JSON.stringify(form));
  const [busy, setBusy] = useState(existing);
  const [azione, setAzione] = useState("");
  const [error, setError] = useState("");
  const [passo, setPasso] = useState<Passo>("cosa");
  const [pdf, setPdf] = useState<{key: string; blob: Blob; name: string; downloadUrl: string} | null>(null);
  const [evidence, setEvidence] = useState<WorkflowEvidence[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState("");
  const [signer, setSigner] = useState(context.customerName ?? "");
  const [signedOn, setSignedOn] = useState("");
  const [emailCliente, setEmailCliente] = useState(context.customerEmail ?? "");
  const [nomeCliente, setNomeCliente] = useState(context.customerName ?? "");
  const lock = useRef(false), alive = useRef(true);
  // Una variante nuova parte con le condizioni di «Contratti e condizioni» (09/11/2026). È una COPIA sul documento:
  // si può correggere qui, e cambiare il modello domani non tocca le varianti già fatte.
  const condizioniAzienda = useCondizioniDocumento("commessa");
  const condizioniCopiate = useRef(false);
  useEffect(() => {
    if (existing || condizioniCopiate.current || !condizioniAzienda.disponibile || condizioniAzienda.testo.length > 10_000) return;
    condizioniCopiate.current = true;
    setForm((f) => {
      if (f.additionalTerms?.trim()) return f;
      const con = { ...f, additionalTerms: condizioniAzienda.testo };
      setSaved((s) => (s === JSON.stringify(f) ? JSON.stringify(con) : s));
      return con;
    });
  }, [existing, condizioniAzienda.disponibile, condizioniAzienda.testo]);
  const dirty = JSON.stringify(form) !== saved;
  const editable = canEdit && (!receipt || receipt.variation.status === "bozza");
  const stato = receipt?.variation.status;
  const approvata = stato === "approvato";
  const pending = stato === "in_attesa";

  const absorb = (data: WorkflowResponse) => {
    setReceipt(data);
    if (data.workspace) { setForm(data.workspace.content); setSaved(JSON.stringify(data.workspace.content)); }
    else if(data.variation) {const legacy={...emptyVariationDraft(),title:data.variation.titolo,description:data.variation.descrizione,amount:String(Math.abs(data.variation.impatto_economico)),kind:data.variation.impatto_economico<0?"riduzione" as const:"aggiunta" as const,days:String(data.variation.impatto_giorni)};setForm(legacy);setSaved(JSON.stringify(legacy));}
    if (Array.isArray(data.evidence)) setEvidence(data.evidence);
    else if (data.evidence) setEvidence(previous => [data.evidence as WorkflowEvidence, ...previous.filter(item => item.id !== (data.evidence as WorkflowEvidence).id)]);
  };
  useEffect(() => {
    alive.current = true;
    if (existing) void workflow.request(id, "load").then(data => {
      if (!alive.current) return;
      absorb(data);
      // Una variante già partita o approvata si apre dove serve: l'ultimo passo.
      if (data.variation && data.variation.status !== "bozza") setPasso("manda");
    }).catch(e => { if (alive.current) setError(e.message); }).finally(() => { if (alive.current) setBusy(false); });
    return () => { alive.current = false; };
    // Dialog is keyed by company/order/id; no background reload can overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, order, company]);

  const phases = useQuery({ queryKey: ["variation-phase-options", order, company], enabled: editable,
    queryFn: async () => { const {data, error} = await supabase.from("order_work_phases").select("id,name,end_date").eq("order_id", order).eq("company_id", company).order("position"); if(error) throw error; return data ?? []; }, staleTime: 30_000 });
  // Chi potrà fare il lavoro extra: persone e ditte/squadre dell'azienda (06/11/2026).
  const chiPuo = useQuery({ queryKey: ["variation-chi-options", company], enabled: editable,
    queryFn: async () => {
      const [p, t] = await Promise.all([
        supabase.from("employees").select("id,first_name,last_name").eq("company_id", company).eq("is_active", true).order("last_name").limit(500),
        supabase.from("external_teams").select("id,name,kind").eq("company_id", company).order("name").limit(500),
      ]);
      return {
        persone: (p.data ?? []).map((e) => ({ id: e.id, nome: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() })),
        ditte: (t.data ?? []).map((d) => ({ id: d.id, nome: d.name, squadra: d.kind === "interna" })),
      };
    }, staleTime: 60_000 });
  const { mutateAsync: richiediFirma } = useRichiediFirma();
  // La richiesta di firma elettronica già mandata per questo lavoro extra: il link resta quello.
  const firmaEsistente = useQuery({
    queryKey: ["variation-fea", id],
    enabled: !!receipt && receipt.variation.status === "in_attesa",
    staleTime: 15_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data } = await db.from("signature_requests")
        .select("token, signer_email, signer_name, created_at")
        .eq("odv_id", id).in("status", ["pending", "otp_verified"])
        .order("created_at", { ascending: false }).limit(1);
      const riga = (data ?? [])[0] as { token: string; signer_email: string | null; signer_name: string | null } | undefined;
      return riga ? { link: `${window.location.origin}/firma-fea/${riga.token}`, email: riga.signer_email, nome: riga.signer_name } : null;
    },
  });
  const approval = useQuery({ queryKey: ["variation-approval-permission", company], enabled: canEdit,
    queryFn: async () => { const {data: session} = await supabase.auth.getSession(); const uid = session.session?.user.id; if(!uid) return false; const {data,error} = await supabase.rpc("has_permission_for_company", {_user_id:uid,_company_id:company,_permission:"can_approve_variations"}); if(error) throw error; return data === true; }, staleTime: 60_000 });

  const run = async (etichetta: string, operation: () => Promise<void>) => {
    if(lock.current) return; lock.current = true; setBusy(true); setAzione(etichetta); setError("");
    try { await operation(); } catch(e) { if(alive.current) setError(await frase(e)); }
    finally { lock.current = false; if(alive.current) { setBusy(false); setAzione(""); } }
  };
  /** La frase da mostrare: quella scritta dalla funzione, mai «Edge Function returned a non-2xx status code». */
  const frase = async (e: unknown): Promise<string> => {
    const ripiego = "Non è andata: riprova. Se succede ancora, scrivi all'assistenza.";
    const ctx = (e as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.clone === "function") {
      try {
        const corpo = await ctx.clone().json() as { error?: unknown };
        if (typeof corpo.error === "string" && corpo.error.trim()) return corpo.error;
      } catch { /* la risposta non è JSON: si usa il messaggio sotto */ }
    }
    const m = e instanceof Error ? e.message : "";
    return !m || /non-2xx|FunctionsHttpError|fetch/i.test(m) ? ripiego : m;
  };

  const save = async () => {
    const data = await workflow.request(id,"save",{revision:receipt?.workspace?.revision ?? 0,content:form,context:variationDocumentContext(form,context)});
    if(alive.current) absorb(data); return data;
  };
  const showDocument = async (fileId = "proposal") => {
    const result = await workflow.open(id,fileId);
    if(alive.current) setPdf({key:crypto.randomUUID(),blob:result.blob,name:result.name,downloadUrl:result.url});
  };
  const render = useCallback(async () => pdf ? createPdfPreviewUrl(pdf.blob) : "", [pdf]);
  /** Niente «Salva bozza»: chiudere salva. Così un modulo lungo non si perde e il passo resta uno solo. */
  const close = () => {
    if (busy || lock.current) return;
    if (!dirty || !editable) { onClose(); return; }
    void run("Salvo…", async () => { await save(); if (alive.current) onClose(); });
  };

  const fresh = !!receipt?.document && !dirty && receipt.document.source_revision === receipt.workspace?.revision;
  const evidenceForDocument = evidence.filter(item => item.document_id === receipt?.document?.id);
  // Il link di firma: quello della firma elettronica col codice. I vecchi link /firma-odv già mandati
  // restano validi e funzionanti, ma da oggi non se ne creano più.
  const link = firmaEsistente.data?.link ?? null;

  // Quanto cambia il contratto: lo stesso conto dell'editor, qui in grande sul passo «Rivedi».
  let pronta: ReturnType<typeof prepareVariation> | null = null;
  try { pronta = prepareVariation(form); } catch { /* lo dice il passo «Cosa fai» quando si prova ad andare avanti */ }
  const impatto = pronta ? variationImpact(context.currentNet, pronta.impatto_economico, context.vatRate) : null;

  /** Dal passo «Cosa fai» a «Rivedi»: salva e prepara il PDF da solo. */
  const vaiARivedi = (): void => void run("Preparo il PDF…", async () => {
    prepareVariation(form); // fermo qui se manca qualcosa: il messaggio è già in italiano
    const data = dirty || !receipt ? await save() : receipt;
    const revisione = data.workspace?.revision;
    if (revisione === undefined) throw new Error("Questo lavoro extra è stato scritto prima e non si può rifare da qui: aprilo da Economia → Documenti.");
    if (!fresh || dirty) {
      const next = await workflow.request(id,"document",{revision:revisione});
      absorb(next);
    }
    await showDocument();
    if (alive.current) setPasso("rivedi");
  });

  /**
   * Un clic solo: blocca il PDF, mette il lavoro extra in attesa e manda al cliente la firma
   * elettronica col codice OTP, la stessa dei preventivi (06/11/2026). Il cliente si identifica,
   * riceve il codice a sei cifre e firma: alla firma la variante è accettata e nasce la fase.
   */
  const mandaAlCliente = (): void => void run("Mando al cliente…", async () => {
    const email = emailCliente.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Scrivi l'email del cliente: è lì che arriva il link per firmare.");
    if (nomeCliente.trim().length < 2) throw new Error("Scrivi il nome di chi firma.");
    let dati = receipt!;
    const revisione = dati.workspace?.revision;
    if (revisione === undefined || !dati.document) throw new Error("Prepara prima il PDF: torna a «Rivedi».");
    if (!pending) {
      dati = await workflow.request(id,"publish",{revision:revisione,document_hash:dati.document.document_hash,reviewed:true});
      absorb(dati);
    }
    // Un link c'è già (clic doppio, o mandato prima): non se ne crea un altro, se no al cliente
    // arrivano due email con due link diversi per lo stesso lavoro (06/11/2026, prova dal vivo).
    const giaMandato = await firmaEsistente.refetch();
    if (giaMandato.data?.link) {
      if (alive.current) setPasso("manda");
      toast.success("Era già stato mandato: il link è qui sotto.");
      return;
    }
    // Da qui il lavoro extra è «in attesa» e non si modifica più: se la firma non parte lo si dice,
    // così non sembra che non sia successo niente (06/11/2026, revisione).
    const esito = await richiediFirma({
      tipo_documento: "odv", documento_id: id, tipo_firmatario: "b2c",
      signer_email: email, signer_name: nomeCliente.trim(), scadenza_giorni: 30,
    }).catch((e: unknown) => {
      throw new Error(`Il lavoro extra è pronto e in attesa, ma la richiesta di firma non è partita. Riprova da qui. (${e instanceof Error && e.message && !/non-2xx/i.test(e.message) ? e.message : "controlla l'email del cliente e la connessione"})`);
    });
    if (alive.current) {
      await firmaEsistente.refetch();
      setPasso("manda");
    }
    toast.success(esito.otp_inviato ? "Mandato al cliente da firmare" : "Richiesta pronta: copia il link e mandalo tu.");
  });

  const copiaLink = () => { if (!link) return; void navigator.clipboard.writeText(link).then(() => toast.success("Link copiato")).catch(() => setError("Copia non riuscita: seleziona il link e copialo a mano.")); };

  const caricaFirmata = (file: File) => {
    const evidenceId = crypto.randomUUID();
    void run("Carico la copia…", async () => {
      if (file.size > 10*1024*1024) throw new Error("File troppo grande: massimo 10 MB.");
      // La foto del foglio firmato diventa un PDF di una pagina: il server accetta solo PDF veri.
      const foto = eUnaFoto(file);
      const base64 = foto
        ? await fotoInPdfBase64(file)
        : await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("File non leggibile")); reader.readAsDataURL(file); });
      const data = await workflow.request(id,"upload_evidence",{evidence_id:evidenceId,file_name:foto ? nomePdfDellaFoto(file.name) : file.name,file_base64:base64,proposal_hash:receipt!.document!.document_hash});
      absorb(data);
      setSelectedEvidence(evidenceId);
      if (!signedOn) setSignedOn(new Date().toLocaleDateString("en-CA"));
    });
  };
  const registraFirmata = (): void => void run("Registro la firma…", async () => {
    if (!window.confirm("Il cliente ha accettato? L'importo entra nel contratto e il lavoro extra diventa una fase delle Lavorazioni.")) return;
    absorb(await workflow.request(id,"approve_offline",{evidence_id:selectedEvidence,signer_name:signer,signed_on:signedOn,confirmed:true}));
    toast.success("Lavoro extra accettato: lo trovi nelle Lavorazioni");
  });

  const passoCorrente = PASSI.findIndex(p => p.id === passo);
  const titolo = receipt ? `Lavoro extra #${receipt.variation.numero_odv}` : "Nuovo lavoro extra";
  const sottotitolo = approvata ? "Accettato dal cliente: è una fase delle Lavorazioni."
    : pending ? "Mandato al cliente: aspetta la firma."
    : "Scrivi cosa fai, guardi il PDF, lo mandi. Niente parte senza il tuo clic.";

  return <Dialog open onOpenChange={open => { if(!open) close(); }}><DialogContent className="flex max-h-[94dvh] flex-col overflow-hidden p-0 sm:max-w-3xl">
    <DialogHeader className="shrink-0 border-b p-4 pr-10">
      <DialogTitle>{titolo}</DialogTitle>
      <DialogDescription>{sottotitolo}</DialogDescription>
      {!approvata && <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" aria-label="A che punto sei">
        {PASSI.map((p, i) => {
          const fatto = i < passoCorrente;
          const ora = i === passoCorrente;
          const puoAndare = i < passoCorrente || (i === 1 && !!receipt?.document) || (i === 2 && pending);
          return <li key={p.id}>
            <button type="button" disabled={!puoAndare || busy} onClick={() => setPasso(p.id)}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                ora ? "border-primary bg-primary text-primary-foreground" : fatto ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "text-muted-foreground",
                puoAndare && !ora && "hover:bg-muted")}>
              {fatto ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}{p.titolo}
            </button>
          </li>;
        })}
      </ol>}
    </DialogHeader>

    <div className="min-h-0 overflow-y-auto p-4 space-y-4">
      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error} {existing && !receipt && <Button variant="outline" size="sm" onClick={() => void run("Riprovo…", async () => absorb(await workflow.request(id,"load")))}>Riprova</Button>}</div>}

      {passo === "cosa" && <>
        {editable && <VariationTemplatePicker companyId={company} draft={form} context={variationDocumentContext(form,context)} disabled={busy} onApply={draft => {setForm(draft);setPdf(null);}} />}
        {phases.isError && <p role="alert" className="text-sm text-destructive">Lavorazioni non disponibili. <Button variant="outline" size="sm" onClick={() => void phases.refetch()}>Riprova</Button></p>}
        <VariationEditor draft={form} setDraft={draft => {setForm(draft);setPdf(null);}} phases={phases.data ?? []} chiPuo={chiPuo.data} context={variationDocumentContext(form,context)} busy={busy || !editable} review={false} onBack={()=>setPasso("cosa")} persistentDraft showPdfPreview={false} error="" />
      </>}

      {passo === "rivedi" && <>
        {impatto && <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3" aria-label="Quanto cambia">
          <div><p className="text-[11px] text-muted-foreground">Questo lavoro extra</p><p className="text-base font-semibold tabular-nums">{formatCurrency(impatto.delta)}</p><p className="text-[11px] text-muted-foreground">IVA esclusa</p></div>
          {impatto.vat !== null && <div><p className="text-[11px] text-muted-foreground">Con IVA {impatto.rate}%</p><p className="text-base font-semibold tabular-nums">{formatCurrency(impatto.grossDelta)}</p></div>}
          {impatto.revisedNet !== null && <div><p className="text-[11px] text-muted-foreground">Contratto se accetta</p><p className="text-base font-semibold tabular-nums">{formatCurrency(impatto.revisedNet)}</p></div>}
        </div>}
        {pdf ? <div className="h-[58dvh] min-h-[340px]"><PdfBlobLivePreviewPanel key={pdf.key} renderBlobUrl={render} depsKey={pdf.key} debounceMs={0} downloadFileName={pdf.name} showDownloadOnMobile /></div>
          : <p role="status" className="rounded-lg border p-6 text-center text-sm text-muted-foreground">{busy ? "Preparo il PDF…" : "Il PDF si prepara quando arrivi qui."}</p>}
        {pdf && <a href={pdf.downloadUrl} download={pdf.name} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium">Scarica il PDF</a>}
        {receipt?.document?.attachments.map(file => <div key={file.id} className="flex items-center justify-between gap-2 rounded-md border p-3"><span className="text-sm break-all">{file.name}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => void run("Apro…", () => showDocument(file.id))}>Apri</Button></div>)}
        <p className="text-xs text-muted-foreground">Se cambi qualcosa, il PDF si rifà: quelli vecchi restano nei Documenti della commessa.</p>
      </>}

      {passo === "manda" && <>
        {approvata ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-900"><Check className="h-4 w-4" />Accettato dal cliente {receipt?.variation.approval_channel === "offline" ? "con firma su carta" : "online, dal link"}{receipt?.variation.firmato_da ? ` · ${receipt.variation.firmato_da}` : ""}.</p>
            <p className="text-sm text-emerald-900">L'importo è nel contratto della commessa e il lavoro è una fase delle Lavorazioni, con le sue sottofasi.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run("Apro…", () => showDocument())}>Apri il PDF firmato</Button>
              {evidence.map(item => <Button key={item.id} variant="outline" size="sm" disabled={busy} onClick={() => void run("Apro…", () => showDocument(item.id))}>Copia caricata: {item.file_name}</Button>)}
            </div>
          </div>
        ) : <>
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Mandalo al cliente da firmare</p>
            {link ? <>
              <p className="text-xs text-muted-foreground">
                Già mandato a {firmaEsistente.data?.email ?? "il cliente"}. Firma elettronica col codice: il cliente apre il link, riceve un codice di sei cifre per email e firma.
              </p>
              <Input aria-label="Link di firma" readOnly value={link} className="text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copiaLink}><Copy className="mr-1.5 h-3.5 w-3.5" />Copia link</Button>
                <Button variant="ghost" size="sm" onClick={() => window.open(link, "_blank", "noopener")}>Apri come il cliente</Button>
              </div>
            </> : <>
              <p className="text-xs text-muted-foreground">
                Firma elettronica col codice, come per i preventivi: il cliente si identifica, riceve un codice di sei cifre e firma. Alla firma il lavoro entra nel contratto e nelle Lavorazioni.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="odv-email">Email del cliente</Label>
                  <Input id="odv-email" type="email" inputMode="email" autoComplete="email" value={emailCliente} onChange={e => setEmailCliente(e.target.value)} disabled={busy} placeholder="cliente@esempio.it" /></div>
                <div className="space-y-1"><Label htmlFor="odv-nome">Chi firma</Label>
                  <Input id="odv-nome" value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} disabled={busy} /></div>
              </div>
              <Button disabled={busy || !fresh} onClick={mandaAlCliente}>
                {busy && azione.startsWith("Mando") ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}Mandalo al cliente da firmare
              </Button>
            </>}
          </div>

          {receipt?.document && canEdit && <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Oppure: l'ha già firmato su carta</p>
            {approval.data === false ? <p className="text-xs text-muted-foreground">Puoi conservare la copia firmata, ma l'accettazione la registra chi ha il permesso sulle varianti.</p>
              : <p className="text-xs text-muted-foreground">Carica la copia firmata: il PDF, o la foto del foglio fatta col telefono (diventa un PDF da sé). Fino a 10 MB. Con nome e data è accettato.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy || dirty} onClick={() => document.getElementById("variation-evidence")?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />Carica la copia firmata o la foto</Button>
              <Input id="variation-evidence" type="file" accept="application/pdf,.pdf,image/*" capture="environment" className="sr-only" aria-label="Copia firmata: PDF o foto, fino a 10 MB" disabled={busy || dirty}
                onChange={event => { const file = event.target.files?.[0]; event.target.value=""; if (file) caricaFirmata(file); }} />
              {evidenceForDocument.map(item => <Button key={item.id} variant="ghost" size="sm" disabled={busy} onClick={() => void run("Apro…", () => showDocument(item.id))}>{item.file_name}</Button>)}
            </div>
            {approval.data === true && evidenceForDocument.length > 0 && <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
              {evidenceForDocument.length > 1 && <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="variation-copy">Quale copia</Label>
                <OfficeSelect id="variation-copy" label="Copia firmata" value={selectedEvidence} onValueChange={setSelectedEvidence}
                  options={[{value:"",label:"Scegli la copia"},...evidenceForDocument.map(item=>({value:item.id,label:item.file_name}))]} />
              </div>}
              <div className="space-y-1"><Label htmlFor="variation-signer">Chi ha firmato</Label><Input id="variation-signer" value={signer} maxLength={200} onChange={e=>setSigner(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="variation-signed-date">Quando</Label><Input id="variation-signed-date" type="date" value={signedOn} onChange={e=>setSignedOn(e.target.value)} /></div>
              <div className="sm:col-span-2">
                <Button disabled={busy || dirty || !selectedEvidence || signer.trim().length<2 || !signedOn} onClick={registraFirmata}><PenLine className="mr-1.5 h-4 w-4" />È accettato: mettilo nel contratto</Button>
              </div>
            </div>}
            {approval.isError && <p role="alert" className="text-sm text-destructive">Permesso non verificabile: puoi conservare la copia, non registrarla.</p>}
          </div>}
        </>}
      </>}
    </div>

    <DialogFooter className="shrink-0 flex-wrap gap-2 border-t p-4">
      <Button variant="outline" disabled={busy} onClick={close}>{dirty && editable ? "Salva bozza e chiudi" : "Chiudi"}</Button>
      {passo === "cosa" && editable && <Button disabled={busy} onClick={vaiARivedi}>{busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{azione}</> : "Avanti: guarda il PDF"}</Button>}
      {passo === "rivedi" && <>
        {editable && <Button variant="outline" disabled={busy} onClick={() => setPasso("cosa")}>Correggi</Button>}
        <Button disabled={busy || !receipt?.document} onClick={() => setPasso("manda")}>Avanti: mandalo</Button>
      </>}
      {passo === "manda" && !approvata && <Button variant="outline" disabled={busy} onClick={() => setPasso(editable ? "cosa" : "rivedi")}>{editable ? "Correggi" : "Rivedi il PDF"}</Button>}
      {canEdit && receipt && ["bozza","in_attesa"].includes(receipt.variation.status) && <Button variant="ghost" className="text-muted-foreground" disabled={busy} onClick={()=>void run("Annullo…", async()=>{if(window.confirm("Annullare questo lavoro extra e togliere il link? I documenti restano."))absorb(await workflow.request(id,"cancel"));})}>Annulla</Button>}
    </DialogFooter>
  </DialogContent></Dialog>;
}
