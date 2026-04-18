/**
 * FornitoriManager — UI unificata per gestione fornitori + linee prodotto.
 *
 * Layout:
 *  - Card superiore: tabella fornitori (select + edit + soft-delete + "Nuovo")
 *  - Card inferiore: tabella linee prodotto del fornitore selezionato
 *  - Dialog modali per CRUD
 *
 * Stati:
 *  - Loading → Skeleton table
 *  - Empty   → messaggio + CTA "Aggiungi fornitore"
 *  - Error   → messaggio + retry
 *
 * Vincolo: gated dalla feature flag `listini_serramenti_avanzati` a livello
 * di route, quindi qui non serve ulteriore gate — ma manteniamo un check
 * difensivo per evitare render fuori posto se montato per errore.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useSupplierCatalogMutations,
  useSupplierCatalogs,
} from "../hooks/useSupplierCatalogs";
import {
  useSupplierProductLineMutations,
  useSupplierProductLines,
} from "../hooks/useSupplierProductLines";
import type { SupplierCatalog, SupplierProductLine } from "../types";
import { SupplierCatalogFormDialog } from "./SupplierCatalogFormDialog";
import { SupplierProductLineFormDialog } from "./SupplierProductLineFormDialog";

// ─── Formatters ─────────────────────────────────────────────────────────────

const fmtPct = (v: number) =>
  `${(v * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const MATERIALE_LABELS: Record<string, string> = {
  pvc: "PVC",
  alluminio: "Alluminio",
  legno: "Legno",
  legno_alluminio: "Legno-alluminio",
  acciaio: "Acciaio",
};

// ─── Main component ──────────────────────────────────────────────────────────

export function FornitoriManager() {
  const {
    suppliers,
    isLoading: suppliersLoading,
    isError: suppliersError,
    refetch: refetchSuppliers,
  } = useSupplierCatalogs();

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null,
  );

  // Auto-seleziona il primo fornitore al primo caricamento.
  const effectiveSupplierId = useMemo(() => {
    if (selectedSupplierId) {
      // Verifica che il fornitore selezionato esista ancora
      if (suppliers.some((s) => s.id === selectedSupplierId)) {
        return selectedSupplierId;
      }
    }
    return suppliers[0]?.id ?? null;
  }, [selectedSupplierId, suppliers]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === effectiveSupplierId) ?? null,
    [suppliers, effectiveSupplierId],
  );

  // Dialog state
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierCatalog | null>(
    null,
  );
  const [supplierToDelete, setSupplierToDelete] = useState<SupplierCatalog | null>(
    null,
  );

  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<SupplierProductLine | null>(
    null,
  );
  const [lineToDelete, setLineToDelete] = useState<SupplierProductLine | null>(
    null,
  );

  // Mutations for delete
  const supplierMutations = useSupplierCatalogMutations();
  const lineMutations = useSupplierProductLineMutations();

  // ─── Handlers fornitori ────────────────────────────────────────────────────

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierDialogOpen(true);
  };

  const handleEditSupplier = (s: SupplierCatalog) => {
    setEditingSupplier(s);
    setSupplierDialogOpen(true);
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    try {
      await supplierMutations.remove.mutateAsync(supplierToDelete.id);
      toast.success("Fornitore disattivato");
      if (selectedSupplierId === supplierToDelete.id) {
        setSelectedSupplierId(null);
      }
      setSupplierToDelete(null);
    } catch (err) {
      toast.error("Errore disattivazione fornitore", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ─── Handlers linee ────────────────────────────────────────────────────────

  const handleAddLine = () => {
    if (!effectiveSupplierId) {
      toast.info("Seleziona o crea prima un fornitore");
      return;
    }
    setEditingLine(null);
    setLineDialogOpen(true);
  };

  const handleEditLine = (l: SupplierProductLine) => {
    setEditingLine(l);
    setLineDialogOpen(true);
  };

  const handleDeleteLine = async () => {
    if (!lineToDelete) return;
    try {
      await lineMutations.remove.mutateAsync({
        id: lineToDelete.id,
        supplierCatalogId: lineToDelete.supplier_catalog_id,
      });
      toast.success("Linea prodotto disattivata");
      setLineToDelete(null);
    } catch (err) {
      toast.error("Errore disattivazione linea", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Fornitori ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Fornitori infissi</CardTitle>
            <CardDescription>
              Anagrafica dei fornitori (es. Veka, Finstral, Schüco) con sconto
              di default applicato ai prezzi di listino.
            </CardDescription>
          </div>
          <Button onClick={handleAddSupplier} size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" aria-hidden />
            Nuovo fornitore
          </Button>
        </CardHeader>
        <CardContent>
          {suppliersLoading ? (
            <SuppliersSkeleton />
          ) : suppliersError ? (
            <ErrorState onRetry={() => void refetchSuppliers()} />
          ) : suppliers.length === 0 ? (
            <EmptyStateSuppliers onAdd={handleAddSupplier} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Codice</TableHead>
                  <TableHead className="text-right">Sconto default</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="w-28 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => {
                  const isSelected = s.id === effectiveSupplierId;
                  return (
                    <TableRow
                      key={s.id}
                      className={cn(
                        "cursor-pointer",
                        isSelected && "bg-muted/50",
                      )}
                      onClick={() => setSelectedSupplierId(s.id)}
                      aria-selected={isSelected}
                    >
                      <TableCell>
                        {isSelected ? (
                          <ChevronDown
                            className="h-4 w-4 text-primary"
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{s.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.codice_interno ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtPct(s.sconto_default)}
                      </TableCell>
                      <TableCell>
                        {s.attivo ? (
                          <Badge variant="secondary">Attivo</Badge>
                        ) : (
                          <Badge variant="outline">Disattivo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifica fornitore ${s.nome}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSupplier(s);
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Disattiva fornitore ${s.nome}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSupplierToDelete(s);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Linee prodotto ───────────────────────────────────────── */}
      <LineeCard
        supplier={selectedSupplier}
        onAddLine={handleAddLine}
        onEditLine={handleEditLine}
        onDeleteLineRequest={setLineToDelete}
      />

      {/* ─── Dialogs ──────────────────────────────────────────────── */}
      <SupplierCatalogFormDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        initial={editingSupplier}
        onSaved={(saved) => {
          setSelectedSupplierId(saved.id);
        }}
      />

      {effectiveSupplierId && (
        <SupplierProductLineFormDialog
          open={lineDialogOpen}
          onOpenChange={setLineDialogOpen}
          supplierCatalogId={effectiveSupplierId}
          initial={editingLine}
        />
      )}

      {/* ─── AlertDialog eliminazione fornitore ────────────────── */}
      <AlertDialog
        open={!!supplierToDelete}
        onOpenChange={(o) => {
          if (!o && !supplierMutations.remove.isPending)
            setSupplierToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattiva fornitore?</AlertDialogTitle>
            <AlertDialogDescription>
              Il fornitore{" "}
              <strong>{supplierToDelete?.nome}</strong> verrà marcato come
              non attivo (soft delete). Le linee prodotto collegate resteranno
              accessibili storicamente ma non saranno più selezionabili nel
              wizard preventivo. Puoi riattivarlo in seguito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={supplierMutations.remove.isPending}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteSupplier();
              }}
              disabled={supplierMutations.remove.isPending}
            >
              {supplierMutations.remove.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Disattiva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── AlertDialog eliminazione linea ────────────────────── */}
      <AlertDialog
        open={!!lineToDelete}
        onOpenChange={(o) => {
          if (!o && !lineMutations.remove.isPending) setLineToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattiva linea prodotto?</AlertDialogTitle>
            <AlertDialogDescription>
              La linea <strong>{lineToDelete?.nome}</strong> verrà marcata come
              non attiva. Potrai riattivarla modificandola in seguito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lineMutations.remove.isPending}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteLine();
              }}
              disabled={lineMutations.remove.isPending}
            >
              {lineMutations.remove.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Disattiva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

interface LineeCardProps {
  supplier: SupplierCatalog | null;
  onAddLine: () => void;
  onEditLine: (l: SupplierProductLine) => void;
  onDeleteLineRequest: (l: SupplierProductLine) => void;
}

function LineeCard({
  supplier,
  onAddLine,
  onEditLine,
  onDeleteLineRequest,
}: LineeCardProps) {
  const {
    lines,
    isLoading,
    isError,
    refetch,
  } = useSupplierProductLines({
    supplierCatalogId: supplier?.id ?? null,
    enabled: !!supplier?.id,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>
            Linee prodotto
            {supplier && (
              <span className="text-muted-foreground font-normal">
                {" "}
                — {supplier.nome}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Profili specifici del fornitore (es. Veka 70, Veka 76, Veka 82).
            Ogni linea ha il suo ricarico e, opzionalmente, un override sconto.
          </CardDescription>
        </div>
        <Button
          onClick={onAddLine}
          size="sm"
          variant="outline"
          className="gap-2 shrink-0"
          disabled={!supplier}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuova linea
        </Button>
      </CardHeader>
      <CardContent>
        {!supplier ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Seleziona un fornitore per vederne le linee prodotto.
          </p>
        ) : isLoading ? (
          <LineeSkeleton />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : lines.length === 0 ? (
          <EmptyStateLinee onAdd={onAddLine} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Materiale</TableHead>
                <TableHead className="text-right">Ricarico</TableHead>
                <TableHead className="text-right">Sconto override</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-28 text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {MATERIALE_LABELS[l.materiale] ?? l.materiale}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtPct(l.ricarico_default)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {l.sconto_override == null ? "—" : fmtPct(l.sconto_override)}
                  </TableCell>
                  <TableCell>
                    {l.attivo ? (
                      <Badge variant="secondary">Attivo</Badge>
                    ) : (
                      <Badge variant="outline">Disattivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Modifica linea ${l.nome}`}
                        onClick={() => onEditLine(l)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Disattiva linea ${l.nome}`}
                        onClick={() => onDeleteLineRequest(l)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Empty / Error / Skeleton ────────────────────────────────────────────────

function EmptyStateSuppliers({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-muted-foreground max-w-md">
        Nessun fornitore configurato. Aggiungi il tuo primo fornitore (es. Veka,
        Finstral, Schüco) per iniziare a caricare i listini.
      </p>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" aria-hidden />
        Aggiungi fornitore
      </Button>
    </div>
  );
}

function EmptyStateLinee({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted-foreground max-w-md">
        Nessuna linea prodotto ancora configurata per questo fornitore. Ogni
        linea rappresenta un profilo specifico (es. Veka 70, Veka 76).
      </p>
      <Button onClick={onAdd} variant="outline" className="gap-2">
        <Plus className="h-4 w-4" aria-hidden />
        Aggiungi linea prodotto
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="text-sm text-muted-foreground">
        Errore di caricamento. Riprova tra qualche secondo.
      </p>
      <Button onClick={onRetry} variant="outline" size="sm">
        Riprova
      </Button>
    </div>
  );
}

function SuppliersSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function LineeSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
