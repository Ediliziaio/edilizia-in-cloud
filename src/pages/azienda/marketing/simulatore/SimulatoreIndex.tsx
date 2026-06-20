/**
 * SimulatoreIndex — lista delle simulazioni contratto.
 *
 * Banco di simulazione "Excel potenziato": ogni card è una simulazione con il
 * suo riepilogo denormalizzato (prezzo cliente, margine %, stato). Da qui si
 * crea/apre/duplica/elimina. L'editing vero avviene nell'editor (`:id`).
 *
 * Pattern visivo allineato alle pagine ricche esistenti (SettingsTariffe /
 * Cruscotto): griglia di Card, Badge colorati per margine/stato, DropdownMenu
 * per le azioni, AlertDialog per le conferme distruttive, EmptyState curato.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Calculator,
  MoreVertical,
  Copy,
  CopyPlus,
  Trash2,
  ExternalLink,
  FileStack,
  FilePlus2,
  Loader2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSimulazioni,
  useSimulazioniMutations,
  useContattiLite,
  type SimulazioneRow,
} from "@/hooks/useSimulazioni";
import { NuovaSimulazioneDialog } from "@/components/marketing/simulatore/NuovaSimulazioneDialog";

// ─── Helpers presentazione ──────────────────────────────────────────────────

const STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  finalizzata: "Finalizzata",
  archiviata: "Archiviata",
};

const STATO_BADGE: Record<string, "secondary" | "default" | "outline"> = {
  bozza: "secondary",
  finalizzata: "default",
  archiviata: "outline",
};

/**
 * Stile del badge margine (semaforo, unico colore semantico della card): verde
 * (chart-2) ≥25%, arancio (chart-3) 10–25%, rosso (chart-5) <10%. Reso inline
 * con la palette chart del brand → coerente col tema e col dark-mode.
 */
function margineStyle(pct: number): CSSProperties {
  const v = pct >= 25 ? "var(--chart-2)" : pct >= 10 ? "var(--chart-3)" : "var(--chart-5)";
  return {
    backgroundColor: `hsl(${v} / 0.12)`,
    color: `hsl(${v})`,
    borderColor: `hsl(${v} / 0.30)`,
  };
}

