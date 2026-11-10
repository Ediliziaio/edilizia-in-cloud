import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Package, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { caricaVociListino } from "@/lib/listino/vociListino";
import { caricaArticoliCatalogo } from "@/lib/listino/catalogoArticoli";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ArticleTemplateData {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_price: number;
  standard_cost: number;
  unit_of_measure: string;
  vat_rate: number;
  supplier_id: string | null;
  description: string | null;
  immagine_url: string | null;
  pdf_scheda_url: string | null;
  /** Origine: catalogo articoli (article_templates) o listino prodotti (article_families). */
  source?: "catalog" | "listino";
  /** Costo manodopera/posa da listino (solo article_families), se valorizzato. */
  manodopera_costo?: number | null;
  /** Il prodotto del listino (solo le voci «source: listino» intere, non le varianti). */
  family_id?: string | null;
  /** Si ordina su misura: una riga per posizione (vedi lib/orders/gruppiSuMisura). */
  su_misura?: boolean;
}

interface ArticleComboboxProps {
  modalita?: "vendita" | "acquisto";
  preferredSupplierId?: string;
  value: string;
  onValueChange: (value: string, templateData?: ArticleTemplateData) => void;
  placeholder?: string;
  /**
   * v8.6.34 — Fallback companyId per super_admin senza impersonation.
   * Se effectiveCompany è null, usiamo questo (es. company della commessa).
   */
  fallbackCompanyId?: string;
  /**
   * Se true, oltre al catalogo articoli (article_templates) mostra anche i
   * prodotti del Listino (article_families, con foto/costo base). Opt-in:
   * attivo solo dove serve (es. articoli di commessa).
   */
  includeListino?: boolean;
  /**
   * Un nome nuovo entra anche nel catalogo (default sì). Falso dove la scelta è di
   * chi inserisce: gli articoli di commessa, che non devono sporcare il catalogo.
   */
  salvaNuoviNelCatalogo?: boolean;
}

