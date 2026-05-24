import { useMemo, useState, forwardRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertCircle, Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DEFAULT_TAG_COLOR, normalizeTagList, normalizeTagName } from "@/lib/marketingTags";

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

type MarketingTag = {
  id: string;
  name: string;
  color: string | null;
};

function getTagErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "";
}

export const TagSelector = forwardRef<HTMLDivElement, TagSelectorProps>(({ selectedTags, onTagsChange }, ref) => {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tags = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.marketingTags.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_tags")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as MarketingTag[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const normalizedName = normalizeTagName(name);
      if (!normalizedName) throw new Error("Inserisci un nome tag valido");
      if (tags.some((tag) => normalizeTagName(tag.name) === normalizedName)) {
        throw new Error("DUPLICATE_TAG");
      }
      const { error } = await supabase.from("marketing_tags").insert({
        company_id: companyId,
        name: normalizedName,
        color: DEFAULT_TAG_COLOR,
      });
      if (error) throw error;
    },
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingTags.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
      const normalized = normalizeTagName(name);
      if (!normalizeTagList(selectedTags).includes(normalized)) {
        onTagsChange(normalizeTagList([...selectedTags, normalized]));
      }
      setSearch("");
      toast.success("Tag creato");
    },
    onError: (e: unknown) => {
      const message = getTagErrorMessage(e);
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (message.includes("DUPLICATE_TAG") || message.includes("duplicate") || code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nella creazione del tag");
      }
    },
  });

  const toggleTag = (tagName: string) => {
    const normalizedName = normalizeTagName(tagName);
    const currentTags = normalizeTagList(selectedTags);
    if (!normalizedName) return;

    if (currentTags.includes(normalizedName)) {
      onTagsChange(currentTags.filter((tag) => tag !== normalizedName));
    } else {
      onTagsChange([...currentTags, normalizedName]);
    }
  };

  const removeTag = (tagName: string) => {
    const normalizedName = normalizeTagName(tagName);
    onTagsChange(normalizeTagList(selectedTags).filter((tag) => tag !== normalizedName));
  };

  const normalizedSelectedTags = useMemo(() => normalizeTagList(selectedTags), [selectedTags]);
  const searchNormalized = normalizeTagName(search);
  const visibleTags = useMemo(
    () => tags.filter((tag) => !searchNormalized || normalizeTagName(tag.name).includes(searchNormalized)),
    [searchNormalized, tags],
  );
  const canCreate = searchNormalized.length > 0 && !!companyId && !tags.some((t) => normalizeTagName(t.name) === searchNormalized);
  const colorByName = useMemo(
    () => new Map(tags.map((tag) => [normalizeTagName(tag.name), tag.color || DEFAULT_TAG_COLOR])),
    [tags],
  );

  return (
    <div ref={ref} className="space-y-1.5">
      {normalizedSelectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {normalizedSelectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorByName.get(tag) || DEFAULT_TAG_COLOR }} />
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
              onValueChange={(v) => { if (v.length <= 50) setSearch(v); }}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Caricamento tag...
                </div>
              ) : isError ? (
                <div className="space-y-2 px-3 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Tag non disponibili.
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                    Riprova
                  </Button>
                </div>
              ) : (
                <>
                  <CommandEmpty className="py-2 px-3 text-sm text-muted-foreground">
                    Nessun tag trovato.
                  </CommandEmpty>
                  <CommandGroup>
                    {visibleTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggleTag(tag.name)}
                    >
                      <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          normalizedSelectedTags.includes(normalizeTagName(tag.name)) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {tag.name}
                    </CommandItem>
                    ))}
                  </CommandGroup>
                  {canCreate && (
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          if (!createMutation.isPending) createMutation.mutate(searchNormalized);
                        }}
                        className="text-primary"
                      >
                        {createMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        {createMutation.isPending ? "Creazione..." : `Crea "${searchNormalized}"`}
                      </CommandItem>
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
});
TagSelector.displayName = "TagSelector";