function fmtPct(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toLocaleString("it-IT")}%`;
}

// ─── Pagina ─────────────────────────────────────────────────────────────────

export default function SimulatoreIndex() {
  const navigate = useNavigate();
  const { data: simulazioni = [], isLoading } = useSimulazioni();
  const { duplicate, remove } = useSimulazioniMutations();

  // Nomi dei contatti collegati (card → cliente). Batch unico sui contact_id.
  const { data: contattiMap = {} } = useContattiLite(simulazioni.map((s) => s.contact_id));

  const [nuovaOpen, setNuovaOpen] = useState(false);
  const [statoFilter, setStatoFilter] = useState<string>("tutti");
  const [soloTemplate, setSoloTemplate] = useState(false);
  const [daEliminare, setDaEliminare] = useState<SimulazioneRow | null>(null);

  const filtrate = useMemo(() => {
    return simulazioni.filter((s) => {
      if (soloTemplate && !s.is_template) return false;
      if (statoFilter !== "tutti" && s.stato !== statoFilter) return false;
      return true;
    });
  }, [simulazioni, statoFilter, soloTemplate]);

  const apri = (id: string) => navigate(`/azienda/marketing/simulatore/${id}`);

  const handleDuplica = async (row: SimulazioneRow, asTemplate: boolean) => {
    try {
      const id = await duplicate.mutateAsync({ ...row, as_template: asTemplate });
      toast.success(asTemplate ? "Template creato" : "Simulazione duplicata");
      apri(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella duplicazione");
    }
  };

  // Crea una simulazione normale a partire da un template (is_template: false).
  const handleNuovaDaTemplate = async (row: SimulazioneRow) => {
    try {
      const id = await duplicate.mutateAsync({ ...row, as_template: false });
      toast.success("Simulazione creata dal template");
      apri(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione dal template");
    }
  };

  const handleElimina = async () => {
    if (!daEliminare) return;
    try {
      await remove.mutateAsync(daEliminare.id);
      toast.success("Simulazione eliminata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setDaEliminare(null);
    }
  };

  const hasNessunaSimulazione = !isLoading && simulazioni.length === 0;
  const hasNessunRisultatoFiltro = !isLoading && simulazioni.length > 0 && filtrate.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Simulatore
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Simula contratti: margine, IVA, finanziamenti — il tuo Excel, potenziato.
          </p>
        </div>
        <Button onClick={() => setNuovaOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nuova simulazione
        </Button>
      </div>

      {/* Filtri */}
      {!hasNessunaSimulazione && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select value={statoFilter} onValueChange={setStatoFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtra per stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli stati</SelectItem>
              <SelectItem value="bozza">Bozza</SelectItem>
              <SelectItem value="finalizzata">Finalizzata</SelectItem>
              <SelectItem value="archiviata">Archiviata</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch id="solo-template" checked={soloTemplate} onCheckedChange={setSoloTemplate} />
            <Label htmlFor="solo-template" className="text-sm font-normal cursor-pointer flex items-center gap-1.5">
              <FileStack className="h-4 w-4 text-muted-foreground" />
              Solo template
            </Label>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-6 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty: nessuna simulazione */}
      {hasNessunaSimulazione && (
        <Card>
          <EmptyState
            icon={Calculator}
            size="lg"
            title="Nessuna simulazione"
            description="Crea la tua prima simulazione per stimare margine, prezzo al cliente, IVA e finanziamenti di un contratto — tutto in un foglio interattivo."
            action={{
              label: "Nuova simulazione",
              icon: Plus,
              onClick: () => setNuovaOpen(true),
              primary: true,
            }}
          />
        </Card>
      )}

      {/* Empty: filtro senza risultati */}
      {hasNessunRisultatoFiltro && (
        <Card>
          <EmptyState
            icon={FileStack}
            title="Nessun risultato"
            description="Nessuna simulazione corrisponde ai filtri selezionati."
            action={{
              label: "Azzera filtri",
              onClick: () => {
                setStatoFilter("tutti");
                setSoloTemplate(false);
              },
              variant: "outline",
            }}
          />
        </Card>
      )}

      {/* Griglia card */}
      {!isLoading && filtrate.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrate.map((sim) => (
            <Card
              key={sim.id}
              className="group flex flex-col transition-shadow hover:shadow-md cursor-pointer"
              onClick={() => apri(sim.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold leading-tight truncate" title={sim.nome}>
                      {sim.nome}
                    </h3>
                    {sim.contact_id ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{contattiMap[sim.contact_id] ?? "—"}</span>
                      </p>
                    ) : null}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={STATO_BADGE[sim.stato] ?? "secondary"} className="text-xs">
                        {STATO_LABELS[sim.stato] ?? sim.stato}
                      </Badge>
                      {sim.is_template && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <FileStack className="h-3 w-3" />
                          Template
                        </Badge>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        aria-label="Azioni simulazione"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => apri(sim.id)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Apri
                      </DropdownMenuItem>
                      {sim.is_template && (
                        <DropdownMenuItem onClick={() => void handleNuovaDaTemplate(sim)}>
                          <FilePlus2 className="mr-2 h-4 w-4" />
                          Nuova da template
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => void handleDuplica(sim, false)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplica
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleDuplica(sim, true)}>
                        <CopyPlus className="mr-2 h-4 w-4" />
                        Duplica come template
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDaEliminare(sim)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 pb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Prezzo cliente</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatCurrency(sim.prezzo_cliente)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-medium" style={margineStyle(sim.margine_pct)}>
                    Margine {fmtPct(sim.margine_pct)}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(sim.margine_valore)}
                  </span>
                </div>
              </CardContent>

              <CardFooter className="pt-0 text-xs text-muted-foreground">
                Aggiornata {formatRelativeTime(sim.updated_at)}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog nuova simulazione */}
      <NuovaSimulazioneDialog open={nuovaOpen} onOpenChange={setNuovaOpen} />

      {/* Conferma eliminazione */}
      <AlertDialog open={!!daEliminare} onOpenChange={(open) => !open && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la simulazione?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare ? (
                <>
                  La simulazione <strong>{daEliminare.nome}</strong> verrà eliminata
                  definitivamente. L'azione non è reversibile.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleElimina();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione…
                </>
              ) : (
                "Elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
