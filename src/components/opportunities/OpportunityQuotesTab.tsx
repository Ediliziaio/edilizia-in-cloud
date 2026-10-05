import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArticleCombobox, type ArticleTemplateData } from "@/components/orders/ArticleCombobox";
import {
  Plus,
  FileText,
  AlertTriangle,
  Loader2,
  Trash2,
  ChevronUp,
  Zap,
  ExternalLink,
  RectangleVertical,
  Sun,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { ivaVoceNuova } from "@/hooks/usePreventivoCosti";
import { costoArticolo } from "@/lib/listino/costoTariffa";
import { allegaSchedeTecniche, avvisoSchedeNonAllegate } from "@/lib/quotes/allegatiPreventivo";
import {
  gruppoPreventivo as gruppoDi, ordinaPreventivi, riepilogoPreventivi, scadenzaPreventivo, valoreProposto, visioneCliente,
} from "@/lib/quotes/riepilogoPreventivi";

interface Props {
  contactId: string | null;
  companyId: string | undefined;
  /** Opportunità corrente — usato per linkare il preventivo Serramenti (sr_progetti.opportunita_id). */
  opportunityId?: string | null;
}

// Gli stati REALI di quotes.status sono italiani (src/lib/quoteStatus.ts:
// bozza/inviata/accettata/rifiutata/scaduta/convertita) — con le sole chiavi
// inglesi OGNI preventivo appariva "Bozza" anche se firmato. Le chiavi
// inglesi restano come alias per eventuali righe legacy.
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  bozza: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  inviata: { label: "Inviato", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  accettata: { label: "Accettato", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  rifiutata: { label: "Rifiutato", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  scaduta: { label: "Scaduto", className: "bg-muted text-muted-foreground" },
  convertita: { label: "Convertito", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  sent: { label: "Inviato", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  accepted: { label: "Accettato", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  rejected: { label: "Rifiutato", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  expired: { label: "Scaduto", className: "bg-muted text-muted-foreground" },
};

const SR_STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  da_consegnare: "Da consegnare",
  consegnato: "Consegnato",
  in_valutazione: "In valutazione",
  accettato: "Accettato",
  rifiutato: "Rifiutato",
  scaduto: "Scaduto",
  archiviato: "Archiviato",
};

const FV_STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  configurato: "Configurato",
  emesso: "Emesso",
  firmato: "Firmato",
  annullato: "Annullato",
};

interface QuoteItemRow {
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  unit_of_measure: string;
  article_template_id: string | null;
  /** Costo d'acquisto unitario dell'articolo scelto; 0 = non si conosce. */
  prezzo_acquisto: number;
}

/**
 * Riga vuota. L'IVA la passa chi aggiunge la riga: quella più usata nelle
 * righe già scritte (ivaVoceNuova), 22 solo a preventivo vuoto (05/10/2026).
 */
const emptyItem = (vat_rate = 22): QuoteItemRow => ({
  name: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  vat_rate,
  unit_of_measure: "pz",
  article_template_id: null,
  prezzo_acquisto: 0,
});

export function OpportunityQuotesTab({ contactId, companyId, opportunityId }: Props) {
  const navigate = useNavigate();
  // Rotte relative al contesto: dall'hub admin si resta su /admin/marketing
  // (prima si finiva su /azienda/* perdendo il PlatformCompanyProvider).
  const routePrefix = useMarketingRoutePrefix();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Modulo Preventivatore Serramenti: se attivo, mostriamo CTA dedicata +
  // lista preventivi sr_progetti collegati a questa opportunità.
  const { isEnabled: serramentiEnabled } = useFeatureAccess("modulo_serramenti_attivo");
  // Modulo Fotovoltaico: stessa logica per i preventivi fv_progetti
  // (collegati tramite opportunita_crm_id, fallback cliente_id).
  const { isEnabled: fotovoltaicoEnabled } = useFeatureAccess("modulo_fotovoltaico_attivo");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("Preventivo");
  const [notes, setNotes] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [items, setItems] = useState<QuoteItemRow[]>([emptyItem()]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  // Queries
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes_by_contact", contactId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, title, status, total, created_at, sent_at, viewed_at, expires_at, opportunity_id")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
  });

  // Valore dell'opportunità: se è a zero e c'è un preventivo, si propone di allinearlo.
  const { data: valoreOpp } = useQuery({
    queryKey: ["quotes_tab_opp_value", companyId, opportunityId],
    enabled: !!companyId && !!opportunityId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("marketing_opportunities")
        .select("value").eq("company_id", companyId!).eq("id", opportunityId!).maybeSingle();
      return Number(data?.value ?? 0);
    },
  });
  const [salvandoValore, setSalvandoValore] = useState(false);
  const [filtroStato, setFiltroStato] = useState<"tutti" | "aperti" | "accettati" | "chiusi">("tutti");
  const riepilogo = useMemo(() => riepilogoPreventivi(quotes), [quotes]);
  const preventiviOrdinati = useMemo(() => ordinaPreventivi(quotes), [quotes]);
  const proposto = useMemo(() => valoreProposto(quotes), [quotes]);
  const impostaValoreOpportunita = async () => {
    if (!proposto || !opportunityId || !companyId) return;
    setSalvandoValore(true);
    const { error } = await supabase.from("marketing_opportunities")
      .update({ value: proposto.valore }).eq("company_id", companyId).eq("id", opportunityId);
    setSalvandoValore(false);
    if (error) { toast.error("Valore non aggiornato"); return; }
    toast.success("Valore dell'opportunità aggiornato");
    queryClient.invalidateQueries({ queryKey: ["quotes_tab_opp_value"] });
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  };

  // Preventivi Serramenti: filtra prima per opportunità (se presente),
  // altrimenti per contatto. Mostriamo solo quelli del modulo attivo.
  const { data: srProgetti = [], isLoading: srLoading } = useQuery({
    queryKey: ["sr-progetti-by-opportunity", opportunityId, contactId, companyId],
    enabled: !!companyId && serramentiEnabled && (!!opportunityId || !!contactId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("sr_progetti")
        .select("id, code, stato, cliente_nome, cliente_cognome, totale_min, totale_max, created_at, opportunita_id, cliente_id")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (opportunityId) {
        q = q.eq("opportunita_id", opportunityId);
      } else if (contactId) {
        q = q.eq("cliente_id", contactId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string; stato: string;
        cliente_nome: string | null; cliente_cognome: string | null;
        totale_min: number | null; totale_max: number | null;
        created_at: string; opportunita_id: string | null; cliente_id: string | null;
      }>;
    },
  });

  // Preventivi Fotovoltaico: stessa logica dei serramenti. Filtra per
  // opportunità (fv_progetti.opportunita_crm_id) se presente, altrimenti per
  // contatto (cliente_id). Esclude i progetti annullati.
  const { data: fvProgetti = [], isLoading: fvLoading } = useQuery({
    queryKey: ["fv-progetti-by-opportunity", opportunityId, contactId, companyId],
    enabled: !!companyId && fotovoltaicoEnabled && (!!opportunityId || !!contactId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("fv_progetti")
        .select("id, numero, stato, prezzo_vendita_iva_inclusa, created_at, opportunita_crm_id, cliente_id")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("annullato", false)
        .order("created_at", { ascending: false });
      if (opportunityId) {
        q = q.eq("opportunita_crm_id", opportunityId);
      } else if (contactId) {
        q = q.eq("cliente_id", contactId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; numero: string | null; stato: string;
        prezzo_vendita_iva_inclusa: number | null;
        created_at: string; opportunita_crm_id: string | null; cliente_id: string | null;
      }>;
    },
  });

  const { data: contact } = useQuery({
    queryKey: ["marketing-contact-for-quote", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("first_name, last_name, email, phone, company_name, address, city, province, postal_code, country, fiscal_code, vat_number")
        .eq("id", contactId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  // Prezzo, costo e IVA degli articoli dalle colonne di oggi (05/10/2026): il
  // selettore porta quelle vecchie (unit_price, standard_cost) e il costo vero
  // sta in prezzo_acquisto_netto (17 articoli su 47 con standard_cost a 0).
  // Senza costo il margine del preventivo risultava pieno.
  const { data: articoliListino = [] } = useQuery({
    queryKey: ["opportunity-quick-quote-articles", companyId],
    enabled: !!companyId && showForm,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, prezzo_vendita, unit_price, prezzo_acquisto_netto, standard_cost, vat_rate")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const articoliPerId = useMemo(() => new Map(articoliListino.map((a) => [a.id, a])), [articoliListino]);

  const { data: materials = [] } = useQuery({
    queryKey: ["quote-pdf-materials", companyId],
    enabled: !!companyId && showForm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_materials")
        .select("id, name, category")
        .eq("company_id", companyId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Calculations
  const calculations = useMemo(() => {
    const subtotal = items.reduce(
      (sum, it) => sum + it.quantity * it.unit_price * (1 - it.discount_percent / 100),
      0
    );
    const discountAmt = subtotal * (discountPercent / 100);
    const vatAmount = items.reduce(
      (sum, it) =>
        sum +
        it.quantity * it.unit_price * (1 - it.discount_percent / 100) * (it.vat_rate / 100) * (1 - discountPercent / 100),
      0
    );
    const total = subtotal - discountAmt + vatAmount;
    return { subtotal, discountAmt, vatAmount, total };
  }, [items, discountPercent]);

  // Item handlers
  const updateItem = (index: number, field: keyof QuoteItemRow, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleArticleSelect = (index: number, name: string, template?: ArticleTemplateData) => {
    // Le colonne di oggi dell'articolo, se già caricate; altrimenti quelle del selettore.
    const articolo = template ? articoliPerId.get(template.id) : undefined;
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              name,
              unit_price: articolo?.prezzo_vendita ?? articolo?.unit_price ?? template?.unit_price ?? it.unit_price,
              vat_rate: articolo?.vat_rate ?? template?.vat_rate ?? it.vat_rate,
              unit_of_measure: template?.unit_of_measure ?? it.unit_of_measure,
              description: template?.description ?? it.description,
              article_template_id: template?.id ?? null,
              // Nome scritto a mano: non è più l'articolo, il suo costo non vale.
              prezzo_acquisto: template ? costoArticolo(articolo ?? { standard_cost: template.standard_cost }) : 0,
            }
          : it
      )
    );
  };

  const resetForm = () => {
    setShowForm(false);
    setTitle("Preventivo");
    setNotes("");
    setValidityDays(30);
    setDiscountPercent(0);
    setItems([emptyItem()]);
    setSelectedMaterials([]);
  };

  // Save
  const handleSave = async () => {
    if (!companyId || !user || !contactId) return;
    const validItems = items.filter((it) => it.name.trim());
    if (validItems.length === 0) {
      toast.error("Aggiungi almeno un prodotto");
      return;
    }

    setSaving(true);
    // Da quando il preventivo esiste, un errore non deve lasciare il modulo
    // pronto a crearne un altro.
    let creatoId: string | null = null;
    try {
      // Generate quote number
      const { data: numData } = await supabase.rpc("generate_quote_number", {
        p_company_id: companyId,
      });

      // Build client data from contact
      const clientAddress = [contact?.address, contact?.city, contact?.province, contact?.postal_code, contact?.country]
        .filter(Boolean)
        .join(", ");

      const quoteData = {
        company_id: companyId,
        // "bozza", NON "draft": lo status è testo libero in DB ma tutta la
        // reportistica/filtri riconoscono solo il vocabolario italiano.
        status: "bozza" as const,
        quote_number: numData || `OFF-${new Date().getFullYear()}-001`,
        contact_id: contactId,
        opportunity_id: opportunityId ?? null,
        client_name: [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || null,
        client_email: contact?.email || null,
        client_phone: contact?.phone || null,
        client_company: contact?.company_name || null,
        client_address: clientAddress || null,
        client_fiscal_code: contact?.fiscal_code || null,
        client_vat_number: contact?.vat_number || null,
        title,
        notes: notes || null,
        validity_days: validityDays,
        discount_percent: discountPercent,
        created_by: user.id,
      };

      const { data: newQuote, error } = await supabase
        .from("quotes")
        .insert(quoteData)
        .select("id")
        .single();
      if (error) throw error;

      const quoteId = newQuote.id;
      creatoId = quoteId;

      // Insert items
      if (validItems.length > 0) {
        const { error: itemsErr } = await supabase.from("quote_items").insert(
          validItems.map((it, idx) => ({
            quote_id: quoteId,
            company_id: companyId,
            item_type: "product" as const,
            name: it.name,
            description: it.description || null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount_percent: it.discount_percent,
            vat_rate: it.vat_rate,
            unit_of_measure: it.unit_of_measure,
            sort_order: idx,
            article_template_id: it.article_template_id || null,
            // Il costo dell'articolo scelto (05/10/2026): prima non si salvava.
            prezzo_acquisto: it.prezzo_acquisto ?? 0,
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      // Attachments: il preventivo esiste già. Una scheda che il database
      // rifiuta (dal 26/09 quella di un'altra azienda) non deve far sembrare
      // fallito il salvataggio: chi riprovava creava un secondo preventivo.
      const nonAllegate = await allegaSchedeTecniche(
        quoteId,
        selectedMaterials.map((mId, idx) => ({
          material_id: mId,
          sort_order: idx,
          nome: materials.find((m) => m.id === mId)?.name ?? null,
        }))
      );

      queryClient.invalidateQueries({ queryKey: ["quotes_by_contact", contactId, companyId] });
      const avviso = avvisoSchedeNonAllegate(nonAllegate);
      if (avviso) {
        toast.warning(`Preventivo creato in bozza: ${avviso.conteggio}`, { description: avviso.descrizione, duration: 10000 });
      } else {
        toast.success("Preventivo creato in bozza");
      }
      resetForm();
    } catch (err: any) {
      if (creatoId) {
        // Il preventivo c'è già ma senza le sue righe, e quindi senza le schede,
        // che vengono dopo (gli allegati non lanciano): il modulo si chiude,
        // perché un nuovo «Salva» ne creerebbe un secondo. Si completa aprendolo.
        const creato = creatoId;
        const mancano = selectedMaterials.length > 0 ? "I prodotti e le schede tecniche" : "I prodotti";
        queryClient.invalidateQueries({ queryKey: ["quotes_by_contact", contactId, companyId] });
        resetForm();
        toast.error("Preventivo creato, ma senza i prodotti", {
          description: `${mancano} non sono stati salvati: apri il preventivo per aggiungerli, invece di crearne un altro.`,
          duration: 10000,
          action: { label: "Apri preventivo", onClick: () => navigate(`${routePrefix}/preventivi/${creato}`) },
        });
      } else {
        toast.error(err.message || "Errore durante il salvataggio");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!contactId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nessun contatto collegato a questa opportunità.<br />
          Collega un contatto per creare preventivi.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fmt = (n: number) => formatCurrency(n);

  // Link a builder con opportunity_id (per linking automatico)
  const builderQs = new URLSearchParams();
  if (contactId) builderQs.set("contact_id", contactId);
  if (opportunityId) builderQs.set("opportunity_id", opportunityId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Preventivi</h3>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`${routePrefix}/preventivi/nuovo?${builderQs.toString()}`)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Preventivo avanzato
          </Button>
        </div>
      </div>

      {/* Colpo d'occhio: quanto vale la trattativa */}
      {quotes.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {([
              { chiave: "aperti", etichetta: "Aperti", d: riepilogo.aperti, colore: "text-blue-700" },
              { chiave: "accettati", etichetta: "Accettati", d: riepilogo.accettati, colore: "text-green-700" },
              { chiave: "chiusi", etichetta: "Rifiutati / scaduti", d: riepilogo.chiusi, colore: "text-muted-foreground" },
            ] as const).map((c) => (
              <button
                key={c.chiave}
                type="button"
                onClick={() => setFiltroStato(filtroStato === c.chiave ? "tutti" : c.chiave)}
                className={`rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 ${filtroStato === c.chiave ? "ring-2 ring-primary/50" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.etichetta}</p>
                <p className={`text-base font-semibold tabular-nums ${c.colore}`}>{c.d.n}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{fmt(c.d.valore)}</p>
              </button>
            ))}
          </div>
          {proposto && opportunityId && (valoreOpp ?? 0) === 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="flex-1">
                Il valore dell'opportunità è 0 €. Il preventivo {proposto.da === "accettato" ? "accettato" : "aperto"} più recente è di <strong>{fmt(proposto.valore)}</strong>.
              </span>
              <Button size="sm" variant="outline" className="h-7" disabled={salvandoValore} onClick={impostaValoreOpportunita}>
                {salvandoValore ? <Loader2 className="h-3 w-3 animate-spin" /> : "Usalo come valore"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Lista Preventivi Serramenti collegati (se modulo attivo) */}
      {serramentiEnabled && (srProgetti.length > 0 || srLoading) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <RectangleVertical className="h-3.5 w-3.5 text-orange-600" />
            <h4 className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
              Preventivi Serramenti
            </h4>
            <span className="text-[10px] text-muted-foreground max-md:text-[11px]">
              ({srLoading ? "…" : srProgetti.length})
            </span>
          </div>
          {srLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1.5">
              {srProgetti.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-orange-100 bg-orange-50/30 p-3 text-left hover:bg-orange-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-orange-700">{p.code}</span>
                      <Badge className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-0 max-md:text-[11px]">
                        {SR_STATO_LABELS[p.stato] ?? p.stato}
                      </Badge>
                      {!p.opportunita_id && opportunityId && (
                        <span className="text-[9px] text-muted-foreground max-md:text-[11px]" title="Collegato solo per contatto, non a questa opportunità">
                          via contatto
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums">
                      {p.totale_min && p.totale_max
                        ? `${formatCurrency(Number(p.totale_min))} – ${formatCurrency(Number(p.totale_max))}`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
                      {format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista Preventivi Fotovoltaico collegati (se modulo attivo) */}
      {fotovoltaicoEnabled && (fvProgetti.length > 0 || fvLoading) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Preventivi Fotovoltaico
            </h4>
            <span className="text-[10px] text-muted-foreground max-md:text-[11px]">
              ({fvLoading ? "…" : fvProgetti.length})
            </span>
          </div>
          {fvLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1.5">
              {fvProgetti.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/azienda/marketing/fotovoltaico/${p.id}`)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/30 p-3 text-left hover:bg-amber-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-amber-700">{p.numero ?? "—"}</span>
                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-0 max-md:text-[11px]">
                        {FV_STATO_LABELS[p.stato] ?? p.stato}
                      </Badge>
                      {!p.opportunita_crm_id && opportunityId && (
                        <span className="text-[9px] text-muted-foreground max-md:text-[11px]" title="Collegato solo per contatto, non a questa opportunità">
                          via contatto
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums">
                      {p.prezzo_vendita_iva_inclusa != null
                        ? formatCurrency(Number(p.prezzo_vendita_iva_inclusa))
                        : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
                      {format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline Quick Creator */}
      <Collapsible open={showForm} onOpenChange={setShowForm}>
        <CollapsibleTrigger asChild>
          <Button size="sm" variant={showForm ? "secondary" : "default"} className="w-full">
            {showForm ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Chiudi creazione rapida
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Crea Preventivo Rapido
              </>
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-4 border rounded-lg p-4 bg-muted/30">
          {/* Title + Validity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Titolo</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Preventivo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Validità (giorni)</Label>
              <Input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                min={1}
              />
            </div>
          </div>

          {/* Products Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Prodotti / Servizi</Label>
              <Button size="sm" variant="ghost" onClick={() => setItems((prev) => [...prev, emptyItem(ivaVoceNuova(prev))])}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Riga
              </Button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid gap-2 border rounded-md p-3 bg-background">
                  {/* Row 1: Article selector */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <ArticleCombobox
                        value={item.name}
                        onValueChange={(name, tpl) => handleArticleSelect(idx, name, tpl)}
                        placeholder="Seleziona articolo..."
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Row 2: Qty, Price, IVA, Sconto, UM */}
                  <div className="grid grid-cols-5 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">Qtà</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                        min={1}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">Prezzo €</Label>
                      <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                        min={0}
                        step={0.01}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">IVA %</Label>
                      <Input
                        type="number"
                        value={item.vat_rate}
                        onChange={(e) => updateItem(idx, "vat_rate", Number(e.target.value))}
                        min={0}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">Sconto %</Label>
                      <Input
                        type="number"
                        value={item.discount_percent}
                        onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))}
                        min={0}
                        max={100}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">UM</Label>
                      <Select value={item.unit_of_measure} onValueChange={(v) => updateItem(idx, "unit_of_measure", v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pz">pz</SelectItem>
                          <SelectItem value="mq">mq</SelectItem>
                          <SelectItem value="ml">ml</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="ore">ore</SelectItem>
                          <SelectItem value="corpo">corpo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Line total */}
                  <p className="text-xs text-right text-muted-foreground">
                    Riga: {fmt(item.quantity * item.unit_price * (1 - item.discount_percent / 100))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Global Discount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sconto globale %</Label>
              <Input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                min={0}
                max={100}
              />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-background rounded-md p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotale</span>
              <span>{fmt(calculations.subtotal)}</span>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Sconto ({discountPercent}%)</span>
                <span>-{fmt(calculations.discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span>{fmt(calculations.vatAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>Totale</span>
              <span>{fmt(calculations.total)}</span>
            </div>
          </div>

          {/* PDF Materials */}
          {materials.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Materiali PDF da allegare</Label>
              <div className="space-y-1.5">
                {materials.map((m: any) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedMaterials.includes(m.id)}
                      onCheckedChange={(checked) =>
                        setSelectedMaterials((prev) =>
                          checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                        )
                      }
                    />
                    <span>{m.name}</span>
                    {m.category && (
                      <span className="text-xs text-muted-foreground">({m.category})</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Note (opzionale)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note per il cliente..."
              rows={2}
            />
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Salvataggio...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Salva Bozza Preventivo
              </>
            )}
          </Button>
        </CollapsibleContent>
      </Collapsible>

      {/* Existing Quotes List */}
      {quotes.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nessun preventivo per questo contatto</p>
          <div className="grid w-full max-w-md grid-cols-2 gap-2 text-left">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold">Preventivo rapido</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Poche righe e un totale: una bozza pronta in un minuto, da rifinire poi.</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold">Preventivo avanzato</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Articoli a listino, sconti, clausole e PDF completo da inviare per la firma.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {preventiviOrdinati.filter((q: any) => filtroStato === "tutti" || gruppoDi(q.status) === filtroStato).map((q: any) => {
            const st = STATUS_LABELS[q.status] || STATUS_LABELS.bozza;
            const scad = scadenzaPreventivo(q);
            const visione = visioneCliente(q);
            return (
              <button
                key={q.id}
                onClick={() => navigate(`${routePrefix}/preventivi/${q.id}`)}
                className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{q.quote_number || "—"}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${st.className} border-0`}>
                      {st.label}
                    </Badge>
                  </div>
                  {q.title && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{q.title}</p>
                  )}
                  {(scad || visione) && (
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[10px]">
                      {scad && <span className={scad.urgente ? "font-medium text-red-600" : "text-muted-foreground"}>{scad.testo}</span>}
                      {visione && <span className="text-muted-foreground">{visione}</span>}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">
                    {q.total != null
                      ? formatCurrency(Number(q.total))
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
                    {format(new Date(q.created_at), "dd MMM yyyy", { locale: it })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
