import { AffidaContrattoDaCommessa } from "@/components/orders/AffidaContrattoDialog";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { LavorazioniAffidateDialog } from "./LavorazioniAffidateDialog";
import { ElencoContrattiSub, type RigaContrattoSub } from "./ElencoContrattiSub";
import { puoConsultareSalSub } from "@/lib/permessi/contabilitaSubappalto";
import { ContrattoCarta } from "./ContrattoCarta";
import {LavoriMisureSubDialog} from "./LavoriMisureSubDialog";
import {VerbaleSalSubDialog} from "./VerbaleSalSubDialog";
import type {SALSubappaltatore} from "@/types/subappaltatori";
import {usePermissions} from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Link } from "react-router-dom";
/**
 * I contratti di un subappaltatore, uno per ogni commessa su cui lavora: elenco,
 * creazione e modifica (con importi, oneri della sicurezza, responsabili,
 * obblighi, pagamenti, penali, garanzie), stato, contratto stampabile da firmare,
 * firma registrata, e la riconciliazione contratto / SAL / fatturato / pagato /
 * ritenute con le fatture ricevute collegate.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, ClipboardList, Clock, Download, Ellipsis, FilePenLine, FileText, Link2, Loader2, Pencil, Plus, Printer, ReceiptText, Ruler, Send, Trash2, Unlink, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { CHIAVE_CLAUSOLE_FISSATE, clausoleArchivioDelContratto, articoliContratto, clausoleFirmaSubappalto, costruisciContrattoSubappaltoHtml, costruisciElencoCantiereHtml, unisciArticoliPersonalizzati, type DatiContrattoSubappalto, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { generaPdfContrattoSubappalto, generaPdfElencoCantiere } from "./ContrattoSubappaltoPDF";
import { modelloPredefinitoDellAzienda } from "../../../supabase/functions/_shared/condizioniArchivio";
import { caricaDatiSocietari, righeSocietarie } from "../../../supabase/functions/_shared/datiSocietari";
import { CondizioniContrattoDialog } from "./CondizioniContrattoDialog";
import { vesteContratto } from "@/lib/subappaltatori/vesteContratto";
import { clienteCommessa } from "@/lib/subappaltatori/clienteCommessa";
import { riepilogoContratto, type RiepilogoContratto } from "@/lib/subappaltatori/riconciliazioneContratto";
import { chiavePiva, imponibileFattura, testoFattura, type SalCtrl } from "@/lib/subappaltatori/controlloFatturaSubappalto";
import { fatturePerSalSub, valoriPivaSub, type FatturaContrattoSub } from "@/lib/subappaltatori/fattureSalContratto";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { CollegaFatturaSalSubDialog, type ConfermaFatturaSalSub } from "./CollegaFatturaSalSubDialog";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  /** Acconto previsto dal contratto (15/11/2026): si fattura senza SAL e si recupera nei SAL. */
  acconto_importo?: number | null;
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
  /** Testi degli articoli propri di questo contratto: {titolo: testo}. */
  articoli_personalizzati?: unknown;
  /** Allegato A: i lavori accettati, uno per uno (31/10/2026). */
  elenco_lavori?: RigaElencoLavori[] | null;
  commessa: { order_code: string | null; description: string | null; work_address: string | null; client_name: string | null; client_company: string | null; customer?: { first_name: string | null; last_name: string | null } | null } | null;
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
  codice_fiscale?: string | null;
  /** La scheda del campo, a cui è legata la ditta (e la sua IVA). */
  campo_subappaltatore_id?: string | null;
}

const STATI: Record<ContrattoCompleto["stato"], { label: string; cls: string }> = {
  bozza: { label: "Bozza", cls: "bg-slate-100 text-slate-700" },
  attivo: { label: "Attivo", cls: "bg-green-100 text-green-800" },
  sospeso: { label: "Sospeso", cls: "bg-amber-100 text-amber-800" },
  completato: { label: "Completato", cls: "bg-blue-100 text-blue-800" },
  risolto: { label: "Risolto", cls: "bg-red-100 text-red-800" },
};

const euro = (v: number) => (Number(v) || 0).toLocaleString(intlCampo(), { style: "currency", currency: "EUR", useGrouping: true });
const dataIT = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const oggi = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

export const chiaviContratti = {
  elenco: (subId: string | undefined) => ["contratti-sub", subId] as const,
  salTutti: (subId: string | undefined) => ["sal-sub-tutti", subId] as const,
};

/** Tutti i contratti del subappaltatore, il più recente prima. */
export function useContrattiSubappaltatore(subId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: [...chiaviContratti.elenco(subId), companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratti_subappalto" as never)
        .select("*, commessa:orders!contratti_subappalto_order_id_fkey(order_code, description, work_address, client_name, client_company, customer:profiles!orders_customer_id_fkey(first_name, last_name))")
        .eq("subappaltatore_id", subId!)
        .eq("company_id",companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const contratti = (data ?? []) as unknown as ContrattoCompleto[];
      // Chi ha la scheda Subappaltatori ma non Commesse non legge gli ordini: il contratto dice
      // comunque a quale cantiere si riferisce.
      const senzaCommessa = [...new Set(contratti.filter((c) => !c.commessa && c.order_id).map((c) => c.order_id as string))];
      if (!senzaCommessa.length) return contratti;
      const { data: etichette, error: erroreEtichette } = await supabase.rpc("subappalto_etichette_commesse" as never, { p_order_ids: senzaCommessa } as never);
      if (erroreEtichette) throw erroreEtichette;
      const perOrdine = new Map(((etichette ?? []) as unknown as Array<{ order_id: string } & NonNullable<ContrattoCompleto["commessa"]>>).map((e) => [e.order_id, e]));
      return contratti.map((c) => (c.commessa ? c : { ...c, commessa: perOrdine.get(c.order_id as string) ?? null }));
    },
    enabled: !!subId && !!companyId,
  });
}

function useFirmeSubappalto(subId: string, ids: string[]) {
  return useQuery({
    queryKey: ["firme-subappalto", subId, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("signature_requests")
        .select("id, contratto_subappalto_id, status, signer_name, signer_email, created_at, signed_at, otp_canale" as never)
        .in("contratto_subappalto_id" as never, ids as never).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; contratto_subappalto_id: string; status: string; signer_name: string | null; signer_email: string | null; created_at: string; signed_at: string | null }>;
    },
    enabled: ids.length > 0,
    // Mentre una ditta sta firmando l'esito si vede da solo in pochi secondi (11/11/2026); senza firme aperte, come prima.
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => ["pending", "otp_verified"].includes(r.status)) ? 8_000 : 60_000),
  });
}

interface FormContratto {
  order_id: string;
  numero_contratto: string;
  descrizione_lavori: string;
  importo_contrattuale: string;
  oneri_sicurezza: string;
  ritenuta_garanzia_pct: string;
  acconto_importo: string;
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
  ritenuta_garanzia_pct: "5", acconto_importo: "", durata_garanzia_mesi: "12", data_stipula: oggi(), data_inizio: "", data_fine_prevista: "",
  stato: "attivo", responsabile_impresa: "", referente_subappaltatore: referente, obblighi: "", modalita_pagamento: "",
  penali: "", garanzie: "", note: "",
});

