/**
 * Uno spazio solo: ricerca sempre disponibile, articolo o posizioni a destra,
 * riepilogo della preparazione. Anche la modifica usa questo contenitore.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, History, Package, Plus, Ruler, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PreparazioneForniture, type TotaleFornitura } from "./PreparazioneForniture";
import { nuovaRigaPreparazione, articoloDaPreparazione, type RigaPreparazione } from "@/lib/orders/preparazioneForniture";
import { SpazioArticoliDialog } from "./SpazioArticoliDialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { caricaVociListino } from "@/lib/listino/vociListino";
import { cercaArticoli, giacenzaDi, righeUsateDistinte } from "@/lib/orders/ricercaArticoli";
import { quantitaDaCampo } from "@/lib/orders/quantitaDaCampo";
import { costoScritto } from "@/lib/orders/gruppiSuMisura";
import { VAT_RATES } from "@/lib/vatUtils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { StockItem } from "@/types/warehouse";
import type { ArticleTemplateData } from "../ArticleCombobox";
import type { OrderItem } from "../OrderItemsList";
import { SupplierSelect } from "../SupplierSelect";
import { FormSuMisura, type EsitoSuMisura, type ProdottoSuMisura } from "./FormSuMisura";

type VoceCatalogo = ArticleTemplateData & { custom_field_values?: { preparazione_articoli?: string } | null };
type VoceStock = StockItem & { warehouse?: { id: string; name: string } | null };
interface RigaRecente {
  name: string; product_code: string | null; purchase_price?: number | null; vat_rate: number | null;
  supplier_id: string | null; unita_misura: string | null; categoria: string | null; article_template_id: string | null;
}

const UNITA = ["pz", "m", "mq", "mc", "kg", "l", "h", "corpo"];

type Scelta =
  | { tipo: "normale"; nome: string; nuovo: boolean; template?: ArticleTemplateData; recente?: RigaRecente }
  | { tipo: "magazzino"; voce: VoceStock }
  | { tipo: "su_misura"; prodotto: ProdottoSuMisura; manodopera?: number | null };

export interface GruppoDaModificare {
  righe: OrderItem[];
  copiaDi?: OrderItem | null;
}

interface Props {
  open: boolean;
  onOpenChange: (aperto: boolean) => void;
  companyId: string | undefined;
  canViewCosts: boolean;
  /** La fase da cui si aggiunge (undefined = l'elenco non usa le fasi). */
  phaseId?: string | null;
  /** Falso se c'è già da decidere (doppione): il form resta com'è. */
  onAggiungiRiga: (riga: OrderItem) => boolean;
  onPrendiDaMagazzino: (voce: VoceStock, quantita: number) => void;
  onEsitoSuMisura: (esito: EsitoSuMisura) => void;
  /** Sale quando l'elenco ha risolto un doppione: si torna alla ricerca. */
  azzera: number;
  /** Se c'è, il popup si apre direttamente su questo gruppo. */
  gruppoDaModificare?: GruppoDaModificare | null;
  puoTogliereSalvate?: boolean;
  stockBloccato?: string;
  onOpenWarehouseExit?: () => void;
  onAddLabor?: (labor: { external_team_id: string; total_cost: number; notes: string }) => void;
  /** Altre strade per i materiali (computo, Silvio), in fondo alla ricerca. */
  altreFonti?: ReactNode;
  articoli?: OrderItem[];
  onModificaArticolo?: (indice: number) => void;
  /** Il form completo delle righe precedenti, nello stesso contenitore. */
  modificaArticolo?: ReactNode;
  confermaDoppione?: ReactNode;
  fornitori?: Array<{ id: string; name: string }>;
  onSalvaPreparazione?: (righe: OrderItem[], richiesta: string) => Promise<void>;
  /** Una preparazione già compilata da riprendere all'apertura; nessuna scrittura automatica. */
  preparazioneIniziale?: { righe: RigaPreparazione[]; forniture: Record<string, TotaleFornitura> };
}

function nuovoGruppoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Browser senza randomUUID (http): un v4 fatto a mano, perché la colonna è uuid.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function AggiungiArticoloDialog({
  open, onOpenChange, companyId, canViewCosts, phaseId, onPrendiDaMagazzino, onEsitoSuMisura, azzera,
  gruppoDaModificare, puoTogliereSalvate, stockBloccato, onOpenWarehouseExit, altreFonti,
  articoli = [], onModificaArticolo, modificaArticolo, confermaDoppione, fornitori = [], onSalvaPreparazione, preparazioneIniziale,
}: Props) {
  const tr = useT();
  const queryClient = useQueryClient();
  const [bozza, setBozza] = useState<RigaPreparazione[]>([]);
  const [forniture, setForniture] = useState<Record<string, TotaleFornitura>>({});
  const [fornitoreDiLavoro, setFornitoreDiLavoro] = useState<string>();
  const [salvandoBozza, setSalvandoBozza] = useState(false);
  const [chiaveInDettaglio, setChiaveInDettaglio] = useState<string | null>(null);
  const [righeGruppoBozza, setRigheGruppoBozza] = useState<OrderItem[]>([]);
  const [gruppoBozza, setGruppoBozza] = useState<string | null>(null);
  const richiestaBozza = useRef<string | null>(null);
  const [testo, setTesto] = useState("");
  const [scelta, setScelta] = useState<Scelta | null>(null);
  const [appena, setAppena] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);

  // I dati appartengono alla voce scelta: mai al fornitore della riga precedente.
  const [nome, setNome] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [unita, setUnita] = useState("pz");
  const [costo, setCosto] = useState("");
  const [iva, setIva] = useState(22);
  const [fornitore, setFornitore] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [nelCatalogo, setNelCatalogo] = useState(false);
  const [cambioInAttesa, setCambioInAttesa] = useState<(() => void) | null>(null);
  const [pagamento, setPagamento] = useState<string | undefined>();
  const [pezziMagazzino, setPezziMagazzino] = useState("1");
  const occupato = useRef(false);
  const baseCreata = useRef<string | null>(null);
  const campoQuantita = useRef<HTMLInputElement>(null);
  const campoRicerca = useRef<HTMLInputElement>(null);

  const torna = () => {
    setScelta(null);
    setChiaveInDettaglio(null);
    setGruppoBozza(null);
    baseCreata.current = null;
    setTesto("");
    setErrore(null);
    setCambioInAttesa(null);
    setNote("");
    setNelCatalogo(false);
    occupato.current = false;
    setTimeout(() => campoRicerca.current?.focus(), 0);
  };

  // Ogni apertura riparte pulita. Il fornitore e l'IVA valgono per la serie, non per sempre.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setAppena([]);
    setBozza(preparazioneIniziale?.righe ?? []);
    setForniture(preparazioneIniziale?.forniture ?? {});
    setFornitoreDiLavoro(undefined);
    richiestaBozza.current = null;
    setFornitore(undefined);
    setIva(22);
    setPagamento(undefined);
    setCambioInAttesa(null);
    setErrore(null);
    setTesto("");
    setScelta(null);
    occupato.current = false;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, preparazioneIniziale]);

  const ultimoAzzera = useRef(azzera);
  useEffect(() => {
    if (azzera === ultimoAzzera.current) return;
    ultimoAzzera.current = azzera;
    // L'elenco ha deciso il doppione: l'inserimento è finito, si torna a cercare.
     
    torna();
  }, [azzera]);

  const { data: magazzino = [], isError: erroreMagazzino } = useQuery({
    queryKey: ["popup-articoli-magazzino", companyId],
    enabled: !!companyId && open,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity, quantity_available, quantity_reserved, unita_misura, unit_cost, vat_rate, supplier_id, tracking_mode, internal_code, barcode, description, warehouse:warehouse_id(id, name)")
        .eq("company_id", companyId!)
        .order("quantity", { ascending: false })
        .order("name")
        .limit(500);
      if (error) throw error;
      return data as unknown as VoceStock[];
    },
  });

  const { data: catalogo = [], isError: erroreCatalogo } = useQuery({
    queryKey: ["popup-articoli-catalogo", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description, immagine_url, pdf_scheda_url, family_id, custom_field_values")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("name");
      if (error) throw error;
      return data as VoceCatalogo[];
    },
  });

  const { data: listino = [], isError: erroreListino } = useQuery({
    queryKey: ["popup-articoli-listino", companyId],
    enabled: !!companyId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => caricaVociListino(companyId!, { suMisuraIntero: true, uso: "acquisto" }),
  });

  const { data: recentiGrezzi = [] } = useQuery({
    queryKey: ["popup-articoli-recenti", companyId, canViewCosts],
    enabled: !!companyId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const costi = canViewCosts ? "purchase_price, " : "";
      const { data, error } = await supabase
        .from("order_items")
        .select(`name, product_code, ${costi}vat_rate, supplier_id, unita_misura, categoria, article_template_id, orders!inner(company_id)`)
        .eq("orders.company_id", companyId!)
        .eq("natura_riga", "materiale")
        // Il su misura non ha un «ultimo prezzo»: ogni finestra ha le sue misure.
        .is("gruppo_id", null)
        .is("family_id", null)
        .is("stock_item_id", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as RigaRecente[];
    },
  });

  const voci = useMemo(() => [
    ...catalogo.map((t) => ({ ...t, su_misura: t.custom_field_values?.preparazione_articoli === "su_misura", source: "catalog" as const })),
    ...listino,
  ], [catalogo, listino]);
  const recenti = useMemo(() => righeUsateDistinte(recentiGrezzi), [recentiGrezzi]);
  const risultati = useMemo(() => cercaArticoli(testo, magazzino, voci, recenti), [testo, magazzino, voci, recenti]);
  const richiedi = (azione: () => void) => {
    if (occupato.current) return;
    const esegui = () => { setChiaveInDettaglio(null); setGruppoBozza(null); azione(); };
    if (scelta) setCambioInAttesa(() => esegui);
    else esegui();
  };
  const chiudi = (aperto: boolean) => {
    if (occupato.current) return;
    if (aperto) onOpenChange(true);
    else if (scelta || bozza.length) setCambioInAttesa(() => () => { setBozza([]); onOpenChange(false); });
    else onOpenChange(false);
  };

  // Scelte: ognuna prepara il form e porta il cursore sulla quantità.
  const scegliNormale = (sceltaNuova: Extract<Scelta, { tipo: "normale" }>) => {
    const t = sceltaNuova.template, r = sceltaNuova.recente;
    const costo = t?.standard_cost ?? r?.purchase_price;
    const prezzoNoto = costo != null && costo > 0;
    const articolo: OrderItem = { name: sceltaNuova.nome, quantity: 1, status: "da_ordinare", position: 0,
      unita_misura: t?.unit_of_measure ?? r?.unita_misura ?? "pz", vat_rate: t?.vat_rate ?? r?.vat_rate ?? 22,
      supplier_id: t?.supplier_id ?? r?.supplier_id ?? fornitoreDiLavoro,
      purchase_price: prezzoNoto ? costo : 0, prezzo_da_definire: !prezzoNoto, prezzo_fonte: prezzoNoto ? t ? "listino" : "ultimo_acquisto" : null,
      standard_cost: t?.standard_cost ?? 0, description: t?.description ?? undefined,
      article_template_id: t?.source === "listino" ? null : t?.id ?? r?.article_template_id ?? null,
      family_id: t?.family_id ?? null, product_code: t?.sku ?? r?.product_code ?? null, categoria: t?.category ?? r?.categoria ?? null,
      ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
    };
    setBozza(prima => [...prima, nuovaRigaPreparazione(articolo, nuovoGruppoId())]);
    setScelta(null); setTesto(""); setErrore(null); setCambioInAttesa(null);
    setTimeout(() => campoRicerca.current?.focus(), 0);
  };

  const dettaglioBozza = (chiave: string) => {
    const r = bozza.find(r => r.chiave === chiave); if (!r) return;
    const a = articoloDaPreparazione(r);
    if (!["pz","cad"].includes((a.unita_misura || "pz").toLowerCase()) || !Number.isInteger(a.quantity)) throw new Error(tr("Le posizioni sono in pezzi interi. Mantieni il materiale con la sua unità e aggiungi un bene su misura separato."));
    setChiaveInDettaglio(chiave); setGruppoBozza(a.gruppo_id ?? null);
    setRigheGruppoBozza(a.gruppo_id ? bozza.filter(x => x.articolo.gruppo_id === a.gruppo_id).map(x => ({...articoloDaPreparazione(x),id:x.chiave})) : []);
    setScelta({ tipo: "su_misura", prodotto: { nome:a.name, familyId:a.family_id, templateId:a.article_template_id, supplierId:a.supplier_id, iva:a.vat_rate,
      categoria:a.categoria, codice:a.product_code, descrizione:a.description, costoIniziale:a.prezzo_da_definire ? null : a.purchase_price, pezziIniziali:Number.isInteger(a.quantity) ? a.quantity : 1 } });
  };

  const dettagliBozza = (chiave: string) => {
    const r = bozza.find(x => x.chiave === chiave); if (!r) return;
    const a = articoloDaPreparazione(r);
    setChiaveInDettaglio(chiave); setGruppoBozza(null);
    setNome(a.name); setQuantita(String(a.quantity)); setUnita(a.unita_misura || "pz");
    setCosto(a.prezzo_da_definire ? "" : String(a.purchase_price ?? "")); setIva(a.vat_rate ?? 22);
    setFornitore(a.supplier_id); setNote(a.description ?? ""); setNelCatalogo(false);
    setScelta({tipo:"normale",nome:a.name,nuovo:!a.article_template_id && !a.family_id});
  };

  const salvaBozza = async () => {
    if (occupato.current || salvandoBozza || !bozza.length) return;
    if (!onSalvaPreparazione) throw new Error(tr("Il salvataggio della preparazione non è disponibile in questa vista."));
    const righe = bozza.map(articoloDaPreparazione);
    richiestaBozza.current ??= nuovoGruppoId();
    setSalvandoBozza(true); occupato.current = true;
    try { await onSalvaPreparazione(righe, richiestaBozza.current); setBozza([]); richiestaBozza.current = null; }
    finally { setSalvandoBozza(false); occupato.current = false; }
  };

  const scegliListino = (v: ArticleTemplateData) => {
    if (v.su_misura) {
      baseCreata.current = null;
      setNelCatalogo(false);
      setScelta({
        tipo: "su_misura",
        manodopera: v.manodopera_costo,
        prodotto: { nome: v.name, familyId: v.source === "listino" ? v.family_id ?? v.id : v.family_id ?? null, templateId: v.source === "catalog" ? v.id : null, categoria: v.category, codice: v.sku, supplierId: v.supplier_id ?? fornitoreDiLavoro, iva: v.vat_rate },
      });
      return;
    }
    scegliNormale({ tipo: "normale", nome: v.name, nuovo: false, template: v });
  };

  const scegliMagazzino = (v: VoceStock) => {
    setPezziMagazzino("1");
    setScelta({ tipo: "magazzino", voce: v });
    setErrore(null);
    setTimeout(() => { campoQuantita.current?.focus(); campoQuantita.current?.select(); }, 0);
  };

  const confermaNormale = async () => {
    if (occupato.current || scelta?.tipo !== "normale") return;
    const q = quantitaDaCampo(quantita);
    const prezzoScritto = costo.trim() ? costoScritto(costo) : 0;
    if (!nome.trim()) { setErrore(tr("Scrivi il nome dell'articolo.")); return; }
    if (!Number.isFinite(q) || q <= 0) { setErrore(tr("La quantità deve essere maggiore di zero.")); return; }
    if (prezzoScritto == null || prezzoScritto < 0) { setErrore(tr("Il costo non è un numero valido.")); return; }
    occupato.current = true;
    setErrore(null);
    const originale = bozza.find(r => r.chiave === chiaveInDettaglio)?.articolo;
    let templateId = scelta.template?.source === "listino" ? null : scelta.template?.id ?? scelta.recente?.article_template_id ?? originale?.article_template_id ?? null;
    if (scelta.nuovo && nelCatalogo && companyId) {
      const { data, error } = await supabase.from("article_templates")
        .insert({ company_id: companyId, name: nome.trim(), unit_of_measure: unita.trim() || "pz", vat_rate: iva, supplier_id: fornitore ?? null, ...(canViewCosts ? { standard_cost: prezzoScritto } : {}) })
        .select("id").single();
      if (error) { occupato.current = false; setErrore(tr("Non riesco a salvare nel catalogo. Riprova oppure scegli Solo per questa commessa.")); return; }
      else {
        templateId = data.id;
        queryClient.invalidateQueries({ queryKey: ["article-templates"] });
        queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
        void queryClient.invalidateQueries({ queryKey: ["popup-articoli-catalogo", companyId] });
      }
    }
    const t = scelta.template;
    const riga: OrderItem = {
      ...(bozza.find(r => r.chiave === chiaveInDettaglio)?.articolo ?? {}),
      name: nome.trim(),
      description: note.trim() || undefined,
      quantity: q,
      unita_misura: unita.trim() || null,
      status: "da_ordinare",
      position: 0,
      supplier_id: fornitore,
      purchase_price: prezzoScritto,
      prezzo_fonte: !costo.trim() ? null : t && Number(t.standard_cost) === prezzoScritto && (t.supplier_id ?? undefined) === fornitore ? "listino" : "manuale",
      vat_rate: iva,
      standard_cost: t && t.standard_cost > 0 ? t.standard_cost : 0,
      article_template_id: templateId,
      product_code: t?.sku ?? scelta.recente?.product_code ?? originale?.product_code ?? null,
      categoria: t?.category ?? scelta.recente?.categoria ?? originale?.categoria ?? null,
      payment_method: pagamento,
      is_paid: false,
      deposit_amount: 0, deposit_paid: false, balance_amount: 0, balance_paid: false,
      unit_price: 0, discount_percent: 0,
      posizioni: null,
      ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
    };
    setBozza(prima => chiaveInDettaglio ? prima.map(r => r.chiave === chiaveInDettaglio ? nuovaRigaPreparazione({...riga,preparazione_prezzo:undefined},r.chiave) : r) : [...prima, nuovaRigaPreparazione(riga, nuovoGruppoId())]);
    setAppena((a) => [riga.name, ...a].slice(0, 5));
    torna();
  };

  const confermaMagazzino = () => {
    if (occupato.current || scelta?.tipo !== "magazzino") return;
    const voce = scelta.voce;
    if (stockBloccato || voce.tracking_mode === "serialized") return;
    const q = Number(pezziMagazzino.trim().replace(",", "."));
    if (!Number.isInteger(q) || q <= 0) { setErrore(tr("La quantità da prelevare è un numero intero maggiore di zero.")); return; }
    const disponibili = voce.quantity_available ?? voce.quantity;
    if (q > disponibili) { setErrore(tr("In magazzino ce ne sono {n} disponibili.", { n: disponibili })); return; }
    occupato.current = true;
    onPrendiDaMagazzino(voce, q);
    setAppena((a) => [voce.name, ...a].slice(0, 5));
    torna();
  };

  const invio = (azione: () => void | Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void azione(); }
  };

  const gruppoId = useMemo(() => nuovoGruppoId(), [open, scelta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo stesso articolo a scaffale: prima di ordinarlo, lo si dice. Segue il nome mentre lo si corregge.
  const giacenza = scelta?.tipo === "normale"
    ? giacenzaDi(nome, scelta.template?.sku ?? scelta.recente?.product_code, magazzino)
    : null;
  const titolo = gruppoDaModificare ? tr("Modifica le posizioni") : modificaArticolo ? tr("Modifica articolo") : tr("Prepara articoli");
  const inGruppo = gruppoDaModificare?.righe[0];


  const conMisure = () => {
    if (scelta?.tipo !== "normale") return;
    const t = scelta.template;
    setScelta({ tipo: "su_misura", manodopera: t?.manodopera_costo, prodotto: {
      nome: nome.trim() || "Articolo su misura", familyId: t?.family_id,
      templateId: t?.source === "listino" ? null : t?.id ?? scelta.recente?.article_template_id,
      categoria: t?.category, codice: t?.sku ?? scelta.recente?.product_code,
      supplierId: fornitore, iva, descrizione: note,
      costoIniziale: ["pz", "cad"].includes(unita.trim().toLowerCase()) ? costoScritto(costo) : null,
      pezziIniziali: ["pz", "cad"].includes(unita.trim().toLowerCase()) && Number.isInteger(quantitaDaCampo(quantita)) && quantitaDaCampo(quantita) > 0 ? quantitaDaCampo(quantita) : 1,
    } });
  };

  const confermaPosizioni = async (esito: EsitoSuMisura) => {
    if (scelta?.tipo !== "su_misura") return;
    const p = scelta.prodotto;
    occupato.current = true;
    try {
      if (nelCatalogo && companyId && !p.familyId && !p.templateId && esito.nuove.length > 0) {
        if (!baseCreata.current) {
          const r = esito.nuove[0];
          const { data, error } = await supabase.from("article_templates").insert({ company_id: companyId, name: p.nome, custom_field_values: { preparazione_articoli: "su_misura" }, unit_of_measure: "pz", vat_rate: r.vat_rate ?? 22, supplier_id: r.supplier_id ?? null, description: p.descrizione ?? null }).select("id").single();
          if (error || !data) throw new Error(tr("Non riesco a salvare la base nel catalogo. Riprova oppure scegli Solo per questa commessa."));
          baseCreata.current = data.id;
          void queryClient.invalidateQueries({ queryKey: ["article-templates"] });
          void queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
          void queryClient.invalidateQueries({ queryKey: ["popup-articoli-catalogo", companyId] });
        }
        esito = { ...esito, nuove: esito.nuove.map(r => ({ ...r, article_template_id: baseCreata.current })) };
      }
      setBozza(prima => {
        const sostituite = prima.map(r => {
          const aggiornamento = esito.aggiornate.find(a => a.prima === r.articolo || a.prima.id === r.chiave);
          return aggiornamento ? nuovaRigaPreparazione({...aggiornamento.dopo,id:undefined,preparazione_prezzo:undefined},r.chiave) : r;
        }).filter(r => !esito.tolte.some(t => t === r.articolo || t.id === r.chiave));
        const senzaConvertita = chiaveInDettaglio && !gruppoBozza ? sostituite.filter(r => r.chiave !== chiaveInDettaglio) : sostituite;
        return [...senzaConvertita, ...esito.nuove.map(a => nuovaRigaPreparazione(a,nuovoGruppoId()))];
      });
      setAppena(a => [tr("{nome} ({n} pos.)", { nome: p.nome, n: esito.nuove.length }), ...a].slice(0, 5));
      torna();
    } finally { occupato.current = false; }
  };

  const riepilogo = <PreparazioneForniture forniture={forniture} onFornitureChange={setForniture} righe={bozza} onChange={setBozza} articoli={articoli} fornitori={fornitori} companyId={companyId} canViewCosts={canViewCosts}
    contestoFornitore={fornitoreDiLavoro} onContestoFornitore={setFornitoreDiLavoro} onNuova={() => scegliNormale({tipo:"normale",nome:"",nuovo:true})}
    onMisure={dettaglioBozza} onDettagli={dettagliBozza} onModifica={onModificaArticolo ? indice => { if (bozza.length) setCambioInAttesa(() => () => { setBozza([]); onModificaArticolo(indice); }); else onModificaArticolo(indice); } : undefined} onSalva={salvaBozza} salvando={salvandoBozza} />;

  return <SpazioArticoliDialog open={open} onOpenChange={chiudi} titolo={titolo}
    descrizione={tr("Scegli dal listino, usa il magazzino o prepara una nuova fornitura. Per i beni su misura aggiungi le singole posizioni.")}
    avviso={cambioInAttesa && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="min-w-0 flex-1">{tr("La preparazione contiene modifiche non salvate. Puoi continuare a compilarla oppure scartare il passaggio in corso.")}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setCambioInAttesa(null)}>{tr("Continua a compilare")}</Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => { const azione = cambioInAttesa; setCambioInAttesa(null); azione(); }}>{tr("Scarta e prosegui")}</Button>
    </div>}
    ricerca={<div className="space-y-4">
      {gruppoDaModificare || modificaArticolo || confermaDoppione ? <div className="rounded-lg border bg-background p-4 text-sm">
        <p className="font-medium">{tr("Modifica della preparazione")}</p><p className="mt-1 text-muted-foreground">{tr("Salva o annulla le modifiche prima di aggiungere altri articoli. I dati già collegati a ordini e consegne restano conservati.")}</p>
      </div> : <>
                    <Command shouldFilter={false} className="rounded-md border bg-background">
              <CommandInput aria-label={tr("Cerca o scrivi il nome dell’articolo")} ref={campoRicerca} autoFocus value={testo} onValueChange={setTesto} placeholder={tr("Cerca o scrivi il nome dell'articolo…")} />
              <CommandList className="max-h-56 md:max-h-[48dvh]">
                {erroreCatalogo && <p role="alert" className="px-3 py-2 text-xs text-red-700">{tr("Catalogo non disponibile. Chiudi e riapri per riprovare.")}</p>}
                {erroreListino && <p role="alert" className="px-3 py-2 text-xs text-red-700">{tr("Listino non disponibile. Riprova prima di scegliere un prodotto.")}</p>}
                {erroreMagazzino && <p role="alert" className="px-3 py-2 text-xs text-red-700">{tr("Disponibilità del magazzino non verificabile. Riprova prima di prelevare.")}</p>}
                <CommandGroup heading={tr("In magazzino")}>
                  {risultati.magazzino.voci.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">{testo.trim() ? tr("Niente in magazzino con questo nome.") : magazzino.length === 0 ? tr("Il magazzino è vuoto.") : ""}</p>
                  )}
                  {risultati.magazzino.voci.map((s) => (
                    <CommandItem key={s.id} value={`mag:${s.id}`} onSelect={() => richiedi(() => scegliMagazzino(s))} className="flex-wrap items-start gap-x-2 gap-y-0.5">
                      <Warehouse className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 whitespace-normal break-words">{s.name}</span>
                      <span className={(s.quantity_available ?? s.quantity) > 0 ? "w-full pl-6 text-xs text-muted-foreground" : "w-full pl-6 text-xs text-destructive"}>
                        {(s.quantity_available ?? s.quantity) > 0 ? tr("{n} disp.", { n: s.quantity_available ?? s.quantity }) : tr("esaurito")}{s.warehouse?.name ? ` · ${s.warehouse.name}` : ""}{canViewCosts && s.unit_cost > 0 ? ` · ${formatCurrency(s.unit_cost)}` : ""}
                      </span>
                      {s.tracking_mode === "serialized" && <Badge variant="secondary" className="h-4 px-1 text-[9px]">SN</Badge>}
                    </CommandItem>
                  ))}
                  {risultati.magazzino.altri > 0 && <p className="px-2 py-1 text-[11px] text-muted-foreground">{tr("Altri {n}: continua a scrivere", { n: risultati.magazzino.altri })}</p>}
                </CommandGroup>
                {risultati.listino.voci.length > 0 && (
                  <CommandGroup heading={tr("Dal listino")}>
                    {risultati.listino.voci.map((v) => (
                      <CommandItem key={`${v.source}:${v.id}`} value={`lis:${v.source}:${v.id}`} onSelect={() => richiedi(() => scegliListino(v))} className="flex-wrap items-start gap-x-2 gap-y-0.5">
                        {v.su_misura ? <Ruler className="h-4 w-4 shrink-0 text-blue-600" aria-hidden /> : <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{v.name}{v.sku ? <span className="ml-1 text-[10px] text-muted-foreground">({v.sku})</span> : null}</span>
                        {!v.su_misura && (() => {
                          const aScaffale = giacenzaDi(v.name, v.sku, magazzino);
                          return aScaffale ? <Badge variant="outline" className="h-5 shrink-0 border-amber-300 px-1.5 text-[10px] text-amber-800">{tr("{n} in magazzino", { n: aScaffale.quantity })}</Badge> : null;
                        })()}
                        {v.su_misura
                          ? <Badge variant="outline" className="h-5 shrink-0 border-blue-300 px-1.5 text-[10px] text-blue-700">{tr("Su misura")}</Badge>
                          : canViewCosts && v.standard_cost > 0 && <span className="w-full pl-6 text-xs text-muted-foreground">{formatCurrency(v.standard_cost)} / {v.unit_of_measure || "pz"}</span>}
                      </CommandItem>
                    ))}
                    {risultati.listino.altri > 0 && <p className="px-2 py-1 text-[11px] text-muted-foreground">{tr("Altri {n}: continua a scrivere", { n: risultati.listino.altri })}</p>}
                  </CommandGroup>
                )}
                {risultati.recenti.voci.length > 0 && (
                  <CommandGroup heading={tr("Usati di recente")}>
                    {risultati.recenti.voci.map((r) => (
                      <CommandItem key={r.chiave} value={`rec:${r.chiave}`} onSelect={() => richiedi(() => scegliNormale({ tipo: "normale", nome: r.name, nuovo: false, recente: r }))} className="flex-wrap items-start gap-x-2 gap-y-0.5">
                        <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{r.name}</span>
                        {canViewCosts && !!r.purchase_price && <span className="w-full pl-6 text-xs text-muted-foreground">{formatCurrency(Number(r.purchase_price))}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {risultati.nuovo && (
                  <CommandGroup heading={tr("Nuovo")}>
                    <CommandItem value="nuovo:normale" onSelect={() => richiedi(() => scegliNormale({ tipo: "normale", nome: risultati.nuovo!, nuovo: true }))} className="gap-2 text-primary">
                      <Plus className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">{tr("Aggiungi «{nome}»", { nome: risultati.nuovo })}</span>
                    </CommandItem>
                    {(
                      <CommandItem value="nuovo:misura" onSelect={() => richiedi(() => setScelta({ tipo: "su_misura", prodotto: { nome: risultati.nuovo!, supplierId: fornitoreDiLavoro } }))} className="flex-wrap items-start gap-x-2 gap-y-0.5">
                        <Ruler className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">{tr("Aggiungi «{nome}» su misura, con le posizioni", { nome: risultati.nuovo })}</span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
                <CommandEmpty className="px-3 py-3 text-xs text-muted-foreground">{tr("Scrivi un nome per cominciare.")}</CommandEmpty>
              </CommandList>
            </Command>
        <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => richiedi(() => scegliNormale({ tipo: "normale", nome: testo.trim(), nuovo: true }))}><Plus className="h-4 w-4" />{tr("Nuovo articolo")}</Button>
        <p className="text-xs leading-relaxed text-muted-foreground">{tr("Con misure: infissi, tapparelle, zanzariere, cassonetti, persiane, porte e altre forniture. A quantità: cemento, lastre, profili e consumabili.")}</p>
        {altreFonti && <div className="flex flex-wrap items-center gap-2 border-t pt-3">{altreFonti}</div>}
      </>}
      {appena.length > 0 && <p className="flex items-start gap-1.5 text-xs text-emerald-700" aria-live="polite"><Check className="h-4 w-4 shrink-0" />{tr("Aggiunti: {elenco}", { elenco: appena.join(", ") })}</p>}
      <Button type="button" variant="ghost" className="w-full" onClick={() => chiudi(false)}>{tr("Chiudi preparazione")}</Button>
    </div>}>
    {confermaDoppione ? confermaDoppione : modificaArticolo ? modificaArticolo : gruppoDaModificare && inGruppo ? <>
      <h3 className="mb-4 text-lg font-semibold">{inGruppo.name}</h3>
      <FormSuMisura key={inGruppo.gruppo_id ?? "gruppo"} gruppoId={inGruppo.gruppo_id!} companyId={companyId}
        prodotto={{ nome: inGruppo.name, templateId: inGruppo.article_template_id, familyId: inGruppo.family_id, categoria: inGruppo.categoria, codice: inGruppo.product_code, supplierId: inGruppo.supplier_id, iva: inGruppo.vat_rate }}
        righeEsistenti={gruppoDaModificare.righe} copiaDi={gruppoDaModificare.copiaDi} puoTogliereSalvate={puoTogliereSalvate} canViewCosts={canViewCosts}
        onAnnulla={() => onOpenChange(false)} onConferma={esito => { onEsitoSuMisura(esito); onOpenChange(false); }} />
    </> : !scelta ? riepilogo : <div className="space-y-5">
      {scelta.tipo !== "magazzino" && <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tr("Preparazione articolo")}</p><h3 className="mt-1 break-words text-lg font-semibold">{scelta.tipo === "su_misura" ? scelta.prodotto.nome : nome || tr("Nuovo articolo")}</h3></div>
        <RadioGroup aria-label={tr("Tipo di preparazione")} value={scelta.tipo === "su_misura" ? "misure" : "quantita"} onValueChange={v => {
          if (v === "misure") conMisure();
          else if (scelta.tipo === "su_misura") richiedi(() => { if (chiaveInDettaglio || gruppoBozza) torna(); else scegliNormale({ tipo: "normale", nome: scelta.prodotto.nome, nuovo: true }); });
        }} className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="quantita" />{tr("A quantità")}</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="misure" />{tr("Con misure")}</label>
        </RadioGroup>
      </div>}
      {scelta.tipo === "su_misura" && <FormSuMisura key={gruppoId} gruppoId={gruppoBozza ?? gruppoId} prodotto={scelta.prodotto} companyId={companyId} canViewCosts={canViewCosts} phaseId={phaseId}
        righeEsistenti={gruppoBozza ? righeGruppoBozza : undefined}
        puoTogliereSalvate
        extra={<div className="space-y-3">
          {!scelta.prodotto.familyId && !scelta.prodotto.templateId && <RadioGroup value={nelCatalogo ? "catalogo" : "commessa"} onValueChange={v => setNelCatalogo(v === "catalogo")} className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="commessa" />{tr("Solo per questa commessa")}</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="catalogo" disabled={!companyId} />{tr("Salva una base nel catalogo")}</label>
          </RadioGroup>}
        </div>} onAnnulla={torna} onConferma={confermaPosizioni} />}
      {scelta.tipo === "magazzino" && <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Warehouse className="h-5 w-5" />{scelta.voce.name}</h3>
        <p className="text-sm text-muted-foreground">{tr("Disponibili {n} {unita}", { n: scelta.voce.quantity_available ?? scelta.voce.quantity, unita: scelta.voce.unita_misura || "pz" })}{scelta.voce.warehouse?.name ? ` ${tr("in {magazzino}", { magazzino: scelta.voce.warehouse.name })}` : ""}{canViewCosts && scelta.voce.unit_cost > 0 ? ` · ${tr("{importo} cad.", { importo: formatCurrency(scelta.voce.unit_cost) })}` : ""}</p>
        {stockBloccato || scelta.voce.tracking_mode === "serialized" ? <div className="space-y-2">
          <p role="alert" className="text-sm text-amber-800">{stockBloccato ?? tr("Questo articolo ha le matricole: si scarica da Magazzino → Uscita merce, scegliendo quali.")}</p>
          {onOpenWarehouseExit && <Button type="button" variant="outline" onClick={() => { onOpenChange(false); onOpenWarehouseExit(); }}>{tr("Apri uscita merce per questa commessa")}</Button>}
        </div> : <div className="flex flex-wrap items-end gap-2">
          <div className="w-28 space-y-1"><Label htmlFor="pezzi-magazzino">{tr("Quantità")}</Label><Input id="pezzi-magazzino" ref={campoQuantita} inputMode="numeric" value={pezziMagazzino} onChange={e => setPezziMagazzino(e.target.value)} onKeyDown={e => invio(confermaMagazzino)(e)} /></div>
          <Button type="button" onClick={confermaMagazzino}>{tr("Preleva")}</Button>
          <Button type="button" variant="outline" onClick={torna}>{tr("Annulla")}</Button>
        </div>}
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      </div>}
      {scelta.tipo === "normale" && <div className="space-y-4">
        {giacenza && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>{giacenza.warehouse?.name ? tr("Ce l'hai già in magazzino: {n} disponibili in {magazzino}.", { n: giacenza.quantity_available ?? giacenza.quantity, magazzino: giacenza.warehouse.name }) : tr("Ce l'hai già in magazzino: {n} disponibili.", { n: giacenza.quantity_available ?? giacenza.quantity })}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => scegliMagazzino(giacenza)}>{tr("Prendi dal magazzino")}</Button>
        </div>}
        <div className="space-y-1"><Label htmlFor="nome-articolo">{tr("Nome")}</Label><Input id="nome-articolo" value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => invio(confermaNormale)(e)} placeholder={tr("Nome dell’articolo")} /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="quantita-articolo">{tr("Quantità")}</Label><Input id="quantita-articolo" ref={campoQuantita} inputMode="decimal" value={quantita} onChange={e => setQuantita(e.target.value)} onKeyDown={e => invio(confermaNormale)(e)} /></div>
          <div className="space-y-1"><Label htmlFor="unita-articolo">{tr("Unità")}</Label><Input id="unita-articolo" list="unita-articolo-elenco" value={unita} onChange={e => setUnita(e.target.value)} onKeyDown={e => invio(confermaNormale)(e)} /><datalist id="unita-articolo-elenco">{UNITA.map(u => <option key={u} value={u} />)}</datalist></div>
          {canViewCosts && <div className="col-span-2 space-y-1 sm:col-span-1"><Label htmlFor="costo-articolo">{tr("Costo cad. €")}</Label><Input id="costo-articolo" inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} onKeyDown={e => invio(confermaNormale)(e)} placeholder={tr("Da definire")} /><p className="text-xs text-muted-foreground">{scelta.template ? tr("Proposto dal listino") : scelta.recente ? tr("Ultimo costo utilizzato, da verificare") : tr("Costo unitario previsto")}</p></div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="min-w-0 space-y-1"><Label>{tr("Fornitore")}</Label><SupplierSelect searchable inlineCreate value={fornitore} onValueChange={id => { if (id !== fornitore) setCosto(""); setFornitore(id); setPagamento(undefined); }} fallbackCompanyId={companyId} />
            <p className="text-xs text-muted-foreground">{fornitore ? tr("Proposto dall’articolo. Se cambi fornitore, verifica il nuovo costo.") : tr("Puoi scegliere il fornitore anche in seguito.")}</p></div>
          <div className="space-y-1"><Label htmlFor="iva-articolo">{tr("IVA acquisto")}</Label><Select value={String(iva)} onValueChange={v => setIva(Number(v))}><SelectTrigger id="iva-articolo"><SelectValue /></SelectTrigger><SelectContent>{VAT_RATES.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-1"><Label htmlFor="note-articolo">{tr("Note e specifiche")}</Label><Textarea id="note-articolo" value={note} onChange={e => setNote(e.target.value)} placeholder={tr("Caratteristiche da comunicare al fornitore…")} rows={2} /></div>
        {scelta.nuovo && <RadioGroup value={nelCatalogo ? "catalogo" : "commessa"} onValueChange={v => setNelCatalogo(v === "catalogo")} className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="commessa" />{tr("Solo per questa commessa")}</label><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="catalogo" disabled={!companyId} />{tr("Salva nel catalogo")}</label>
        </RadioGroup>}
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">{canViewCosts && costo.trim() && costoScritto(costo) != null ? tr("Totale previsto: {importo}", { importo: formatCurrency((quantitaDaCampo(quantita) || 0) * costoScritto(costo)!) }) : tr("Completa i dati e aggiungi alla commessa.")}</p>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={torna}>{tr("Annulla")}</Button><Button type="button" onClick={() => void confermaNormale()}>{tr("Aggiungi")}</Button></div>
        </div>
      </div>}
    </div>}
  </SpazioArticoliDialog>;
}
