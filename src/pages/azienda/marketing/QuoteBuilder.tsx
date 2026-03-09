import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import { COLOR_PALETTES } from "@/types/quoteTemplate";
import type { QuoteTemplateLayout } from "@/types/quoteTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  Send,
  Loader2,
  User,
  Package,
  FileStack,
  FileCheck,
  Palette,
} from "lucide-react";

interface QuoteItem {
  id?: string;
  item_type: string;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  unit_of_measure: string;
  sort_order: number;
  article_template_id?: string | null;
}

const STEPS = [
  { key: "cliente", label: "Cliente", icon: User },
  { key: "prodotti", label: "Prodotti", icon: Package },
  { key: "documenti", label: "Documenti", icon: FileStack },
  { key: "riepilogo", label: "Riepilogo", icon: FileCheck },
];

export default function QuoteBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Client
  const [contactId, setContactId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientFiscalCode, setClientFiscalCode] = useState("");
  const [clientVatNumber, setClientVatNumber] = useState("");
  const [title, setTitle] = useState("Preventivo");
  const [description, setDescription] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // Step 2: Items
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Step 3: Documents
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  // Load contacts
  const { data: contacts = [] } = useQuery({
    queryKey: ["marketing-contacts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, company_name, address, city, province, postal_code, country, fiscal_code, vat_number")
        .eq("company_id", companyId!)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // Load article templates for import
  const { data: articles = [] } = useQuery({
    queryKey: ["article-templates", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, description, unit_price, standard_cost, unit_of_measure, vat_rate")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Load PDF materials
  const { data: materials = [] } = useQuery({
    queryKey: ["quote-pdf-materials", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_materials")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Load existing quote if editing
  const { data: existingQuote } = useQuery({
    queryKey: ["quote", id],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingItems = [] } = useQuery({
    queryKey: ["quote-items", id],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: existingAttachments = [] } = useQuery({
    queryKey: ["quote-attachments", id],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_attachments")
        .select("material_id")
        .eq("quote_id", id!);
      if (error) throw error;
      return data.map((a: any) => a.material_id);
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (existingQuote) {
      setContactId(existingQuote.contact_id);
      setClientName(existingQuote.client_name || "");
      setClientEmail(existingQuote.client_email || "");
      setClientPhone(existingQuote.client_phone || "");
      setClientCompany(existingQuote.client_company || "");
      setClientAddress(existingQuote.client_address || "");
      setClientFiscalCode(existingQuote.client_fiscal_code || "");
      setClientVatNumber(existingQuote.client_vat_number || "");
      setTitle(existingQuote.title || "Preventivo");
      setDescription(existingQuote.description || "");
      setValidityDays(existingQuote.validity_days || 30);
      setNotes(existingQuote.notes || "");
      setInternalNotes(existingQuote.internal_notes || "");
      setDiscountPercent(existingQuote.discount_percent || 0);
    }
  }, [existingQuote]);

  useEffect(() => {
    if (existingItems.length > 0) {
      setItems(
        existingItems.map((i: any) => ({
          id: i.id,
          item_type: i.item_type,
          name: i.name,
          description: i.description || "",
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_percent: i.discount_percent || 0,
          vat_rate: i.vat_rate,
          unit_of_measure: i.unit_of_measure || "pz",
          sort_order: i.sort_order,
          article_template_id: i.article_template_id,
        }))
      );
    }
  }, [existingItems]);

  useEffect(() => {
    if (existingAttachments.length > 0) {
      setSelectedMaterials(existingAttachments);
    }
  }, [existingAttachments]);

  // Auto-select contact from URL param
  useEffect(() => {
    if (!isEdit && contacts.length > 0 && !contactId) {
      const urlContactId = searchParams.get("contact_id");
      if (urlContactId) {
        handleContactSelect(urlContactId);
      }
    }
  }, [contacts, isEdit, searchParams]);

  // Contact selection
  const handleContactSelect = (cId: string) => {
    setContactId(cId);
    const c = contacts.find((x: any) => x.id === cId);
    if (c) {
      setClientName(`${c.first_name || ""} ${c.last_name || ""}`.trim());
      setClientEmail(c.email || "");
      setClientPhone(c.phone || "");
      setClientCompany(c.company_name || "");
      setClientFiscalCode((c as any).fiscal_code || "");
      setClientVatNumber((c as any).vat_number || "");
      // Compose address from contact fields
      const addressParts = [c.address, c.postal_code, c.city, c.province].filter(Boolean);
      if (addressParts.length > 0) {
        setClientAddress(addressParts.join(", "));
      }
    }
  };

  // Items management
  const addItem = (type: string = "product") => {
    setItems([
      ...items,
      {
        item_type: type,
        name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        vat_rate: 22,
        unit_of_measure: "pz",
        sort_order: items.length,
      },
    ]);
  };

  const importFromCatalog = (article: any) => {
    setItems([
      ...items,
      {
        item_type: "product",
        name: article.name,
        description: article.description || "",
        quantity: 1,
        unit_price: article.unit_price || 0,
        discount_percent: 0,
        vat_rate: article.vat_rate || 22,
        unit_of_measure: article.unit_of_measure || "pz",
        sort_order: items.length,
        article_template_id: article.id,
      },
    ]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = items.reduce(
    (sum, it) => sum + it.quantity * it.unit_price * (1 - it.discount_percent / 100),
    0
  );
  const discountAmt = subtotal * (discountPercent / 100);
  const vatAmount = items.reduce(
    (sum, it) =>
      sum +
      it.quantity *
        it.unit_price *
        (1 - it.discount_percent / 100) *
        (it.vat_rate / 100) *
        (1 - discountPercent / 100),
    0
  );
  const total = subtotal - discountAmt + vatAmount;

  // Save
  const handleSave = async (status: string = "bozza") => {
    if (!companyId || !user) return;
    setSaving(true);
    try {
      const quoteData: any = {
        company_id: companyId,
        status,
        contact_id: contactId,
        client_name: clientName || null,
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        client_company: clientCompany || null,
        client_address: clientAddress || null,
        client_fiscal_code: clientFiscalCode || null,
        client_vat_number: clientVatNumber || null,
        title,
        description: description || null,
        notes: notes || null,
        internal_notes: internalNotes || null,
        validity_days: validityDays,
        discount_percent: discountPercent,
        created_by: user.id,
      };

      let quoteId = id;

      if (isEdit) {
        const { error } = await supabase
          .from("quotes")
          .update(quoteData)
          .eq("id", id!);
        if (error) throw error;
      } else {
        const { data: numData } = await supabase.rpc("generate_quote_number", {
          p_company_id: companyId,
        });
        quoteData.quote_number = numData || `OFF-${new Date().getFullYear()}-001`;
        const { data, error } = await supabase
          .from("quotes")
          .insert(quoteData)
          .select("id")
          .single();
        if (error) throw error;
        quoteId = data.id;
      }

      // Delete existing items and re-insert
      if (isEdit) {
        await supabase.from("quote_items").delete().eq("quote_id", quoteId!);
      }
      if (items.length > 0) {
        const { error: itemsErr } = await supabase.from("quote_items").insert(
          items.map((it, idx) => ({
            quote_id: quoteId!,
            company_id: companyId,
            item_type: it.item_type,
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
      if (isEdit) {
        await supabase.from("quote_pdf_attachments").delete().eq("quote_id", quoteId!);
      }
      if (selectedMaterials.length > 0) {
        await supabase.from("quote_pdf_attachments").insert(
          selectedMaterials.map((mId, idx) => ({
            quote_id: quoteId!,
            material_id: mId,
            sort_order: idx,
          }))
        );
      }

      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success(isEdit ? "Preventivo aggiornato" : "Preventivo creato");
      navigate(`/azienda/marketing/preventivi/${quoteId}`);
    } catch (err: any) {
      toast.error(err.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/marketing/preventivi")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Modifica Preventivo" : "Nuovo Preventivo"}
          </h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                ? "bg-muted text-foreground"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            <s.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dati Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Seleziona contatto esistente</Label>
              <Select value={contactId || ""} onValueChange={handleContactSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Cerca contatto..." />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name} {c.company_name ? `(${c.company_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nome cliente *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div>
                <Label>Telefono</Label>
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </div>
              <div>
                <Label>Azienda</Label>
                <Input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
              </div>
              <div>
                <Label>Codice Fiscale</Label>
                <Input value={clientFiscalCode} onChange={(e) => setClientFiscalCode(e.target.value)} />
              </div>
              <div>
                <Label>P.IVA</Label>
                <Input value={clientVatNumber} onChange={(e) => setClientVatNumber(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Indirizzo</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
              </div>
            </div>
            <hr />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Titolo offerta</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Validità (giorni)</Label>
                <Input type="number" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)} />
              </div>
              <div className="md:col-span-2">
                <Label>Descrizione</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div>
                <Label>Note (visibili al cliente)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Note interne</Label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Prodotti e Servizi</CardTitle>
              <div className="flex gap-2">
                <Select onValueChange={(articleId) => {
                  const art = articles.find((a: any) => a.id === articleId);
                  if (art) importFromCatalog(art);
                }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Importa da catalogo" />
                  </SelectTrigger>
                  <SelectContent>
                    {articles.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {formatCurrency(a.unit_price || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => addItem("product")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Riga
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nessun prodotto. Aggiungi una riga o importa dal catalogo.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg">
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={item.name}
                        onChange={(e) => updateItem(idx, "name", e.target.value)}
                        placeholder="Nome prodotto"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-xs">Quantità</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-xs">Prezzo unit.</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-xs">Sconto %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={item.discount_percent}
                        onChange={(e) => updateItem(idx, "discount_percent", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-xs">IVA %</Label>
                      <Input
                        type="number"
                        value={item.vat_rate}
                        onChange={(e) => updateItem(idx, "vat_rate", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2 flex items-end gap-2">
                      <div className="flex-1 text-right">
                        <Label className="text-xs">Totale riga</Label>
                        <p className="font-medium text-sm py-2">
                          {formatCurrency(item.quantity * item.unit_price * (1 - item.discount_percent / 100))}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals summary */}
            {items.length > 0 && (
              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotale</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Sconto globale %</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 h-8 text-right"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Sconto</span>
                      <span>-{formatCurrency(discountAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA</span>
                    <span>{formatCurrency(vatAmount)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between font-bold text-base">
                    <span>Totale</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Documenti Allegati</CardTitle>
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileStack className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nessun materiale disponibile.</p>
                <p className="text-sm">Vai in Impostazioni → Materiali Preventivi per caricare PDF.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {materials.map((m: any) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedMaterials.includes(m.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedMaterials([...selectedMaterials, m.id]);
                        } else {
                          setSelectedMaterials(selectedMaterials.filter((x) => x !== m.id));
                        }
                      }}
                    />
                    <FileStack className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.category} — {(m.file_size_bytes / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                ))}
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedMaterials.length} documenti selezionati
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Riepilogo Preventivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Client summary */}
            <div>
              <h3 className="font-medium mb-2">Cliente</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> {clientName || "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {clientEmail || "—"}</div>
                <div><span className="text-muted-foreground">Azienda:</span> {clientCompany || "—"}</div>
                <div><span className="text-muted-foreground">Telefono:</span> {clientPhone || "—"}</div>
              </div>
            </div>

            {/* Items summary */}
            <div>
              <h3 className="font-medium mb-2">Prodotti ({items.length})</h3>
              {items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prodotto</TableHead>
                      <TableHead className="text-right">Qtà</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{it.name || "—"}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(it.quantity * it.unit_price * (1 - it.discount_percent / 100))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Nessun prodotto</p>
              )}
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotale</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Sconto {discountPercent}%</span>
                    <span>-{formatCurrency(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA</span>
                  <span>{formatCurrency(vatAmount)}</span>
                </div>
                <hr />
                <div className="flex justify-between font-bold text-lg">
                  <span>Totale</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Documents */}
            {selectedMaterials.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Documenti allegati ({selectedMaterials.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedMaterials.map((mId) => {
                    const m = materials.find((x: any) => x.id === mId);
                    return m ? (
                      <Badge key={mId} variant="secondary">{m.name}</Badge>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Indietro
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave("bozza")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salva Bozza
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              Avanti
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => handleSave("bozza")} disabled={saving || !clientName}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
              Salva Preventivo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
