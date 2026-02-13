import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
}

interface ArticleComboboxProps {
  value: string;
  onValueChange: (value: string, templateData?: ArticleTemplateData) => void;
  placeholder?: string;
}

export function ArticleCombobox({
  value,
  onValueChange,
  placeholder = "Seleziona o digita nome articolo...",
}: ArticleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const companyId = effectiveCompany?.id;

  const { data: templates = [] } = useQuery({
    queryKey: ["article-templates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description")
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
    
    await createTemplateMutation.mutateAsync(searchValue);
    onValueChange(searchValue.trim());
    setOpen(false);
    setSearchValue("");
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
            <CommandEmpty className="py-2 px-4 text-sm text-muted-foreground">
              Nessun articolo trovato
            </CommandEmpty>
            <CommandGroup>
              {filteredTemplates.map((template) => (
                <CommandItem
                  key={template.id}
                  value={template.name}
                  onSelect={() => handleSelect(template)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === template.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span>{template.name}</span>
                    {template.sku && (
                      <span className="ml-2 text-xs text-muted-foreground">({template.sku})</span>
                    )}
                  </div>
                  {template.unit_price > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      €{template.unit_price.toFixed(2)}
                    </span>
                  )}
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
