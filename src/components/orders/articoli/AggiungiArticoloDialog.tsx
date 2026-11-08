/**
 * «Aggiungi articolo»: una ricerca sola, con i risultati a gruppi (In magazzino,
 * Dal listino, Usati di recente, Aggiungi «…»). Scelto un risultato si compila
 * su una riga e con Invio si torna alla ricerca; il su misura apre l'elenco delle
 * posizioni. La modifica di un articolo normale resta nell'altra finestra.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, History, Package, Plus, Ruler, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import type { StockItem } from "@/types/warehouse";
import type { ArticleTemplateData } from "../ArticleCombobox";
import type { OrderItem } from "../OrderItemsList";
import { SupplierSelect } from "../SupplierSelect";
import { FormSuMisura, type EsitoSuMisura, type ProdottoSuMisura } from "./FormSuMisura";

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
  open, onOpenChange, companyId, canViewCosts, phaseId, onAggiungiRiga, onPrendiDaMagazzino, onEsitoSuMisura, azzera,
  gruppoDaModificare, puoTogliereSalvate, stockBloccato, onOpenWarehouseExit, onAddLabor, altreFonti,
}: Props) {
  const queryClient = useQueryClient();
  const [testo, setTesto] = useState("");
  const [scelta, setScelta] = useState<Scelta | null>(null);
  const [appena, setAppena] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);

  // Campi dell'articolo normale. Fornitore e IVA restano fra un inserimento e l'altro:
  // il caso tipico è la bolla di un fornitore con otto articoli.
  const [nome, setNome] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [unita, setUnita] = useState("pz");
  const [costo, setCosto] = useState("");
  const [iva, setIva] = useState(22);
  const [fornitore, setFornitore] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [nelCatalogo, setNelCatalogo] = useState(false);
  const [dettagli, setDettagli] = useState(false);
  const [pagamento, setPagamento] = useState<string | undefined>();
  const [posa, setPosa] = useState(false);
  const [squadra, setSquadra] = useState<string | undefined>();
  const [pezziMagazzino, setPezziMagazzino] = useState("1");
  const occupato = useRef(false);
  const campoQuantita = useRef<HTMLInputElement>(null);
  const campoRicerca = useRef<HTMLInputElement>(null);

  const torna = () => {
    setScelta(null);
    setTesto("");
    setErrore(null);
    setPosa(false);
    setSquadra(undefined);
    setDettagli(false);
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
    setFornitore(undefined);
    setIva(22);
    setErrore(null);
    setTesto("");
    setScelta(null);
    occupato.current = false;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  const ultimoAzzera = useRef(azzera);
  useEffect(() => {
    if (azzera === ultimoAzzera.current) return;
    ultimoAzzera.current = azzera;
    // L'elenco ha deciso il doppione: l'inserimento è finito, si torna a cercare.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    torna();
  }, [azzera]);

  const { data: magazzino = [] } = useQuery({
    queryKey: ["popup-articoli-magazzino", companyId],
    enabled: !!companyId && open,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity, unit_cost, vat_rate, supplier_id, tracking_mode, internal_code, barcode, description, warehouse:warehouse_id(id, name)")
        .eq("company_id", companyId!)
        .order("quantity", { ascending: false })
        .order("name")
        .limit(500);
      if (error) throw error;
      return data as unknown as VoceStock[];
    },
  });

  const { data: catalogo = [], isError: erroreCatalogo } = useQuery({
    queryKey: ["article-templates", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description, immagine_url, pdf_scheda_url")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("name");
      if (error) throw error;
      return data as ArticleTemplateData[];
    },
  });

  const { data: listino = [] } = useQuery({
    queryKey: ["popup-articoli-listino", companyId],
    enabled: !!companyId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => caricaVociListino(companyId!, { suMisuraIntero: true }),
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

  const { data: squadre = [] } = useQuery({
    queryKey: ["external-teams-for-posa", companyId],
    enabled: !!companyId && !!onAddLabor && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("external_teams").select("id, name").eq("company_id", companyId!).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string | null }>;
    },
  });

  const voci = useMemo(() => [
    ...catalogo.map((t) => ({ ...t, source: "catalog" as const })),
    ...listino,
  ], [catalogo, listino]);
  const recenti = useMemo(() => righeUsateDistinte(recentiGrezzi), [recentiGrezzi]);
  const risultati = useMemo(() => cercaArticoli(testo, magazzino, voci, recenti), [testo, magazzino, voci, recenti]);
  const azioneSuMisuraNuovo = useMemo(() => listino.some((l) => l.su_misura), [listino]);

  // Scelte: ognuna prepara il form e porta il cursore sulla quantità.
  const scegliNormale = (s: Extract<Scelta, { tipo: "normale" }>) => {
    const t = s.template; const r = s.recente;
    setNome(s.nome);
    setQuantita("1");
    setUnita(t?.unit_of_measure || r?.unita_misura || "pz");
    const prezzo = t ? t.standard_cost : r?.purchase_price;
    setCosto(prezzo && prezzo > 0 ? String(prezzo) : "");
    if (t?.vat_rate != null) setIva(t.vat_rate); else if (r?.vat_rate != null) setIva(Number(r.vat_rate));
    const f = t?.supplier_id ?? r?.supplier_id;
    if (f) setFornitore(f);
    setNote(t?.description ?? "");
    setNelCatalogo(false);
    setDettagli(false);
    setScelta(s);
    setErrore(null);
    setTimeout(() => { campoQuantita.current?.focus(); campoQuantita.current?.select(); }, 0);
  };

  const scegliListino = (v: ArticleTemplateData) => {
    if (v.su_misura) {
      setScelta({
        tipo: "su_misura",
        manodopera: v.manodopera_costo,
        prodotto: { nome: v.name, familyId: v.family_id ?? v.id, categoria: v.category, codice: v.sku, supplierId: v.supplier_id, iva: v.vat_rate },
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

  const aggiungiPosa = (nome: string, pezzi: number, costoUnitario: number | null | undefined) => {
    if (onAddLabor && posa && squadra && costoUnitario && costoUnitario > 0) {
      onAddLabor({ external_team_id: squadra, total_cost: Math.round(costoUnitario * pezzi * 100) / 100, notes: `Posa ${nome} (da listino)` });
    }
  };

  const confermaNormale = async () => {
    if (occupato.current || scelta?.tipo !== "normale") return;
    const q = quantitaDaCampo(quantita);
    const prezzoScritto = costo.trim() ? costoScritto(costo) : 0;
    if (!nome.trim()) { setErrore("Scrivi il nome dell'articolo."); return; }
    if (!Number.isFinite(q) || q <= 0) { setErrore("La quantità deve essere maggiore di zero."); return; }
    if (prezzoScritto == null || prezzoScritto < 0) { setErrore("Il costo non è un numero valido."); return; }
    occupato.current = true;
    setErrore(null);
    let templateId = scelta.template?.source === "listino" ? null : scelta.template?.id ?? scelta.recente?.article_template_id ?? null;
    if (scelta.nuovo && nelCatalogo && companyId) {
      const { data, error } = await supabase.from("article_templates")
        .insert({ company_id: companyId, name: nome.trim(), unit_of_measure: unita.trim() || "pz", vat_rate: iva, supplier_id: fornitore ?? null, ...(canViewCosts ? { standard_cost: prezzoScritto } : {}) })
        .select("id").single();
      if (error) toast.error("Articolo aggiunto alla commessa, ma non salvato nel catalogo");
      else {
        templateId = data.id;
        queryClient.invalidateQueries({ queryKey: ["article-templates"] });
        queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
      }
    }
    const t = scelta.template;
    const riga: OrderItem = {
      name: nome.trim(),
      description: note.trim() || undefined,
      quantity: q,
      unita_misura: unita.trim() || null,
      status: "da_ordinare",
      position: 0,
      supplier_id: fornitore,
      purchase_price: prezzoScritto,
      vat_rate: iva,
      standard_cost: t && t.standard_cost > 0 ? t.standard_cost : 0,
      article_template_id: templateId,
      product_code: t?.sku ?? scelta.recente?.product_code ?? null,
      categoria: t?.category ?? scelta.recente?.categoria ?? null,
      payment_method: pagamento,
      is_paid: false,
      deposit_amount: 0, deposit_paid: false, balance_amount: 0, balance_paid: false,
      unit_price: 0, discount_percent: 0,
      posizioni: null,
      ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
    };
    if (!onAggiungiRiga(riga)) { occupato.current = false; return; }
    aggiungiPosa(riga.name, q, t?.manodopera_costo);
    setAppena((a) => [riga.name, ...a].slice(0, 5));
    torna();
  };

  const confermaMagazzino = () => {
    if (occupato.current || scelta?.tipo !== "magazzino") return;
    const voce = scelta.voce;
    if (stockBloccato || voce.tracking_mode === "serialized") return;
    const q = Number(pezziMagazzino.trim().replace(",", "."));
    if (!Number.isInteger(q) || q <= 0) { setErrore("La quantità da prelevare è un numero intero maggiore di zero."); return; }
    if (q > voce.quantity) { setErrore(`In magazzino ce ne sono ${voce.quantity}.`); return; }
    occupato.current = true;
    onPrendiDaMagazzino(voce, q);
    setAppena((a) => [voce.name, ...a].slice(0, 5));
    torna();
  };

  const invio = (azione: () => void | Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void azione(); }
  };

  const gruppoId = useMemo(() => nuovoGruppoId(), [open, scelta]); // eslint-disable-line react-hooks/exhaustive-deps

  const bloccoPosa = (manodopera: number | null | undefined, pezzi: number | null) => !!manodopera && manodopera > 0 && !!onAddLabor && (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-sm">
      <label className="flex items-center gap-2">
        <Checkbox checked={posa} onCheckedChange={(c) => setPosa(c === true)} />
        <span>Aggiungi la posa alla Manodopera{canViewCosts && (pezzi == null ? ` (${formatCurrency(manodopera)} a pezzo)` : ` (${formatCurrency(manodopera * pezzi)})`)}</span>
      </label>
      {posa && (
        <Select value={squadra} onValueChange={setSquadra}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Scegli squadra o subappaltatore…" /></SelectTrigger>
          <SelectContent>
            {squadre.length === 0
              ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessuna squadra: creane una in Subappaltatori</div>
              : squadre.map((t) => <SelectItem key={t.id} value={t.id}>{t.name ?? "Squadra"}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  // Lo stesso articolo a scaffale: prima di ordinarlo, lo si dice. Segue il nome mentre lo si corregge.
  const giacenza = scelta?.tipo === "normale"
    ? giacenzaDi(nome, scelta.template?.sku ?? scelta.recente?.product_code, magazzino)
    : null;
  const titolo = gruppoDaModificare ? "Modifica le posizioni" : "Aggiungi articolo";
  const inGruppo = gruppoDaModificare?.righe[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 overflow-y-auto sm:max-w-2xl max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription className="sr-only">Cerca tra magazzino, listino e articoli usati, oppure scrivi un nome nuovo.</DialogDescription>
        </DialogHeader>

        {gruppoDaModificare && inGruppo ? (
          <>
            <p className="text-sm font-medium">{inGruppo.name}</p>
            <FormSuMisura
              key={inGruppo.gruppo_id ?? "gruppo"}
              gruppoId={inGruppo.gruppo_id!}
              prodotto={{ nome: inGruppo.name, familyId: inGruppo.family_id, categoria: inGruppo.categoria, codice: inGruppo.product_code, supplierId: inGruppo.supplier_id, iva: inGruppo.vat_rate }}
              righeEsistenti={gruppoDaModificare.righe}
              copiaDi={gruppoDaModificare.copiaDi}
              puoTogliereSalvate={puoTogliereSalvate}
              canViewCosts={canViewCosts}
              onAnnulla={() => onOpenChange(false)}
              onConferma={(esito) => { onEsitoSuMisura(esito); onOpenChange(false); }}
            />
          </>
        ) : !scelta ? (
          <>
            <Command shouldFilter={false} className="rounded-md border">
              <CommandInput ref={campoRicerca} autoFocus value={testo} onValueChange={setTesto} placeholder="Cerca o scrivi il nome dell'articolo…" />
              <CommandList className="max-h-[min(26rem,55vh)] max-sm:max-h-none">
                {erroreCatalogo && <p role="alert" className="px-3 py-2 text-xs text-red-700">Catalogo non disponibile. Chiudi e riapri per riprovare.</p>}
                <CommandGroup heading="In magazzino">
                  {risultati.magazzino.voci.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">{testo.trim() ? "Niente in magazzino con questo nome." : magazzino.length === 0 ? "Il magazzino è vuoto." : ""}</p>
                  )}
                  {risultati.magazzino.voci.map((s) => (
                    <CommandItem key={s.id} value={`mag:${s.id}`} onSelect={() => scegliMagazzino(s)} className="gap-2">
                      <Warehouse className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className={s.quantity > 0 ? "shrink-0 text-xs text-muted-foreground" : "shrink-0 text-xs text-destructive"}>
                        {s.quantity > 0 ? `${s.quantity} disp.` : "esaurito"}{s.warehouse?.name ? ` · ${s.warehouse.name}` : ""}{canViewCosts && s.unit_cost > 0 ? ` · ${formatCurrency(s.unit_cost)}` : ""}
                      </span>
                      {s.tracking_mode === "serialized" && <Badge variant="secondary" className="h-4 px-1 text-[9px]">SN</Badge>}
                    </CommandItem>
                  ))}
                  {risultati.magazzino.altri > 0 && <p className="px-2 py-1 text-[11px] text-muted-foreground">Altri {risultati.magazzino.altri}: continua a scrivere</p>}
                </CommandGroup>
                {risultati.listino.voci.length > 0 && (
                  <CommandGroup heading="Dal listino">
                    {risultati.listino.voci.map((v) => (
                      <CommandItem key={`${v.source}:${v.id}`} value={`lis:${v.source}:${v.id}`} onSelect={() => scegliListino(v)} className="gap-2">
                        {v.su_misura ? <Ruler className="h-4 w-4 shrink-0 text-blue-600" aria-hidden /> : <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                        <span className="min-w-0 flex-1 truncate">{v.name}{v.sku ? <span className="ml-1 text-[10px] text-muted-foreground">({v.sku})</span> : null}</span>
                        {!v.su_misura && (() => {
                          const aScaffale = giacenzaDi(v.name, v.sku, magazzino);
                          return aScaffale ? <Badge variant="outline" className="h-5 shrink-0 border-amber-300 px-1.5 text-[10px] text-amber-800">{aScaffale.quantity} in magazzino</Badge> : null;
                        })()}
                        {v.su_misura
                          ? <Badge variant="outline" className="h-5 shrink-0 border-blue-300 px-1.5 text-[10px] text-blue-700">Su misura</Badge>
                          : canViewCosts && v.standard_cost > 0 && <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(v.standard_cost)} / {v.unit_of_measure || "pz"}</span>}
                      </CommandItem>
                    ))}
                    {risultati.listino.altri > 0 && <p className="px-2 py-1 text-[11px] text-muted-foreground">Altri {risultati.listino.altri}: continua a scrivere</p>}
                  </CommandGroup>
                )}
                {risultati.recenti.voci.length > 0 && (
                  <CommandGroup heading="Usati di recente">
                    {risultati.recenti.voci.map((r) => (
                      <CommandItem key={r.chiave} value={`rec:${r.chiave}`} onSelect={() => scegliNormale({ tipo: "normale", nome: r.name, nuovo: false, recente: r })} className="gap-2">
                        <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{r.name}</span>
                        {canViewCosts && !!r.purchase_price && <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(Number(r.purchase_price))}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {risultati.nuovo && (
                  <CommandGroup heading="Nuovo">
                    <CommandItem value="nuovo:normale" onSelect={() => scegliNormale({ tipo: "normale", nome: risultati.nuovo!, nuovo: true })} className="gap-2 text-primary">
                      <Plus className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">Aggiungi «{risultati.nuovo}»</span>
                    </CommandItem>
                    {azioneSuMisuraNuovo && (
                      <CommandItem value="nuovo:misura" onSelect={() => setScelta({ tipo: "su_misura", prodotto: { nome: risultati.nuovo! } })} className="gap-2">
                        <Ruler className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">Aggiungi «{risultati.nuovo}» su misura, con le posizioni</span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
                <CommandEmpty className="px-3 py-3 text-xs text-muted-foreground">Scrivi un nome per cominciare.</CommandEmpty>
              </CommandList>
            </Command>
            {appena.length > 0 && (
              <p className="truncate text-xs text-emerald-700" aria-live="polite">Aggiunti: {appena.join(", ")}</p>
            )}
            {altreFonti && <div className="flex flex-wrap items-center gap-2 border-t pt-3">{altreFonti}</div>}
          </>
        ) : (
          <>
            <button type="button" onClick={torna} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Torna alla ricerca
            </button>

            {scelta.tipo === "su_misura" && (
              <>
                <p className="flex items-center gap-2 text-sm font-medium"><Ruler className="h-4 w-4 text-blue-600" aria-hidden />{scelta.prodotto.nome}</p>
                <FormSuMisura
                  key={gruppoId}
                  gruppoId={gruppoId}
                  prodotto={scelta.prodotto}
                  canViewCosts={canViewCosts}
                  phaseId={phaseId}
                  extra={bloccoPosa(scelta.manodopera, null)}
                  onAnnulla={torna}
                  onConferma={(esito) => {
                    onEsitoSuMisura(esito);
                    const pezzi = esito.nuove.reduce((t, r) => t + r.quantity, 0);
                    aggiungiPosa(scelta.prodotto.nome, pezzi, scelta.manodopera);
                    setAppena((a) => [`${scelta.prodotto.nome} (${esito.nuove.length} pos.)`, ...a].slice(0, 5));
                    torna();
                  }}
                />
              </>
            )}

            {scelta.tipo === "magazzino" && (
              <div className="space-y-3">
                <p className="text-sm font-medium">{scelta.voce.name}</p>
                <p className="text-xs text-muted-foreground">
                  Disponibili {scelta.voce.quantity}{scelta.voce.warehouse?.name ? ` in ${scelta.voce.warehouse.name}` : ""}{canViewCosts && scelta.voce.unit_cost > 0 ? ` · ${formatCurrency(scelta.voce.unit_cost)} cad.` : ""}
                </p>
                {stockBloccato || scelta.voce.tracking_mode === "serialized" ? (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-amber-800">{stockBloccato ?? "Questo articolo ha le matricole: si scarica da Magazzino → Uscita merce, scegliendo quali."}</p>
                    {onOpenWarehouseExit && <Button type="button" variant="outline" onClick={() => { onOpenChange(false); onOpenWarehouseExit(); }}>Apri uscita merce per questa commessa</Button>}
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="w-28 space-y-1">
                      <Label htmlFor="pezzi-magazzino" className="text-xs">Quantità</Label>
                      <Input id="pezzi-magazzino" ref={campoQuantita} inputMode="numeric" value={pezziMagazzino} onChange={(e) => setPezziMagazzino(e.target.value)} onKeyDown={invio(confermaMagazzino)} className="h-9" />
                    </div>
                    <Button type="button" onClick={confermaMagazzino} className="gap-1.5"><Warehouse className="h-4 w-4" aria-hidden />Preleva</Button>
                  </div>
                )}
                {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
              </div>
            )}

            {scelta.tipo === "normale" && (
              <div className="space-y-3">
                {giacenza && (
                  <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <span>Ce l'hai già in magazzino: {giacenza.quantity} disponibili{giacenza.warehouse?.name ? ` in ${giacenza.warehouse.name}` : ""}.</span>
                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 bg-background" onClick={() => scegliMagazzino(giacenza)}>
                      <Warehouse className="h-3.5 w-3.5" aria-hidden />Prendi dal magazzino
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-[1fr_5.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_5.5rem_7rem]">
                  <div className="col-span-2 space-y-1 sm:col-span-1">
                    <Label htmlFor="nome-articolo" className="text-xs">Nome</Label>
                    <Input id="nome-articolo" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={invio(confermaNormale)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quantita-articolo" className="text-xs">Quantità</Label>
                    <Input id="quantita-articolo" ref={campoQuantita} inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value)} onKeyDown={invio(confermaNormale)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="unita-articolo" className="text-xs">Unità</Label>
                    <Input id="unita-articolo" list="unita-articolo-elenco" value={unita} onChange={(e) => setUnita(e.target.value)} onKeyDown={invio(confermaNormale)} className="h-9" />
                    <datalist id="unita-articolo-elenco">{UNITA.map((u) => <option key={u} value={u} />)}</datalist>
                  </div>
                  {canViewCosts && (
                    <div className="col-span-2 space-y-1 sm:col-span-1">
                      <Label htmlFor="costo-articolo" className="text-xs">Costo cad. €</Label>
                      <Input id="costo-articolo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} onKeyDown={invio(confermaNormale)} placeholder="0,00" className="h-9 text-right" />
                    </div>
                  )}
                </div>

                {scelta.nuovo && (
                  <RadioGroup value={nelCatalogo ? "catalogo" : "commessa"} onValueChange={(v) => setNelCatalogo(v === "catalogo")} className="flex flex-wrap gap-x-5 gap-y-1">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="commessa" />Solo per questa commessa</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="catalogo" />Salva nel catalogo</label>
                  </RadioGroup>
                )}

                <button type="button" onClick={() => setDettagli((d) => !d)} aria-expanded={dettagli} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  {dettagli ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}Altri dettagli
                </button>
                {dettagli && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">IVA acquisto</Label>
                      <Select value={String(iva)} onValueChange={(v) => setIva(Number(v))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{VAT_RATES.map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fornitore</Label>
                      <SupplierSelect value={fornitore} onValueChange={(id, aliquota, modo) => { setFornitore(id); if (aliquota !== undefined) setIva(aliquota); setPagamento(modo ?? undefined); }} fallbackCompanyId={companyId} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="note-articolo" className="text-xs">Note</Label>
                      <Input id="note-articolo" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={invio(confermaNormale)} className="h-9" />
                    </div>
                  </div>
                )}
                {bloccoPosa(scelta.template?.manodopera_costo, quantitaDaCampo(quantita) || 1)}
                {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={torna} className="max-sm:flex-1">Annulla</Button>
                  <Button type="button" onClick={() => void confermaNormale()} className="max-sm:flex-1">Aggiungi</Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
