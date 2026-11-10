import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { aggiornaDatiPlanimetria, chiaviPlanimetrie, type AssociazioniPlanimetria, type RigaPlanimetria } from "@/lib/planimetrie/archivio";
import { accessiCollegamenti, cercaCollegamentiPianta, DEFINIZIONI_COLLEGAMENTI, TIPI_COLLEGAMENTO, type MappaCollegamenti, type SceltaCollegamento, type TipoCollegamento } from "@/lib/planimetrie/collegamenti";

export function RiferimentiPianta({ riga, mappa }: { riga: RigaPlanimetria; mappa?: MappaCollegamenti }) {
  const permessi = usePermissions();
  const accessi = accessiCollegamenti(permessi);
  const tipi = TIPI_COLLEGAMENTO.filter((tipo) => riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]);
  if (!tipi.length) return <span className="text-xs text-muted-foreground">Nessun collegamento</span>;
  return <div className="flex flex-wrap gap-1.5">{tipi.map((tipo) => {
    const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]!;
    const scelta = mappa?.[tipo][id];
    return <Badge key={tipo} variant="outline" className="max-w-full font-normal">
      {accessi[tipo] && scelta ? scelta.percorso ? <Link to={scelta.percorso} title={`${DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: ${scelta.nome}`} className="truncate hover:underline">{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: {scelta.nome}</Link>
        : <span className="truncate">{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: {scelta.nome}</span> : `${DEFINIZIONI_COLLEGAMENTI[tipo].titolo} collegato`}
    </Badge>;
  })}</div>;
}

function SelettoreCollegamento({ tipo, companyId, value, onChange }: { tipo: TipoCollegamento; companyId: string; value: SceltaCollegamento | null; onChange: (value: SceltaCollegamento | null) => void }) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const ricerca = useDebounce(testo, 250);
  const { data = [], isFetching, isError, refetch } = useQuery({
    queryKey: ["planimetrie-scelta-collegamento", companyId, tipo, ricerca],
    queryFn: () => cercaCollegamentiPianta(companyId, tipo, ricerca),
    enabled: aperto && !!companyId,
    staleTime: 30_000,
  });
  const titolo = DEFINIZIONI_COLLEGAMENTI[tipo].titolo;
  return <div className="space-y-2">
    <Label>{titolo}</Label>
    <div className="flex min-w-0 gap-2">
      <Popover open={aperto} onOpenChange={setAperto}><PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label={titolo} aria-expanded={aperto} className="min-w-0 flex-1 justify-between font-normal">
          <span className="truncate">{value?.nome ?? `Seleziona ${titolo.toLocaleLowerCase("it-IT")}…`}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command shouldFilter={false}><CommandInput placeholder={`Cerca ${titolo.toLocaleLowerCase("it-IT")}…`} value={testo} onValueChange={setTesto} /><CommandList>
          {isFetching ? <p role="status" className="p-3 text-sm text-muted-foreground">Ricerca…</p> : isError ? <div role="alert" className="p-3 text-sm">Ricerca non disponibile. <Button variant="link" onClick={() => refetch()}>Riprova</Button></div>
            : data.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nessun risultato.</p> : <CommandGroup>{data.map((scelta) => <CommandItem key={scelta.id} value={scelta.id} onSelect={() => { onChange(scelta); setAperto(false); }}><Check className={`mr-2 h-4 w-4 shrink-0 ${value?.id === scelta.id ? "opacity-100" : "opacity-0"}`} /><span className="truncate">{scelta.nome}</span></CommandItem>)}</CommandGroup>}
        </CommandList></Command>
      </PopoverContent></Popover>
      {value && <Button type="button" variant="ghost" size="icon" aria-label={`Scollega ${titolo}`} onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>}
    </div>
  </div>;
}

/** Montato solo quando si apre: non conserva scelte non salvate fra due progetti. */
export function CollegamentiPiantaDialog({ riga: corrente, mappa, onChiudi }: { riga: RigaPlanimetria; mappa?: MappaCollegamenti; onChiudi: () => void }) {
  // Una ricarica in background non deve spostare la verifica di concorrenza
  // alla versione nuova mentre l'utente sta ancora modificando le scelte vecchie.
  const [riga] = useState(corrente);
  const permessi = usePermissions();
  const accessi = accessiCollegamenti(permessi);
  const client = useQueryClient();
  const [scelte, setScelte] = useState(() => Object.fromEntries(TIPI_COLLEGAMENTO.map((tipo) => {
    const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna];
    return [tipo, id ? mappa?.[tipo][id] ?? { id, nome: `${DEFINIZIONI_COLLEGAMENTI[tipo].titolo} collegato`, percorso: `${DEFINIZIONI_COLLEGAMENTI[tipo].base}/${id}` } : null];
  })) as Record<TipoCollegamento, SceltaCollegamento | null>);
  const cambiati = TIPI_COLLEGAMENTO.filter((tipo) => accessi[tipo] && (scelte[tipo]?.id ?? null) !== (riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna] ?? null));
  const puoSalvare = !permessi.solaLettura && cambiati.length > 0;
  const salva = useMutation({
    mutationFn: async () => {
      if (!puoSalvare) return;
      const dati: AssociazioniPlanimetria = {};
      for (const tipo of cambiati) dati[DEFINIZIONI_COLLEGAMENTI[tipo].campo] = scelte[tipo]?.id ?? null;
      await aggiornaDatiPlanimetria(riga.id, dati, { companyId: riga.company_id, updatedAt: riga.updated_at });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: chiaviPlanimetrie.tutte });
      toast.success("Associazioni della planimetria salvate");
      onChiudi();
    },
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !salva.isPending) onChiudi(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Associa la planimetria</DialogTitle><DialogDescription>{riga.titolo} · Seleziona le schede già esistenti da associare a questa planimetria.</DialogDescription></DialogHeader>
    <div className="space-y-5">{TIPI_COLLEGAMENTO.filter((tipo) => accessi[tipo]).map((tipo) => <SelettoreCollegamento key={tipo} tipo={tipo} companyId={riga.company_id} value={scelte[tipo]} onChange={(value) => setScelte((prev) => ({ ...prev, [tipo]: value }))} />)}
      {salva.error && <p role="alert" className="text-sm text-destructive">{salva.error instanceof Error ? salva.error.message : "Salvataggio non riuscito."}</p>}
    </div>
    <DialogFooter><Button variant="outline" disabled={salva.isPending} onClick={onChiudi}>Annulla</Button><Button disabled={!puoSalvare || salva.isPending} onClick={() => salva.mutate()}>{salva.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Salva associazioni</Button></DialogFooter>
  </DialogContent></Dialog>;
}
