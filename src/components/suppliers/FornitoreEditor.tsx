import { useRef, useState, type FormEvent } from "react";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  QrCode,
  UserRound,
  Building2,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { PAGAMENTI_FORNITORI as PAYMENT_METHODS } from "@/lib/impostazioni/pagamentiFornitori";
import { VAT_RATES } from "@/lib/vatUtils";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyForm,
  supplierToForm,
  normalizeSupplierName,
  supplierNameKey,
  normalizeVatNumber,
  isValidEmail,
  isValidPhone,
  isValidItalianVat,
  validaDettagliFornitore,
  type Supplier,
  type SupplierFormData,
} from "@/lib/suppliers/anagraficaFornitore";
// ─── Finestra del fornitore (nuovo / modifica) ──────────────────────────────

export interface FornitoreDialogProps {
  /** Il fornitore da modificare; null = nuovo. */
  fornitore: Supplier | null;
  /** Per un fornitore nuovo: parte dalla scheda aperta (Italiani o Esteri). */
  esteroIniziale: boolean;
  fornitori: Supplier[];
  categorieEsistenti: string[];
  salvataggio: boolean;
  onChiudi: () => void;
  onSalva: (dati: SupplierFormData) => void;
}

/** Si monta solo da aperta: ogni apertura riparte dai dati del fornitore (o da vuota), senza un effetto che li ricopi. */
export function FornitoreEditor({
  aperta,
  ...resto
}: FornitoreDialogProps & { aperta: boolean }) {
  if (!aperta) return null;
  return <FornitoreDialogAperta {...resto} />;
}

