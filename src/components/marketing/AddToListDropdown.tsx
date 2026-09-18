import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { perOgniLotto, raccogliALotti, LOTTO_RIGHE } from "@/lib/lottiDiId";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { CreateListDialog } from "./CreateListDialog";

interface AddToListDropdownProps {
  selectedIds: Set<string>;
}

async function assertListBelongsToCompany(listId: string, companyId: string | undefined) {
  if (!companyId) throw new Error("Azienda non selezionata");

  const { data, error } = await supabase
    .from("marketing_contact_lists")
    .select("id")
    .eq("id", listId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Lista non disponibile per questa azienda");
}

async function getCompanyScopedContactIds(contactIds: string[], companyId: string | undefined) {
  if (!companyId) throw new Error("Azienda non selezionata");
  if (contactIds.length === 0) throw new Error("Seleziona almeno un contatto");

  // A lotti: PostgREST risponde al massimo con mille righe e l'URL non regge
  // 25.000 id, quindi con la selezione intera il controllo qui sotto
  // («ne ho ritrovati quanti ne ho mandati») falliva da solo.
  const safeIds = await raccogliALotti(contactIds, async (lotto) => {
    const { data, error } = await supabase
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", companyId)
      .in("id", lotto);
    if (error) throw error;
    return (data || []).map((row) => row.id);
  });
  if (safeIds.length !== contactIds.length) {
    throw new Error("Alcuni contatti selezionati non appartengono all'azienda corrente");
  }

  return safeIds;
}

export function AddToListDropdown({ selectedIds }: AddToListDropdownProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: lists = [] } = useQuery({
    queryKey: queryKeys.contactLists.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contact_lists")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && open,
  });

  const addMutation = useMutation({
    mutationFn: async (listId: string) => {
      await assertListBelongsToCompany(listId, companyId);
      const contactIds = await getCompanyScopedContactIds(Array.from(selectedIds), companyId);

      let aggiunti = 0;
      try {
        await perOgniLotto(contactIds, async (lotto) => {
          const rows = lotto.map((contactId) => ({ list_id: listId, contact_id: contactId }));
          const { error } = await supabase.from("marketing_contact_list_members").upsert(rows, { onConflict: "list_id,contact_id" });
          if (error) throw error;
          aggiunti += lotto.length;
        }, LOTTO_RIGHE);
      } catch (errore) {
        // A lotti si può fallire a metà: chi è già nella lista ci resta.
        throw new Error(
          aggiunti > 0
            ? `${aggiunti} contatti aggiunti, poi si è fermata: ${errore instanceof Error ? errore.message : String(errore)}`
            : errore instanceof Error ? errore.message : String(errore),
          { cause: errore },
        );
      }
      return aggiunti;
    },
    onSuccess: (aggiunti: number) => {
      toast.success(`${aggiunti.toLocaleString("it-IT")} contatti aggiunti alla lista`);
      queryClient.invalidateQueries({ queryKey: queryKeys.contactLists.all });
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Errore nell'aggiunta"),
  });

  const createAndAdd = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const contactIds = await getCompanyScopedContactIds(Array.from(selectedIds), companyId);

      const { data: list, error } = await supabase
        .from("marketing_contact_lists")
        .insert({ company_id: companyId, name: data.name, description: data.description || null })
        .select("id")
        .single();
      if (error) throw error;

      await perOgniLotto(contactIds, async (lotto) => {
        const rows = lotto.map((contactId) => ({ list_id: list.id, contact_id: contactId }));
        const { error: err2 } = await supabase.from("marketing_contact_list_members").insert(rows);
        if (err2) throw err2;
      }, LOTTO_RIGHE);
    },
    onSuccess: () => {
      toast.success("Lista creata e contatti aggiunti");
      queryClient.invalidateQueries({ queryKey: queryKeys.contactLists.all });
      setCreateOpen(false);
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Errore nella creazione"),
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || addMutation.isPending || createAndAdd.isPending}>
            <ListPlus className="h-4 w-4 mr-1" /> Aggiungi a lista
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {lists.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">Nessuna lista</p>
            ) : (
              lists.map((l) => (
                <button
                  key={l.id}
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  onClick={() => addMutation.mutate(l.id)}
                  disabled={addMutation.isPending}
                >
                  {l.name}
                </button>
              ))
            )}
          </div>
          <div className="border-t mt-1 pt-1">
            <button
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-center gap-1.5 text-primary"
              onClick={() => { setOpen(false); setCreateOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" /> Crea nuova lista
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(data) => createAndAdd.mutateAsync(data)}
      />
    </>
  );
}