const daContratto = (c: ContrattoCompleto): FormContratto => ({
  order_id: c.order_id, numero_contratto: c.numero_contratto ?? "", descrizione_lavori: c.descrizione_lavori ?? "",
  importo_contrattuale: String(c.importo_contrattuale ?? ""), oneri_sicurezza: String(c.oneri_sicurezza ?? ""),
  ritenuta_garanzia_pct: String(c.ritenuta_garanzia_pct ?? ""),
  acconto_importo: Number(c.acconto_importo ?? 0) > 0 ? String(c.acconto_importo) : "", durata_garanzia_mesi: String(c.durata_garanzia_mesi ?? 12),
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
  companyId, sub, selezionatoId, onSeleziona, onApriContabilita, onApriAnagrafica, richiestaApertura, onAperturaGestita, invioRichiesto, onInvioGestito,
}: {
  richiestaApertura?: string | null;
  /** Il contratto per cui aprire subito l'invio in firma (da «Affida e manda il contratto»). */
  invioRichiesto?: string | null;
  onInvioGestito?: () => void;
  onAperturaGestita?: () => void;
  companyId: string;
  sub: SubPerContratto;
  selezionatoId: string | null;
  onSeleziona: (id: string) => void;
  onApriContabilita: (id: string) => void;
  onApriAnagrafica: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [dettaglioLocale, setDettaglio] = useState<string | null>(null);
  const dettaglio = richiestaApertura ?? dettaglioLocale;
  const ritornoDettaglio = useRef<HTMLElement | null>(null);
  const chiudiDettaglio = () => {setDettaglio(null);onAperturaGestita?.();};
  const permessiLavori = usePermissions();
  const [computo, setComputo] = useState<ContrattoCompleto | null>(null);
  const [lavoriMisure, setLavoriMisure] = useState<ContrattoCompleto|null>(null);
  const [verbaleDaMisure, setVerbaleDaMisure] = useState<SALSubappaltatore|null>(null);
  const { data: contratti = [], isLoading, isError: erroreContratti, refetch: ricaricaContratti } = useContrattiSubappaltatore(sub.id);
  const ids = contratti.map((c) => c.id);
  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  const [scegliCommessa, setScegliCommessa] = useState(false);
  const [commessaScelta, setCommessaScelta] = useState("");
  const [creaDaCommessa, setCreaDaCommessa] = useState<string | null>(null);
  const [form, setForm] = useState<FormContratto>(formVuoto(sub.order_id ?? "", sub.responsabile ?? ""));
  const [stampa, setStampa] = useState<{ html: string; nome: string; pdf: () => Promise<Blob> } | null>(null);
  const [collega, setCollega] = useState<{ contrattoId: string; salId?: string; fattura?: FatturaContrattoSub } | null>(null);
  const [condizioni, setCondizioni] = useState<ContrattoCompleto | null>(null);
  // Variante tracciata: nuovo importo e oneri di un contratto con base lavori registrata.
  const [variante, setVariante] = useState<{ c: ContrattoCompleto; importo: string; oneri: string; motivo: string } | null>(null);
  const [invio, setInvio] = useState<{ c: ContrattoCompleto; nome: string; email: string; telefono: string } | null>(null);

  const commesseContratto = useQuery({
    queryKey: ["contratti-sub-commesse", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, order_code, description").eq("company_id", companyId)
        .is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dialog || scegliCommessa,
  });
  const commesse = commesseContratto.data ?? [];

  const { data: sal = [], isLoading: caricoSal, isError: erroreSal } = useQuery({
    queryKey: [...chiaviContratti.salTutti(sub.id), ids.join(","), companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sal_subappaltatori" as never)
        .select("id, company_id, contratto_id, numero_sal, importo_lordo, oneri_quota, ritenuta_importo, acconto_recuperato, importo_netto, pagato_registrato, stato, data_emissione")
        .eq("company_id", companyId).in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<SalCtrl & { stato: string; ritenuta_importo: number; importo_netto: number; pagato_registrato?: number | null }>;
    },
    enabled: ids.length > 0,
  });
  // Contratti con la base lavori registrata: commessa, importo e oneri sono congelati (serve una variante).
  const { data: conBase = [] } = useQuery({
    queryKey: ["contratti-base-registrata", sub.id, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("subappalto_quadri_lavori" as never).select("contratto_id").in("contratto_id", ids);
      if (error) throw error;
      return [...new Set(((data ?? []) as unknown as Array<{ contratto_id: string }>).map((r) => r.contratto_id))];
    },
    enabled: ids.length > 0,
  });
  // Misure registrate: con la base lavori, importo e oneri passano da una variante (la registra «Salva» da solo).
  const { data: conMisure = [] } = useQuery({
    queryKey: ["contratti-con-misure", sub.id, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("subappalto_misure" as never).select("contratto_id").in("contratto_id", ids).neq("stato", "annullata");
      if (error) throw error;
      return [...new Set(((data ?? []) as unknown as Array<{ contratto_id: string }>).map((r) => r.contratto_id))];
    },
    enabled: ids.length > 0,
  });
  const conLavoriContabilizzati = (id: string) => conBase.includes(id)
    && (conMisure.includes(id) || sal.some((x) => x.contratto_id === id && x.stato !== "contestato" && Number(x.importo_lordo) > 0));
  // Base lavori con misure o SAL: commessa fissa; importo e oneri si cambiano con una variante registrata al salvataggio.
  const baseCongelata = !!dialog?.id && conLavoriContabilizzati(dialog.id);
  const [motivoVariante, setMotivoVariante] = useState("");
  const varianteFatta = useRef(false);
  const { data: ritenute = [], isLoading: caricoRitenute, isError: erroreRitenute } = useQuery({
    queryKey: ["ritenute-sub-tutte", sub.id, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("ritenute_garanzia" as never).select("contratto_id, importo, stato").in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ contratto_id: string; importo: number; stato: string }>;
    },
    enabled: ids.length > 0,
  });
  const pivaSub = chiavePiva(sub.piva);
  const chiaveFatture = ["fatture-sub", sub.id, companyId, ids.join(","), pivaSub] as const;
  const { data: fatture = [], isLoading: caricoFatture, isError: erroreFatture } = useQuery({
    queryKey: chiaveFatture,
    queryFn: async (): Promise<FatturaContrattoSub[]> => {
      const filtri = [ids.length ? `contratto_subappalto_id.in.(${ids.join(",")})` : null,
        ...valoriPivaSub(pivaSub).map(piva => `cedente_piva.ilike.${piva}`)].filter(Boolean).join(",");
      if (!filtri) return [];
      const { data, error } = await supabase.from("fatture_ricevute")
        .select("id, company_id, cedente_piva, numero_fattura, data_fattura, imponibile_totale, totale_documento, tipo_documento, contratto_subappalto_id, sal_subappaltatore_id, subappalto_acconto, cedente_ragione_sociale, stato, righe, note")
        .eq("company_id", companyId).or(filtri).order("data_fattura", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []).map(({ righe, note, ...f }) => ({ ...f, testo: testoFattura({ righe, note }) })) as FatturaContrattoSub[];
    },
    enabled: !!pivaSub || ids.length > 0,
  });
  // L'ultima richiesta di firma di ogni contratto: inviata, aperta, firmata, rifiutata.
  const {data: richieste = [], isLoading: caricoFirme, isError: erroreFirme} = useFirmeSubappalto(sub.id, ids);
  const richiestaDi = (id: string) => richieste.find((r) => r.contratto_subappalto_id === id);
  // Una firma appena arrivata: il contratto risulta firmato senza ricaricare la pagina.
  const firmeRegistrate = useRef<Set<string> | null>(null);
  useEffect(() => {
    // Con la lettura in errore l'elenco è vuoto: niente confronto, o al giro dopo ogni firma sembrerebbe nuova.
    if (caricoFirme || erroreFirme) return;
    const firmate = richieste.filter((r) => r.status === "signed");
    const viste = firmeRegistrate.current;
    firmeRegistrate.current = new Set(firmate.map((r) => r.id));
    if (!viste) return;
    const nuove = firmate.filter((r) => !viste.has(r.id));
    if (!nuove.length) return;
    void qc.invalidateQueries({ queryKey: chiaviContratti.elenco(sub.id) });
    toast.success(nuove.length === 1 ? t("{nome} ha firmato il contratto.", { nome: nuove[0].signer_name ?? t("La ditta") }) : t("{n} contratti firmati.", { n: nuove.length }));
  }, [richieste, caricoFirme, erroreFirme, qc, sub.id]);

  const { data: azienda } = useQuery({
    queryKey: ["contratto-sub-azienda", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("anagrafica_azienda")
        .select("ragione_sociale, partita_iva, codice_fiscale, telefono, email, indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia")
        .eq("company_id", companyId).maybeSingle();
      return data;
    },
    enabled: !!stampa || contratti.length > 0,
  });
  // Logo e colore dell'impresa, e l'IVA della ditta (0 = reverse charge): per la testata e il riquadro economico.
  const { data: veste } = useQuery({
    queryKey: ["contratto-sub-veste", companyId],
    queryFn: () => vesteContratto(companyId),
    enabled: contratti.length > 0, staleTime: 10 * 60_000,
  });
  // Lo standard dell'azienda per gli articoli del contratto (vuoto = testo di base).
  const { data: modelloArticoli = {}, isLoading: caricoModello, isError: erroreModello } = useQuery({
    queryKey: ["subappalto-modello-contratto", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subappalto_modello_contratto" as never).select("articoli").eq("company_id", companyId).maybeSingle();
      if (error) throw error;
      return unisciArticoliPersonalizzati((data as { articoli?: unknown } | null)?.articoli, {});
    },
    enabled: !!companyId && contratti.length > 0, staleTime: 5 * 60_000,
  });
  // Le clausole di «Contratti e condizioni» e i dati societari del piè di pagina (09/11/2026).
  const { data: extraContratto } = useQuery({
    queryKey: ["contratto-sub-archivio", companyId],
    queryFn: async () => {
      const [modello, societari] = await Promise.all([
        modelloPredefinitoDellAzienda(supabase, companyId, "subappalto"),
        caricaDatiSocietari(supabase, companyId),
      ]);
      return { modello, societarie: righeSocietarie(societari) };
    },
    enabled: !!companyId && contratti.length > 0, staleTime: 60_000,
  });
  const { data: ivaDitta = 0, isLoading: caricoIva } = useQuery({
    queryKey: ["contratto-sub-iva-ditta", companyId, sub.campo_subappaltatore_id ?? null],
    queryFn: async () => {
      const { data } = await supabase.from("external_teams").select("vat_rate")
        .eq("company_id", companyId).eq("subappaltatore_id", sub.campo_subappaltatore_id!).limit(1).maybeSingle();
      return Number(data?.vat_rate) || 0;
    },
    enabled: contratti.length > 0 && !!sub.campo_subappaltatore_id,
  });
  // «Crea e manda in firma»: appena IVA della ditta e condizioni sono lette, si apre l'invio di quel contratto.
  useEffect(() => {
    if (!invioRichiesto || caricoIva || caricoModello || erroreModello || caricoFirme) return;
    const c = contratti.find((x) => x.id === invioRichiesto);
    if (!c) return;
    onInvioGestito?.();
    const r = richiestaDi(c.id);
    if (c.firmato_il || (r && ["pending", "otp_verified"].includes(r.status))) return;
    setInvio({ c, nome: c.referente_subappaltatore || sub.responsabile || "", email: sub.pec || sub.email || "", telefono: sub.telefono || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invioRichiesto, caricoIva, caricoModello, erroreModello, caricoFirme, contratti]);

  const riepiloghi = useMemo(() => new Map<string, RiepilogoContratto>(contratti.map((c) => [
    c.id,
    riepilogoContratto(c, sal.filter((s) => s.contratto_id === c.id), fatture.filter((f) => f.contratto_subappalto_id === c.id), ritenute.filter((r) => r.contratto_id === c.id)),
  ])), [contratti, sal, fatture, ritenute]);

  const invalida = () => {
    qc.invalidateQueries({ queryKey: chiaviContratti.elenco(sub.id) });
    qc.invalidateQueries({ queryKey: ["fatture-sub", sub.id] });
    qc.invalidateQueries({ queryKey: ["subappaltatori-page", companyId] });
    qc.invalidateQueries({ queryKey: ["order-subcontract-statistics"] });
    qc.invalidateQueries({ queryKey: ["fascicolo-cantiere"] });
    qc.invalidateQueries({ queryKey: ["sicurezza-documenti", companyId] });
  };
  const riprovaRiepilogo = () => {
    void qc.invalidateQueries({ queryKey: chiaviContratti.salTutti(sub.id) });
    void qc.invalidateQueries({ queryKey: ["ritenute-sub-tutte", sub.id] });
    void qc.invalidateQueries({ queryKey: ["fatture-sub", sub.id] });
  };

  const salva = useMutation({
    mutationFn: async () => {
      if (!form.order_id) throw new Error("Scegli la commessa del contratto");
      if (!form.descrizione_lavori.trim()) throw new Error("Scrivi i lavori affidati");
      const importoLetto = numero(form.importo_contrattuale);
      if (importoLetto == null || importoLetto < 0) throw new Error("Importo del contratto non valido");
      // Arrotondati al centesimo come nel database: «1000,005» non deve far scattare il blocco dopo la variante.
      const importo = Math.round(importoLetto * 100) / 100;
      const oneriLetti = numero(form.oneri_sicurezza) ?? 0;
      if (oneriLetti < 0) throw new Error("Oneri della sicurezza non validi");
      const oneri = Math.round(oneriLetti * 100) / 100;
      // Tutte le verifiche prima della variante: una variante registrata e poi un errore sul resto lasciavano a metà.
      const ritenuta = numero(form.ritenuta_garanzia_pct);
      if (ritenuta == null || ritenuta < 0 || ritenuta > 100) throw new Error("Ritenuta di garanzia non valida");
      // L'acconto si recupera nei SAL: non può superare il valore del contratto.
      const accontoLetto = form.acconto_importo.trim() ? numero(form.acconto_importo) : 0;
      if (accontoLetto == null || accontoLetto < 0) throw new Error("Acconto non valido");
      const acconto = Math.round(accontoLetto * 100) / 100;
      if (acconto > importo + oneri + 0.004) throw new Error("L'acconto non può superare il valore del contratto");
      const orig = dialog?.id ? contratti.find((x) => x.id === dialog.id) : undefined;
      const cambiaImporto = !!orig && (Math.abs(Number(orig.importo_contrattuale) - importo) > 0.004 || Math.abs(Number(orig.oneri_sicurezza ?? 0) - oneri) > 0.004);
      // In firma: il subappaltatore firmerebbe il PDF con l'importo vecchio.
      if (orig && cambiaImporto && ["pending", "otp_verified"].includes(richiestaDi(orig.id)?.status ?? ""))
        throw new Error("Il contratto è in firma con l'importo attuale: annulla la richiesta di firma prima di cambiare importo o oneri.");
      if (orig && cambiaImporto && orig.firmato_il && !baseCongelata)
        throw new Error("Il contratto è firmato: importo e oneri si cambiano con una variante (pulsante «Variante»), non riscrivendo il contratto.");
      // Contratto con lavori già contabilizzati: se cambiano importo o oneri, prima la variante tracciata.
      if (orig && baseCongelata && cambiaImporto) {
        const motivo = motivoVariante.trim() || "Correzione dell'importo del contratto";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errVar } = await (supabase as any).rpc("subappalto_variante_registra", {
          p_company: companyId, p_contratto: orig.id, p_importo: importo, p_oneri: oneri,
          p_motivo: motivo.length >= 5 ? motivo : `${motivo} (variante)`,
        });
        if (errVar) throw new Error(errVar.message || "Variante non registrata: importo e oneri non cambiati.");
        varianteFatta.current = true;
      }
      const campi = {
        company_id: companyId, subappaltatore_id: sub.id, order_id: form.order_id,
        numero_contratto: form.numero_contratto.trim() || null, descrizione_lavori: form.descrizione_lavori.trim(),
        importo_contrattuale: importo, oneri_sicurezza: oneri, ritenuta_garanzia_pct: ritenuta, acconto_importo: acconto,
        durata_garanzia_mesi: Math.max(0, Math.round(numero(form.durata_garanzia_mesi) ?? 12)),
        data_stipula: form.data_stipula || null, data_inizio: form.data_inizio || null, data_fine_prevista: form.data_fine_prevista || null,
        stato: form.stato, responsabile_impresa: form.responsabile_impresa.trim() || null,
        referente_subappaltatore: form.referente_subappaltatore.trim() || null, obblighi: form.obblighi.trim() || null,
        modalita_pagamento: form.modalita_pagamento.trim() || null, penali: form.penali.trim() || null,
        garanzie: form.garanzie.trim() || null, note: form.note.trim() || null,
      };
      if (orig?.firmato_il) {
        // Firmato: le condizioni pattuite non si riscrivono (collaudo 10/11/2026). Restano date, stato, referenti e note.
        const testo = (v: unknown) => (v == null || v === "" ? null : String(v).trim());
        const cambiate = (["order_id", "numero_contratto", "descrizione_lavori", "ritenuta_garanzia_pct", "durata_garanzia_mesi", "data_stipula",
          "obblighi", "modalita_pagamento", "penali", "garanzie"] as const)
          .filter((k) => testo((campi as Record<string, unknown>)[k]) !== testo((orig as unknown as Record<string, unknown>)[k]));
        if (cambiate.length) throw new Error("Il contratto è firmato: commessa, numero, lavori, ritenuta, garanzie, penali e pagamenti non si riscrivono. Qui cambi date, stato, referenti e note; il resto con una variante.");
      }
      if (orig && orig.order_id !== campi.order_id) {
        // Con SAL o ritenute la commessa non si sposta: resterebbero sulla vecchia.
        const [{ count: sal, error: e1 }, { count: rit, error: e2 }] = await Promise.all([
          supabase.from("sal_subappaltatori" as never).select("id", { count: "exact", head: true }).eq("contratto_id", orig.id),
          supabase.from("ritenute_garanzia" as never).select("id", { count: "exact", head: true }).eq("contratto_id", orig.id),
        ]);
        if (e1 || e2) throw new Error("Non riesco a controllare SAL e ritenute del contratto: riprova.");
        if ((sal ?? 0) > 0 || (rit ?? 0) > 0) throw new Error("Il contratto ha già SAL o ritenute su questa commessa: la commessa non si cambia.");
      }
      const q = dialog?.id
        ? supabase.from("contratti_subappalto" as never).update(campi as never).eq("id", dialog.id).select("id").single()
        : supabase.from("contratti_subappalto" as never).insert(campi as never).select("id").single();
      const { data, error } = await q;
      if (error) {
        const prima = varianteFatta.current ? "La variante è registrata (importo e oneri aggiornati), ma il resto del contratto non è salvato: " : "";
        if (error.code === "23514")
          throw new Error(prima + (error.message || "il contratto ha misure o SAL: importo e oneri si cambiano con una variante."));
        if (error.code === "42501" || error.code === "PGRST116") throw new Error(prima + "non hai il permesso di modificare questo contratto.");
        throw new Error(prima + "controlla i dati e riprova.");
      }
      return (data as unknown as { id: string }).id;
    },
    onMutate: () => { varianteFatta.current = false; },
    onSuccess: (id) => {
      toast.success(dialog?.id ? (varianteFatta.current ? t("Contratto aggiornato, con la variante registrata") : t("Contratto aggiornato")) : t("Contratto creato"));
      invalida(); qc.invalidateQueries({ queryKey: ["contratti-con-misure"] }); qc.invalidateQueries({ queryKey: ["contratto-varianti"] });
      setDialog(null); onSeleziona(id); setDettaglio(id);
    },
    // Si ricarica comunque: dopo una variante riuscita i dati del contratto sono cambiati.
    onError: (e: Error) => { toast.error(e.message); invalida(); qc.invalidateQueries({ queryKey: ["contratti-con-misure"] }); },
  });

  // Lo storico delle varianti del contratto (prima, dopo, motivo, quando): si vede nel dialogo «Variante».
  const { data: storicoVarianti = [] } = useQuery({
    queryKey: ["contratto-varianti", variante?.c.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.from("subappalto_varianti_contratto" as never)
        .select("id, importo_prima, importo_dopo, oneri_prima, oneri_dopo, motivo, created_at").eq("contratto_id", variante!.c.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; importo_prima: number; importo_dopo: number; oneri_prima: number; oneri_dopo: number; motivo: string; created_at: string }>;
    },
    enabled: !!variante,
  });

  const registraVariante = useMutation({
    mutationFn: async () => {
      if (!variante) return null;
      const importo = numero(variante.importo), oneri = numero(variante.oneri);
      if (importo == null || importo < 0) throw new Error("Importo lavori non valido");
      if (oneri == null || oneri < 0) throw new Error("Oneri della sicurezza non validi");
      if (variante.motivo.trim().length < 5) throw new Error("Scrivi il motivo della variante (almeno 5 caratteri)");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("subappalto_variante_registra", {
        p_company: companyId, p_contratto: variante.c.id, p_importo: Math.round(importo * 100) / 100,
        p_oneri: Math.round(oneri * 100) / 100, p_motivo: variante.motivo.trim(),
      });
      if (error) throw new Error(error.message || "Variante non registrata. Riprova.");
      return data as { quadro_da_riscrivere?: boolean } | null;
    },
    onSuccess: (esito) => {
      toast.success(esito?.quadro_da_riscrivere
        ? t("Variante registrata. Importo ridotto: aggiorna le voci da «Lavori e quantità».")
        : t("Variante registrata: importo e oneri aggiornati, storico salvato."));
      setVariante(null); invalida();
      qc.invalidateQueries({ queryKey: ["contratti-base-registrata"] });
      qc.invalidateQueries({ queryKey: ["contratto-varianti"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const annullaFirma = useMutation({
    mutationFn: async (contrattoId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("subappalto_firma_annulla", { p_company: companyId, p_contratto: contrattoId });
      if (error) throw new Error(error.message || "Richiesta non annullata. Riprova.");
      return Number((data as { annullate?: number } | null)?.annullate ?? 0);
    },
    onSuccess: (n) => {
      toast.success(n > 0 ? t("Richiesta di firma annullata: il link non vale più") : t("Non c'era nessuna richiesta di firma da annullare"));
      invalida(); qc.invalidateQueries({ queryKey: ["firme-subappalto", sub.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: ContrattoCompleto["stato"] }) => {
      const extra = stato === "completato" ? { data_fine_effettiva: oggi() } : {};
      const { data, error } = await supabase.from("contratti_subappalto" as never).update({ stato, ...extra } as never).eq("id", id).select("id");
      if (error) throw new Error("Stato non aggiornato. Riprova.");
      if (!data?.length) throw new Error("Stato non aggiornato: non hai il permesso di modificare questo contratto.");
    },
    onSuccess: () => { toast.success(t("Stato del contratto aggiornato")); invalida(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fattura → contratto e SAL: la contabilizza se serve e ne porta il costo
  // sulla commessa del contratto (subappalto_collega_fattura). Così il
  // pagamento del SAL paga proprio quella fattura.
  const collegaFattura = useMutation({
    mutationFn: async ({ fatturaId, contrattoId, salId = null, acconto = false, prove: esiti = [] }: {
      fatturaId: string; contrattoId: string | null; salId?: string | null;
      acconto?: boolean; prove?: ConfermaFatturaSalSub["prove"];
    }) => {
      // Nella traccia comune resta la scelta della persona, con quello che ha scelto.
      const salScelto = salId ? sal.find((x) => x.id === salId) : null;
      const contratto = contrattoId ? contratti.find((c) => c.id === contrattoId) : null;
      const prove = contrattoId ? [...esiti, {
        campo: "scelta_dalla_scheda_subappaltatore", ruolo: "conferma", esito: "uguale",
        trovato: [contratto?.numero_contratto ?? "contratto senza numero", salScelto ? `SAL n. ${salScelto.numero_sal}` : null].filter(Boolean).join(" · "),
        testo: `Scelto dalla scheda del subappaltatore: ${contratto?.numero_contratto ?? "contratto senza numero"}${salScelto ? `, SAL n. ${salScelto.numero_sal}` : ""}`,
      }] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("subappalto_collega_fattura", {
        p_fattura: fatturaId, p_contratto: contrattoId, p_sal: salId, p_esito: "manuale", p_regola: "subappalto_controllo_fattura",
        p_prove: prove, p_acconto: acconto,
      });
      if (error) throw new Error(error.message || "Collegamento non riuscito. Riprova.");
      const esito: string | undefined = data?.esito;
      if (!esito || !["collegata", "contabilizzata_e_collegata", "scollegata"].includes(esito)) {
        throw new Error("Collegamento non confermato dal server. Riprova.");
      }
      return esito;
    },
    onSuccess: (esito, scelta) => {
      qc.setQueryData<FatturaContrattoSub[]>(chiaveFatture, prima => prima?.map(f => f.id === scelta.fatturaId ? {
        ...f, contratto_subappalto_id: scelta.contrattoId, sal_subappaltatore_id: scelta.salId ?? null,
        subappalto_acconto: !!scelta.acconto,
      } : f));
      void qc.invalidateQueries({ queryKey: ["fatture-sub", sub.id] });
      void qc.invalidateQueries({ queryKey: ["fattura-controllo-subappalto", companyId] });
      refreshFinancialQueries(qc);
      if (esito === "contabilizzata_e_collegata") toast.success(t("Fattura collegata e contabilizzata"));
      else if (esito === "collegata") toast.success(t("Fattura collegata"));
      else toast.success(t("Fattura scollegata"));
    },
  });

  const datiContratto = (c: ContrattoCompleto, opzioni: { rileggi?: boolean } = {}): DatiContrattoSubappalto => {
    const a = azienda;
    const indirizzo = a ? [[a.indirizzo_via, a.indirizzo_numero_civico].filter(Boolean).join(" "), [a.indirizzo_cap, a.indirizzo_comune, a.indirizzo_provincia ? `(${a.indirizzo_provincia})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    return {
        numero: c.numero_contratto, dataStipula: c.data_stipula,
        committente: { ragioneSociale: a?.ragione_sociale ?? "", partitaIva: a?.partita_iva ?? "", indirizzo, rappresentante: c.responsabile_impresa ?? "",
          codiceFiscale: a?.codice_fiscale ?? "", telefono: a?.telefono ?? "", email: a?.email ?? "" },
        subappaltatore: { ragioneSociale: sub.ragione_sociale ?? "", partitaIva: sub.piva ?? "", indirizzo: sub.indirizzo ?? "", email: sub.email ?? "", pec: sub.pec ?? "",
          codiceFiscale: sub.codice_fiscale ?? "", telefono: sub.telefono ?? "", responsabile: sub.responsabile ?? "" },
        ivaPct: ivaDitta, veste: veste ?? undefined,
        commessa: { codice: c.commessa?.order_code ?? "", descrizione: c.commessa?.description ?? "", indirizzoCantiere: c.commessa?.work_address ?? "", cliente: clienteCommessa(c.commessa) },
        descrizioneLavori: c.descrizione_lavori, importo: c.importo_contrattuale, oneriSicurezza: c.oneri_sicurezza, ritenutaPct: c.ritenuta_garanzia_pct,
        dataInizio: c.data_inizio, dataFinePrevista: c.data_fine_prevista, responsabileImpresa: c.responsabile_impresa,
        referenteSubappaltatore: c.referente_subappaltatore, obblighi: c.obblighi, modalitaPagamento: c.modalita_pagamento,
        penali: c.penali, garanzie: c.garanzie, durataGaranziaMesi: c.durata_garanzia_mesi, note: c.note,
        elencoLavori: Array.isArray(c.elenco_lavori) ? c.elenco_lavori : [],
        articoliPersonalizzati: unisciArticoliPersonalizzati(modelloArticoli, c.articoli_personalizzati),
        clausoleArchivio: clausoleArchivioDelContratto(c, extraContratto?.modello, opzioni),
        societarie: extraContratto?.societarie,
    };
  };

  const stampaContratto = (c: ContrattoCompleto) => setStampa({
    nome: `Contratto subappalto ${sub.ragione_sociale ?? ""} ${c.commessa?.order_code ?? ""}`.trim(),
    html: costruisciContrattoSubappaltoHtml(datiContratto(c)),
    pdf: () => generaPdfContrattoSubappalto(datiContratto(c)),
  });

  // Dimora Torino, 31/10/2026: l'elenco dei lavori da lasciare in cantiere, senza prezzi né importi.
  const stampaElencoCantiere = (c: ContrattoCompleto) => setStampa({
    nome: `Elenco lavori ${sub.ragione_sociale ?? ""} ${c.commessa?.order_code ?? ""}`.trim(),
    html: costruisciElencoCantiereHtml(datiContratto(c)),
    pdf: () => generaPdfElencoCantiere(datiContratto(c)),
  });

  // Un contratto non firmato, senza SAL, fatture né base lavori registrata si elimina davvero: un contratto
  // «cancellato» ma ancora nei conti di commessa e ritenute sarebbe peggio. Se ha già una storia, si segna Risolto.
  const eliminaContratto = useMutation({
    mutationFn: async (c: ContrattoCompleto) => {
      if (c.firmato_il) throw new Error("Il contratto è firmato: non si elimina. Segnalo come «Risolto» dallo stato lavori.");
      const [{ count: sal, error: e1 }, { count: fatt, error: e2 }, { count: rit, error: e3 }] = await Promise.all([
        supabase.from("sal_subappaltatori" as never).select("id", { count: "exact", head: true }).eq("contratto_id", c.id),
        supabase.from("fatture_ricevute" as never).select("id", { count: "exact", head: true }).eq("contratto_subappalto_id", c.id),
        supabase.from("ritenute_garanzia" as never).select("id", { count: "exact", head: true }).eq("contratto_id", c.id),
      ]);
      // Un controllo che non riesce non vale «zero»: i SAL se ne andrebbero col contratto (collaudo 10/11/2026).
      if (e1 || e2 || e3) throw new Error("Non riesco a controllare SAL, fatture e ritenute del contratto: non lo elimino. Riprova.");
      if ((sal ?? 0) > 0 || (fatt ?? 0) > 0 || (rit ?? 0) > 0) throw new Error("Ci sono SAL, fatture o ritenute collegati: non si elimina. Segnalo come «Risolto» dallo stato lavori.");
      const { data, error } = await supabase.from("contratti_subappalto" as never).delete().eq("id", c.id).eq("company_id", companyId).select("id");
      if (error) {
        if (error.code === "23503") throw new Error("Il contratto ha già una base lavori o misure registrate: resta nello storico. Segnalo come «Risolto» dallo stato lavori.");
        throw new Error("Contratto non eliminato. Riprova.");
      }
      if (!data?.length) throw new Error("Contratto non eliminato: non hai il permesso, o è già stato tolto.");
    },
    onSuccess: () => { toast.success(t("Contratto eliminato")); invalida(); setDettaglio(null); },
    onError: (e: Error) => toast.error(e.message),
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
      // Si manda il testo del modello di oggi, e resta fissato sul contratto: il modello può cambiare, questo no.
      const datiInvio = datiContratto(c, { rileggi: true });
      const blob = await generaPdfContrattoSubappalto(datiInvio);
      const percorso = `${companyId}/subappalti/${c.id}/${Date.now()}.pdf`;
      const { error: errFile } = await supabase.storage.from("quote-pdfs").upload(percorso, blob, { contentType: "application/pdf" });
      if (errFile) throw new Error("Non riesco a salvare il PDF del contratto. Riprova tra poco.");
      // Il reinvio sostituisce la richiesta vecchia: altrimenti restano due link validi, e quella vecchia
      // blocca anche il caricamento della copia firmata su carta. Prima di scrivere sul contratto: con una
      // richiesta aperta il database non lascia cambiare le clausole (lotto 6).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errAnnulla } = await (supabase as any).rpc("subappalto_firma_annulla", { p_company: companyId, p_contratto: c.id });
      if (errAnnulla) throw new Error("Non riesco ad annullare la richiesta di firma precedente. Riprova tra poco.");
      const { error: errC } = await supabase.from("contratti_subappalto" as never).update({ pdf_path: percorso, articoli_personalizzati: { ...(c.articoli_personalizzati as Record<string, unknown> | null ?? {}), [CHIAVE_CLAUSOLE_FISSATE]: JSON.stringify(datiInvio.clausoleArchivio ?? []) } } as never).eq("id", c.id);
      if (errC) throw new Error("Non riesco a collegare il PDF al contratto. Riprova tra poco.");
      const { data, error } = await supabase.functions.invoke("fea-richiedi-firma", {
        body: {
          tipo_documento: "subappalto", documento_id: c.id, tipo_firmatario: "b2b",
          signer_name: nome.trim(), signer_email: email.trim(), signer_phone: telefono.trim() || undefined,
          // Gli articoli da approvare a parte, col testo di QUESTO contratto (anche quelli riscritti dall'azienda).
          clausole_da_approvare: clausoleFirmaSubappalto(articoliContratto(datiInvio)),
          expires_giorni: 30, note: `Contratto di subappalto ${c.numero_contratto ?? ""} · ${c.commessa?.order_code ?? ""}`.trim(),
        },
      });
      if (error) {
        let messaggio = t("Invio non riuscito. Riprova tra poco.");
        try {
          const corpo = await (error as { context?: Response }).context?.json?.();
          if (typeof corpo?.error === "string" && corpo.error.length < 200) messaggio = corpo.error;
        } catch { /* messaggio generico */ }
        throw new Error(messaggio);
      }
      if (data?.request_id) await supabase.from("contratti_subappalto" as never).update({ firma_richiesta_id: data.request_id } as never).eq("id", c.id);
      // Chi firma per la ditta si ricorda (11/11/2026): dal secondo invio nome, email e cellulare sono già scritti.
      // Solo dove la scheda non li ha: non si sovrascrive quello che qualcuno ha scritto a mano.
      const ricorda: Record<string, string> = {};
      if (!sub.responsabile?.trim()) ricorda.responsabile = nome.trim();
      if (!sub.pec?.trim() && !sub.email?.trim()) ricorda.email = email.trim();
      if (!sub.telefono?.trim() && telefono.trim()) ricorda.telefono = telefono.trim();
      if (Object.keys(ricorda).length) {
        await supabase.from("subappaltatori_sicurezza" as never).update(ricorda as never).eq("id", c.subappaltatore_id).eq("company_id", companyId);
      }
      return data as { otp_inviato?: boolean };
    },
    onSuccess: () => {
      toast.success(t("Contratto inviato per la firma"), { description: t("Il subappaltatore riceve il link per leggerlo e firmarlo con un codice.") });
      setInvio(null);
      invalida();
      qc.invalidateQueries({ queryKey: ["firme-subappalto", sub.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  // Le rifiutate non si collegano (il database lo vieta): non proporle.
  const fattureLibere = fatture.filter(f => !!pivaSub && chiavePiva(f.cedente_piva) === pivaSub
    && !f.contratto_subappalto_id && f.stato !== "rifiutata");
  const contrattoCollegamento = contratti.find(c => c.id === collega?.contrattoId);
  const apriVerbaleSal = async (id: string, contrattoId: string) => {
    const { data, error } = await supabase.from("sal_subappaltatori").select("*")
      .eq("id", id).eq("company_id", companyId).eq("contratto_id", contrattoId).single();
    if (error || !data) throw new Error("Verbale SAL non disponibile. Riprova.");
    setVerbaleDaMisure(data as SALSubappaltatore);
  };
  const campo = (k: keyof FormContratto) => ({ value: form[k] as string, onChange: (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("Un contratto per ogni commessa su cui lavora questa impresa.")}</p>
        <Button size="sm" disabled={permessiLavori.solaLettura || !permessiLavori.canEditOrders} onClick={() => {
          if (sub.campo_subappaltatore_id && permessiLavori.canViewCosts) {
            setCommessaScelta(sub.order_id ?? "");
            setScegliCommessa(true);
          } else {
            setForm(formVuoto(sub.order_id ?? "", sub.responsabile ?? ""));
            setDialog({ id: null });
          }
        }}>
          <Plus className="mr-1 h-4 w-4" />{t("Nuovo contratto")}
        </Button>
      </div>

      <Dialog open={scegliCommessa} onOpenChange={setScegliCommessa}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Nuovo contratto di subappalto")}</DialogTitle>
            <DialogDescription>{t("Scegli la commessa per aprire le lavorazioni di {nome}.", { nome: sub.ragione_sociale || t("questa ditta") })}</DialogDescription>
          </DialogHeader>
          {commesseContratto.isError ? <p role="alert" className="text-sm text-destructive">{t("Commesse non disponibili.")}
            <Button variant="link" onClick={() => void commesseContratto.refetch()}>{t("Riprova")}</Button>
          </p> : <OfficeSelect label={t("Commessa del nuovo contratto")} value={commessaScelta} onValueChange={setCommessaScelta}
            placeholder={commesseContratto.isLoading ? t("Carico le commesse…") : t("Scegli la commessa")}
            options={commesse.map(o => ({ value: o.id, label: [o.order_code, o.description].filter(Boolean).join(" · ") }))} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={!commesse.some(o => o.id === commessaScelta)} onClick={() => {
              setForm(formVuoto(commessaScelta, sub.responsabile ?? ""));
              setScegliCommessa(false);
              setDialog({ id: null });
            }}>{t("Usa importo complessivo")}</Button>
            <Button disabled={!commesse.some(o => o.id === commessaScelta)} onClick={() => {
              setScegliCommessa(false);
              setCreaDaCommessa(commessaScelta);
            }}>{t("Apri lavorazioni")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {creaDaCommessa && sub.campo_subappaltatore_id && <AffidaContrattoDaCommessa key={creaDaCommessa}
        orderId={creaDaCommessa} companyId={companyId} dittaFissa={{ id: sub.campo_subappaltatore_id, nome: sub.ragione_sociale || "Subappaltatore", schedaId: sub.id }}
        onChiudi={() => setCreaDaCommessa(null)} onContrattoSalvato={id => {
          invalida();
          setDettaglio(id);
          onSeleziona(id);
        }} />}

      {erroreContratti ? <p role="alert" className="rounded-lg border p-4 text-sm">{t("Contratti non disponibili.")} <Button variant="outline" onClick={() => void ricaricaContratti()}>{t("Riprova")}</Button></p> : isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : contratti.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("Nessun contratto. Creane uno per la commessa: servirà per SAL, ritenute e pagamenti, e lo potrai stampare e far firmare.")}
        </CardContent></Card>
      ) : erroreSal || erroreRitenute || erroreFatture ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">{t("Riepilogo dei contratti non disponibile. Non mostriamo importi parziali.")}<Button variant="outline" className="ml-3" onClick={invalida}>{t("Riprova")}</Button></div> : caricoSal || caricoRitenute || caricoFatture ? <p role="status" className="p-4 text-sm text-muted-foreground">{t("Caricamento riepilogo dei contratti…")}</p> : <ElencoContrattiSub righe={contratti.map(c => ({contratto:c, riepilogo:riepiloghi.get(c.id)!, firma:c.firmato_il ? 'firmato' : caricoFirme || erroreFirme ? 'non_disponibile' : ['pending','otp_verified','signed'].includes(richiestaDi(c.id)?.status || '') ? 'in_attesa' : 'da_firmare'}))} onApri={cid => {ritornoDettaglio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;onAperturaGestita?.();setDettaglio(cid); onSeleziona(cid);}}/>}
      {erroreFirme && <p role="alert" className="text-sm text-amber-800">{t("Stato delle richieste di firma non disponibile.")} <Button variant="link" onClick={() => void qc.invalidateQueries({queryKey:['firme-subappalto',sub.id]})}>{t("Riprova")}</Button></p>}
      <Dialog open={!!dettaglio} onOpenChange={open => { if (!open) chiudiDettaglio(); }}>
        <DialogContent
          onCloseAutoFocus={event => {
            if (ritornoDettaglio.current?.isConnected) {
              event.preventDefault();
              ritornoDettaglio.current.focus();
            }
          }}
          className="flex w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 focus:outline-none sm:w-[calc(100%-2rem)]"
        >
          {contratti.filter(c => c.id === dettaglio).map(c => {
            const r = riepiloghi.get(c.id)!;
            const suoiSal = sal.filter(s => s.contratto_id === c.id);
            const suoFatture = fatture.filter(f => f.contratto_subappalto_id === c.id);
            const coperturaSal = fatturePerSalSub(suoiSal, suoFatture);
            const richiesta = richiestaDi(c.id);
            const firmaInCorso = !!richiesta && ["pending", "otp_verified"].includes(richiesta.status);
            const puoGestire = !permessiLavori.solaLettura && permessiLavori.canEditOrders;
            const puoCollegareFatture = puoGestire && permessiLavori.canViewSubappaltatoriAmministrazione;
            const haBaseLavori = conBase.includes(c.id);
            const puoEliminare = puoGestire && !c.firmato_il && !firmaInCorso && !haBaseLavori
              && !suoiSal.length && !suoFatture.length && !ritenute.some(ritenuta => ritenuta.contratto_id === c.id);
            const datiContabiliDisponibili = !caricoSal && !caricoRitenute && !caricoFatture
              && !erroreSal && !erroreRitenute && !erroreFatture;
            const accessiLavori = [
              {
                titolo: t("Lavori e quantità"), testo: t("Registra le misure e prepara un SAL"),
                Icona: Ruler, visibile: puoConsultareSalSub(permessiLavori), apri: () => setLavoriMisure(c),
                principale: true,
              },
              {
                titolo: t("Computo del contratto"), testo: t("Voci, quantità e prezzi concordati"),
                Icona: ClipboardList, visibile: !!c.elenco_lavori?.length, apri: () => setComputo(c),
              },
              {
                titolo: t("SAL e verbali"), testo: suoiSal.length === 1 ? t("1 SAL registrato")
                  : suoiSal.length > 1 ? t("{n} SAL registrati", { n: suoiSal.length }) : t("Consulta lo storico dei SAL"),
                Icona: FileText, visibile: true, apri: () => onApriContabilita(c.id),
              },
            ];

            return (
              <Tabs key={c.id} defaultValue="panoramica" className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="shrink-0 gap-3 border-b px-4 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pr-14 md:flex-row md:items-start md:justify-between md:space-y-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="hidden shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary sm:block">
                      <FileText aria-hidden="true" className="size-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <DialogTitle className="break-words text-lg sm:text-xl">{c.numero_contratto || t("Contratto di subappalto")}</DialogTitle>
                      <DialogDescription className="break-words">
                        {[c.commessa?.order_code, c.commessa?.description].filter(Boolean).join(" · ") || t("Contratto di subappalto")}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant="secondary" className={STATI[c.stato]?.cls}>{STATI[c.stato] ? t(STATI[c.stato].label) : c.stato}</Badge>
                    {c.firmato_il
                      ? <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">{t("Firmato · {firmato_il}", { firmato_il: String(dataIT(c.firmato_il) ?? "") })}</Badge>
                      : !caricoFirme && !erroreFirme && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">{firmaInCorso ? t("In attesa di firma") : t("Da firmare")}</Badge>}
                  </div>
                </DialogHeader>

                <div className="shrink-0 border-b px-4 py-2 sm:px-6">
                  <TabsList aria-label={t("Sezioni del contratto")} className="grid h-auto w-full grid-cols-3 sm:inline-grid sm:w-auto">
                    <TabsTrigger value="panoramica" className="px-2 sm:px-4">{t("Panoramica")}</TabsTrigger>
                    <TabsTrigger value="documenti" className="gap-2 px-2 sm:px-4">
                      <FilePenLine aria-hidden="true" className="hidden size-4 sm:block" />{t("Documenti")}
                    </TabsTrigger>
                    <TabsTrigger value="fatture" className="gap-2 px-2 sm:px-4">
                      <ReceiptText aria-hidden="true" className="hidden size-4 sm:block" />{t("Fatture")}
                      {suoFatture.length > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{suoFatture.length}</span>}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                  <TabsContent value="panoramica" className="mt-0 space-y-4">
                    {datiContabiliDisponibili && (
                      <section aria-label={t("Riepilogo economico del contratto")} className="overflow-hidden rounded-xl border">
                        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                          {([
                            ["Contratto con oneri", r.valore],
                            ["Eseguito da SAL", r.eseguito],
                            ["Netto SAL da pagare", r.daPagare],
                            ["Ritenute trattenute", r.ritenuteTrattenute],
                          ] as const).map(([label, amount]) => (
                            <div key={label} className={cn("bg-muted px-3 py-2.5 sm:px-4", label === "Netto SAL da pagare" && "bg-blue-50 dark:bg-blue-950")}>
                              <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                              <dd className={cn("mt-0.5 text-base font-semibold tabular-nums sm:text-lg", label === "Netto SAL da pagare" && "text-primary")}>{euro(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="space-y-2 border-t px-3 py-2.5 sm:px-4">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{t("Avanzamento SAL")} <span className="ml-1.5 font-semibold tabular-nums text-foreground">{r.avanzamento}%</span></span>
                            <span>{t("Residuo contratto")} <span className="ml-1.5 font-medium tabular-nums text-foreground">{euro(r.residuo)}</span></span>
                          </div>
                          <div role="progressbar" aria-label={t("Avanzamento SAL")} aria-valuenow={r.avanzamento} className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${r.avanzamento}%` }} />
                          </div>
                        </div>
                      </section>
                    )}
                    {(erroreSal || erroreRitenute || erroreFatture) && (
                      <p role="alert" className="text-sm text-destructive">{t("Riepilogo economico non disponibile.")} <Button variant="link" onClick={riprovaRiepilogo}>{t("Riprova")}</Button></p>
                    )}
                    {!datiContabiliDisponibili && (caricoSal || caricoRitenute || caricoFatture) && (
                      <p role="status" className="text-sm text-muted-foreground">{t("Caricamento riepilogo economico…")}</p>
                    )}

                    <section aria-label={t("Lavorazioni del contratto")}>
                      {c.descrizione_lavori && <p className="mb-2 break-words text-sm font-medium">{c.descrizione_lavori}</p>}
                      <div className="divide-y overflow-hidden rounded-xl border">
                        {accessiLavori.filter(accesso => accesso.visibile).map(({ titolo, testo, Icona, apri, principale }) => (
                          <Button key={titolo} type="button" variant="ghost" aria-label={titolo} onClick={apri}
                            className={cn("h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-3 py-2 text-left focus-visible:ring-inset sm:px-4",
                              principale && "bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary")}>
                            <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", principale ? "bg-primary/10" : "bg-muted text-muted-foreground")}>
                              <Icona aria-hidden="true" className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{titolo}</span>
                              <span className="block text-xs font-normal text-muted-foreground">{testo}</span>
                            </span>
                            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                          </Button>
                        ))}
                      </div>
                    </section>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("Stato lavori")}</span>
                        <Select disabled={cambiaStato.isPending || !puoGestire} value={c.stato} onValueChange={v => cambiaStato.mutate({ id: c.id, stato: v as ContrattoCompleto["stato"] })}>
                          <SelectTrigger aria-label={t("Stato lavori del contratto")} className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATI) as ContrattoCompleto["stato"][]).map(s => <SelectItem key={s} value={s}>{t(STATI[s].label)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2"><Ellipsis aria-hidden="true" className="size-4" />{t("Gestisci contratto")}</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" disabled={!puoGestire} onSelect={() => {
                            setForm(daContratto(c));
                            setMotivoVariante("");
                            setDialog({ id: c.id });
                          }}><Pencil aria-hidden="true" className="size-4" />{t("Modifica")}</DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onSelect={() => setCondizioni(c)}>
                            <FileText aria-hidden="true" className="size-4" />{t("Condizioni")}
                          </DropdownMenuItem>
                          {(haBaseLavori || c.firmato_il) && (
                            <DropdownMenuItem className="gap-2" disabled={!puoGestire || firmaInCorso}
                              title={firmaInCorso ? t("Annulla la richiesta di firma per aggiungere una variante") : undefined}
                              onSelect={() => setVariante({ c, importo: String(c.importo_contrattuale ?? ""), oneri: String(c.oneri_sicurezza ?? 0), motivo: "" })}>
                              <FilePenLine aria-hidden="true" className="size-4" />{t("Variante")}
                            </DropdownMenuItem>
                          )}
                          {puoEliminare && datiContabiliDisponibili && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" disabled={eliminaContratto.isPending}
                                onSelect={() => { if (window.confirm(t("Eliminare questo contratto?"))) eliminaContratto.mutate(c); }}>
                                <Trash2 aria-hidden="true" className="size-4" />{t("Elimina contratto")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TabsContent>

                  <TabsContent value="documenti" className="mt-0 space-y-3">
                    {erroreFirme && <p role="alert" className="text-sm text-amber-800">{t("Stato firma non disponibile.")} <Button variant="link" onClick={() => void qc.invalidateQueries({ queryKey: ["firme-subappalto", sub.id] })}>{t("Riprova")}</Button></p>}
                    {richiesta && !c.firmato_il && (
                      <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
                        richiesta.status === "refused" ? "border-red-200 bg-red-50 text-red-800"
                          : firmaInCorso ? "border-sky-200 bg-sky-50 text-sky-900" : "bg-muted/25 text-muted-foreground")}>
                        {richiesta.status === "refused" ? <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                        <span className="min-w-0 break-words">
                          {richiesta.status === "refused" ? t("{nome} ha rifiutato la firma.", { nome: richiesta.signer_name ?? t("Il subappaltatore") })
                            : richiesta.status === "expired" ? t("Il link per firmare è scaduto.")
                            : richiesta.status === "cancelled" ? t("La richiesta di firma è stata annullata.")
                            : richiesta.status === "signed" ? t("Firma completata. Registrazione in aggiornamento.")
                            : t("Inviato il {data} a {nome}.", { data: String(dataIT(richiesta.created_at) ?? ""), nome: richiesta.signer_name || richiesta.signer_email || t("chi deve firmare") })}
                        </span>
                      </div>
                    )}
                    {puoConsultareSalSub(permessiLavori) ? (
                      <ContrattoCarta companyId={companyId} contratto={c} firmaElettronica={firmaInCorso || richiesta?.status === "signed"} onSaved={invalida}>
                        {c.firmato_il && richiesta?.status === "signed" && (
                          <Button size="sm" variant="outline" onClick={() => scaricaFirmato(richiesta.id)}>
                            <Download className="size-4" />{t("Contratto firmato")}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={caricoIva} onClick={() => stampaContratto(c)}>
                          <Printer className="size-4" />{c.firmato_il ? t("Anteprima contratto") : t("Contratto da firmare")}
                        </Button>
                        {Array.isArray(c.elenco_lavori) && c.elenco_lavori.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => stampaElencoCantiere(c)} title={t("Elenco delle lavorazioni con quantità, senza prezzi")}>
                            <FileText className="size-4" />{t("Elenco lavori per il cantiere")}
                          </Button>
                        )}
                        {!c.firmato_il && (
                          <Button size="sm" disabled={!puoGestire || caricoIva || caricoModello || erroreModello}
                            title={caricoIva || caricoModello ? t("Caricamento IVA e condizioni dell’azienda") : erroreModello ? t("Condizioni standard non disponibili: ricarica la pagina") : undefined}
                            onClick={() => setInvio({
                              c, nome: c.referente_subappaltatore || sub.responsabile || "",
                              email: sub.pec || sub.email || "", telefono: sub.telefono || "",
                            })}>
                            <Send className="size-4" />{firmaInCorso ? t("Invia di nuovo") : t("Invia per la firma")}
                          </Button>
                        )}
                        {!c.firmato_il && firmaInCorso && (
                          <Button size="sm" variant="ghost" disabled={annullaFirma.isPending || !puoGestire}
                            onClick={() => { if (window.confirm(t("Annullare la richiesta di firma? Il link inviato smette di funzionare."))) annullaFirma.mutate(c.id); }}>
                            <XCircle className="size-4" />{t("Annulla richiesta di firma")}
                          </Button>
                        )}
                      </ContrattoCarta>
                    ) : <p className="text-sm text-muted-foreground">{t("Documenti e firma richiedono l’accesso ai contratti di subappalto.")}</p>}
                  </TabsContent>

                  <TabsContent value="fatture" className="mt-0 space-y-3">
                    {datiContabiliDisponibili && (
                      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
                        {([["SAL approvati", r.approvato], ["Fatturato", r.fatturato], ["Pagato", r.pagato]] as const).map(([label, amount]) => (
                          <div key={label} className="bg-muted px-2.5 py-2 sm:px-4 sm:py-3">
                            <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                            <dd className="mt-0.5 text-sm font-semibold tabular-nums sm:text-base">{euro(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {datiContabiliDisponibili && (
                      <section aria-label={t("Fatture per SAL")} className="overflow-hidden rounded-xl border">
                        <div className="border-b bg-muted px-3 py-2.5 sm:px-4">
                          <h3 className="text-sm font-semibold">{t("Fatture per SAL")}</h3>
                          <p className="text-xs text-muted-foreground">{t("L’imponibile atteso è il netto del SAL, dopo ritenuta e recuperi.")}</p>
                        </div>
                        {coperturaSal.length ? (
                          <ul className="divide-y">
                            {coperturaSal.map(({ sal: s, fatturato, differenza }) => (
                              <li key={s.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(10rem,1fr)_minmax(15rem,1.5fr)_auto] sm:items-center sm:gap-3 sm:px-4">
                                <div>
                                  <p className="text-sm font-medium">SAL {s.numero_sal}</p>
                                  <p className="text-xs text-muted-foreground">{t("Lordo {importo_lordo} · Ritenuta {valore}", { importo_lordo: euro(s.importo_lordo), valore: euro(s.ritenuta_importo ?? 0) })}</p>
                                </div>
                                <dl className="grid grid-cols-3 gap-2 text-xs">
                                  {([
                                    ["Atteso", euro(s.importo_netto ?? 0)],
                                    ["Collegato", euro(fatturato)],
                                    [differenza < 0 ? "Eccedenza" : "Da fatturare", euro(Math.abs(differenza))],
                                  ] as const).map(([label, value]) => (
                                    <div key={label}><dt className="text-muted-foreground">{t(label)}</dt><dd className="font-medium tabular-nums">{value}</dd></div>
                                  ))}
                                </dl>
                                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                                  {differenza === 0 && fatturato > 0 && (
                                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">{t("Coperto")}</Badge>
                                  )}
                                  {puoConsultareSalSub(permessiLavori) && (
                                    <Button variant="ghost" size="sm" aria-label={t("Verbale SAL {numero_sal}", { numero_sal: String(s.numero_sal ?? "") })}
                                      onClick={() => void apriVerbaleSal(s.id, c.id).catch((e: Error) => toast.error(e.message))}>{t("Verbale")}</Button>
                                  )}
                                  {differenza > 0 && puoCollegareFatture && fattureLibere.length > 0 && (
                                    <Button variant="outline" size="sm" aria-label={t("Collega fattura al SAL {numero_sal}", { numero_sal: String(s.numero_sal ?? "") })}
                                      onClick={() => setCollega({ contrattoId: c.id, salId: s.id })}><Link2 className="size-4" />{t("Collega")}</Button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="px-3 py-3 text-sm text-muted-foreground sm:px-4">{t("I SAL verificati compariranno qui con l’imponibile da fatturare.")}</p>}
                      </section>
                    )}
                    {datiContabiliDisponibili && r.acconto > 0 && (
                      <p className="text-xs leading-relaxed text-muted-foreground" data-testid="acconto-contratto">
                        {t("Acconto {acconto} · Fatturato {fatturato} · Recuperato nei SAL {recuperato}", { acconto: euro(r.acconto), fatturato: euro(r.accontoFatturato), recuperato: euro(r.accontoRecuperato) })} ·{" "}
                        <span className={r.accontoDaRecuperare > 0 ? "font-medium text-amber-800" : undefined}>{t("Da recuperare {accontoDaRecuperare}", { accontoDaRecuperare: euro(r.accontoDaRecuperare) })}</span>
                      </p>
                    )}
                    {datiContabiliDisponibili && r.avvisi.length > 0 && (
                      <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <summary className="cursor-pointer font-medium">
                          <AlertTriangle aria-hidden="true" className="mr-1.5 inline size-4 align-text-bottom" />
                          {r.avvisi.length === 1 ? t("1 verifica contabile da completare") : t("{n} verifiche contabili da completare", { n: r.avvisi.length })}
                        </summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5">{r.avvisi.map(a => <li key={a}>{a}</li>)}</ul>
                      </details>
                    )}
                    {erroreFatture ? <p role="alert" className="text-sm text-destructive">{t("Fatture non disponibili.")} <Button variant="link" onClick={riprovaRiepilogo}>{t("Riprova")}</Button></p>
                      : caricoFatture ? <p role="status" className="text-sm text-muted-foreground">{t("Caricamento fatture…")}</p>
                        : <section aria-label={t("Fatture collegate")} className="rounded-xl border">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
                            <h3 className="text-sm font-medium">{t("Fatture collegate")}</h3>
                            {datiContabiliDisponibili && puoCollegareFatture && fattureLibere.length > 0 && (
                              <Button size="sm" variant="outline" onClick={() => setCollega({ contrattoId: c.id })}>
                                <Link2 className="size-4" />{t("Collega fattura")}
                              </Button>
                            )}
                          </div>
                          {suoFatture.length === 0 ? (
                            <div className="space-y-1 px-3 py-3 text-sm text-muted-foreground sm:px-4">
                              <p>{t("Nessuna fattura collegata a questo contratto.")}</p>
                              {puoCollegareFatture && !fattureLibere.length && (pivaSub ? (
                                <div className="flex flex-wrap items-center gap-x-2">
                                  <span>{t("Nessuna fattura ricevuta disponibile per la partita IVA {piva}.", { piva: String(sub.piva ?? "") })}</span>
                                  {permessiLavori.canViewBilling && <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/azienda/documenti/fatture-ricevute">{t("Apri fatture ricevute")}</Link>}
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-x-2">
                                  <span>{t("Aggiungi la partita IVA per trovare le fatture di questa ditta.")}</span>
                                  <button type="button" className="font-medium text-primary underline-offset-2 hover:underline"
                                    onClick={() => { chiudiDettaglio(); onApriAnagrafica(); }}>{t("Completa anagrafica")}</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ul className="divide-y">
                              {suoFatture.map(f => {
                                const suoSal = suoiSal.find(s => s.id === f.sal_subappaltatore_id);
                                return (
                                  <li key={f.id} className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <p className="break-words text-sm font-medium">{f.tipo_documento === "TD04" ? t("Nota di credito") : t("Fattura")} {f.numero_fattura ?? ""}</p>
                                      <p className="text-xs text-muted-foreground">{dataIT(f.data_fattura)} · {suoSal ? t("SAL n. {numero_sal}", { numero_sal: String(suoSal.numero_sal ?? "") }) : f.subappalto_acconto ? t("Acconto") : t("SAL non assegnato")}</p>
                                    </div>
                                    <span className="shrink-0 text-sm font-medium tabular-nums">{euro(imponibileFattura(f))}</span>
                                    {!suoSal && !f.subappalto_acconto && coperturaSal.length > 0 && puoCollegareFatture && f.stato !== "rifiutata" && (
                                      <Button variant="ghost" size="sm" onClick={() => setCollega({ contrattoId: c.id, fattura: f })}>{t("Assegna SAL")}</Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Scollega la fattura ${f.numero_fattura ?? ""}`.trim()}
                                      disabled={!puoCollegareFatture || collegaFattura.isPending} onClick={() => {
                                        if (window.confirm(t("Scollegare la fattura dal contratto e dal SAL? La fattura e l’eventuale costo restano registrati."))) {
                                          collegaFattura.mutate({ fatturaId: f.id, contrattoId: null }, { onError: (e: Error) => toast.error(e.message) });
                                        }
                                      }}>
                                      <Unlink className="size-4" />
                                    </Button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>}
                  </TabsContent>
                </div>
              </Tabs>
            );
          })}
          {!contratti.some(c => c.id === dettaglio) && (
            <DialogHeader className="p-4 pr-12 text-left">
              <DialogTitle>{t("Contratto di subappalto")}</DialogTitle>
              <DialogDescription>{isLoading ? t("Caricamento contratto…") : t("Contratto non disponibile.")}</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {condizioni && (
        <CondizioniContrattoDialog
          key={condizioni.id}
          companyId={companyId}
          contrattoId={condizioni.id}
          dati={{ ...datiContratto(condizioni), articoliPersonalizzati: {}, clausoleArchivio: [] }}
          modello={modelloArticoli}
          personalizzati={unisciArticoliPersonalizzati({}, condizioni.articoli_personalizzati)}
          bloccato={condizioni.firmato_il
            ? t("Contratto firmato: le sue condizioni non si cambiano più. Puoi ancora aggiornare lo standard dell'azienda.")
            : ["pending", "otp_verified"].includes(richiestaDi(condizioni.id)?.status ?? "")
              ? t("Il contratto è in firma: annulla la richiesta di firma prima di cambiarne le condizioni.")
              : null}
          puoScrivere={!permessiLavori.solaLettura && permessiLavori.canEditOrders}
          onClose={() => setCondizioni(null)}
          onSalvato={invalida}
        />
      )}

      {/* Variante tracciata */}
      <Dialog open={!!variante} onOpenChange={(v) => { if (!v && !registraVariante.isPending) setVariante(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Variante del contratto")}</DialogTitle>
            <DialogDescription>
              {t("Cambia importo lavori e oneri della sicurezza. Resta lo storico (prima, dopo, motivo, chi e quando). Se l'importo sale, nell'elenco lavori si aggiunge una voce «Variante» a corpo per la differenza; per ridurlo non devono esserci misure né SAL.")}
            </DialogDescription>
          </DialogHeader>
          {variante && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("Oggi: lavori {valore} · oneri {valore2}", { valore: euro(Number(variante.c.importo_contrattuale)), valore2: euro(Number(variante.c.oneri_sicurezza ?? 0)) })}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>{t("Nuovo importo lavori (€)")}</Label>
                  <Input inputMode="decimal" value={variante.importo} onChange={(e) => setVariante((p) => p && { ...p, importo: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t("Nuovi oneri sicurezza (€)")}</Label>
                  <Input inputMode="decimal" value={variante.oneri} onChange={(e) => setVariante((p) => p && { ...p, oneri: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>{t("Motivo *")}</Label>
                <Textarea rows={2} value={variante.motivo} placeholder={t("es. Lavori aggiuntivi al bagno richiesti dal cliente")}
                  onChange={(e) => setVariante((p) => p && { ...p, motivo: e.target.value })} /></div>
              {storicoVarianti.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{t("Varianti già registrate")}</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {storicoVarianti.map((v) => (
                      <li key={v.id}>{t("{data}: lavori {prima} → {dopo}", { data: new Date(v.created_at).toLocaleDateString(intlCampo()), prima: euro(Number(v.importo_prima)), dopo: euro(Number(v.importo_dopo)) })}
                        {Number(v.oneri_prima) !== Number(v.oneri_dopo) ? t(", oneri {valore} → {valore2}", { valore: euro(Number(v.oneri_prima)), valore2: euro(Number(v.oneri_dopo)) }) : ""} · {v.motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={registraVariante.isPending} onClick={() => setVariante(null)}>{t("Annulla")}</Button>
            <Button disabled={registraVariante.isPending} onClick={() => registraVariante.mutate()}>
              {registraVariante.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("Registra variante")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuovo / modifica */}
      <Dialog open={!!dialog} onOpenChange={(v) => { if (!v && !salva.isPending) setDialog(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.id ? t("Modifica contratto") : t("Nuovo contratto di subappalto")}</DialogTitle>
            <DialogDescription>{t("I dati finiscono nel contratto da stampare e firmare; quello che scrivi negli ultimi campi prende il posto del testo standard.")}</DialogDescription>
          </DialogHeader>
          {baseCongelata && <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>{t("Questo contratto ha già misure o SAL registrati: la commessa resta quella. Se cambi importo o oneri, al salvataggio si registra una variante con lo storico (prima, dopo, motivo).")}</p>
            <Input className="h-8 bg-white text-xs" placeholder={t("Motivo della variante (es. lavori aggiuntivi richiesti dal cliente)")} value={motivoVariante} onChange={(e) => setMotivoVariante(e.target.value)} />
          </div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("Commessa *")}</Label>
              <Select disabled={baseCongelata} value={form.order_id} onValueChange={(v) => setForm((p) => ({ ...p, order_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Scegli la commessa")} /></SelectTrigger>
                <SelectContent>{commesse.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_code ? `${o.order_code} · ` : ""}{o.description ?? ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("Lavori affidati *")}</Label><Textarea rows={2} {...campo("descrizione_lavori")} placeholder={t("es. Montaggio e smontaggio del ponteggio di facciata")} /></div>
            <div className="space-y-1"><Label>{t("Numero contratto")}</Label><Input {...campo("numero_contratto")} /></div>
            <div className="space-y-1"><Label>{t("Data di stipula")}</Label><Input type="date" {...campo("data_stipula")} /></div>
            <div className="space-y-1"><Label>{t("Importo lavori (€) *")}</Label><Input inputMode="decimal" {...campo("importo_contrattuale")} placeholder="0,00" /></div>
            <div className="space-y-1"><Label>{t("Oneri della sicurezza (€)")}</Label><Input inputMode="decimal" {...campo("oneri_sicurezza")} placeholder={t("Non soggetti a ribasso")} /></div>
            <div className="space-y-1"><Label>{t("Ritenuta di garanzia (%)")}</Label><Input inputMode="decimal" {...campo("ritenuta_garanzia_pct")} /></div>
            <div className="space-y-1"><Label>{t("Acconto (€)")}</Label><Input inputMode="decimal" {...campo("acconto_importo")} placeholder={t("Se il contratto lo prevede")} />
              <p className="text-[11px] text-muted-foreground">{t("Si fattura senza SAL e si scala dai SAL, in proporzione al valore del contratto; l'ultimo SAL recupera il resto.")}</p></div>
            <div className="space-y-1"><Label>{t("Garanzia (mesi dalla fine lavori)")}</Label><Input inputMode="numeric" {...campo("durata_garanzia_mesi")} /></div>
            <div className="space-y-1"><Label>{t("Inizio lavori")}</Label><Input type="date" {...campo("data_inizio")} /></div>
            <div className="space-y-1"><Label>{t("Fine lavori prevista")}</Label><Input type="date" {...campo("data_fine_prevista")} /></div>
            <div className="space-y-1"><Label>{t("Rappresentante legale della tua impresa")}</Label><Input {...campo("responsabile_impresa")} placeholder={t("Chi firma il contratto per te (compare come «rappresentata da»)")} /></div>
            <div className="space-y-1"><Label>{t("Responsabile in cantiere del subappaltatore")}</Label><Input {...campo("referente_subappaltatore")} /></div>
            <div className="space-y-1">
              <Label>{t("Stato")}</Label>
              <Select value={form.stato} onValueChange={(v) => setForm((p) => ({ ...p, stato: v as ContrattoCompleto["stato"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(STATI) as ContrattoCompleto["stato"][]).map((s) => <SelectItem key={s} value={s}>{t(STATI[s].label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("Obblighi e responsabilità specifici")}</Label><Textarea rows={2} {...campo("obblighi")} placeholder={t("es. fornitura dei materiali, pulizia giornaliera, smaltimento dei rifiuti")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("Pagamenti")}</Label><Textarea rows={2} {...campo("modalita_pagamento")} placeholder={t("Vuoto = standard: SAL dall'elenco pagamenti, fattura pagata entro 7 giorni lavorativi")} /></div>
            <div className="space-y-1"><Label>{t("Penali")}</Label><Textarea rows={2} {...campo("penali")} placeholder={t("Vuoto = standard: 200 €/giorno fino al 10° giorno, poi 400 €/giorno")} /></div>
            <div className="space-y-1"><Label>{t("Garanzie e polizze")}</Label><Textarea rows={2} {...campo("garanzie")} placeholder={t("Si aggiunge alle garanzie di legge (polizza RC minimo 500.000 €)")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("Altre pattuizioni")}</Label><Textarea rows={2} {...campo("note")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={salva.isPending}>{t("Annulla")}</Button>
            <Button onClick={() => salva.mutate()} disabled={salva.isPending}>{salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("Salva")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {collega && contrattoCollegamento && (
        <CollegaFatturaSalSubDialog
          contesto={{
            contratto: { ...contrattoCollegamento, piva: sub.piva },
            altriContratti: contratti.filter(c => c.id !== contrattoCollegamento.id).map(c => ({ ...c, piva: sub.piva })),
            sal: sal.filter(s => s.contratto_id === contrattoCollegamento.id),
            collegate: fatture.filter(f => f.contratto_subappalto_id === contrattoCollegamento.id),
          }}
          disponibili={fattureLibere}
          salIniziale={collega.salId}
          fatturaIniziale={collega.fattura}
          onConferma={async scelta => {
            await collegaFattura.mutateAsync({ ...scelta, contrattoId: contrattoCollegamento.id });
          }}
          onChiudi={() => setCollega(null)}
        />
      )}

      {/* Invio per la firma elettronica */}
      <Dialog open={!!invio} onOpenChange={(v) => { if (!v && !inviaInFirma.isPending) setInvio(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Invia il contratto per la firma")}</DialogTitle>
            <DialogDescription>
              {t("Il subappaltatore riceve per email il link al contratto in PDF: lo legge, accetta con una spunta e firma con un codice che gli arriva per email o, se metti il cellulare, per SMS. A firma fatta il contratto risulta firmato da solo.")}
            </DialogDescription>
          </DialogHeader>
          {invio && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>{t("Chi firma per il subappaltatore")}</Label>
                <Input value={invio.nome} onChange={(e) => setInvio({ ...invio, nome: e.target.value })} placeholder={t("Nome e cognome del legale rappresentante")} /></div>
              <div className="space-y-1"><Label>Email</Label>
                <Input type="email" value={invio.email} onChange={(e) => setInvio({ ...invio, email: e.target.value })} placeholder={t("email o PEC del subappaltatore")} /></div>
              <div className="space-y-1"><Label>{t("Cellulare (per il codice via SMS)")}</Label>
                <Input type="tel" value={invio.telefono} onChange={(e) => setInvio({ ...invio, telefono: e.target.value })} placeholder={t("Facoltativo")} /></div>
              <p className="text-xs text-muted-foreground">
                {t("Si manda il contratto così com'è adesso: se devi cambiare qualcosa, modificalo prima di inviarlo.")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvio(null)} disabled={inviaInFirma.isPending}>{t("Annulla")}</Button>
            <Button onClick={() => inviaInFirma.mutate()} disabled={inviaInFirma.isPending}>
              {inviaInFirma.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{t("Invia")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {computo && <LavorazioniAffidateDialog titolo={[computo.commessa?.order_code, computo.numero_contratto].filter(Boolean).join(" · ") || computo.descrizione_lavori}
        righe={computo.elenco_lavori ?? []} importoPattuito={Number(computo.importo_contrattuale)}
        oneri={Number(computo.oneri_sicurezza) || 0} onClose={() => setComputo(null)}
        onPdf={() => { setComputo(null); stampaContratto(computo); }} pdfInCorso={caricoIva} />}
      {lavoriMisure && <LavoriMisureSubDialog key={lavoriMisure.id} companyId={companyId} contratto={lavoriMisure} onApriStorico={()=>{ const cid=lavoriMisure.id; setLavoriMisure(null); onApriContabilita(cid); }} onClose={()=>{ setLavoriMisure(null); qc.invalidateQueries({ queryKey: ["contratti-con-misure"] }); qc.invalidateQueries({ queryKey: ["contratti-base-registrata"] }); }} onApriVerbale={async (id)=>{
        await apriVerbaleSal(id, lavoriMisure.id);
        setLavoriMisure(null);
      }}/>}
      {verbaleDaMisure && <VerbaleSalSubDialog key={verbaleDaMisure.id} companyId={companyId} sal={verbaleDaMisure} onClose={()=>setVerbaleDaMisure(null)} />}
      {stampa && (
        <PrintPreviewModal htmlContent={stampa.html} fileName={stampa.nome} title={stampa.nome} onDownloadPdf={stampa.pdf}
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
  const t = useT();
  const { data: contratti = [], isLoading, isError, refetch } = useContrattiSubappaltatore(subId);
  const ids = contratti.map((c) => c.id);
  const [lavorazioni, mostraLavorazioni] = useState<ContrattoCompleto | null>(null);
  const { data: sal = [], isLoading: caricoSal, isError: erroreSal, refetch: ricaricaSal } = useQuery({
    queryKey: [...chiaviContratti.salTutti(subId), ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("sal_subappaltatori" as never)
        .select("id, contratto_id, numero_sal, importo_lordo, ritenuta_importo, acconto_recuperato, importo_netto, pagato_registrato, stato").in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; contratto_id: string; numero_sal: number; importo_lordo: number; ritenuta_importo: number; importo_netto: number; pagato_registrato?: number | null; stato: string }>;
    },
    enabled: ids.length > 0,
  });
  // Fatture e ritenute dei contratti (01/11/2026): prima il riepilogo le riceveva vuote, e la scheda
  // mostrava fatturato e ritenute a zero su ogni contratto.
  const { data: ritenute = [], isLoading: caricoRitenute, isError: erroreRitenute } = useQuery({
    queryKey: ["ritenute-sub-lavori", subId, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("ritenute_garanzia" as never).select("contratto_id, importo, stato").in("contratto_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ contratto_id: string; importo: number; stato: string }>;
    },
    enabled: ids.length > 0,
  });
  const { data: fatture = [], isLoading: caricoFatture, isError: erroreFatture } = useQuery({
    queryKey: ["fatture-sub-lavori", subId, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("fatture_ricevute" as never)
        .select("id, imponibile_totale, totale_documento, tipo_documento, contratto_subappalto_id, sal_subappaltatore_id, subappalto_acconto")
        .in("contratto_subappalto_id" as never, ids as never);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; imponibile_totale: number | null; totale_documento: number | null; tipo_documento: string | null; contratto_subappalto_id: string | null; sal_subappaltatore_id: string | null; subappalto_acconto: boolean | null }>;
    },
    enabled: ids.length > 0,
  });
  const {data: firme = [], isLoading: caricoFirme, isError: erroreFirme} = useFirmeSubappalto(subId, ids);
  const righe: RigaContrattoSub[] = contratti.map(c => ({contratto:c, riepilogo:{...riepilogoContratto(c, sal.filter(s => s.contratto_id === c.id), fatture.filter(f => f.contratto_subappalto_id === c.id), ritenute.filter(r => r.contratto_id === c.id)), avvisi:[] as string[]}, firma:c.firmato_il ? 'firmato' : caricoFirme || erroreFirme ? 'non_disponibile' : ['pending','otp_verified','signed'].includes(firme.find(f => f.contratto_subappalto_id === c.id)?.status || '') ? 'in_attesa' : 'da_firmare'}));
  if (isError || erroreSal || erroreRitenute || erroreFatture) return <div role="alert" className="rounded-lg border p-4 text-sm">{t("Commesse e riepiloghi non disponibili.")} <Button variant="outline" onClick={() => {void refetch();void ricaricaSal();}}>{t("Riprova")}</Button></div>;
  if (isLoading || caricoSal || caricoRitenute || caricoFatture) return <p role="status" className="p-4 text-sm text-muted-foreground">{t("Caricamento commesse e contratti…")}</p>;
  if (!righe.length) return <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("Nessun contratto collegato. Crea un contratto per ogni commessa nella scheda Contratti.")}</p>;
  return <>
    <ElencoContrattiSub righe={righe} contesto="commesse" onApri={onApriContratto}
      onCommessa={onApriCommessa} onLavorazioni={mostraLavorazioni} />
    {lavorazioni && <LavorazioniAffidateDialog titolo={[lavorazioni.commessa?.description || lavorazioni.commessa?.order_code,
      lavorazioni.numero_contratto].filter(Boolean).join(" · ") || lavorazioni.descrizione_lavori}
      righe={lavorazioni.elenco_lavori ?? []} importoPattuito={Number(lavorazioni.importo_contrattuale)}
      oneri={Number(lavorazioni.oneri_sicurezza) || 0} onClose={() => mostraLavorazioni(null)}
      onApriContratto={() => { mostraLavorazioni(null); onApriContratto(lavorazioni.id); }} />}
  </>;
}
