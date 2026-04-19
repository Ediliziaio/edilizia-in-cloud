/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.2
 *
 * Catalogo delle famiglie articoli. Lista + ricerca, raggruppamento per
 * categoria (listino_categorie). Click su card → router a /azienda/impostazioni/listino/famiglie/:id
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Package, Loader2, CopyPlus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFamilies } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FamilyWithAxes, ModalitaPrezzoBase } from "@/types/articleFamily";

interface Categoria {
  id: string;
  nome: string;
  icona: string | null;
}

const MODALITA_LABEL: Record<ModalitaPrezzoBase, string> = {
  pz: "A pezzo",
  mq: "Al mq",
  griglia: "Griglia L×H",
  misura_libera: "Misura libera",
};

export function FamilyCatalog() {
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { families, isLoading } = useFamilies();
  const { deleteFamily, duplicateFamily } = useFamilyMutations();

  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<FamilyWithAxes | null>(null);
  const [toDuplicate, setToDuplicate] = useState<FamilyWithAxes | null>(null);
  const [dupName, setDupName] = useState("");

  // Categorie per etichette di raggruppamento
  // FIX P4-B: se la query fallisce mostriamo un avviso inline anziché
  // fallire silenziosamente (prima tutte le famiglie finivano in
  // "Senza categoria" senza feedback all'utente).
  const {
    data: categorie = [],
    isError: categorieError,
    refetch: refetchCategorie,
  } = useQuery({
    queryKey: ["listino-categorie-for-families", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listino_categorie")
        .select("id, nome, icona")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Categoria[];
    },
  });

  const categoriaById = useMemo(
    () => new Map(categorie.map((c) => [c.id, c])),
    [categorie],
  );

  // Filtro + grouping per categoria
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? families.filter(
          (f) =>
            f.nome.toLowerCase().includes(q) ||
            (f.descrizione ?? "").toLowerCase().includes(q),
        )
      : families;

    const groups = new Map<string, { categoria: Categoria | null; items: FamilyWithAxes[] }>();
    for (const f of filtered) {
      const key = f.categoria_id ?? "__none__";
      const cat = f.categoria_id ? categoriaById.get(f.categoria_id) ?? null : null;
      if (!groups.has(key)) groups.set(key, { categoria: cat, items: [] });
      groups.get(key)!.items.push(f);
    }
    return Array.from(groups.entries());
  }, [families, search, categoriaById]);

  const handleDuplicate = async () => {
    if (!toDuplicate || !dupName.trim()) return;
    try {
      const newId = await duplicateFamily.mutateAsync({
        sourceId: toDuplicate.id,
        newName: dupName.trim(),
      });
      toast.success("Famiglia duplicata");
      setToDuplicate(null);
      setDupName("");
      navigate(`/azienda/impostazioni/listino/famiglie/${newId}`);
    } catch (err) {
      toast.error("Errore duplicazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteFamily.mutateAsync(toDelete.id);
      toast.success("Famiglia disattivata");
      setToDelete(null);
    } catch (err) {
      toast.error("Errore disattivazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Famiglie articoli</h2>
          <p className="text-sm text-muted-foreground">
            Modelli parametrici con assi configurabili (materiale, vetro, apertura…).
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:flex-nowrap">
          <div className="relative w-full sm:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Cerca famiglia…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
              aria-label="Cerca famiglia"
            />
          </div>
          {isAdmin && (
            <Button
              onClick={() => navigate("/azienda/impostazioni/listino/famiglie/nuova")}
              className="h-10 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Nuova famiglia
            </Button>
          )}
        </div>
      </header>

      {!isAdmin && (
        <div
          className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground"
          role="note"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Visualizzazione in sola lettura. Solo l&apos;amministratore
            dell&apos;azienda può creare, modificare o duplicare le famiglie.
          </p>
        </div>
      )}

      {categorieError && (
        <div
          className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 text-sm"
          role="alert"
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-amber-900 dark:text-amber-100 font-medium">
                Impossibile caricare le categorie
              </p>
              <p className="text-amber-800/90 dark:text-amber-200/90 text-xs mt-0.5">
                Le famiglie sono mostrate senza raggruppamento. Riprova tra qualche secondo.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetchCategorie()}
            className="h-9 shrink-0 w-full sm:w-auto"
          >
            Riprova
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
          Caricamento…
        </div>
      ) : families.length === 0 ? (
        <Card>
          <CardContent className="py-10 sm:py-14 text-center px-4">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
            <p className="font-medium">Nessuna famiglia configurata</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {isAdmin
                ? "Crea la tua prima famiglia articoli per iniziare a preventivare."
                : "L'amministratore non ha ancora configurato famiglie articoli."}
            </p>
            {isAdmin && (
              <Button
                className="mt-4 h-10 w-full sm:w-auto"
                onClick={() => navigate("/azienda/impostazioni/listino/famiglie/nuova")}
              >
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Crea famiglia
              </Button>
            )}
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground space-y-3">
            <p>Nessuna famiglia corrisponde alla ricerca.</p>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="h-9">
                Pulisci ricerca
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, group]) => (
            <section key={key}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {group.categoria?.nome ?? "Senza categoria"}
                <span className="ml-2 font-normal text-muted-foreground">
                  ({group.items.length})
                </span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {group.items.map((f) => {
                  const nAssi = f.axes.length;
                  const nValori = f.axes.reduce((sum, a) => sum + a.values.length, 0);
                  return (
                    <Card
                      key={f.id}
                      className={
                        isAdmin
                          ? "cursor-pointer hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all"
                          : ""
                      }
                      onClick={
                        isAdmin
                          ? () => navigate(`/azienda/impostazioni/listino/famiglie/${f.id}`)
                          : undefined
                      }
                      role={isAdmin ? "button" : undefined}
                      tabIndex={isAdmin ? 0 : undefined}
                      aria-label={isAdmin ? `Apri famiglia ${f.nome}` : undefined}
                      onKeyDown={
                        isAdmin
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigate(`/azienda/impostazioni/listino/famiglie/${f.id}`);
                              }
                            }
                          : undefined
                      }
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base leading-tight break-words">{f.nome}</CardTitle>
                          <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                            {MODALITA_LABEL[f.modalita_prezzo_base]}
                          </Badge>
                        </div>
                        {f.descrizione ? (
                          <CardDescription className="line-clamp-2">
                            {f.descrizione}
                          </CardDescription>
                        ) : null}
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{nAssi} {nAssi === 1 ? "asse" : "assi"}</span>
                          <span aria-hidden="true">·</span>
                          <span>{nValori} {nValori === 1 ? "valore" : "valori"}</span>
                          <span aria-hidden="true">·</span>
                          <span>UM {f.unit_of_measure}</span>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 flex-1 sm:flex-initial"
                              onClick={(e) => {
                                e.stopPropagation();
                                setToDuplicate(f);
                                setDupName(`${f.nome} (copia)`);
                              }}
                              aria-label={`Duplica ${f.nome}`}
                            >
                              <CopyPlus className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                              <span className="hidden sm:inline">Duplica</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 flex-1 sm:flex-initial text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setToDelete(f);
                              }}
                              aria-label={`Disattiva ${f.nome}`}
                            >
                              <Trash2 className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                              <span className="hidden sm:inline">Disattiva</span>
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Dialog duplica */}
      <Dialog
        open={!!toDuplicate}
        onOpenChange={(open) => {
          if (duplicateFamily.isPending) return;
          if (!open) {
            setToDuplicate(null);
            setDupName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplica famiglia</DialogTitle>
            <DialogDescription>
              Crea una copia di "{toDuplicate?.nome}" con tutti gli assi e valori. Potrai modificarla separatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="dup-name" className="text-sm font-medium">Nome nuova famiglia</label>
            <Input
              id="dup-name"
              value={dupName}
              onChange={(e) => setDupName(e.target.value)}
              autoFocus
              className="h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && dupName.trim() && !duplicateFamily.isPending) {
                  e.preventDefault();
                  void handleDuplicate();
                }
              }}
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setToDuplicate(null);
                setDupName("");
              }}
              disabled={duplicateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!dupName.trim() || duplicateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {duplicateFamily.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Duplicazione…
                </>
              ) : (
                "Duplica"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog elimina (soft delete) */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (deleteFamily.isPending) return;
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattivare "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              La famiglia verrà nascosta dai nuovi preventivi ma resterà nei preventivi storici che la usano. Potrai riattivarla in futuro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={deleteFamily.isPending} className="h-10 mt-0 w-full sm:w-auto">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteFamily.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFamily.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Disattivazione…
                </>
              ) : (
                "Disattiva"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