function FornitoreDialogAperta({
  fornitore,
  esteroIniziale,
  fornitori,
  categorieEsistenti,
  salvataggio,
  onChiudi,
  onSalva,
}: FornitoreDialogProps) {
  const [formIniziale] = useState<SupplierFormData>(() =>
    fornitore
      ? supplierToForm(fornitore)
      : { ...emptyForm, is_foreign: esteroIniziale },
  );
  const [formData, setFormData] = useState<SupplierFormData>(formIniziale);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const vaiASezione = (id: string) => {
    const contenitore = scrollRef.current;
    const sezione = document.getElementById(id);
    if (!contenitore || !sezione) return;
    contenitore.scrollTo({
      top:
        sezione.getBoundingClientRect().top -
        contenitore.getBoundingClientRect().top +
        contenitore.scrollTop -
        8,
    });
  };
  const modificato = JSON.stringify(formData) !== JSON.stringify(formIniziale);
  // Esc, clic fuori e «Annulla» chiedono conferma solo se si è scritto o cambiato qualcosa.
  const conferma = useSettingsDraftGuard(salvataggio || modificato);
  const chiudi = () => {
    if (!salvataggio && conferma()) onChiudi();
  };
  const updateField = (
    field: keyof SupplierFormData,
    value: string | number | boolean,
  ) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (salvataggio) return;
    const safeName = normalizeSupplierName(formData.name);
    const safeNameKey = supplierNameKey(formData.name);
    const safeVatNumber = normalizeVatNumber(formData.vat_number);
    if (!safeName) {
      toast.error("Errore", { description: "Il nome è obbligatorio." });
      return;
    }
    if (
      (!fornitore || safeNameKey !== supplierNameKey(fornitore.name)) &&
      fornitori.some(
        (supplier) =>
          supplier.id !== fornitore?.id &&
          supplierNameKey(supplier.name) === safeNameKey,
      )
    ) {
      toast.error("Fornitore duplicato", {
        description: "Esiste già un fornitore con questa ragione sociale.",
      });
      return;
    }
    if (
      safeVatNumber &&
      (!fornitore ||
        safeVatNumber !== normalizeVatNumber(fornitore.vat_number || "")) &&
      fornitori.some(
        (supplier) =>
          supplier.id !== fornitore?.id &&
          normalizeVatNumber(supplier.vat_number || "") === safeVatNumber,
      )
    ) {
      toast.error("P.IVA duplicata", {
        description: "Esiste già un fornitore con questa partita IVA.",
      });
      return;
    }
    if (!isValidItalianVat(formData.vat_number, formData.is_foreign)) {
      toast.error("P.IVA non valida", {
        description:
          "Per fornitori italiani usa 11 cifre, con prefisso IT opzionale.",
      });
      return;
    }
    if (!isValidEmail(formData.email)) {
      toast.error("Email non valida", {
        description: "Inserisci un indirizzo email valido.",
      });
      return;
    }
    if (!isValidPhone(formData.phone)) {
      toast.error("Telefono non valido", {
        description: "Usa solo numeri, spazi, +, parentesi, punti o trattini.",
      });
      return;
    }
    const errore = validaDettagliFornitore(formData);
    if (errore) {
      toast.error("Controlla i dati", { description: errore });
      return;
    }
    onSalva(formData);
  };

  return (
    <Dialog
      open
      onOpenChange={(aperta) => {
        if (!aperta) chiudi();
      }}
    >
      <DialogContent className="flex max-h-[94dvh] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>
            {fornitore ? "Modifica fornitore" : "Nuovo fornitore"}
          </DialogTitle>
          <DialogDescription>
            Solo il nome è obbligatorio. Completa i contatti del referente, i
            dati fiscali e le condizioni d’acquisto quando sono disponibili.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <nav
            aria-label="Sezioni del fornitore"
            className="flex shrink-0 flex-wrap gap-1 border-b px-4 py-2"
          >
            {[
              ["fornitore-generali", "Anagrafica"],
              ["fornitore-referente", "Referente"],
              ["fornitore-commerciali", "Pagamenti e acquisti"],
            ].map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => vaiASezione(id)}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-5">
            <fieldset
              disabled={salvataggio}
              className="grid min-w-0 gap-5 lg:grid-cols-2 disabled:opacity-60"
            >
              {/* Dati generali */}
              <div
                id="fornitore-generali"
                className="min-w-0 scroll-mt-4 rounded-xl border p-4 lg:col-span-2"
              >
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Dati generali
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome del fornitore *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="Es. ABC Serramenti Srl"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-categoria">Categoria</Label>
                    <Popover
                      open={categoryPopoverOpen}
                      onOpenChange={setCategoryPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          id="supplier-categoria"
                          variant="outline"
                          role="combobox"
                          aria-expanded={categoryPopoverOpen}
                          className="w-full justify-between font-normal"
                        >
                          {formData.product_category ||
                            "Seleziona categoria..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[--radix-popover-trigger-width] p-0"
                        align="start"
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Cerca o crea categoria..."
                            value={categorySearch}
                            onValueChange={setCategorySearch}
                            maxLength={50}
                          />
                          <CommandList>
                            <CommandEmpty className="py-2 px-4 text-sm text-muted-foreground">
                              Nessuna categoria trovata
                            </CommandEmpty>
                            <CommandGroup>
                              {categorieEsistenti
                                .filter(
                                  (cat) =>
                                    !categorySearch ||
                                    cat
                                      .toLowerCase()
                                      .includes(categorySearch.toLowerCase()),
                                )
                                .map((cat) => (
                                  <CommandItem
                                    key={cat}
                                    value={cat}
                                    onSelect={() => {
                                      updateField("product_category", cat);
                                      setCategoryPopoverOpen(false);
                                      setCategorySearch("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.product_category === cat
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {cat}
                                  </CommandItem>
                                ))}
                              {categorySearch.trim() &&
                                !categorieEsistenti.some(
                                  (c) =>
                                    c.toLowerCase() ===
                                    categorySearch.toLowerCase(),
                                ) && (
                                  <CommandItem
                                    value={`create-${categorySearch}`}
                                    onSelect={() => {
                                      updateField(
                                        "product_category",
                                        categorySearch.trim(),
                                      );
                                      setCategoryPopoverOpen(false);
                                      setCategorySearch("");
                                    }}
                                    className="text-primary"
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Crea "{categorySearch}"
                                  </CommandItem>
                                )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mt-3">
                  <div className="space-y-2">
                    <Label htmlFor="supplier-pagamento">
                      Modalità di pagamento
                    </Label>
                    <Select
                      value={formData.payment_method || "none"}
                      onValueChange={(v) =>
                        updateField("payment_method", v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger id="supplier-pagamento">
                        <SelectValue placeholder="Seleziona modalità..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuna</SelectItem>
                        {formData.payment_method &&
                          !PAYMENT_METHODS.some(
                            (m) => m.value === formData.payment_method,
                          ) && (
                            <SelectItem value={formData.payment_method}>
                              {formData.payment_method.replace(/_/g, " ")}
                            </SelectItem>
                          )}
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-tipo">Tipo fornitore</Label>
                    <Select
                      value={formData.is_foreign ? "estero" : "italiano"}
                      onValueChange={(v) =>
                        updateField("is_foreign", v === "estero")
                      }
                    >
                      <SelectTrigger id="supplier-tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="italiano">Italiano</SelectItem>
                        <SelectItem value="estero">Estero</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-2 mt-4 rounded-md border p-3">
                  <Checkbox
                    id="supplier-active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      updateField("is_active", checked === true)
                    }
                  />
                  <div>
                    <Label htmlFor="supplier-active" className="cursor-pointer">
                      Fornitore attivo
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      I fornitori inattivi restano nello storico, ma non
                      dovrebbero essere usati per nuovi acquisti.
                    </p>
                  </div>
                </div>
              </div>

              <div
                id="fornitore-referente"
                className="min-w-0 scroll-mt-4 rounded-xl border bg-primary/[0.02] p-4 lg:col-span-2"
              >
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4 text-primary" />
                  Referente / responsabile
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  La persona da contattare per questo fornitore. I suoi recapiti
                  restano separati da quelli generali dell’azienda.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      [
                        "contact_name",
                        "Nome del referente",
                        "Nome e cognome",
                        "text",
                      ],
                      [
                        "contact_role",
                        "Ruolo / reparto",
                        "Es. commerciale, amministrazione",
                        "text",
                      ],
                      [
                        "contact_email",
                        "Email del referente",
                        "nome@fornitore.it",
                        "email",
                      ],
                      [
                        "contact_phone",
                        "Telefono del referente",
                        "+39…",
                        "tel",
                      ],
                    ] as const
                  ).map(([key, label, placeholder, type]) => (
                    <div key={key} className="min-w-0 space-y-2">
                      <Label htmlFor={key}>{label}</Label>
                      <Input
                        id={key}
                        type={type}
                        maxLength={key === "contact_phone" ? 25 : 200}
                        value={formData[key]}
                        placeholder={placeholder}
                        onChange={(e) => updateField(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Dati fiscali */}
              <div className="min-w-0 rounded-xl border p-4">
                <h3 className="text-sm font-semibold mb-3">Dati fiscali</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="vat_number">P.IVA</Label>
                    <Input
                      id="vat_number"
                      value={formData.vat_number}
                      onChange={(e) =>
                        updateField("vat_number", e.target.value)
                      }
                      placeholder="IT01234567890"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fiscal_code">Codice fiscale</Label>
                    <Input
                      id="fiscal_code"
                      value={formData.fiscal_code}
                      onChange={(e) =>
                        updateField("fiscal_code", e.target.value)
                      }
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vat_rate">Aliquota IVA</Label>
                    <Select
                      value={formData.vat_rate.toString()}
                      onValueChange={(v) =>
                        updateField("vat_rate", parseInt(v))
                      }
                    >
                      <SelectTrigger id="vat_rate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VAT_RATES.map((rate) => (
                          <SelectItem
                            key={rate.value}
                            value={rate.value.toString()}
                          >
                            {rate.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Contatti */}
              <div className="min-w-0 rounded-xl border p-4">
                <h3 className="text-sm font-semibold mb-3">
                  Contatti aziendali
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="info@fornitore.it"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefono</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+39 0123 456789"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Sito web</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => updateField("website", e.target.value)}
                      placeholder="www.fornitore.it"
                      maxLength={100}
                    />
                  </div>
                </div>
              </div>

              {/* Indirizzo */}
              <div className="min-w-0 rounded-xl border p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold mb-3">Indirizzo</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="address">Via / Indirizzo</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      placeholder="Via Roma 1"
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Città</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      maxLength={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="province">Provincia</Label>
                    <Input
                      id="province"
                      value={formData.province}
                      onChange={(e) => updateField("province", e.target.value)}
                      placeholder="MI"
                      maxLength={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">CAP</Label>
                    <Input
                      id="postal_code"
                      value={formData.postal_code}
                      onChange={(e) =>
                        updateField("postal_code", e.target.value)
                      }
                      placeholder="20100"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Paese</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => updateField("country", e.target.value)}
                      maxLength={50}
                    />
                  </div>
                </div>
              </div>

              <div
                id="fornitore-commerciali"
                className="min-w-0 scroll-mt-4 rounded-xl border p-4 lg:col-span-2"
              >
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Pagamenti e condizioni d’acquisto
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Dati di riferimento. Le condizioni e le scadenze effettive si
                  definiscono nei singoli ordini d’acquisto.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="iban">IBAN</Label>
                    <Input
                      id="iban"
                      value={formData.iban}
                      maxLength={42}
                      placeholder="IT…"
                      onChange={(e) => updateField("iban", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Banca</Label>
                    <Input
                      id="bank_name"
                      value={formData.bank_name}
                      maxLength={150}
                      onChange={(e) => updateField("bank_name", e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ["lead_time_days", "Consegna indicativa (giorni)"],
                      ["min_order_amount", "Ordine minimo (€)"],
                      ["credit_limit", "Fido concordato (€)"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>{label}</Label>
                      <Input
                        id={key}
                        inputMode={
                          key === "lead_time_days" ? "numeric" : "decimal"
                        }
                        placeholder="Non indicato"
                        value={formData[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="space-y-2">
                    <Label htmlFor="rating">Valutazione interna</Label>
                    <select
                      id="rating"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={formData.rating}
                      onChange={(e) => updateField("rating", e.target.value)}
                    >
                      <option value="">Non valutato</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "stella" : "stelle"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Note */}
              <div className="min-w-0 rounded-xl border p-4 space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Note aggiuntive sul fornitore..."
                  rows={3}
                  maxLength={2000}
                />
              </div>

              {/* Codici a barre: l'unica scelta che qualcuno legge è «usa GS1» (il carico rapido del magazzino).
              «Prefisso barcode» e «Formato QR» sono stati tolti: non li leggeva nessun codice. */}
              <Accordion
                type="single"
                collapsible
                className="border rounded-lg"
              >
                <AccordionItem value="codici-a-barre" className="border-0">
                  <AccordionTrigger className="px-3 py-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-left">
                      <QrCode className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">
                          Codici a barre
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formData.uses_gs1 ? "GS1 attivo" : "GS1 non attivo"}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        id="uses-gs1"
                        checked={formData.uses_gs1}
                        onCheckedChange={(checked) =>
                          updateField("uses_gs1", checked === true)
                        }
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="uses-gs1"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Questo fornitore usa codici GS1
                        </Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Il lettore legge da solo lotto, seriale e scadenza dai
                          QR di questo fornitore.
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </fieldset>
          </div>
          <DialogFooter className="shrink-0 flex-row gap-2 border-t bg-background px-5 py-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={salvataggio}
              onClick={chiudi}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              disabled={salvataggio}
            >
              {salvataggio && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {fornitore ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
