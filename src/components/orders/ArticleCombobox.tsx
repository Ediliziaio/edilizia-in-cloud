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

interface ArticleTemplate {
  id: string;
  name: string;
}

interface ArticleComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function ArticleCombobox({
  value,
  onValueChange,
  placeholder = "Seleziona o digita nome articolo...",
}: ArticleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch company ID
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch article templates
  const { data: templates = [] } = useQuery({
    queryKey: ["article-templates", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name")
        .eq("company_id", profile!.company_id)
        .order("name");
      if (error) throw error;
      return data as ArticleTemplate[];
    },
    enabled: !!profile?.company_id,
  });

  // Create new template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("article_templates")
        .insert({
          company_id: profile!.company_id,
          name: name.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates"] });
    },
  });

  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  const exactMatch = templates.some(
    (template) => template.name.toLowerCase() === searchValue.toLowerCase()
  );

  const handleSelect = async (selectedValue: string) => {
    onValueChange(selectedValue);
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
                  onSelect={() => handleSelect(template.name)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === template.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {template.name}
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
