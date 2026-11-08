import { letturaSenzaPrezzi } from "@/lib/acquisti/letturaSenzaPrezzi";
import { CampoVoceRdo } from "@/components/rdo/CampoVoceRdo";
import { DocumentoAnteprimaDialog } from "@/components/acquisti/DocumentoAnteprimaDialog";
import { StoricoAcquistiCard } from "@/components/acquisti/StoricoAcquistiCard";
import { AttivitaAcquistoCard } from "@/components/acquisti/AttivitaAcquistoCard";
import { RdoCondizioniOfferta } from "@/components/acquisti/RdoCondizioniOfferta";
import { attivitaRdo, oggiLocale } from "@/lib/acquisti/attivita";
import { confrontoOfferta, TRASPORTO_LABELS } from "@/lib/acquisti/confronto";
import { RdoDettagliCard } from "@/components/rdo/RdoDettagliCard";
import { useQuery } from "@tanstack/react-query";
import { OdaFornitoreCard } from "@/components/orders/OdaFornitoreCard";
import type { Supplier } from "@/lib/suppliers/anagraficaFornitore";
import { scaricaBlob } from "@/components/orders/generali/vendita/scarica";
import { salvaPrezzoRdo } from "@/lib/orders/salvaPrezzoRdo";
import { FornitoreCombobox } from "@/components/orders/FornitoreCombobox";
/**
 * Richiesta d'offerta — dettaglio.
 *
 * Tre momenti, uno dopo l'altro:
 *   1. si scrive cosa serve (righe senza prezzo) e a chi chiederlo
 *   2. si chiede a ciascun fornitore: dalla casella aziendale, oppure fuori
 *      dall'app (telefono, WhatsApp, la propria email, al banco) e la si segna
 *      come chiesta
 *   3. arrivano le risposte — lette dall'AI o scritte a mano — si confrontano
 *      riga per riga e si aggiudica
 *
 * L'aggiudicazione e' l'unico punto in cui nasce un impegno di spesa: da li'
 * in poi si lavora sull'ordine d'acquisto, non piu' qui.
 */
import { useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDentroPopupDocumento, useIdDocumento, useNavigaDocumento } from "@/lib/orders/documentoPopup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Trash2, Send, Trophy, Mail, ExternalLink, AlertTriangle,
  FileQuestion, Users, ClipboardList, CheckCircle2, Sparkles, MoreHorizontal, Paperclip, Inbox, FileDown, Loader2, Eye,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  QuotePageHeader, QuoteCard, QuoteChip, QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";
