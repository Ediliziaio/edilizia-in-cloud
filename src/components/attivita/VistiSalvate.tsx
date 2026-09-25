/**
 * Viste salvate della Regia attività: un insieme di filtri con un nome.
 *
 * Prima ogni mattina si rifaceva a mano la stessa selezione ("le mie, scadute,
 * commessa X"), e al ricaricamento della pagina priorità, categoria e ricerca
 * si perdevano perché nell'indirizzo finivano solo quattro filtri su sette.
 * Una vista si può tenere per sé o condividerla con i colleghi.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, BookmarkPlus, Check, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** I filtri che compongono una vista. Deliberatamente piatto: finisce in jsonb. */
export interface FiltriVista {
  vista?: string;
  stato?: string;
  priorita?: string;
  categoria?: string;
  fonte?: string;
  assegnatario?: string;
  ricerca?: string;
  ordina?: { col: string; dir: "asc" | "desc" } | null;
}

interface VistaSalvata {
  id: string;
  name: string;
  filters: FiltriVista;
  is_shared: boolean;
  user_id: string;
}

interface Props {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  /** Filtri attualmente impostati: è quello che si salva. */
  filtriCorrenti: FiltriVista;
  /** Applica una vista scelta dall'elenco. */
  onApplica: (filtri: FiltriVista) => void;
}

export function VistiSalvate({ companyId, userId, filtriCorrenti, onApplica }: Props) {
  const queryClient = useQueryClient();
  const [dialogAperto, setDialogAperto] = useState(false);
  const [nome, setNome] = useState("");
  const [condivisa, setCondivisa] = useState(false);
  const chiave = ["task-saved-views", companyId];

  const { data: viste = [] } = useQuery<VistaSalvata[]>({
    queryKey: chiave,
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_saved_views")
        .select("id, name, filters, is_shared, user_id")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VistaSalvata[];
    },
  });

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("task_saved_views").insert({
        company_id: companyId!,
        user_id: userId!,
        name: nome.trim(),
        filters: filtriCorrenti as never,
        is_shared: condivisa,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(condivisa ? `Vista "${nome.trim()}" salvata e condivisa` : `Vista "${nome.trim()}" salvata`);
      queryClient.invalidateQueries({ queryKey: chiave });
      setDialogAperto(false);
      setNome("");
      setCondivisa(false);
    },
    onError: (e: Error) => toast.error("Vista non salvata", { description: e.message }),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vista eliminata");
      queryClient.invalidateQueries({ queryKey: chiave });
    },
    onError: (e: Error) => toast.error("Eliminazione non riuscita", { description: e.message }),
  });

  if (!companyId || !userId) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2" aria-label="Viste salvate">
            <Bookmark className="h-4 w-4" />
            Viste{viste.length > 0 ? ` (${viste.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Viste salvate</DropdownMenuLabel>
          {viste.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Nessuna vista. Imposta i filtri che usi tutti i giorni e salvali qui.
            </div>
          )}
          {viste.map((v) => (
            <DropdownMenuItem
              key={v.id}
              className="flex items-center gap-2"
              onSelect={(e) => { e.preventDefault(); onApplica(v.filters ?? {}); toast.success(`Vista "${v.name}"`); }}
            >
              <Check className="h-3.5 w-3.5 opacity-0" />
              <span className="flex-1 truncate">{v.name}</span>
              {v.is_shared && <Users className="h-3 w-3 text-muted-foreground" aria-label="condivisa" />}
              {v.user_id === userId && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Elimina la vista ${v.name}`}
                  onClick={(e) => { e.stopPropagation(); elimina.mutate(v.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogAperto(true)}>
            <BookmarkPlus className="mr-2 h-4 w-4" />
            Salva i filtri di adesso
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogAperto} onOpenChange={setDialogAperto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salva la vista</DialogTitle>
            <DialogDescription>
              I filtri impostati adesso si riaprono con un click, anche domani.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome-vista">Nome</Label>
              <Input
                id="nome-vista"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Le mie scadute"
                maxLength={60}
                onKeyDown={(e) => { if (e.key === "Enter" && nome.trim()) salva.mutate(); }}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="vista-condivisa" className="text-sm">Condividi con il team</Label>
                <p className="text-xs text-muted-foreground">La vedono tutti, la modifichi solo tu.</p>
              </div>
              <Switch id="vista-condivisa" checked={condivisa} onCheckedChange={setCondivisa} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAperto(false)}>Annulla</Button>
            <Button onClick={() => salva.mutate()} disabled={!nome.trim() || salva.isPending}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
