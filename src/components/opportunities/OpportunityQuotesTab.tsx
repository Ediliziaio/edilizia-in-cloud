import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
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
  ChevronDown,
  ChevronUp,
  Zap,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  contactId: string | null;
  companyId: string | undefined;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  sent: { label: "Inviato", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  accepted: { label: "Accettato", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  rejected: { label: "Rifiutato", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  expired: { label: "Scaduto", className: "bg-muted text-muted-foreground" },
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
}

const emptyItem = (): QuoteItemRow => ({
  name: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  vat_rate: 22,
  unit_of_measure: "pz",
  article_template_id: null,
});

export function OpportunityQuotesTab({ contactId, companyId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
        .select("id, quote_number, title, status, total, created_at")
        .eq("company_id", companyId!)
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
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
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              name,
              unit_price: template?.unit_price ?? it.unit_price,
              vat_rate: template?.vat_rate ?? it.vat_rate,
              unit_of_measure: template?.unit_of_measure ?? it.unit_of_measure,
              description: template?.description ?? it.description,
              article_template_id: template?.id ?? null,
            }
          : it
      )
    );
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
        status: "draft" as const,
        quote_number: numData || `OFF-${new Date().getFullYear()}-001`,
        contact_id: contactId,
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
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      // Attachments
      if (selectedMaterials.length > 0) {
        await supabase.from("quote_pdf_attachments").insert(
          selectedMaterials.map((mId, idx) => ({
            quote_id: quoteId,
            material_id: mId,
            sort_order: idx,
          }))
        );
      }

      queryClient.invalidateQueries({ queryKey: ["quotes_by_contact", contactId, companyId] });
      toast.success("Preventivo creato in bozza");

      // Reset form
      setShowForm(false);
      setTitle("Preventivo");
      setNotes("");
      setValidityDays(30);
      setDiscountPercent(0);
      setItems([emptyItem()]);
      setSelectedMaterials([]);
    } catch (err: any) {
      toast.error(err.message || "Errore durante il salvataggio");
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

  const fmt = (n: number) =>
    `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Preventivi</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/azienda/marketing/preventivi/nuovo?contact_id=${contactId}`)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Builder completo
          </Button>
        </div>
      </div>

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
              <Button size="sm" variant="ghost" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
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
                      <Label className="text-[10px] text-muted-foreground">Qtà</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                        min={1}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Prezzo €</Label>
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
                      <Label className="text-[10px] text-muted-foreground">IVA %</Label>
                      <Input
                        type="number"
                        value={item.vat_rate}
                        onChange={(e) => updateItem(idx, "vat_rate", Number(e.target.value))}
                        min={0}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Sconto %</Label>
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
                      <Label className="text-[10px] text-muted-foreground">UM</Label>
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
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nessun preventivo per questo contatto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q: any) => {
            const st = STATUS_LABELS[q.status] || STATUS_LABELS.draft;
            return (
              <button
                key={q.id}
                onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}
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
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">
                    {q.total != null
                      ? `€ ${Number(q.total).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
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