import {
  useSupplierRfqDetail, totaleRigaOfferta, CANALE_RICHIESTA_LABELS, type CanaleRichiesta, type RfqSupplier,
} from "@/hooks/useSupplierRfqs";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useAuth } from "@/contexts/AuthContext";
import { type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { EstraiOffertaAIDialog, type RigaEstratta, type PropostaEstratta } from "@/components/rdo/EstraiOffertaAIDialog";
import { DocumentoEmailDialog } from "@/components/documentiOperativi/DocumentoEmailDialog";
import { recapitiFornitore } from "@/lib/documentiOperativi/fornitore";
import { nomeFileDocumento, type DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { buildRdoEmailBody, buildRdoEmailSubject } from "@/lib/rdoEmail";
import { descrizioneConMisure } from "@/lib/acquisti/misureSuDocumenti";
import { ControlloDocumentoCard } from "@/components/orders/ControlloDocumentoCard";
import {
  RDO_STATUS_LABELS, RDO_FORNITORE_LABELS, RDO_FORNITORE_COLORS,
} from "@/lib/rdoStatus";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";

const dataIt = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

export default function SupplierRfqDetail() {
  const { rfqId: rfqIdIndirizzo } = useParams();
  const rfqId = useIdDocumento(rfqIdIndirizzo);
  const navigate = useNavigaDocumento();
  const inPopup = useDentroPopupDocumento();
  const { effectiveCompany } = useAuth();
  const {
    rfq, items, fornitori, quotes, isLoading,
    updateRfq, addItem, updateItem, deleteItem,
    addFornitore, updateFornitore, removeFornitore, setQuote, aggiudica,
    segnaChiesta, registraOfferta, allegaOfferta,
  } = useSupplierRfqDetail(rfqId ?? null);
  // Le misure chieste al fornitore confrontate con quelle di oggi sulla commessa.
  const { data: misureCambiate = [] } = useQuery({
    queryKey: ["rdo-misure-cambiate", rfqId],
    enabled: !!rfqId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ data: Array<{ rfq_item_id: string; riferimento: string | null; descrizione: string; chieste: string | null; attuali: string | null }> | null; error: { message: string } | null }>)(
        "rdo_misure_cambiate", { p_rfq: rfqId });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { suppliers } = useOperationalSuppliers();

  const supplierIds=fornitori.map(f=>f.supplier_id);
  const {data:anagrafiche=[],isFetching:loadingAnagrafiche,isError:erroreAnagrafiche,refetch:ricaricaAnagrafiche}=useQuery({
    queryKey:["rdo-fornitori-anagrafica",effectiveCompany?.id,rfqId,supplierIds],
    enabled:!!effectiveCompany?.id && supplierIds.length>0,
    queryFn:async()=>{const {data,error}=await supabase.from("suppliers").select("*").eq("company_id",effectiveCompany!.id).in("id",supplierIds);if(error)throw error;return (data ?? []) as Supplier[];},
  });
  const [editingRfqId,setEditingRfqId]=useState<string|null>(null);
  const [sendMode,setSendMode]=useState<"testo"|"pdf">("testo");
  const [downloadingFor,setDownloadingFor]=useState<string|null>(null);
  const [previewFor,setPreviewFor]=useState<RfqSupplier|null>(null);
  const [editingOffers,setEditingOffers]=useState<string[]>([]);
  const [nuovoFornitore, setNuovoFornitore] = useState("");
  const [inviaA, setInviaA] = useState<RfqSupplier | null>(null);
  const [aggiudicaA, setAggiudicaA] = useState<RfqSupplier | null>(null);
  const [estraiDa, setEstraiDa] = useState<RfqSupplier | null>(null);
  const [motivazione, setMotivazione] = useState("");
  // un doppio clic parte prima che il bottone si disabiliti: il database rifiuta
  // il secondo, ma l'errore arrivava dopo un'aggiudicazione riuscita
  const aggiudicaInCorso = useRef(false);

  const totaliPerFornitore = useMemo(() => {
    const out: Record<string, { totale: number | null; righeCoperte: number; daRighe?:boolean }> = {};
    for (const f of fornitori) {
      let somma = 0;
      let coperte = 0;
      for (const it of items) {
        const q = quotes.find((x) => x.rfq_item_id === it.id && x.rfq_supplier_id === f.id);
        const t = totaleRigaOfferta(q, Number(it.quantita));
        if (t != null) {
          somma += t;
          coperte += 1;
        }
      }
      // Se il fornitore ha risposto a corpo senza dettagliare, vale il totale
      // che ha scritto lui: sommare righe vuote darebbe zero.
      const daRighe = coperte > 0 ? somma : null;
      out[f.id] = {
        daRighe: daRighe!=null,
        totale: daRighe ?? (f.totale_offerto == null ? null : Number(f.totale_offerto)),
        // un'offerta a corpo copre tutto per definizione
        righeCoperte: daRighe == null && f.totale_offerto != null ? items.length : coperte,
      };
    }
    return out;
  }, [fornitori, items, quotes]);

  /** Chi offre meno su una riga: e' l'unico confronto che conta davvero. */
  const migliorePerRiga = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const it of items) {
      let vincitore: string | null = null;
      let minimo = Infinity;
      for (const f of fornitori) {
        if(f.status!=="risposta" || (f.validita_offerta && f.validita_offerta<oggiLocale()))continue;
        const q = quotes.find((x) => x.rfq_item_id === it.id && x.rfq_supplier_id === f.id);
        const t = totaleRigaOfferta(q, Number(it.quantita));
        if (t != null && t < minimo) {
          minimo = t;
          vincitore = f.id;
        }
      }
      out[it.id] = vincitore;
    }
    return out;
  }, [items, fornitori, quotes]);

  // Il totale più basso vale solo fra offerte che coprono le stesse voci: chi
  // quota una voce su due costa meno perché manca metà fornitura, non perché conviene.
  const confronti = useMemo(()=>Object.fromEntries(fornitori.map(f=>[f.id,confrontoOfferta(f,totaliPerFornitore[f.id]??{totale:null,righeCoperte:0},items.length,oggiLocale())])),[fornitori,totaliPerFornitore,items.length]);
  const miglioreTotale = useMemo(() => {
    const valide=fornitori.filter(f=>confronti[f.id]?.confrontabile);
    valide.sort((a,b)=>(confronti[a.id].totale??Infinity)-(confronti[b.id].totale??Infinity));
    return valide[0]?.id??null;
  }, [fornitori,confronti]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Richiesta non trovata</p>
        <Button variant="outline" onClick={() => navigate("/azienda/ordini?tab=offerte")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  // le voci si cambiano finché non arriva la prima offerta: chi chiede per
  // telefono spesso segna la richiesta prima di aver scritto tutto l'elenco
  const modificabile = rfq.status === "bozza" ||
    (rfq.status === "inviata" && !fornitori.some((f) => f.status === "risposta"));
  // aggiudicata o annullata: si guarda, non si cambia più niente
  // Chi non vede i prezzi guarda soltanto: salverebbe offerte vuote al posto di quelle vere.
  const senzaPrezzi = letturaSenzaPrezzi();
  const chiusa = senzaPrezzi || rfq.status === "aggiudicata" || rfq.status === "annullata";
  const haRisposte = fornitori.some((f) => f.status === "risposta");

  const composeContext = (f: RfqSupplier): ComposeContext => {
    const dati = {
      rfqNumber: rfq.rfq_number,
      titolo: rfq.titolo,
      descrizione: rfq.descrizione,
      fornitoreNome: f.suppliers?.name ?? null,
      aziendaNome: effectiveCompany?.name ?? null,
      dataFabbisogno: rfq.data_fabbisogno,
      scadenzaOfferte: rfq.scadenza_offerte,
      commessaCodice: rfq.orders?.order_code ?? null,
      note: rfq.note,
      righe: items.map((i) => ({
        descrizione: i.descrizione,
        quantita: i.quantita,
        unita_misura: i.unita_misura,
        note: [i.misure_testo, i.note].filter(Boolean).join("\n") || null,
      })),
    };
    return {
      mode: "new",
      initialTo: f.suppliers?.email ? [f.suppliers.email] : [],
      initialSubject: buildRdoEmailSubject(dati),
      initialBodyHtml: buildRdoEmailBody(dati),
    };
  };

  const documentoInvio = (f: RfqSupplier): DocumentoOperativo => ({
    tipo:"richiesta",numero:rfq.rfq_number,data:rfq.created_at?.slice(0,10),
    ...recapitiFornitore({...(anagrafiche.find(s=>s.id===f.supplier_id) ?? suppliers.find(s=>s.id===f.supplier_id)),id:f.supplier_id,name:f.suppliers?.name || "Fornitore",email:(anagrafiche.find(s=>s.id===f.supplier_id) ?? suppliers.find(s=>s.id===f.supplier_id))?.email || f.suppliers?.email}),
    pagamento:f.condizioni_pagamento || recapitiFornitore({...(anagrafiche.find(s=>s.id===f.supplier_id) ?? suppliers.find(s=>s.id===f.supplier_id)),id:f.supplier_id,name:f.suppliers?.name || "Fornitore"}).pagamento,
    commessa:rfq.orders?.order_code,luogo:rfq.orders?.work_address,indirizzoCantiere:rfq.orders?.work_address,destinazioneTipo:rfq.order_id ? "cantiere" : "magazzino", consegna:rfq.data_fabbisogno,scadenzaOfferta:rfq.scadenza_offerte,
    note:[rfq.descrizione,rfq.note].filter(Boolean).join("\n"),
    righe:items.map(i=>({descrizione:descrizioneConMisure(i.descrizione,i.misure_testo,i.note),unita:i.unita_misura || "pz",quantita:Number(i.quantita),prezzo: null as number | null})),
  });
  const downloadPdf=async(f:RfqSupplier)=>{
    if(!effectiveCompany || downloadingFor)return;
    setDownloadingFor(f.id);
    try {const {generaPdfOperativo}=await import("@/lib/documentiOperativi/pdf");const documento=documentoInvio(f);scaricaBlob(await generaPdfOperativo(documento,effectiveCompany),nomeFileDocumento(documento));}
    catch(e){toast.error("Impossibile scaricare il PDF",{description:e instanceof Error ? e.message : "Riprova."});}
    finally{setDownloadingFor(null);}
  };
  return (
    <div className="space-y-4 sm:space-y-6">
      {!inPopup && <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/ordini?tab=offerte")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Richieste d'offerta</span>
          <span className="sm:hidden">Indietro</span>
        </Button>
      </div>}

      <QuotePageHeader
        numero={rfq.rfq_number}
        stato={
          <QuoteChip variant={rfq.status === "aggiudicata" ? "green" : rfq.status === "bozza" ? "default" : "blue"}>
            {RDO_STATUS_LABELS[rfq.status] ?? rfq.status}
          </QuoteChip>
        }
        chips={
          rfq.purchase_order_id ? (
            <Link to={`/azienda/ordini-acquisto/${rfq.purchase_order_id}`} className="inline-flex">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors">
                Ordine generato <ExternalLink className="h-3 w-3" />
              </span>
            </Link>
          ) : null
        }
        title={rfq.titolo}
        subtitle={
          rfq.data_fabbisogno ? `Serve in cantiere entro il ${dataIt(rfq.data_fabbisogno)}` : undefined
        }
        icon={<FileQuestion className="h-5 w-5" />}
        actions={
          rfq.status !== "aggiudicata" && rfq.status !== "annullata" ? (
            <>
              {haRisposte && (
                <QuotePrimaryButton
                  size="sm"
                  disabled={editingOffers.some(id=>fornitori.some(f=>f.id===id)) || updateFornitore.isPending || setQuote.isPending || updateRfq.isPending}
                  onClick={() => {
                    const scelto = fornitori.find((f) => f.id === miglioreTotale) ?? fornitori.find((f) => f.status === "risposta");
                    if (scelto) setAggiudicaA(scelto);
                  }}
                >
                  <Trophy className="h-3.5 w-3.5 mr-1" />
                  Aggiudica
                </QuotePrimaryButton>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateRfq.mutate({ status: "annullata" })}
                disabled={updateRfq.isPending}
              >
                Annulla richiesta
              </Button>
            </>
          ) : null
        }
      />

      {misureCambiate.length > 0 && !chiusa && (
        <div role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Offerta su misure vecchie: {misureCambiate.length} {misureCambiate.length === 1 ? "posizione è cambiata" : "posizioni sono cambiate"} dopo la richiesta</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {misureCambiate.map((m) => <li key={m.rfq_item_id}>{m.riferimento ?? m.descrizione}: chieste {m.chieste ?? "—"}, ora {m.attuali ?? "—"}</li>)}
            </ul>
            <p className="mt-1 text-xs">L'ordine partirà con le misure di oggi: chiedi al fornitore di confermare il prezzo.</p>
          </div>
        </div>
      )}
      <AttivitaAcquistoCard attivita={attivitaRdo({status:rfq.status,righe:items.length,scadenza:rfq.scadenza_offerte,fornitori:fornitori.map(f=>({status:f.status,nome:f.suppliers?.name??"Fornitore",email:documentoInvio(f).destinatario.email,scadenza:f.validita_offerta,copertura:totaliPerFornitore[f.id]?.righeCoperte??0,aggancio:f.aggancio_da_confermare,trasportoDefinito:confronti[f.id]?.trasportoNoto,coerente:confronti[f.id]?.coerente}))})}/>
      <div className="grid grid-cols-1 gap-6">
        <div className="min-w-0 space-y-4">
          {/* ── Cosa serve ─────────────────────────────────────────── */}
          <QuoteCard
            title="Cosa serve"
            icon={<ClipboardList className="h-4 w-4" />}
            action={
              modificabile ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addItem.isPending}
                  onClick={() => addItem.mutate({ posizione: items.length })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi voce
                </Button>
              ) : null
            }
          >
            {items.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">
                Nessuna voce. I fornitori devono sapere cosa quotare.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2">
                    <CampoVoceRdo campo="descrizione" valore={it.descrizione} disabled={!modificabile} onSave={value=>updateItem.mutateAsync({id:it.id,updates:{descrizione:value}})} />
                    <CampoVoceRdo campo="quantita" valore={Number(it.quantita)} disabled={!modificabile} onSave={value=>updateItem.mutateAsync({id:it.id,updates:{quantita:value}})} />
                    <CampoVoceRdo campo="unita_misura" valore={it.unita_misura ?? "pz"} disabled={!modificabile} onSave={value=>updateItem.mutateAsync({id:it.id,updates:{unita_misura:value}})} />
                    {modificabile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Elimina voce ${it.descrizione}`}
                        disabled={deleteItem.isPending}
                        onClick={() => deleteItem.mutate(it.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </QuoteCard>

          <RdoDettagliCard key={rfq.id} rfq={rfq} disabled={chiusa} onSave={patch=>updateRfq.mutateAsync(patch)} onEditingChange={editing=>setEditingRfqId(editing ? rfq.id : null)}/>

          {/* ── Confronto ──────────────────────────────────────────── */}
          {!senzaPrezzi && fornitori.length > 0 && items.length > 0 && (
            <QuoteCard noHeader className="p-0 sm:p-0">
              <div className="px-5 sm:px-6 pt-5 pb-3">
                <h3 className="text-[15px] font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="block w-1 h-4 rounded-sm bg-gradient-to-b from-orange-500 to-eic-amber" />
                  Confronto offerte
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Importi IVA esclusa. Il confronto complessivo considera trasporto, disponibilità, validità e copertura delle voci. Il più basso è evidenziato solo tra offerte complete, valide e con trasporto definito.
                </p>
              </div>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 pl-4 font-medium min-w-[180px]">Voce</th>
                      <th className="text-right p-2 font-medium w-20">Q.tà</th>
                      {fornitori.map((f) => (
                        <th key={f.id} className="text-right p-2 font-medium min-w-[110px]">
                          {f.suppliers?.name ?? "Fornitore"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b">
                        <td className="p-2 pl-4">{it.descrizione}{it.misure_testo && <span className="mt-0.5 block whitespace-pre-line text-xs text-muted-foreground">{it.misure_testo}</span>}</td>
                        <td className="p-2 text-right text-slate-500">
                          {Number(it.quantita).toLocaleString("it-IT")} {it.unita_misura ?? "pz"}
                        </td>
                        {fornitori.map((f) => {
                          const q = quotes.find((x) => x.rfq_item_id === it.id && x.rfq_supplier_id === f.id);
                          const tot = totaleRigaOfferta(q, Number(it.quantita));
                          const vince = migliorePerRiga[it.id] === f.id;
                          return (
                            <td key={f.id} className={`p-1 ${vince ? "bg-emerald-50" : ""}`}>
                              <Input
                                // la chiave segue il valore salvato: un prezzo letto dall'AI
                                // compare nella cella (con defaultValue restava «—», e uscendo
                                // dalla cella vuota il prezzo si cancellava)
                                key={`${q?.id ?? "nuova"}:${q?.prezzo_unitario ?? ""}`}
                                type="number"
                                step="0.01"
                                // a richiesta chiusa si legge soltanto: due decimali, come un prezzo
                                defaultValue={chiusa && q?.prezzo_unitario != null ? Number(q.prezzo_unitario).toFixed(2) : q?.prezzo_unitario ?? ""}
                                placeholder="—"
                                disabled={chiusa}
                                className={`h-8 text-sm text-right ${vince ? "font-semibold text-emerald-700" : ""}`}
                                aria-label={`Prezzo offerto da ${f.suppliers?.name || "fornitore"} per ${it.descrizione}`}
                                min="0"
                                onBlur={async (e) => {
                                  const input = e.currentTarget;
                                  const raw = input.value.trim();
                                  const precedente = q?.prezzo_unitario == null ? null : Number(q.prezzo_unitario);
                                  try {
                                    await salvaPrezzoRdo({raw,precedente,
                                      salva: value => setQuote.mutateAsync({ rfq_supplier_id:f.id,rfq_item_id:it.id,updates:{prezzo_unitario:value,disponibile:value != null} }),
                                      registraRisposta: f.status !== "risposta" ? () => registraOfferta.mutateAsync(f) : undefined,
                                    });
                                  } catch (error) {
                                    if (input.value.trim() === raw) input.value = precedente == null ? "" : String(precedente);
                                    toast.error(error instanceof Error ? error.message : "Prezzo non salvato");
                                  }
                                }}
                              />
                              <select className="mt-1 h-7 w-full rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-600" aria-label={`Disponibilità ${it.descrizione} da ${f.suppliers?.name}`} disabled={chiusa || setQuote.isPending} value={!q?"da_quotare":q.disponibile?"disponibile":"non_disponibile"} onChange={e=>setQuote.mutate({rfq_supplier_id:f.id,rfq_item_id:it.id,updates:e.target.value==="da_quotare"?{disponibile:true,prezzo_unitario:null}:{disponibile:e.target.value==="disponibile"}})}><option value="da_quotare" disabled={!!q}>Da quotare</option><option value="disponibile">Disponibile</option><option value="non_disponibile">Non disponibile</option></select>
                              {tot != null && (
                                <span className="block text-[10px] text-slate-400 text-right pr-1 mt-0.5">
                                  {formatCurrency(tot)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t">
                      <td colSpan={2} className="p-2 pl-4 text-right font-bold">Somma righe confrontate</td>
                      {fornitori.map((f) => {
                        const t = totaliPerFornitore[f.id]?.totale;
                        const vince = miglioreTotale === f.id;
                        return (
                          <td
                            key={f.id}
                            className={`p-2 text-right font-bold tabular-nums ${vince ? "text-emerald-700 bg-emerald-50" : ""}`}
                          >
                            {t != null ? formatCurrency(t) : "—"}
                            {t != null && (totaliPerFornitore[f.id]?.righeCoperte ?? 0) < items.length && (
                              <span className="block text-[10px] font-normal text-amber-700">
                                {totaliPerFornitore[f.id]?.righeCoperte} di {items.length} {items.length === 1 ? "voce" : "voci"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Il totale scritto sul documento può includere costi non a
                        righe (imballo, trasporto): mostrarlo evita il "perché
                        non torna col PDF?" — il delta è proprio quella parte. */}
                    {fornitori.some((f) => f.totale_offerto != null) && (
                      <tr className="border-t text-xs text-slate-500">
                        <td colSpan={2} className="p-2 pl-4 text-right">Totale documento (con imballo/trasporto)</td>
                        {fornitori.map((f) => {
                          const doc = f.totale_offerto == null ? null : Number(f.totale_offerto);
                          const righe = totaliPerFornitore[f.id]?.totale;
                          const delta = doc != null && righe != null && Math.abs(doc - righe) > 0.5 ? doc - righe : null;
                          return (
                            <td key={f.id} className="p-2 text-right tabular-nums">
                              {doc != null ? formatCurrency(doc) : "—"}
                              {delta != null && (
                                <span className="block text-[10px] text-slate-400">
                                  {delta > 0 ? "+" : "−"}{formatCurrency(Math.abs(delta))} extra righe
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    <tr className="border-t bg-blue-50/40"><th colSpan={2} className="p-2 pl-4 text-right text-xs">Totale complessivo noto</th>{fornitori.map(f=>{const c=confronti[f.id];return <td key={f.id} className={`p-2 text-right text-sm font-semibold ${miglioreTotale===f.id?"bg-emerald-50 text-emerald-800":""}`}>{c.totale==null?"—":formatCurrency(c.totale)}{miglioreTotale===f.id&&<span className="block text-[10px]">Più basso tra offerte confrontabili</span>}{!c.coerente&&<span className="block text-[10px] text-red-700">Totale documento da riconciliare</span>}{!c.trasportoNoto&&<span className="block text-[10px] text-amber-700">Trasporto da definire</span>}</td>;})}</tr>
                    {(["Trasporto","Consegna","Pagamento","Validità","Disponibilità"] as const).map(label=><tr key={label} className="border-t text-xs"><th colSpan={2} className="p-2 pl-4 text-right font-medium">{label}</th>{fornitori.map(f=><td key={f.id} className="max-w-[18rem] break-words p-2 text-right text-slate-600">{label==="Trasporto"?<>{TRASPORTO_LABELS[f.trasporto_tipo??"da_confermare"]}{f.trasporto_tipo==="extra"&&f.costo_trasporto!=null?` · ${formatCurrency(Number(f.costo_trasporto))}`:""}</>:label==="Consegna"?f.giorni_consegna==null?"Da indicare":`${f.giorni_consegna} giorni`:label==="Pagamento"?f.condizioni_pagamento||"Da indicare":label==="Validità"?<span className={confronti[f.id].scaduta?"text-red-700 font-semibold":""}>{dataIt(f.validita_offerta)}{confronti[f.id].scaduta?" · Scaduta":""}</span>:<>{totaliPerFornitore[f.id]?.righeCoperte??0}/{items.length} voci{f.disponibilita_note&&<span className="mt-1 block whitespace-pre-wrap">{f.disponibilita_note}</span>}</>}</td>)}</tr>)}
                  </tfoot>
                </table>
              </div>
            </QuoteCard>
          )}
        </div>

        {/* ── Fornitori interpellati ───────────────────────────────── */}
        <div className="space-y-4">
          {/* Chi ha vinto si legge subito, non in fondo alla colonna. */}
          {rfq.status === "aggiudicata" && (
            <QuoteCard title="Aggiudicata" icon={<CheckCircle2 className="h-4 w-4" />}>
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">
                  Il {dataIt(rfq.aggiudicata_at)}, fornitore scelto:{" "}
                  <strong>
                    {fornitori.find((f) => f.supplier_id === rfq.supplier_id_aggiudicato)?.suppliers?.name ?? "—"}
                  </strong>
                </p>
                {rfq.motivazione_scelta && (
                  <p className="text-xs text-slate-500 italic">{rfq.motivazione_scelta}</p>
                )}
                {rfq.purchase_order_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate(`/azienda/ordini-acquisto/${rfq.purchase_order_id}`)}
                  >
                    Apri l'ordine generato <ExternalLink className="h-3 w-3 ml-1.5" />
                  </Button>
                )}
              </div>
            </QuoteCard>
          )}
          <QuoteCard title="A chi lo chiedi" subtitle="Prepara un’email distinta per ogni fornitore: testo completo oppure richiesta in PDF." icon={<Users className="h-4 w-4" />}>
            {erroreAnagrafiche && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Impossibile caricare i recapiti aggiornati dei fornitori. <Button variant="link" size="sm" onClick={()=>void ricaricaAnagrafiche()}>Riprova</Button></p>}
            <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fornitori.length === 0 && (
                <p className="text-xs text-slate-500">
                  Nessun fornitore. Chiedere a due o tre è il modo più semplice per non
                  pagare troppo.
                </p>
              )}
              {fornitori.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {f.suppliers?.name ?? "Fornitore"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {f.inviata_at
                          ? `Chiesta${f.inviata_via ? ` per ${CANALE_RICHIESTA_LABELS[f.inviata_via]}` : ""} il ${dataIt(f.inviata_at)}`
                          : f.suppliers?.email ?? "nessuna email in anagrafica"}
                      </p>
                    </div>
                    <Badge className={`${RDO_FORNITORE_COLORS[f.status] ?? ""} text-[10px] shrink-0`}>
                      {RDO_FORNITORE_LABELS[f.status] ?? f.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={loadingAnagrafiche || erroreAnagrafiche || editingOffers.some(id=>fornitori.some(f=>f.id===id)) || editingRfqId===rfq.id || updateRfq.isPending || updateFornitore.isPending || addItem.isPending || updateItem.isPending || deleteItem.isPending} onClick={()=>setPreviewFor(f)} aria-label={`Anteprima PDF per ${f.suppliers?.name??"fornitore"}`}><Eye className="mr-1 h-3.5 w-3.5"/>Anteprima PDF</Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={editingOffers.some(id=>fornitori.some(f=>f.id===id)) || !!downloadingFor || loadingAnagrafiche || erroreAnagrafiche || editingRfqId === rfq.id || updateRfq.isPending || updateFornitore.isPending || addItem.isPending || updateItem.isPending || deleteItem.isPending} onClick={()=>void downloadPdf(f)} aria-label={`Scarica PDF per ${f.suppliers?.name ?? "fornitore"}`}>{downloadingFor === f.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <FileDown className="mr-1 h-3.5 w-3.5"/>}Scarica PDF</Button>
                    {!chiusa && <><Button size="sm" variant="outline" className="h-8 text-xs" disabled={editingOffers.some(id=>fornitori.some(f=>f.id===id)) || loadingAnagrafiche || erroreAnagrafiche || editingRfqId === rfq.id || items.length===0 || addItem.isPending || updateItem.isPending || deleteItem.isPending || updateRfq.isPending || updateFornitore.isPending} onClick={()=>{setSendMode("testo");setInviaA(f);}} aria-label={`Email con testo a ${f.suppliers?.name ?? "fornitore"}`}><Mail className="mr-1 h-3.5 w-3.5"/>Email con testo</Button><Button size="sm" className="h-8 text-xs" disabled={editingOffers.some(id=>fornitori.some(f=>f.id===id)) || loadingAnagrafiche || erroreAnagrafiche || editingRfqId === rfq.id || items.length===0 || addItem.isPending || updateItem.isPending || deleteItem.isPending || updateRfq.isPending || updateFornitore.isPending} onClick={()=>{setSendMode("pdf");setInviaA(f);}} aria-label={`Email con PDF a ${f.suppliers?.name ?? "fornitore"}`}><Paperclip className="mr-1 h-3.5 w-3.5"/>Email con PDF</Button></>}
                  </div>
                  {f.status !== "risposta" && <div><Label className="text-[11px] text-slate-500">Pagamento per questa richiesta</Label><Input aria-label={`Pagamento richiesta ${f.suppliers?.name}`} className="h-8 text-xs" disabled={chiusa} key={`${f.id}:${f.condizioni_pagamento ?? documentoInvio(f).pagamento}`} defaultValue={f.condizioni_pagamento || documentoInvio(f).pagamento || ""} onBlur={e=>{const v=e.target.value.trim() || null;if(v !== (f.condizioni_pagamento || documentoInvio(f).pagamento || null))updateFornitore.mutate({id:f.id,updates:{condizioni_pagamento:v}});}}/></div>}
                  {anagrafiche.find(s=>s.id===f.supplier_id) && <details className="rounded-lg border border-slate-100 bg-slate-50/50 p-2"><summary className="cursor-pointer text-xs font-medium text-slate-600">Anagrafica, referenti e pagamento</summary><div className="mt-2"><OdaFornitoreCard supplier={anagrafiche.find(s=>s.id===f.supplier_id)}/></div></details>}

                  <RdoCondizioniOfferta fornitore={f} chiusa={chiusa} onSave={updates=>updateFornitore.mutateAsync({id:f.id,updates})} onEditingChange={editing=>setEditingOffers(ids=>editing?[...new Set([...ids,f.id])]:ids.filter(id=>id!==f.id))}/>
                  {editingOffers.includes(f.id)&&<p role="status" className="text-xs text-amber-700">Salva o annulla le condizioni aperte prima di preparare PDF, email o aggiudicare.</p>}
                  {f.aggancio_da_confermare && (
                    <div className="flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                      <span>
                        Risposta agganciata dal mittente, non dal codice: controlla che sia
                        davvero per questa richiesta.
                      </span>
                    </div>
                  )}

                  {f.status === "risposta" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-slate-500">Consegna (gg)</Label>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          aria-label={`Giorni consegna ${f.suppliers?.name}`}
                          min="0"
                          disabled={chiusa}
                          defaultValue={f.giorni_consegna ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v != null && (!Number.isFinite(v) || v < 0 || !Number.isInteger(v))) { e.target.value = f.giorni_consegna == null ? "" : String(f.giorni_consegna); toast.error("Indica un numero intero di giorni maggiore o uguale a zero."); return; }
                            if (v !== f.giorni_consegna) {
                              updateFornitore.mutate({ id: f.id, updates: { giorni_consegna: v } });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-500">Offerta valida fino</Label>
                        <Input
                          type="date"
                          className="h-7 text-xs"
                          aria-label={`Validità offerta ${f.suppliers?.name}`}
                          disabled={chiusa}
                          defaultValue={f.validita_offerta ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value || null;
                            if (v !== f.validita_offerta) {
                              updateFornitore.mutate({ id: f.id, updates: { validita_offerta: v } });
                            }
                          }}
                        />
                      </div>
                      {/* Offerta a corpo (o con trasporto/imballo): il totale
                          del documento, scritto a mano se non lo legge l'AI. */}
                      <div>
                        <Label className="text-[10px] text-slate-500">Totale offerto (€)</Label>
                        <Input
                          key={`${f.id}:${f.totale_offerto ?? ""}`}
                          type="number"
                          step="0.01"
                          className="h-7 text-xs"
                          disabled={chiusa}
                          aria-label={`Totale offerto ${f.suppliers?.name}`}
                          min="0"
                          defaultValue={f.totale_offerto ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v != null && (!Number.isFinite(v) || v < 0)) {e.target.value = f.totale_offerto == null ? "" : String(f.totale_offerto);toast.error("Il totale offerto non può essere negativo.");return;}
                            if (v !== (f.totale_offerto == null ? null : Number(f.totale_offerto))) {
                              updateFornitore.mutate({ id: f.id, updates: { totale_offerto: v } });
                            }
                          }}
                        />
                      </div>
                      {/* finisce nell'ordine fornitore all'aggiudicazione */}
                      <div>
                        <Label className="text-[10px] text-slate-500">Pagamento</Label>
                        <Input
                          className="h-7 text-xs"
                          disabled={chiusa}
                          placeholder="Es. 60 gg d.f."
                          defaultValue={f.condizioni_pagamento ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== f.condizioni_pagamento) {
                              updateFornitore.mutate({ id: f.id, updates: { condizioni_pagamento: v } });
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {!chiusa && f.status !== "risposta" && f.status !== "da_inviare" && <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={registraOfferta.isPending} onClick={()=>registraOfferta.mutate(f)}><Inbox className="mr-1 h-3 w-3"/>Ho l’offerta</Button>}
                    {!chiusa && f.status !== "risposta" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" aria-label="Altre azioni" title="Altre azioni">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {f.status === "da_inviare" ? (
                            <>
                              <DropdownMenuLabel className="text-xs">L'ho già chiesta io</DropdownMenuLabel>
                              {(["telefono", "whatsapp", "email", "di_persona"] as CanaleRichiesta[]).map((via) => (
                                <DropdownMenuItem key={via} onClick={() => segnaChiesta.mutate({ id: f.id, via })}>
                                  {via === "email" ? "Con la mia email" : `Per ${CANALE_RICHIESTA_LABELS[via]}`}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => registraOfferta.mutate(f)}>Ho già l'offerta</DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                if (items.length === 0) {
                                  toast.error("Aggiungi almeno una voce prima di chiedere l'offerta");
                                  return;
                                }
                                setSendMode("testo");setInviaA(f);
                              }}
                            >
                              Sollecita per email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => updateFornitore.mutate({ id: f.id, updates: { status: "rifiutata" } })}>
                            Non fa l'offerta
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {!chiusa && f.status === "risposta" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        disabled={editingOffers.some(id=>fornitori.some(f=>f.id===id)) || updateFornitore.isPending || setQuote.isPending}
                        onClick={() => setAggiudicaA(f)}
                      >
                        <Trophy className="h-3 w-3 mr-1" /> Scegli questo
                      </Button>
                    )}
                    {/* La lettura AI del preventivo: propone i prezzi nella
                        griglia, l'umano conferma. Sempre disponibile: anche chi
                        non ha l'email agganciata ha un PDF da caricare. */}
                    {!chiusa && <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600"
                      title="Leggi il preventivo con l'AI"
                      onClick={() => {
                        if (items.length === 0) {
                          toast.error("Aggiungi le voci della richiesta prima di leggere il preventivo");
                          return;
                        }
                        setEstraiDa(f);
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>}
                    {!chiusa && f.status === "risposta" && <ControlloDocumentoCard obiettivo={{ rfqSupplierId: f.id }} tipo="offerta" compatto />}
                    {/* Il preventivo arrivato su WhatsApp o su carta: si allega
                        anche senza farlo leggere all'AI, e i prezzi si scrivono a mano. */}
                    {!chiusa && f.status === "risposta" && !f.allegato_url && (
                      <label
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-accent hover:text-slate-700"
                        title="Allega l'offerta (PDF o foto)"
                      >
                        {allegaOfferta.isPending ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> : <Paperclip className="h-3.5 w-3.5" />}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) allegaOfferta.mutate({ id: f.id, file });
                          }}
                        />
                      </label>
                    )}
                    {/* Offerta originale (PDF letto dall'AI o allegato email):
                        il confronto si controlla sul documento, non a memoria. */}
                    {f.allegato_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700"
                        title="Apri l'offerta originale"
                        onClick={async () => {
                          const raw = f.allegato_url!;
                          if (/^https?:\/\//.test(raw)) { window.open(raw, "_blank"); return; }
                          const slash = raw.indexOf("/");
                          const { data, error } = await supabase.storage
                            .from(raw.slice(0, slash))
                            .createSignedUrl(raw.slice(slash + 1), 600);
                          if (error || !data?.signedUrl) {
                            toast.error("Non riesco ad aprire l'allegato dell'offerta");
                            return;
                          }
                          window.open(data.signedUrl, "_blank");
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {modificabile && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFornitore.mutate(f.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {!chiusa && (
                <div className="flex gap-2 pt-1">
                  <FornitoreCombobox value={nuovoFornitore} onChange={setNuovoFornitore} fornitori={suppliers.filter(s=>s.is_active && !fornitori.some(f=>f.supplier_id===s.id))}/>

                  <Button
                    size="sm"
                    className="h-8"
                    aria-label="Aggiungi fornitore alla richiesta"
                    disabled={!nuovoFornitore || addFornitore.isPending}
                    onClick={() => {
                      addFornitore.mutate(nuovoFornitore, { onSuccess: () => setNuovoFornitore("") });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </QuoteCard>

        </div>
      </div>

      {/* Invio al singolo fornitore: stesso compositore del resto dell'app. */}
      <StoricoAcquistiCard tipo="rdo" id={rfq.id} revisionKey={JSON.stringify([rfq,items,fornitori,quotes])}/>
      {previewFor&&<DocumentoAnteprimaDialog documento={documentoInvio(previewFor)} onClose={()=>setPreviewFor(null)}/>}
      {inviaA && (
        <DocumentoEmailDialog
          tracking={{tipo:"rdo",id:rfq.id}}
          key={`${effectiveCompany?.id}:${inviaA.id}:${sendMode}`}
          modo={sendMode}
          documento={documentoInvio(inviaA)}
          orderId={rfq.order_id}
          open={!!inviaA}
          onOpenChange={(o) => { if (!o) setInviaA(null); }}
          context={composeContext(inviaA)}
          onSent={() => {
            const corrente=fornitori.find(f=>f.id===inviaA.id);
            if(!corrente || rfq.status === "aggiudicata" || rfq.status === "annullata") return;
            if(corrente.status !== "risposta") updateFornitore.mutate({
              id: inviaA.id,
              // un sollecito non azzera l'attesa: conta dalla prima richiesta
              updates: corrente.inviata_at
                ? { status: "inviata" }
                : { status: "inviata", inviata_at: new Date().toISOString(), inviata_via: "app" },
            });
            if (rfq.status === "bozza") updateRfq.mutate({ status: "inviata" });
          }}
        />
      )}

      {/* Lettura AI del preventivo fornitore */}
      {estraiDa && (
        <EstraiOffertaAIDialog
          open={!!estraiDa}
          onOpenChange={(o) => { if (!o) setEstraiDa(null); }}
          rfqSupplierId={estraiDa.id}
          fornitoreNome={estraiDa.suppliers?.name ?? "Fornitore"}
          haEmailAgganciata={!!estraiDa.email_inbox_id}
          onApplica={async (righe: RigaEstratta[], meta: PropostaEstratta) => {
            // I prezzi scelti finiscono nella griglia, riga per riga.
            for (const r of righe) {
              if (!r.rfq_item_id) continue;
              await setQuote.mutateAsync({
                rfq_supplier_id: estraiDa.id,
                rfq_item_id: r.rfq_item_id,
                updates: {
                  prezzo_unitario: r.prezzo_unitario,
                  sconto_percentuale: r.sconto_percentuale,
                  aliquota_iva: r.aliquota_iva,
                  disponibile: r.disponibile,
                  note: r.nota,
                },
              });
            }
            // Consegna/validita'/pagamento: si compilano solo se vuoti, per non
            // sovrascrivere quello che qualcuno ha gia' scritto a mano.
            const updates: import("@/integrations/supabase/types").TablesUpdate<"supplier_rfq_suppliers"> = {};
            if (meta.giorni_consegna != null && estraiDa.giorni_consegna == null) updates.giorni_consegna = meta.giorni_consegna;
            if (meta.validita_offerta && !estraiDa.validita_offerta) updates.validita_offerta = meta.validita_offerta;
            if (meta.condizioni_pagamento && !estraiDa.condizioni_pagamento) updates.condizioni_pagamento = meta.condizioni_pagamento;
            if (meta.totale_documento != null && estraiDa.totale_offerto == null) updates.totale_offerto = meta.totale_documento;
            if (estraiDa.status === "inviata" || estraiDa.status === "da_inviare") {
              updates.status = "risposta";
              updates.risposta_at = new Date().toISOString();
            }
            if (Object.keys(updates).length > 0) {
              await updateFornitore.mutateAsync({ id: estraiDa.id, updates });
            }
          }}
        />
      )}

      {/* Aggiudicazione */}
      <Dialog open={!!aggiudicaA} onOpenChange={(o) => { if (!o) { setAggiudicaA(null); setMotivazione(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-orange-500" />
              Aggiudica a {aggiudicaA?.suppliers?.name}
            </DialogTitle>
            <DialogDescription>
              Nasce un ordine d'acquisto in bozza con i prezzi che ha offerto. Da lì in poi
              si lavora sull'ordine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {aggiudicaA && totaliPerFornitore[aggiudicaA.id]?.totale != null && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">Totale offerto</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(confronti[aggiudicaA.id]?.totale ?? 0)}
                </span>
              </div>
            )}
            {aggiudicaA && (totaliPerFornitore[aggiudicaA.id]?.righeCoperte ?? 0) < items.length && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Ha quotato {totaliPerFornitore[aggiudicaA.id]?.righeCoperte ?? 0} {(totaliPerFornitore[aggiudicaA.id]?.righeCoperte ?? 0) === 1 ? "voce" : "voci"} su {items.length}: nell'ordine
                  entrano solo quelle, le altre vanno ordinate a parte.
                </span>
              </div>
            )}
            {aggiudicaA && !((totaliPerFornitore[aggiudicaA.id]?.totale ?? 0) > 0) && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>
                  Non c'è nessun prezzo: scrivi i prezzi delle voci o il totale offerto prima di
                  scegliere. Un ordine da 0 € chiuderebbe la richiesta senza costo in commessa.
                </span>
              </div>
            )}
            {aggiudicaA && (() => {
              const doc = aggiudicaA.totale_offerto == null ? null : Number(aggiudicaA.totale_offerto);
              const righe = totaliPerFornitore[aggiudicaA.id];
              const daRighe = righe && righe.righeCoperte > 0 && doc != null && righe.totale != null && righe.totale !== doc ? righe.totale : null;
              if (doc == null || daRighe == null || confronti[aggiudicaA.id]?.coerente || doc - daRighe < 0.01) return null;
              return (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Il documento dice {formatCurrency(doc)}, le voci {formatCurrency(daRighe)}: la differenza
                    ({formatCurrency(doc - daRighe)}, trasporto o imballo) va indicata nelle condizioni di trasporto o riconciliata nelle voci prima di scegliere.
                  </span>
                </div>
              );
            })()}
            {aggiudicaA&&confronti[aggiudicaA.id]?.scaduta&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">L’offerta è scaduta. Chiedi conferma al fornitore e aggiorna la validità prima di scegliere.</p>}
            {aggiudicaA&&!confronti[aggiudicaA.id]?.coerente&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">Il totale documento non coincide con voci e trasporto. Correggi gli importi prima di aggiudicare.</p>}
            {aggiudicaA && miglioreTotale && aggiudicaA.id !== miglioreTotale && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Non è l'offerta più bassa. Se scegli comunque questo fornitore, scrivi
                  perché: fra sei mesi nessuno se lo ricorderà.
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rdo-motivo">Perché questo fornitore (facoltativo)</Label>
              <Textarea
                id="rdo-motivo"
                rows={2}
                value={motivazione}
                onChange={(e) => setMotivazione(e.target.value)}
                placeholder="Es. consegna in 3 giorni contro 15, ci serve per lunedì."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAggiudicaA(null); setMotivazione(""); }}>Annulla</Button>
            <Button
              disabled={aggiudica.isPending || editingOffers.some(id=>fornitori.some(f=>f.id===id)) || updateFornitore.isPending || setQuote.isPending || !aggiudicaA || !!confronti[aggiudicaA.id]?.scaduta || !confronti[aggiudicaA.id]?.coerente || (aggiudicaA.trasporto_tipo==="extra"&&aggiudicaA.costo_trasporto==null) || !((confronti[aggiudicaA.id]?.totale ?? 0) > 0)}
              onClick={() => {
                if (!aggiudicaA || aggiudicaInCorso.current) return;
                aggiudicaInCorso.current = true;
                aggiudica.mutate(
                  { rfq_supplier_id: aggiudicaA.id, motivazione: motivazione.trim() || undefined },
                  {
                    onSettled: () => { aggiudicaInCorso.current = false; },
                    onSuccess: (r) => {
                      setAggiudicaA(null);
                      setMotivazione("");
                      navigate(`/azienda/ordini-acquisto/${r.purchaseOrderId}`);
                    },
                  },
                );
              }}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {aggiudica.isPending ? "Creazione ordine..." : "Aggiudica e crea ordine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