export function ArticleCombobox({
  value,
  onValueChange,
  placeholder = "Seleziona o digita nome articolo...",
  fallbackCompanyId,
  includeListino = false,
  modalita = "vendita",
  preferredSupplierId,
  salvaNuoviNelCatalogo = true,
}: ArticleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const companyId = effectiveCompany?.id ?? fallbackCompanyId;

  const { data: templates = [], isLoading: loadingCatalogo, isError: erroreCatalogo } = useQuery({
    queryKey: ["article-templates", companyId],
    queryFn: () => caricaArticoliCatalogo(companyId!),
    enabled: !!companyId,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error("Company ID non disponibile");
      const { data, error } = await supabase
        .from("article_templates")
        .insert({
          company_id: companyId,
          name: name.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates"] });
      queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
    },
  });

  // Listino prodotti (article_families) — opt-in.
  const { data: listino = [] } = useQuery({
    queryKey: ["article-combobox-listino", companyId],
    enabled: !!companyId && includeListino,
    queryFn: () => caricaVociListino(companyId!),
  });

  // Catalogo + Listino uniti (catalogo prima). Il catalogo è oggi spesso vuoto:
  // il listino è la fonte reale dei prodotti.
  const allTemplates: ArticleTemplateData[] = [
    ...templates.map((t) => ({ ...t, source: t.source ?? ("catalog" as const) })),
    ...listino,
  ];

  const filteredTemplates = allTemplates.filter((template) =>
    template.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    (template.sku && template.sku.toLowerCase().includes(searchValue.toLowerCase())) ||
    (template.description?.toLowerCase().includes(searchValue.toLowerCase())) ||
    (template.category?.toLowerCase().includes(searchValue.toLowerCase()))
  ).sort((a,b)=> modalita === "acquisto" && preferredSupplierId ? Number(b.supplier_id === preferredSupplierId)-Number(a.supplier_id === preferredSupplierId) : 0);

  const exactMatch = allTemplates.some(
    (template) => template.name.toLowerCase() === searchValue.toLowerCase()
  );

  const handleSelect = (template: ArticleTemplateData) => {
    onValueChange(template.name, template);
    setOpen(false);
    setSearchValue("");
  };

  const handleCreateNew = async () => {
    if (!searchValue.trim()) return;
    const trimmed = searchValue.trim();
    onValueChange(trimmed);
    setOpen(false);
    setSearchValue("");
    if (companyId && salvaNuoviNelCatalogo) {
      try {
        await createTemplateMutation.mutateAsync(trimmed);
      } catch {
        // Template non creato, ma il nome è già stato impostato
        toast.error("Articolo aggiunto all'ordine ma non salvato a catalogo");
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full min-w-0 justify-between gap-2 py-2 text-left font-normal"
          aria-label={modalita === "acquisto" ? "Articolo da acquistare" : "Articolo"}
        >
          <span className="min-w-0 whitespace-normal break-words leading-snug">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(34rem,calc(100vw-2rem))] min-w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca nome, codice, categoria o descrizione…"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <div className="flex items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2 text-xs text-slate-500"><span>{modalita === "acquisto" ? "Costi di acquisto · IVA esclusa" : "Articoli disponibili"}</span><span>{filteredTemplates.length} risultati</span></div>
          {erroreCatalogo && <p role="alert" className="px-3 py-2 text-xs text-red-700">Catalogo non disponibile. Chiudi e riapri per riprovare.</p>}
          <CommandList className="max-h-[min(24rem,50vh)]">
            <CommandEmpty className="py-3 px-4 text-sm text-muted-foreground">
              {loadingCatalogo ? "Caricamento articoli…" : searchValue.trim()
                ? <>Nessun articolo "{searchValue}" — premi <kbd className="px-1 py-0.5 mx-0.5 rounded border bg-muted text-[10px]">↩</kbd> o clicca sotto per crearne uno nuovo</>
                : allTemplates.length === 0
                  ? (includeListino
                      ? "Nessun prodotto nel listino né nel catalogo. Digita un nome per aggiungerlo al volo, oppure popola il Listino prodotti in Impostazioni → Listino."
                      : "Il catalogo articoli è vuoto. Digita un nome per aggiungerlo al volo (verrà salvato a catalogo), oppure popolalo in Impostazioni → Catalogo articoli con foto, scheda e prezzi.")
                  : "Digita per cercare, oppure scegli un prodotto qui sotto."}
            </CommandEmpty>
            <CommandGroup>
              {filteredTemplates.map((template) => (
                <CommandItem
                  key={`${template.source}:${template.id}`}
                  value={`${template.source}:${template.id}`}
                  onSelect={() => handleSelect(template)}
                  className="items-start gap-2 px-3 py-3"
                >
                  <Check
                    className={cn(
                      "mt-1.5 h-4 w-4 shrink-0",
                      value === template.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {template.immagine_url ? (
                    <img
                      src={template.immagine_url}
                      alt=""
                      loading="lazy"
                      className="h-9 w-9 rounded object-cover border shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold leading-snug">{template.name}</span>
                      {modalita === "acquisto" && preferredSupplierId && template.supplier_id === preferredSupplierId && <span className="rounded bg-emerald-50 px-1.5 text-[10px] text-emerald-700">Questo fornitore</span>}
                      {template.sku && (
                        <span className="text-[10px] text-muted-foreground">({template.sku})</span>
                      )}
                      {template.source === "listino" && (
                        <span className="text-[9px] px-1.5 py-0 rounded-full bg-blue-100 text-blue-700">listino</span>
                      )}
                      {template.category && (
                        <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground">
                          {template.category}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {modalita === "acquisto" ? <span className="text-xs font-medium text-slate-700">{template.standard_cost > 0 ? `${formatCurrency(template.standard_cost)} / ${template.unit_of_measure || "pz"}` : "Costo da definire"}</span> : template.unit_price > 0 && <span className="text-xs text-muted-foreground">{formatCurrency(template.unit_price)} / {template.unit_of_measure || "pz"}</span>}
                      {modalita === "acquisto" && <span className="text-[11px] text-slate-500">IVA {template.vat_rate ?? 22}%</span>}
                      {template.pdf_scheda_url && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600">
                          <FileText className="h-3 w-3" /> scheda
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
              {searchValue.trim() && !exactMatch && (
                <CommandItem
                  value={`create-${searchValue}`}
                  onSelect={handleCreateNew}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi "{searchValue}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
