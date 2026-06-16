import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Package, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
}

interface ArticleComboboxProps {
  value: string;
  onValueChange: (value: string, templateData?: ArticleTemplateData) => void;
  placeholder?: string;
  /**
   * v8.6.34 — Fallback companyId per super_admin senza impersonation.
   * Se effectiveCompany è null, usiamo questo (es. company della commessa).
   */
  fallbackCompanyId?: string;
}

export function ArticleCombobox({
  value,
  onValueChange,
  placeholder = "Seleziona o digita nome articolo...",
  fallbackCompanyId,
}: ArticleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const companyId = effectiveCompany?.id ?? fallbackCompanyId;

  const { data: templates = [] } = useQuery({
    queryKey: ["article-templates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description, immagine_url, pdf_scheda_url")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as ArticleTemplateData[];
    },
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

  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    (template.sku && template.sku.toLowerCase().includes(searchValue.toLowerCase()))
  );

  const exactMatch = templates.some(
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
    if (companyId) {
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
          className="w-full justify-between font-normal"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca o digita nuovo nome..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty className="py-3 px-4 text-sm text-muted-foreground">
              {searchValue.trim()
                ? <>Nessun articolo "{searchValue}" — premi <kbd className="px-1 py-0.5 mx-0.5 rounded border bg-muted text-[10px]">↩</kbd> o clicca sotto per crearne uno nuovo</>
                : templates.length === 0
                  ? "Il catalogo articoli è vuoto. Digita un nome per aggiungerlo al volo (verrà salvato a catalogo), oppure popolalo in Impostazioni → Catalogo articoli con foto, scheda e prezzi."
                  : "Digita per cercare, oppure scegli un articolo del catalogo qui sotto."}
            </CommandEmpty>
            <CommandGroup>
              {filteredTemplates.map((template) => (
                <CommandItem
                  key={template.id}
                  value={template.name}
                  onSelect={() => handleSelect(template)}
                  className="items-start gap-2"
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
                      <span className="font-medium truncate">{template.name}</span>
                      {template.sku && (
                        <span className="text-[10px] text-muted-foreground">({template.sku})</span>
                      )}
                      {template.category && (
                        <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground">
                          {template.category}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{template.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {template.unit_price > 0 && (
                        <span className="text-[11px] text-muted-foreground">€{template.unit_price.toFixed(2)}</span>
                      )}
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
