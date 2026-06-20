/**
 * NuovaSimulazioneDialog — crea una nuova simulazione contratto.
 *
 * Dialog compatto: campo "nome" obbligatorio + collegamento OPZIONALE a un
 * contatto CRM tramite un combobox a tutta larghezza (Popover + Command su
 * `marketing_contacts`). Su create passa `nome` e `contact_id` → `create`
 * (useSimulazioniMutations) → naviga all'editor. La simulazione nasce con
 * voci/fasi vuote e DEFAULT_SCENARI.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, ChevronsUpDown, Check, X, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSimulazioniMutations } from "@/hooks/useSimulazioni";

interface ContattoLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const contactLabel = (c: ContattoLite) =>
  `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Senza nome";

interface NuovaSimulazioneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuovaSimulazioneDialog({ open, onOpenChange }: NuovaSimulazioneDialogProps) {
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const { create } = useSimulazioniMutations();
  const [nome, setNome] = useState("");
  const [contatto, setContatto] = useState<ContattoLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);

  const { data: contatti = [], isFetching } = useQuery({
    queryKey: ["sim-contact-picker", companyId, debounced],
    enabled: !!companyId && pickerOpen,
    queryFn: async (): Promise<ContattoLite[]> => {
      let q = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .limit(20);
      const safe = debounced.replace(/[%,()_\\]/g, " ").trim();
      if (safe) {
        q = q.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`);
      }
      const { data, error } = await q.order("first_name", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ContattoLite[];
    },
  });

  const reset = () => {
    setNome("");
    setContatto(null);
    setSearch("");
  };
  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = nome.trim();
    if (!trimmed) {
      toast.error("Inserisci un nome per la simulazione");
      return;
    }
    try {
      const id = await create.mutateAsync({ nome: trimmed, contact_id: contatto?.id ?? null });
      toast.success("Simulazione creata");
      handleOpenChange(false);
      navigate(`/azienda/marketing/simulatore/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nuova simulazione
          </DialogTitle>
          <DialogDescription>
            Dai un nome alla simulazione. Voci, IVA, tempistiche e finanziamenti
            li aggiungi nell'editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="sim-nome">Nome simulazione</Label>
            <Input
              id="sim-nome"
              autoFocus
              placeholder="Es. Ristrutturazione appartamento Rossi"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !create.isPending) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Cliente <span className="font-normal">(opzionale)</span></Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {contatto ? (
                      <span className="truncate">{contactLabel(contatto)}</span>
                    ) : (
                      <span className="text-muted-foreground">Collega un contatto dal CRM…</span>
                    )}
                  </span>
                  {contatto ? (
                    <X
                      className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContatto(null);
                      }}
                    />
                  ) : (
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Cerca contatto…"
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {isFetching ? "Ricerca…" : "Nessun contatto trovato"}
                    </CommandEmpty>
                    <CommandGroup>
                      {contatti.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setContatto(c);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              contatto?.id === c.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{contactLabel(c)}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={create.isPending}>
            Annulla
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={create.isPending || !nome.trim()}>
            {create.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creazione…
              </>
            ) : (
              "Crea e apri"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
