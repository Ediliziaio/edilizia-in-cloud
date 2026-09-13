/**
 * AccessoriSection — sezione "Accessori e complementi" estratta dallo
 * StepAccessori e riusata dentro StepBom (Composizione offerta).
 *
 * Use case: tapparelle, cassonetti, zanzariere, persiane, monoblocchi che
 * spesso hanno le stesse misure dei serramenti già nel preventivo.
 *
 * Feature chiave: "Copia misure dai serramenti" — dialog che mostra i
 * serramenti già nel BOM e permette di selezionare quali importare; per
 * ogni serramento selezionato viene creata una riga accessorio con
 * tipologia comune (es. tapparella) ed esatte misure (larghezza × altezza
 * × quantità). Risolve il workflow "ho 10 finestre, voglio 10 tapparelle
 * con le stesse misure senza re-inserirle tutte".
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Image as ImageIcon, Plus, Trash2, Loader2, Copy, Layers, Package, Sparkles,
} from "lucide-react";
import {
  useAddAccessorio, useUpdateAccessorio, useDeleteAccessorio,
  useListinoFamilies, useMacrocategorie, useListinoGriglia, useTariffeManodopera,
} from "@/lib/serramenti/queries";
import { SR_ACCESSORI_TIPI } from "@/types/serramenti";
import type { SrProgettoDetail, SrAccessorioRow, SrSerramentoRow } from "@/types/serramenti";
import { SrCard } from "@/lib/serramenti/wizardUI";
import { formatEuro } from "@/lib/serramenti/format";
import { toast } from "sonner";
import { ListinoPickerDialog, type ListinoPickResult } from "./ListinoPickerDialog";
import { useFamily } from "@/hooks/useFamilies";
import { useSupplierProductLines } from "@/features/serramenti-listini/hooks/useSupplierProductLines";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { applyMaggiorazioniAssi, calcolaPosaInclusa, calcolaPrezzoProdotto } from "@/lib/serramenti/pricing";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function AccessoriSection({ progettoId, detail }: Props) {
  const addMut = useAddAccessorio(progettoId);
  const updateMut = useUpdateAccessorio(progettoId);
  const deleteMut = useDeleteAccessorio(progettoId);

  const accessori = detail.accessori;
  const serramenti = detail.serramenti;

  const [toDelete, setToDelete] = useState<SrAccessorioRow | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  /** Picker listino aperto per scegliere un articolo accessorio. */
  const [listinoPickerOpen, setListinoPickerOpen] = useState(false);

  const handleAdd = () => {
    addMut.mutate({
      tipo: "avvolgibile",
      quantita: 1,
      position: accessori.length,
    });
  };

  /**
   * Aggiunge un accessorio scegliendolo dal listino prodotti.
   * Il picker ritorna family_id + misure + prezzo già calcolato dalla griglia
   * + variabili. Lo snapshot della modalita_prezzo serve al dialog "Copia da
   * serramenti" per decidere se copiare dims o quantita.
   */
  const handleAddFromListino = (pick: ListinoPickResult) => {
    addMut.mutate({
      tipo: "avvolgibile", // fallback semantic; real type derivato dalla macro
      descrizione: pick.family_nome,
      quantita: pick.quantita,
      larghezza_mm: pick.larghezza_mm,
      altezza_mm: pick.altezza_mm,
      prezzo_unitario: pick.prezzo_unitario,
      prezzo_totale:
        pick.prezzo_unitario != null
          ? Number((pick.prezzo_unitario * pick.quantita).toFixed(2))
          : null,
      family_id: pick.family_id,
      supplier_catalog_id: pick.supplier_catalog_id ?? null,
      supplier_product_line_id: pick.supplier_product_line_id ?? null,
      valori_assi: pick.valori_assi ?? null,
      modalita_prezzo: pick.modalita_prezzo,
      position: accessori.length,
    });
    toast.success(`"${pick.family_nome}" aggiunto agli accessori`);
  };

  const onPatch = (id: string, patch: Partial<SrAccessorioRow>) => {
    if (patch.prezzo_unitario !== undefined || patch.quantita !== undefined) {
      const orig = accessori.find((a) => a.id === id);
      if (orig) {
        const pu = patch.prezzo_unitario ?? orig.prezzo_unitario ?? 0;
        const q = patch.quantita ?? orig.quantita ?? 1;
        patch.prezzo_totale = pu * q;
      }
    }
    updateMut.mutate({ id, patch });
  };

  return (
    <>
      <SrCard
        title="Accessori e complementi"
        description="Tapparelle, cassonetti, zanzariere, persiane, monoblocchi. Possono ereditare le misure dai serramenti già configurati."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        {/* Toolbar: aggiungi vuoto + copia da serramenti */}
        {accessori.length === 0 ? (
          <div className="border-2 border-dashed border-orange-200 rounded-md p-6 text-center space-y-3">
            <ImageIcon className="h-8 w-8 mx-auto text-orange-300" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Nessun accessorio aggiunto
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Aggiungi tapparelle, cassonetti o altri complementi.{" "}
                {serramenti.length > 0 && (
                  <strong>Scorciatoia:</strong>
                )}{" "}
                {serramenti.length > 0 &&
                  "se le tapparelle hanno le stesse misure dei serramenti, copiale in un click."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              <Button
                size="sm"
                onClick={() => setListinoPickerOpen(true)}
                className="bg-orange-500 hover:bg-orange-600 gap-1.5"
              >
                <Package className="h-4 w-4" />
                Aggiungi da listino
              </Button>
              {serramenti.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCopyDialogOpen(true)}
                  className="gap-1.5 border-orange-300 hover:bg-orange-50"
                >
                  <Copy className="h-4 w-4" />
                  Copia misure dai serramenti ({serramenti.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAdd}
                disabled={addMut.isPending}
              >
                {addMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Riga manuale
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar superiore quando ci sono già accessori */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-xs text-muted-foreground">
                {accessori.length} {accessori.length === 1 ? "accessorio" : "accessori"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setListinoPickerOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600 gap-1.5 h-8"
                >
                  <Package className="h-3.5 w-3.5" />
                  Da listino
                </Button>
                {serramenti.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCopyDialogOpen(true)}
                    className="gap-1.5 border-orange-300 hover:bg-orange-50 h-8"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copia da serramenti
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Descrizione</TableHead>
                    <TableHead className="text-xs w-24">Largh. (mm)</TableHead>
                    <TableHead className="text-xs w-24">Altezza (mm)</TableHead>
                    <TableHead className="text-xs w-16">Q.tà</TableHead>
                    <TableHead className="text-xs w-32">Prezzo unit.</TableHead>
                    <TableHead className="text-xs w-28">Totale</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessori.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Select
                          value={a.tipo}
                          onValueChange={(v) => onPatch(a.id, { tipo: v })}
                        >
                          <SelectTrigger className="h-8 text-xs w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SR_ACCESSORI_TIPI.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            defaultValue={a.descrizione ?? ""}
                            onBlur={(e) => onPatch(a.id, { descrizione: e.target.value || null })}
                            placeholder="es. Alluminio coibentato"
                            className="h-8 text-xs"
                          />
                          {a.family_id && (
                            <Badge
                              variant="outline"
                              className="h-5 text-[9px] px-1 border-orange-300 text-orange-700 shrink-0"
                              title="Articolo collegato al listino prodotti"
                            >
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              listino
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={(a as SrAccessorioRow & { larghezza_mm?: number | null }).larghezza_mm ?? ""}
                          onBlur={(e) =>
                            onPatch(a.id, {
                              larghezza_mm: e.target.value ? Number(e.target.value) : null,
                            } as Partial<SrAccessorioRow>)
                          }
                          className="h-8 text-xs w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={(a as SrAccessorioRow & { altezza_mm?: number | null }).altezza_mm ?? ""}
                          onBlur={(e) =>
                            onPatch(a.id, {
                              altezza_mm: e.target.value ? Number(e.target.value) : null,
                            } as Partial<SrAccessorioRow>)
                          }
                          className="h-8 text-xs w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          defaultValue={a.quantita}
                          onBlur={(e) => onPatch(a.id, { quantita: Math.max(1, Number(e.target.value) || 1) })}
                          className="h-8 text-xs w-14"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={a.prezzo_unitario ?? ""}
                          onBlur={(e) =>
                            onPatch(a.id, {
                              prezzo_unitario: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className="h-8 text-xs w-24"
                        />
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-orange-600">
                        {formatEuro(a.prezzo_totale)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 sm:h-7 sm:w-7"
                          onClick={() => setToDelete(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <Button
                  onClick={() => setListinoPickerOpen(true)}
                  variant="outline"
                  className="gap-1 border-dashed border-2 border-orange-300 hover:bg-orange-50 text-orange-700"
                  disabled={addMut.isPending}
                >
                  <Package className="h-4 w-4" />
                  Aggiungi da listino
                </Button>
                <Button
                  onClick={handleAdd}
                  variant="ghost"
                  className="gap-1 border-dashed border-2 border-slate-200 hover:bg-slate-50"
                  disabled={addMut.isPending}
                >
                  {addMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Riga manuale
                </Button>
              </div>
            </div>
          </>
        )}
      </SrCard>

      {/* Dialog "Copia misure da serramenti" */}
      <CopyMisureDialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        serramenti={serramenti}
        progettoId={progettoId}
        position={accessori.length}
      />

      {/* Picker listino prodotti per accessori — usa lo stesso dialog dei
          serramenti (macro → famiglia → misure). L'utente sceglie un articolo
          da una macrocategoria diversa da Infissi (Tapparelle, Zanzariere,
          Cassonetti, Persiane, Monoblocchi). */}
      <ListinoPickerDialog
        open={listinoPickerOpen}
        onOpenChange={setListinoPickerOpen}
        onSelect={(pick) => handleAddFromListino(pick)}
        // Filtro tipo='accessorio': il picker degli accessori mostra solo
        // macrocategorie marcate come "Accessorio" in Listino → Macrocategorie
        // (Tapparelle, Cassonetti, Zanzariere, …). Esclude i prodotti
        // principali (es. Infissi).
        tipo="accessorio"
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare accessorio?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.descrizione || toDelete?.tipo} verrà rimosso dal preventivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Dialog: copia misure dai serramenti ────────────────────────────────────

function CopyMisureDialog({
  open, onClose, serramenti, progettoId, position,
}: {
  open: boolean;
  onClose: () => void;
  serramenti: SrSerramentoRow[];
  progettoId: string;
  position: number;
}) {
  const addMut = useAddAccessorio(progettoId);
  // Mode toggle: "manuale" (legacy, tipo enum) vs "listino" (collega a family
  // del listino prodotti → prezzo calcolato automaticamente + variabili).
  const [mode, setMode] = useState<"manuale" | "listino">("listino");
  const [tipoAccessorio, setTipoAccessorio] = useState<string>("tapparella");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(serramenti.map((s) => s.id)));
  const [descrizionePresetByTipo, setDescrizionePresetByTipo] = useState<string>("");
  // Modalità "listino": macro filter + family selection.
  // Mostriamo TUTTE le macrocategorie (l'utente sceglie es. Tapparelle).
  const [pickedMacroId, setPickedMacroId] = useState<string | null>(null);
  const [pickedFamilyId, setPickedFamilyId] = useState<string | null>(null);

  // Macrocategorie ACCESSORIO (migration 20270513230000): mostrate solo se
  // l'azienda le ha esplicitamente marcate "Accessorio" in Listino →
  // Macrocategorie → Tipo macrocategoria. Niente più heuristic per nome.
  const { data: accessoryMacros = [], isLoading: loadingMacros } = useMacrocategorie({
    vertical: "serramentista",
    tipo: "accessorio",
  });

  // Families della macro selezionata (limite 100 per default del backend).
  // Loading state esposto per evitare "lista vuota" durante il fetch.
  const { data: pickedFamilies = [], isLoading: loadingFamilies } =
    useListinoFamilies({ macroId: pickedMacroId });

  // Auto-switch a "manuale" quando l'azienda NON ha ancora configurato
  // macrocategorie. Evita il dead-end "Da listino" + 0 macro = utente
  // bloccato senza poter avanzare.
  useEffect(() => {
    if (open && !loadingMacros && accessoryMacros.length === 0 && mode === "listino") {
      setMode("manuale");
    }
  }, [open, loadingMacros, accessoryMacros.length, mode]);

  // Reset selezione e picker quando il dialog si apre o cambia la lista.
  useEffect(() => {
    if (open) {
      setSelected(new Set(serramenti.map((s) => s.id)));
      setPickedMacroId(null);
      setPickedFamilyId(null);
    }
  }, [open, serramenti]);

  const allSelected = serramenti.length > 0 && selected.size === serramenti.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === serramenti.length ? new Set() : new Set(serramenti.map((s) => s.id)),
    );
  };

  const pickedFamily = pickedFamilyId
    ? pickedFamilies.find((f) => f.id === pickedFamilyId)
    : null;
  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(pickedFamily?.id);
  const { family: pickedFamilyWithAxes } = useFamily(pickedFamily?.id);
  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);
  const { lines: supplierLines = [] } = useSupplierProductLines({
    enabled: open && mode === "listino" && pickedFamily?.modalita_prezzo_base === "griglia",
  });
  const supplierLineMap = useMemo(() => {
    const m = new Map<string, SupplierProductLine>();
    supplierLines.forEach((line) => m.set(line.id, line));
    return m;
  }, [supplierLines]);
  const availableSupplierProductLineIds = useMemo(
    () => Array.from(new Set(griglia.map((g) => g.supplier_product_line_id).filter((v): v is string => !!v))),
    [griglia],
  );
  const defaultAxisSelection = useMemo(() => {
    const out: Record<string, string> = {};
    for (const axis of pickedFamilyWithAxes?.axes ?? []) {
      const def = axis.values.find((v) => v.attivo && v.is_default);
      if (def) out[axis.codice] = def.id;
    }
    return out;
  }, [pickedFamilyWithAxes]);

  const handleCopy = async () => {
    const targets = serramenti.filter((s) => selected.has(s.id));
    if (targets.length === 0) {
      toast.error("Seleziona almeno un serramento");
      return;
    }

    // Validazione modalità listino: serve almeno la family
    if (mode === "listino" && !pickedFamily) {
      toast.error("Scegli un articolo dal listino oppure passa a Manuale");
      return;
    }
    if (
      mode === "listino" &&
      pickedFamily?.modalita_prezzo_base === "griglia" &&
      availableSupplierProductLineIds.length > 1
    ) {
      toast.error("Questo articolo ha più linee fornitore", {
        description: "Usa “Aggiungi da listino” per scegliere la linea prodotto corretta.",
      });
      return;
    }
    if (
      mode === "listino" &&
      pickedFamily?.modalita_prezzo_base === "griglia" &&
      loadingGriglia
    ) {
      toast.error("Griglia prezzi ancora in caricamento");
      return;
    }

    try {
      let count = 0;
      for (const s of targets) {
        if (mode === "listino" && pickedFamily) {
          // Smart copy: collega all'articolo del listino.
          // Logica dims/quantita basata su modalita_prezzo_base del listino:
          //   - griglia/mq: copia larghezza+altezza dal serramento e calcola
          //     subito prezzo listino reale (griglia/mq + variabili + posa)
          //   - pz/misura_libera: copia solo quantità, niente dims
          const modalita = pickedFamily.modalita_prezzo_base;
          const wantsDims = modalita === "griglia" || modalita === "mq";
          const qty = s.quantita ?? 1;
          if (wantsDims && (!s.larghezza_mm || !s.altezza_mm)) {
            throw new Error(`${pickedFamily.nome}: il serramento "${s.tipologia_label || s.tipologia}" non ha misure complete.`);
          }
          const singleSupplierLineId =
            availableSupplierProductLineIds.length === 1
              ? availableSupplierProductLineIds[0]
              : null;
          const calc = calcolaPrezzoProdotto(
            pickedFamily,
            wantsDims ? s.larghezza_mm : null,
            wantsDims ? s.altezza_mm : null,
            qty,
            griglia,
            { supplierProductLineId: singleSupplierLineId, supplierLines: supplierLineMap },
          );
          if (calc.fuoriRange) {
            throw new Error(`${pickedFamily.nome}: ${calc.note ?? "misura fuori griglia"}`);
          }
          if (calc.requiresSupplierLine || calc.missingSupplierLinePricing) {
            throw new Error(calc.note ?? "Linea fornitore richiesta per calcolare il prezzo");
          }
          const prezzoProdotto = pickedFamilyWithAxes
            ? applyMaggiorazioniAssi(
                calc.prezzo,
                defaultAxisSelection,
                pickedFamilyWithAxes.axes,
                wantsDims ? s.larghezza_mm : null,
                wantsDims ? s.altezza_mm : null,
                qty,
              )
            : calc.prezzo;
          const posa = calcolaPosaInclusa(pickedFamily, qty, tariffePrezzi);
          const unit = qty > 0 ? Number(((prezzoProdotto + posa) / qty).toFixed(2)) : 0;
          await addMut.mutateAsync({
            tipo: tipoAccessorio,
            descrizione: pickedFamily.nome,
            quantita: qty,
            larghezza_mm: wantsDims ? s.larghezza_mm : null,
            altezza_mm: wantsDims ? s.altezza_mm : null,
            prezzo_unitario: unit,
            prezzo_totale: Number((unit * qty).toFixed(2)),
            family_id: pickedFamily.id,
            supplier_catalog_id: calc.supplierCatalogId ?? null,
            supplier_product_line_id: calc.supplierProductLineId ?? singleSupplierLineId,
            listino_voce_id: calc.matchedGrigliaId,
            valori_assi: defaultAxisSelection,
            modalita_prezzo:
              (modalita === "pz" || modalita === "mq" || modalita === "griglia" || modalita === "misura_libera")
                ? modalita
                : null,
            serramento_id: s.id,
            position: position + count,
          });
        } else {
          // Modalità manuale (legacy): tipo enum + descrizione opzionale.
          await addMut.mutateAsync({
            tipo: tipoAccessorio,
            descrizione: descrizionePresetByTipo.trim() ||
              (s.ambiente ? `${tipoLabel(tipoAccessorio)} ${s.ambiente}` : null),
            quantita: s.quantita ?? 1,
            larghezza_mm: s.larghezza_mm,
            altezza_mm: s.altezza_mm,
            serramento_id: s.id,
            position: position + count,
          });
        }
        count++;
      }
      const label = count === 1 ? "accessorio creato" : "accessori creati";
      toast.success(
        `${count} ${label} dalle misure dei serramenti`,
        pickedFamily ? { description: `Collegati a "${pickedFamily.nome}"` } : undefined,
      );
      onClose();
    } catch (err) {
      toast.error("Errore copia misure", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center shrink-0">
              <Layers className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <DialogTitle>Copia misure dai serramenti</DialogTitle>
              <DialogDescription>
                Crea automaticamente un accessorio per ogni serramento selezionato,
                con le stesse misure (larghezza × altezza × quantità). Utile per
                tapparelle, cassonetti, persiane, zanzariere.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Toggle mode: Listino (smart, prezzo automatico) vs Manuale (legacy). */}
          <div className="flex items-center gap-1 p-1 rounded-md bg-muted/50 w-fit">
            <button
              type="button"
              onClick={() => setMode("listino")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "listino"
                  ? "bg-white dark:bg-slate-900 text-orange-700 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-3.5 w-3.5 inline mr-1.5" />
              Da listino prodotti
            </button>
            <button
              type="button"
              onClick={() => setMode("manuale")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "manuale"
                  ? "bg-white dark:bg-slate-900 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Manuale
            </button>
          </div>

          {mode === "listino" ? (
            /* Mode LISTINO: macro picker + family picker. Prezzo + variabili
               ereditati dal listino. UX: chips macro orizzontali, poi list
               articoli verticale con prezzo base.  */
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Macrocategoria accessorio</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {loadingMacros ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground italic py-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Caricamento macrocategorie…
                    </div>
                  ) : accessoryMacros.length === 0 ? (
                    /* NB: l'auto-switch a 'manuale' partito sopra dovrebbe
                       coprire questo caso, ma lo lasciamo come safety net
                       (se l'utente ri-cambia manualmente a 'listino'). */
                    <p className="text-xs text-muted-foreground italic">
                      Nessun accessorio da proporre. Nel <strong>Listino</strong> servono tipologie segnate come
                      accessorio (tapparelle, zanzariere, cassonetti) con prodotti attivi e proposti nei preventivi.
                    </p>
                  ) : (
                    accessoryMacros.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setPickedMacroId(m.id); setPickedFamilyId(null); }}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          pickedMacroId === m.id
                            ? "bg-orange-100 border-orange-400 text-orange-700"
                            : "bg-background border-slate-200 hover:border-orange-300"
                        }`}
                      >
                        {m.nome}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {pickedMacroId && (
                <div>
                  <Label className="text-xs">
                    Articolo {pickedFamilies.length > 0 && `(${pickedFamilies.length})`}
                  </Label>
                  {loadingFamilies ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground italic mt-1 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Caricamento articoli…
                    </div>
                  ) : pickedFamilies.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic mt-1 rounded-md border border-dashed p-3 text-center">
                      Nessun articolo in questa macrocategoria.
                      <br />
                      Aggiungi articoli da <strong>Impostazioni → Listino prodotti</strong>,
                      oppure passa a <button
                        type="button"
                        className="underline hover:text-foreground"
                        onClick={() => setMode("manuale")}
                      >Manuale</button> per inserirli senza listino.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mt-1 max-h-48 overflow-y-auto pr-1">
                      {pickedFamilies.map((f) => {
                        const isSelected = pickedFamilyId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setPickedFamilyId(f.id)}
                            className={`text-left flex items-center gap-2 px-2.5 py-2 rounded border transition-colors ${
                              isSelected
                                ? "border-orange-400 bg-orange-50/60"
                                : "border-slate-200 hover:bg-accent/30"
                            }`}
                          >
                            {f.immagine_url ? (
                              <img width={32} height={32} loading="lazy" src={f.immagine_url} alt="" className="h-8 w-8 object-cover rounded shrink-0" />
                            ) : (
                              <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                <Package className="h-3.5 w-3.5 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{f.nome}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {modalitaLabel(f.modalita_prezzo_base)}
                                {f.prezzo_base_vendita != null && f.prezzo_base_vendita > 0 && (
                                  <> · <span className="font-semibold text-emerald-700">{formatEuro(f.prezzo_base_vendita)}</span></>
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {pickedFamily && (
                <div className="rounded-md border border-orange-200 bg-orange-50/40 p-2.5 text-[11px] text-orange-900">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3 w-3 text-orange-600" />
                    <strong>Cosa copiamo dai serramenti:</strong>
                  </div>
                  {pickedFamily.modalita_prezzo_base === "griglia" || pickedFamily.modalita_prezzo_base === "mq" ? (
                    <span>Larghezza × Altezza × Quantità (l'articolo è venduto {pickedFamily.modalita_prezzo_base === "mq" ? "al mq" : "a griglia L×H"}).</span>
                  ) : (
                    <span>Solo la quantità (l'articolo è venduto a pezzo — niente dimensioni).</span>
                  )}
                  {pickedFamily.modalita_prezzo_base === "griglia" && availableSupplierProductLineIds.length > 1 && (
                    <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                      Questo articolo ha più linee fornitore: per scegliere quella corretta usa “Aggiungi da listino”.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Mode MANUALE (legacy): tipo enum + descrizione free-form. */
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs">Tipo di accessorio</Label>
                <Select value={tipoAccessorio} onValueChange={setTipoAccessorio}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SR_ACCESSORI_TIPI.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 md:col-span-7">
                <Label className="text-xs">Descrizione (opzionale)</Label>
                <Input
                  value={descrizionePresetByTipo}
                  onChange={(e) => setDescrizionePresetByTipo(e.target.value)}
                  placeholder="Lascia vuoto per generare automaticamente"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* Lista serramenti con checkbox */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                />
                Seleziona {selected.size > 0 ? `(${selected.size}/${serramenti.length})` : "tutti"}
              </Label>
              <Badge variant="secondary" className="text-[10px]">
                {selected.size} {selected.size === 1 ? "selezionato" : "selezionati"}
              </Badge>
            </div>

            <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
              {serramenti.map((s) => {
                const isSel = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors ${
                      isSel ? "bg-orange-50/40 dark:bg-orange-950/20" : ""
                    }`}
                  >
                    <Checkbox checked={isSel} onCheckedChange={() => toggleOne(s.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {s.tipologia_label || s.tipologia}
                        </span>
                        {s.ambiente && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {s.ambiente}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.larghezza_mm && s.altezza_mm
                          ? `${s.larghezza_mm}×${s.altezza_mm} mm`
                          : "Misure non impostate"}
                        {" · "}×{s.quantita ?? 1}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Annulla</Button>
          <Button
            onClick={handleCopy}
            disabled={
              selected.size === 0 ||
              addMut.isPending ||
              (mode === "listino" && !pickedFamily) ||
              (mode === "listino" && pickedFamily?.modalita_prezzo_base === "griglia" && availableSupplierProductLineIds.length > 1)
            }
            className="w-full gap-1.5 bg-orange-500 hover:bg-orange-600 sm:w-auto"
          >
            {addMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Copy className="h-4 w-4" />
            Crea {selected.size} {selected.size === 1 ? "accessorio" : "accessori"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function tipoLabel(value: string): string {
  return SR_ACCESSORI_TIPI.find((t) => t.value === value)?.label ?? value;
}

function modalitaLabel(value: string | null | undefined): string {
  switch (value) {
    case "pz": return "A pezzo";
    case "mq": return "Al mq";
    case "griglia": return "Griglia L×H";
    case "misura_libera": return "Misura libera";
    default: return "Modalità non impostata";
  }
}
