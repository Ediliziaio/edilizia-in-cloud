import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagSelector({ selectedTags, onTagsChange }: TagSelectorProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["marketing_tags", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_tags")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("marketing_tags").insert({
        company_id: companyId!,
        name: name.trim().toLowerCase(),
      });
      if (error) throw error;
    },
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["marketing_tags"] });
      const normalized = name.trim().toLowerCase();
      if (!selectedTags.includes(normalized)) {
        onTagsChange([...selectedTags, normalized]);
      }
      setSearch("");
      toast.success("Tag creato");
    },
    onError: (e: any) => {
      if (e.message?.includes("duplicate") || e.code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nella creazione del tag");
      }
    },
  });

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onTagsChange(selectedTags.filter((t) => t !== tagName));
    } else {
      onTagsChange([...selectedTags, tagName]);
    }
  };

  const removeTag = (tagName: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tagName));
  };

  const searchNormalized = search.trim().toLowerCase();
  const canCreate = searchNormalized && !tags.some((t) => t.name === searchNormalized);

  return (
    <div className="space-y-1.5">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between text-muted-foreground font-normal">
            Seleziona o crea tag...
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Cerca o crea tag..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="py-2 px-3 text-sm text-muted-foreground">
                Nessun tag trovato.
              </CommandEmpty>
              <CommandGroup>
                {tags
                  .filter((t) => !searchNormalized || t.name.includes(searchNormalized))
                  .map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggleTag(tag.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedTags.includes(tag.name) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {tag.name}
                    </CommandItem>
                  ))}
              </CommandGroup>
              {canCreate && (
                <CommandGroup>
                  <CommandItem
                    onSelect={() => createMutation.mutate(searchNormalized)}
                    className="text-primary"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Crea "{searchNormalized}"
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
