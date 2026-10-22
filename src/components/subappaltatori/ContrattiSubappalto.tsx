/**
 * I contratti di un subappaltatore, uno per ogni commessa su cui lavora: elenco,
 * creazione e modifica (con importi, oneri della sicurezza, responsabili,
 * obblighi, pagamenti, penali, garanzie), stato, contratto stampabile da firmare,
 * firma registrata, e la riconciliazione contratto / SAL / fatturato / pagato /
 * ritenute con le fatture ricevute collegate.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Download, FileSignature, FileText, Link2, Loader2, Pencil, Plus, Printer, Send, Unlink, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { costruisciContrattoSubappaltoHtml, type DatiContrattoSubappalto } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { generaPdfContrattoSubappalto } from "./ContrattoSubappaltoPDF";
import { riepilogoContratto, type RiepilogoContratto } from "@/lib/subappaltatori/riconciliazioneContratto";

export interface ContrattoCompleto {
  id: string;
  company_id: string;
  subappaltatore_id: string;
  order_id: string;
  numero_contratto: string | null;
  descrizione_lavori: string;
  importo_contrattuale: number;
  ritenuta_garanzia_pct: number;
  data_inizio: string | null;
  data_fine_prevista: string | null;
  data_fine_effettiva: string | null;
  stato: "bozza" | "attivo" | "completato" | "risolto" | "sospeso";
  note: string | null;
  created_at: string;
  oneri_sicurezza: number;
  data_stipula: string | null;
  responsabile_impresa: string | null;
  referente_subappaltatore: string | null;
  obblighi: string | null;
  modalita_pagamento: string | null;
  penali: string | null;
  garanzie: string | null;
  durata_garanzia_mesi: number;
  firmato_il: string | null;
  firmato_da: string | null;
  pdf_path: string | null;
  commessa: { order_code: string | null; description: string | null; work_address: string | null; client_name: string | null; client_company: string | null } | null;
}

interface SubPerContratto {
  id: string;
  ragione_sociale: string | null;
  piva: string | null;
  indirizzo: string | null;
  email: string | null;
  pec: string | null;
  telefono?: string | null;
  responsabile: string | null;
  order_id: string | null;
}

const STATI: Record<ContrattoCompleto["stato"], { label: string; cls: string }> = {
  bozza: { label: "Bozza", cls: "bg-slate-100 text-slate-700" },
  attivo: { label: "Attivo", cls: "bg-green-100 text-green-800" },
  sospeso: { label: "Sospeso", cls: "bg-amber-100 text-amber-800" },
  completato: { label: "Completato", cls: "bg-blue-100 text-blue-800" },
  risolto: { label: "Risolto", cls: "bg-red-100 text-red-800" },
};

const euro = (v: number) => (Number(v) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIT = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const oggi = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

export const chiaviContratti = {
  elenco: (subId: string | undefined) => ["contratti-sub", subId] as const,
  salTutti: (subId: string | undefined) => ["sal-sub-tutti", subId] as const,
};

/** Tutti i contratti del subappaltatore, il più recente prima. */
export function useContrattiSubappaltatore(subId: string | undefined) {
  return useQuery({
    queryKey: chiaviContratti.elenco(subId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratti_subappalto" as never)
        .select("*, commessa:orders!contratti_subappalto_order_id_fkey(order_code, description, work_address, client_name, client_company)")
        .eq("subappaltatore_id", subId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContrattoCompleto[];
    },
    enabled: !!subId,
  });
}

interface FormContratto {
  order_id: string;
  numero_contratto: string;
  descrizione_lavori: string;
  importo_contrattuale: string;
  oneri_sicurezza: string;
  ritenuta_garanzia_pct: string;
  durata_garanzia_mesi: string;
  data_stipula: string;
  data_inizio: string;
  data_fine_prevista: string;
  stato: ContrattoCompleto["stato"];
  responsabile_impresa: string;
  referente_subappaltatore: string;
  obblighi: string;
  modalita_pagamento: string;
  penali: string;
  garanzie: string;
  note: string;
}

const formVuoto = (orderId: string, referente: string): FormContratto => ({
  order_id: orderId, numero_contratto: "", descrizione_lavori: "", importo_contrattuale: "", oneri_sicurezza: "",
  ritenuta_garanzia_pct: "5", durata_garanzia_mesi: "12", data_stipula: oggi(), data_inizio: "", data_fine_prevista: "",
  stato: "attivo", responsabile_impresa: "", referente_subappaltatore: referente, obblighi: "", modalita_pagamento: "",
  penali: "", garanzie: "", note: "",
});

const daContratto = (c: ContrattoCompleto): FormContratto => ({
  order_id: c.order_id, numero_contratto: c.numero_contratto ?? "", descrizione_lavori: c.descrizione_lavori ?? "",
  importo_contrattuale: String(c.importo_contrattuale ?? ""), oneri_sicurezza: String(c.oneri_sicurezza ?? ""),
  ritenuta_garanzia_pct: String(c.ritenuta_garanzia_pct ?? ""), durata_garanzia_mesi: String(c.durata_garanzia_mesi ?? 12),
  data_stipula: c.data_stipula ?? "", data_inizio: c.data_inizio ?? "", data_fine_prevista: c.data_fine_prevista ?? "",
  stato: c.stato, responsabile_impresa: c.responsabile_impresa ?? "", referente_subappaltatore: c.referente_subappaltatore ?? "",
  obblighi: c.obblighi ?? "", modalita_pagamento: c.modalita_pagamento ?? "", penali: c.penali ?? "", garanzie: c.garanzie ?? "", note: c.note ?? "",
});

/** Vuoto → null (lo 0 resta 0: prima `|| 5` trasformava lo 0% in 5%); il resto come i campi importo dell'app. */
function numero(v: string): number | null {
  return v.trim() ? parseDecimalIT(v) : null;
}

/** Il contratto firmato (timbro su ogni pagina + certificato di firma) in una nuova scheda. */
async function scaricaFirmato(richiestaId: string) {
  const scheda = window.open("", "_blank");
  const { data, error } = await supabase.functions.invoke("fea-pdf-firmato", { body: { request_id: richiestaId } });
  if (error || !data?.url) { scheda?.close(); toast.error("Il PDF firmato non è ancora pronto. Riprova tra poco."); return; }
  if (scheda) scheda.location.href = data.url; else window.location.href = data.url;
}

export function ContrattiSubappalto({
  companyId, sub, selezionatoId, onSeleziona,
}: {
  companyId: string;
  sub: SubPerContratto;
  selezionatoId: string | null;
  onSeleziona: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: contratti = [], isLoading } = useContrattiSubappaltatore(sub.id);
  const ids = contratti.map((c) => c.id);
  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState<FormContratto>(formVuoto(sub.order_id ?? "", sub.responsabile ?? ""));
  const [stampa, setStampa] = useState<{ html: string; nome: string } | null>(null);
  const [firma, setFirma] = useState<{ id: string; il: string; da: string } | null>(null);
  const [collega, setCollega] = useState<string | null>(null);
  const [invio, setInvio] = useState<{ c: ContrattoCompleto; nome: string; email: string; telefono: string } | null>(null);

  const { data: commesse = [] } = useQuery({
    queryKey: ["contratti-sub-commesse", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, order_code, description").eq("company_id", companyId)
        .is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dialog,
  });

  const { data: sal = [] } = useQuery({
    queryKey: chiaviContratti.salTutti(sub.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("sal_subappaltatori" as never)
        .select("id, contratto_id, numero_sal, importo_lordo, ritenuta_importo, importo_netto, stato").in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; contratto_id: string; numero_sal: number; importo_lordo: number; ritenuta_importo: number; importo_netto: number; stato: string }>;
    },
    enabled: ids.length > 0,
  });
  const { data: ritenute = [] } = useQuery({
    queryKey: ["ritenute-sub-tutte", sub.id, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("ritenute_garanzia" as never).select("contratto_id, importo, stato").in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ contratto_id: string; importo: number; stato: string }>;
    },
    enabled: ids.length > 0,
  });
  const { data: fatture = [] } = useQuery({
    queryKey: ["fatture-sub", sub.id, ids.join(","), sub.piva],
    queryFn: async () => {
      // Le collegate ai contratti e quelle ancora libere con la stessa P.IVA.
      const filtri = [ids.length ? `contratto_subappalto_id.in.(${ids.join(",")})` : null, sub.piva ? `cedente_piva.eq.${sub.piva.replace(/\s/g, "")}` : null].filter(Boolean).join(",");
      if (!filtri) return [];
      const { data, error } = await supabase.from("fatture_ricevute")
        .select("id, numero_fattura, data_fattura, imponibile_totale, totale_documento, tipo_documento, contratto_subappalto_id, cedente_ragione_sociale")
        .eq("company_id", companyId).or(filtri).order("data_fattura", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; numero_fattura: string | null; data_fattura: string | null; imponibile_totale: number | null; totale_documento: number | null; tipo_documento: string | null; contratto_subappalto_id: string | null; cedente_ragione_sociale: string | null }>;
    },
    enabled: !!sub.piva || ids.length > 0,
  });
  // L'ultima richiesta di firma di ogni contratto: inviata, aperta, firmata, rifiutata.
  const { data: richieste = [] } = useQuery({
    queryKey: ["firme-subappalto", sub.id, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("signature_requests")
        .select("id, contratto_subappalto_id, status, signer_name, signer_email, created_at, signed_at, otp_canale" as never)
        .in("contratto_subappalto_id" as never, ids as never).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; contratto_subappalto_id: string; status: string; signer_name: string | null; signer_email: string | null; created_at: string; signed_at: string | null }>;
    },
    enabled: ids.length > 0,
    refetchInterval: 60_000,
  });
  const richiestaDi = (id: string) => richieste.find((r) => r.contratto_subappalto_id === id);

  const { data: azienda } = useQuery({
    queryKey: ["contratto-sub-azienda", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("anagrafica_azienda")
        .select("ragione_sociale, partita_iva, indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia")
        .eq("company_id", companyId).maybeSingle();
      return data;
    },
    enabled: !!stampa || contratti.length > 0,
  });

  const riepiloghi = useMemo(() => new Map<string, RiepilogoContratto>(contratti.map((c) => [
    c.id,
    riepilogoContratto(c, sal.filter((s) => s.contratto_id === c.id), fatture.filter((f) => f.contratto_subappalto_id === c.id), ritenute.filter((r) => r.contratto_id === c.id)),
  ])), [contratti, sal, fatture, ritenute]);

  const invalida = () => {
    qc.invalidateQueries({ queryKey: chiaviContratti.elenco(sub.id) });
    qc.invalidateQueries({ queryKey: ["fatture-sub", sub.id] });
    qc.invalidateQueries({ queryKey: ["subappaltatori-page", companyId] });
    qc.invalidateQueries({ queryKey: ["order-subcontract-statistics"] });
  };

  const salva = useMutation({
    mutationFn: async () => {
      if (!form.order_id) throw new Error("Scegli la commessa del contratto");
      if (!form.descrizione_lavori.trim()) throw new Error("Scrivi i lavori affidati");
      const importo = numero(form.importo_contrattuale);
      if (importo == null || importo < 0) throw new Error("Importo del contratto non valido");
      const ritenuta = numero(form.ritenuta_garanzia_pct);
      if (ritenuta == null || ritenuta < 0 || ritenuta > 100) throw new Error("Ritenuta di garanzia non valida");
      const campi = {
        company_id: companyId, subappaltatore_id: sub.id, order_id: form.order_id,
        numero_contratto: form.numero_contratto.trim() || null, descrizione_lavori: form.descrizione_lavori.trim(),
        importo_contrattuale: importo, oneri_sicurezza: numero(form.oneri_sicurezza) ?? 0, ritenuta_garanzia_pct: ritenuta,
        durata_garanzia_mesi: Math.max(0, Math.round(numero(form.durata_garanzia_mesi) ?? 12)),
        data_stipula: form.data_stipula || null, data_inizio: form.data_inizio || null, data_fine_prevista: form.data_fine_prevista || null,
        stato: form.stato, responsabile_impresa: form.responsabile_impresa.trim() || null,
        referente_subappaltatore: form.referente_subappaltatore.trim() || null, obblighi: form.obblighi.trim() || null,
        modalita_pagamento: form.modalita_pagamento.trim() || null, penali: form.penali.trim() || null,
        garanzie: form.garanzie.trim() || null, note: form.note.trim() || null,
      };
      const q = dialog?.id
        ? supabase.from("contratti_subappalto" as never).update(campi as never).eq("id", dialog.id).select("id").single()
        : supabase.from("contratti_subappalto" as never).insert(campi as never).select("id").single();
      const { data, error } = await q;
      if (error) throw new Error("Contratto non salvato. Controlla i dati e riprova.");
      return (data as unknown as { id: string }).id;
    },
    onSuccess: (id) => { toast.success(dialog?.id ? "Contratto aggiornato" : "Contratto creato"); invalida(); setDialog(null); onSeleziona(id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: ContrattoCompleto["stato"] }) => {
      const extra = stato === "completato" ? { data_fine_effettiva: oggi() } : {};
      const { error } = await supabase.from("contratti_subappalto" as never).update({ stato, ...extra } as never).eq("id", id);
      if (error) throw new Error("Stato non aggiornato. Riprova.");
    },
    onSuccess: () => { toast.success("Stato del contratto aggiornato"); invalida(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const registraFirma = useMutation({
    mutationFn: async () => {
      if (!firma) return;
      const { error } = await supabase.from("contratti_subappalto" as never)
        .update({ firmato_il: firma.il ? new Date(`${firma.il}T12:00:00`).toISOString() : null, firmato_da: firma.da.trim() || null } as never).eq("id", firma.id);
      if (error) throw new Error("Firma non registrata. Riprova.");
    },
    onSuccess: () => { toast.success("Firma registrata"); invalida(); setFirma(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const collegaFattura = useMutation({
    mutationFn: async ({ fatturaId, contrattoId }: { fatturaId: string; contrattoId: string | null }) => {
      const { error } = await supabase.from("fatture_ricevute").update({ contratto_subappalto_id: contrattoId } as never).eq("id", fatturaId).eq("company_id", companyId);
      if (error) throw new Error("Collegamento non riuscito. Riprova.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fatture-sub", sub.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const datiContratto = (c: ContrattoCompleto): DatiContrattoSubappalto => {
    const a = azienda;
    const indirizzo = a ? [[a.indirizzo_via, a.indirizzo_numero_civico].filter(Boolean).join(" "), [a.indirizzo_cap, a.indirizzo_comune, a.indirizzo_provincia ? `(${a.indirizzo_provincia})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    return {
        numero: c.numero_contratto, dataStipula: c.data_stipula,
        committente: { ragioneSociale: a?.ragione_sociale ?? "", partitaIva: a?.partita_iva ?? "", indirizzo, rappresentante: c.responsabile_impresa ?? "" },
        subappaltatore: { ragioneSociale: sub.ragione_sociale ?? "", partitaIva: sub.piva ?? "", indirizzo: sub.indirizzo ?? "", email: sub.email ?? "", pec: sub.pec ?? "" },
        commessa: { codice: c.commessa?.order_code ?? "", descrizione: c.commessa?.description ?? "", indirizzoCantiere: c.commessa?.work_address ?? "", cliente: c.commessa?.client_company || c.commessa?.client_name || "" },
        descrizioneLavori: c.descrizione_lavori, importo: c.importo_contrattuale, oneriSicurezza: c.oneri_sicurezza, ritenutaPct: c.ritenuta_garanzia_pct,
        dataInizio: c.data_inizio, dataFinePrevista: c.data_fine_prevista, responsabileImpresa: c.responsabile_impresa,
        referenteSubappaltatore: c.referente_subappaltatore, obblighi: c.obblighi, modalitaPagamento: c.modalita_pagamento,
        penali: c.penali, garanzie: c.garanzie, durataGaranziaMesi: c.durata_garanzia_mesi, note: c.note,
    };
  };

  const stampaContratto = (c: ContrattoCompleto) => setStampa({
    nome: `Contratto subappalto ${sub.ragione_sociale ?? ""} ${c.commessa?.order_code ?? ""}`.trim(),
    html: costruisciContrattoSubappaltoHtml(datiContratto(c)),
  });

  // Invio in firma: PDF congelato nello storage, poi la richiesta di firma
  // elettronica (link via email, codice via email o SMS). Il contratto risulta
  // firmato da solo quando il subappaltatore completa la firma.
  const inviaInFirma = useMutation({
    mutationFn: async () => {
      if (!invio) return;
      const { c, nome, email, telefono } = invio;
      if (!nome.trim()) throw new Error("Scrivi il nome di chi firma per il subappaltatore");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Serve un'email valida: il link per firmare arriva lì");
      if (!azienda) throw new Error("Mancano i dati della tua azienda: completa l'anagrafica aziendale");
      const blob = await generaPdfContrattoSubappalto(datiContratto(c));
      const percorso = `${companyId}/subappalti/${c.id}/${Date.now()}.pdf`;
      const { error: errFile } = await supabase.storage.from("quote-pdfs").upload(percorso, blob, { contentType: "application/pdf" });
      if (errFile) throw new Error("Non riesco a salvare il PDF del contratto. Riprova tra poco.");
      const { error: errC } = await supabase.from("contratti_subappalto" as never).update({ pdf_path: percorso } as never).eq("id", c.id);
      if (errC) throw new Error("Non riesco a collegare il PDF al contratto. Riprova tra poco.");
      const { data, error } = await supabase.functions.invoke("fea-richiedi-firma", {
        body: {
          tipo_documento: "subappalto", documento_id: c.id, tipo_firmatario: "b2b",
          signer_name: nome.trim(), signer_email: email.trim(), signer_phone: telefono.trim() || undefined,
          expires_giorni: 30, note: `Contratto di subappalto ${c.numero_contratto ?? ""} · ${c.commessa?.order_code ?? ""}`.trim(),
        },
      });
      if (error) {
        let messaggio = "Invio non riuscito. Riprova tra poco.";
        try {
          const corpo = await (error as { context?: Response }).context?.json?.();
          if (typeof corpo?.error === "string" && corpo.error.length < 200) messaggio = corpo.error;
        } catch { /* messaggio generico */ }
        throw new Error(messaggio);
      }
      if (data?.request_id) await supabase.from("contratti_subappalto" as never).update({ firma_richiesta_id: data.request_id } as never).eq("id", c.id);
      return data as { otp_inviato?: boolean };
    },
    onSuccess: () => {
      toast.success("Contratto inviato per la firma", { description: "Il subappaltatore riceve il link per leggerlo e firmarlo con un codice." });
      setInvio(null);
      invalida();
      qc.invalidateQueries({ queryKey: ["firme-subappalto", sub.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const fattureLibere = fatture.filter((f) => !f.contratto_subappalto_id);
  const campo = (k: keyof FormContratto) => ({ value: form[k] as string, onChange: (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Un contratto per ogni commessa su cui lavora questa impresa.</p>
        <Button size="sm" onClick={() => { setForm(formVuoto(sub.order_id ?? "", sub.responsabile ?? "")); setDialog({ id: null }); }}>
          <Plus className="mr-1 h-4 w-4" />Nuovo contratto
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : contratti.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nessun contratto. Creane uno per la commessa: servirà per SAL, ritenute e pagamenti, e lo potrai stampare e far firmare.
        </CardContent></Card>
      ) : contratti.map((c) => {
        const r = riepiloghi.get(c.id)!;
        const suoFatture = fatture.filter((f) => f.contratto_subappalto_id === c.id);
        const selezionato = c.id === selezionatoId;
        const richiesta = richiestaDi(c.id);
        return (
          <Card key={c.id} className={cn(selezionato && "border-primary/50 ring-1 ring-primary/30")}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                {c.numero_contratto ? `Contratto ${c.numero_contratto}` : "Contratto di subappalto"}
                <span className="text-sm font-normal text-muted-foreground">· {c.commessa?.order_code ?? "Commessa"} {c.commessa?.description ? `— ${c.commessa.description}` : ""}</span>
                <Badge className={cn("ml-auto hover:opacity-100", STATI[c.stato]?.cls)}>{STATI[c.stato]?.label ?? c.stato}</Badge>
                {c.firmato_il
                  ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3 w-3" />Firmato il {dataIT(c.firmato_il)}</Badge>
                  : <Badge variant="outline" className="border-amber-300 text-amber-700">Da firmare</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{c.descrizione_lavori}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {([
                  ["Valore (con oneri)", euro(r.valore)],
                  ["Eseguito (SAL)", euro(r.eseguito)],
                  ["Approvato", euro(r.approvato)],
                  ["Fatturato", euro(r.fatturato)],
                  ["Pagato", euro(r.pagato)],
                  ["Da pagare", euro(r.daPagare)],
                  ["Ritenute trattenute", euro(r.ritenuteTrattenute)],
                ] as const).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">{k}</p>
                    <p className="text-sm font-semibold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground"><span>Eseguito {r.avanzamento}%</span><span>Residuo {euro(r.residuo)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-orange-500" style={{ width: `${r.avanzamento}%` }} /></div>
              </div>
              {/* Firma elettronica: a che punto è */}
              {richiesta && !c.firmato_il && (
                <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  richiesta.status === "refused" ? "border-red-200 bg-red-50 text-red-800"
                    : richiesta.status === "expired" || richiesta.status === "cancelled" ? "border-slate-200 bg-slate-50 text-slate-700"
                    : "border-sky-200 bg-sky-50 text-sky-900")}>
                  {richiesta.status === "refused" ? <XCircle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
                  {richiesta.status === "refused" ? `${richiesta.signer_name ?? "Il subappaltatore"} ha rifiutato la firma.`
                    : richiesta.status === "expired" ? "Il link per firmare è scaduto: invialo di nuovo."
                    : richiesta.status === "cancelled" ? "La richiesta di firma è stata annullata."
                    : `Inviato per la firma il ${dataIT(richiesta.created_at)} a ${richiesta.signer_name ?? ""} (${richiesta.signer_email ?? ""}): in attesa della firma.`}
                </div>
              )}
              {r.avvisi.map((a) => (
                <p key={a} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />{a}</p>
              ))}

              <div className="rounded-lg border">
                <div className="flex items-center justify-between px-3 py-2 text-sm font-medium">
                  Fatture del subappaltatore su questo contratto
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setCollega(c.id)} disabled={!fattureLibere.length}
                    title={fattureLibere.length ? "Collega una fattura ricevuta" : sub.piva ? "Nessuna fattura libera con questa partita IVA" : "Manca la partita IVA del subappaltatore"}>
                    <Link2 className="h-3.5 w-3.5" />Collega fattura
                  </Button>
                </div>
                {suoFatture.length === 0 ? (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">Nessuna fattura collegata.</p>
                ) : suoFatture.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 border-t px-3 py-1.5 text-xs">
                    <span className="font-medium">{f.tipo_documento === "TD04" ? "Nota di credito" : "Fattura"} {f.numero_fattura ?? ""}</span>
                    <span className="text-muted-foreground">del {dataIT(f.data_fattura)}</span>
                    <span className="ml-auto tabular-nums">{euro(Number(f.imponibile_totale ?? f.totale_documento) || 0)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Scollega la fattura" onClick={() => collegaFattura.mutate({ fatturaId: f.id, contrattoId: null })}>
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!selezionato && <Button size="sm" variant="outline" onClick={() => onSeleziona(c.id)}>Vedi SAL e ritenute</Button>}
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setForm(daContratto(c)); setDialog({ id: c.id }); }}><Pencil className="h-3.5 w-3.5" />Modifica</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => stampaContratto(c)}><Printer className="h-3.5 w-3.5" />Contratto da firmare</Button>
                {!c.firmato_il && (
                  <Button size="sm" className="gap-1" onClick={() => setInvio({
                    c, nome: c.referente_subappaltatore || sub.responsabile || "",
                    email: sub.pec || sub.email || "", telefono: sub.telefono || "",
                  })}>
                    <Send className="h-3.5 w-3.5" />{richiesta && ["pending", "otp_verified"].includes(richiesta.status) ? "Invia di nuovo" : "Invia per la firma"}
                  </Button>
                )}
                {c.firmato_il && richiesta?.status === "signed" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => scaricaFirmato(richiesta.id)}>
                    <Download className="h-3.5 w-3.5" />Contratto firmato
                  </Button>
                )}
                {/* Firma su carta: si registra a mano. */}
                {(!c.firmato_il || richiesta?.status !== "signed") && (
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => setFirma({ id: c.id, il: c.firmato_il?.slice(0, 10) ?? oggi(), da: c.firmato_da ?? sub.responsabile ?? "" })}>
                    <FileSignature className="h-3.5 w-3.5" />{c.firmato_il ? "Firma su carta" : "Firmato su carta"}
                  </Button>
                )}
                <Select value={c.stato} onValueChange={(v) => cambiaStato.mutate({ id: c.id, stato: v as ContrattoCompleto["stato"] })}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(STATI) as ContrattoCompleto["stato"][]).map((s) => <SelectItem key={s} value={s}>{STATI[s].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Nuovo / modifica */}
      <Dialog open={!!dialog} onOpenChange={(v) => { if (!v && !salva.isPending) setDialog(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.id ? "Modifica contratto" : "Nuovo contratto di subappalto"}</DialogTitle>
            <DialogDescription>I dati finiscono nel contratto da stampare e firmare; quello che scrivi negli ultimi campi prende il posto del testo standard.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Commessa *</Label>
              <Select value={form.order_id} onValueChange={(v) => setForm((p) => ({ ...p, order_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Scegli la commessa" /></SelectTrigger>
                <SelectContent>{commesse.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_code ? `${o.order_code} · ` : ""}{o.description ?? ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>Lavori affidati *</Label><Textarea rows={2} {...campo("descrizione_lavori")} placeholder="es. Montaggio e smontaggio del ponteggio di facciata" /></div>
            <div className="space-y-1"><Label>Numero contratto</Label><Input {...campo("numero_contratto")} /></div>
            <div className="space-y-1"><Label>Data di stipula</Label><Input type="date" {...campo("data_stipula")} /></div>
            <div className="space-y-1"><Label>Importo lavori (€) *</Label><Input inputMode="decimal" {...campo("importo_contrattuale")} placeholder="0,00" /></div>
            <div className="space-y-1"><Label>Oneri della sicurezza (€)</Label><Input inputMode="decimal" {...campo("oneri_sicurezza")} placeholder="Non soggetti a ribasso" /></div>
            <div className="space-y-1"><Label>Ritenuta di garanzia (%)</Label><Input inputMode="decimal" {...campo("ritenuta_garanzia_pct")} /></div>
            <div className="space-y-1"><Label>Garanzia (mesi dalla fine lavori)</Label><Input inputMode="numeric" {...campo("durata_garanzia_mesi")} /></div>
            <div className="space-y-1"><Label>Inizio lavori</Label><Input type="date" {...campo("data_inizio")} /></div>
            <div className="space-y-1"><Label>Fine lavori prevista</Label><Input type="date" {...campo("data_fine_prevista")} /></div>
            <div className="space-y-1"><Label>Responsabile per la tua impresa</Label><Input {...campo("responsabile_impresa")} placeholder="es. direttore tecnico" /></div>
            <div className="space-y-1"><Label>Responsabile in cantiere del subappaltatore</Label><Input {...campo("referente_subappaltatore")} /></div>
            <div className="space-y-1">
              <Label>Stato</Label>
              <Select value={form.stato} onValueChange={(v) => setForm((p) => ({ ...p, stato: v as ContrattoCompleto["stato"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(STATI) as ContrattoCompleto["stato"][]).map((s) => <SelectItem key={s} value={s}>{STATI[s].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>Obblighi e responsabilità specifici</Label><Textarea rows={2} {...campo("obblighi")} placeholder="es. fornitura dei materiali, pulizia giornaliera, smaltimento dei rifiuti" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Pagamenti</Label><Textarea rows={2} {...campo("modalita_pagamento")} placeholder="Standard: bonifico a 60 giorni data fattura, previa verifica del SAL" /></div>
            <div className="space-y-1"><Label>Penali</Label><Textarea rows={2} {...campo("penali")} placeholder="Standard: 1‰ al giorno, massimo 10%" /></div>
            <div className="space-y-1"><Label>Garanzie e polizze</Label><Textarea rows={2} {...campo("garanzie")} placeholder="Standard: polizza RCT/RCO" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Altre pattuizioni</Label><Textarea rows={2} {...campo("note")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={salva.isPending}>Annulla</Button>
            <Button onClick={() => salva.mutate()} disabled={salva.isPending}>{salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Firma */}
      <Dialog open={!!firma} onOpenChange={(v) => { if (!v) setFirma(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Firma del contratto</DialogTitle>
            <DialogDescription>Stampa il contratto, fallo firmare e registra qui quando e da chi è stato firmato.</DialogDescription>
          </DialogHeader>
          {firma && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Firmato il</Label><Input type="date" value={firma.il} onChange={(e) => setFirma({ ...firma, il: e.target.value })} /></div>
              <div className="space-y-1"><Label>Firmato da (per il subappaltatore)</Label><Input value={firma.da} onChange={(e) => setFirma({ ...firma, da: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFirma(null)}>Annulla</Button>
            <Button onClick={() => registraFirma.mutate()} disabled={registraFirma.isPending}>Registra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collega fattura */}
      <Dialog open={!!collega} onOpenChange={(v) => { if (!v) setCollega(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Collega una fattura ricevuta</DialogTitle>
            <DialogDescription>Le fatture con la partita IVA {sub.piva ?? "—"} non ancora collegate a un contratto.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 divide-y overflow-y-auto rounded-lg border">
            {fattureLibere.map((f) => (
              <button key={f.id} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => { collegaFattura.mutate({ fatturaId: f.id, contrattoId: collega! }); setCollega(null); }}>
                <span className="font-medium">{f.tipo_documento === "TD04" ? "Nota di credito" : "Fattura"} {f.numero_fattura ?? ""}</span>
                <span className="text-xs text-muted-foreground">del {dataIT(f.data_fattura)}</span>
                <span className="ml-auto tabular-nums">{euro(Number(f.imponibile_totale ?? f.totale_documento) || 0)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invio per la firma elettronica */}
      <Dialog open={!!invio} onOpenChange={(v) => { if (!v && !inviaInFirma.isPending) setInvio(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invia il contratto per la firma</DialogTitle>
            <DialogDescription>
              Il subappaltatore riceve per email il link al contratto in PDF: lo legge, approva le clausole e firma con un codice
              che gli arriva per email o, se metti il cellulare, per SMS. A firma fatta il contratto risulta firmato da solo.
            </DialogDescription>
          </DialogHeader>
          {invio && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Chi firma per il subappaltatore</Label>
                <Input value={invio.nome} onChange={(e) => setInvio({ ...invio, nome: e.target.value })} placeholder="Nome e cognome del legale rappresentante" /></div>
              <div className="space-y-1"><Label>Email</Label>
                <Input type="email" value={invio.email} onChange={(e) => setInvio({ ...invio, email: e.target.value })} placeholder="email o PEC del subappaltatore" /></div>
              <div className="space-y-1"><Label>Cellulare (per il codice via SMS)</Label>
                <Input type="tel" value={invio.telefono} onChange={(e) => setInvio({ ...invio, telefono: e.target.value })} placeholder="Facoltativo" /></div>
              <p className="text-xs text-muted-foreground">
                Si manda il contratto così com'è adesso: se devi cambiare qualcosa, modificalo prima di inviarlo.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvio(null)} disabled={inviaInFirma.isPending}>Annulla</Button>
            <Button onClick={() => inviaInFirma.mutate()} disabled={inviaInFirma.isPending}>
              {inviaInFirma.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Invia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {stampa && (
        <PrintPreviewModal htmlContent={stampa.html} fileName={stampa.nome} title={stampa.nome}
          open={!!stampa} onOpenChange={(v) => { if (!v) setStampa(null); }} />
      )}
    </div>
  );
}

/**
 * La scheda «Lavori»: tutte le commesse su cui lavora l'impresa (una per
 * contratto), con eseguito, pagato e da pagare di ognuna e i totali. Prima
 * mostrava solo la commessa della scheda e i SAL di un contratto.
 */
export function LavoriSubappaltatore({ subId, onApriCommessa, onApriContratto }: {
  subId: string;
  onApriCommessa: (orderId: string) => void;
  onApriContratto: (contrattoId: string) => void;
}) {
  const { data: contratti = [], isLoading } = useContrattiSubappaltatore(subId);
  const ids = contratti.map((c) => c.id);
  const { data: sal = [] } = useQuery({
    queryKey: chiaviContratti.salTutti(subId),
    queryFn: async () => {
      const { data, error } = await supabase.from("sal_subappaltatori" as never)
        .select("id, contratto_id, numero_sal, importo_lordo, ritenuta_importo, importo_netto, stato").in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; contratto_id: string; numero_sal: number; importo_lordo: number; ritenuta_importo: number; importo_netto: number; stato: string }>;
    },
    enabled: ids.length > 0,
  });
  const righe = contratti.map((c) => ({ c, r: riepilogoContratto(c, sal.filter((s) => s.contratto_id === c.id), [], []) }));
  const tot = righe.reduce((t, { r }) => ({ valore: t.valore + r.valore, eseguito: t.eseguito + r.eseguito, pagato: t.pagato + r.pagato, daPagare: t.daPagare + r.daPagare }),
    { valore: 0, eseguito: 0, pagato: 0, daPagare: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Valore dei contratti", tot.valore, ""], ["Eseguito (SAL)", tot.eseguito, ""], ["Pagato", tot.pagato, "text-green-600"], ["Da pagare", tot.daPagare, "text-amber-600"]] as const).map(([k, v, cls]) => (
          <Card key={k}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k}</p><p className={cn("text-xl font-bold tabular-nums", cls)}>{euro(v)}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Commesse</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            : righe.length === 0 ? <p className="text-sm text-muted-foreground">Nessun contratto: crea un contratto per ogni commessa nella scheda «Contratto».</p>
            : righe.map(({ c, r }) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <button type="button" className="font-semibold hover:underline" onClick={() => onApriCommessa(c.order_id)}>
                    {c.commessa?.order_code ? `${c.commessa.order_code} · ` : ""}{c.commessa?.description ?? "Commessa"}
                  </button>
                  <p className="truncate text-xs text-muted-foreground">{c.descrizione_lavori}</p>
                </div>
                <Badge className={cn("hover:opacity-100", STATI[c.stato]?.cls)}>{STATI[c.stato]?.label ?? c.stato}</Badge>
                <div className="grid grid-cols-3 gap-3 text-right text-xs">
                  <div><p className="text-muted-foreground">Eseguito</p><p className="font-semibold tabular-nums">{euro(r.eseguito)} <span className="font-normal text-muted-foreground">({r.avanzamento}%)</span></p></div>
                  <div><p className="text-muted-foreground">Pagato</p><p className="font-semibold tabular-nums text-green-700">{euro(r.pagato)}</p></div>
                  <div><p className="text-muted-foreground">Da pagare</p><p className="font-semibold tabular-nums text-amber-700">{euro(r.daPagare)}</p></div>
                </div>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => onApriContratto(c.id)}>Contratto</Button>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
