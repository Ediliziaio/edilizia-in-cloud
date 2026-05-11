/**
 * ManodoperaSection — sezione manodopera/posa nello Step Composizione offerta.
 *
 * Permette di:
 *  - Aggiungere voci di manodopera dal listino aziendale (tariffe_aziendali)
 *  - Inserire voci a mano (off-listino)
 *  - Modificare quantità, prezzi unitari (auto-calcolo totale)
 *  - Vedere il subtotale manodopera
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  HardHat, Plus, Trash2, Loader2, Search, Wrench,
} from "lucide-react";
import {
  useTariffeManodopera, useAddManodopera, useUpdateManodopera, useDeleteManodopera,
} from "@/lib/serramenti/queries";
import type { SrManodoperaRow, SrProgettoDetail } from "@/types/serramenti";
import type { TariffaMinimal } from "@/lib/serramenti/api";
import { SrCard, formatEuro } from "@/lib/serramenti/wizardUI";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function ManodoperaSection({ progettoId, detail }: Props) {
  const addMut = useAddManodopera(progettoId);
  const updateMut = useUpdateManodopera(progettoId);
  const deleteMut = useDeleteManodopera(progettoId);
  const [tariffaPickerOpen, setTariffaPickerOpen] = useState(false);
  const [toDelete, setToDelete] = useState<SrManodoperaRow | null>(null);

  const righe = detail.manodopera ?? [];

  const subtotaleVendita = righe.reduce(
    (acc, r) => acc + Number(r.prezzo_totale_vendita ?? 0), 0,
  );
  const subtotaleCosto = righe.reduce(
    (acc, r) => acc + Number(r.prezzo_totale_costo ?? 0), 0,
  );

  const handleAddManual = () => {
    addMut.mutate({
      descrizione: "Posa serramenti",
      unita: "cantiere",
      quantita: 1,
      position: righe.length,
    });
  };

  const handlePickTariffa = (t: TariffaMinimal) => {
    addMut.mutate({
      tariffa_id: t.id,
      descrizione: t.nome,
      unita: t.unita ?? "ora",
      quantita: 1,
      prezzo_unitario_costo: t.prezzo_costo != null ? Number(t.prezzo_costo) : null,
      prezzo_unitario_vendita: t.prezzo_vendita != null ? Number(t.prezzo_vendita) : null,
      position: righe.length,
    });
    setTariffaPickerOpen(false);
  };

  const onPatch = (id: string, patch: Partial<SrManodoperaRow>) => {
    updateMut.mutate({ id, patch });
  };

  return (
    <SrCard
      title="Manodopera / Posa"
      description="Voci di manodopera collegate al listino tariffe aziendali. Entrano nel calcolo del prezzo finale nello Step Economia."
      icon={<HardHat className="h-4 w-4" />}
    >
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Button
          onClick={() => setTariffaPickerOpen(true)}
          className="flex-1 bg-emerald-700 hover:bg-emerald-800 gap-1"
          disabled={addMut.isPending}
        >
          <Wrench className="h-4 w-4" /> Aggiungi dal listino tariffe
        </Button>
        <Button
          onClick={handleAddManual}
          variant="outline"
          className="flex-1 gap-1"
          disabled={addMut.isPending}
        >
          <Plus className="h-4 w-4" /> Aggiungi voce custom
        </Button>
      </div>

      {righe.length === 0 ? (
        <div className="border-2 border-dashed border-emerald-200 rounded-md p-5 text-center">
          <HardHat className="h-8 w-8 mx-auto text-emerald-300 mb-2" />
          <p className="text-xs text-muted-foreground">
            Nessuna voce di manodopera. Aggiungi dal listino o crea una voce custom (posa, smontaggio, sopralluogo, ecc.).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Descrizione</TableHead>
                  <TableHead className="text-xs w-20">Unità</TableHead>
                  <TableHead className="text-xs w-20">Q.tà</TableHead>
                  <TableHead className="text-xs w-28">€ costo</TableHead>
                  <TableHead className="text-xs w-28">€ vendita</TableHead>
                  <TableHead className="text-xs w-28">Totale</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Input
                        defaultValue={r.descrizione}
                        onBlur={(e) => onPatch(r.id, { descrizione: e.target.value || "Voce" })}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={r.unita ?? ""}
                        onBlur={(e) => onPatch(r.id, { unita: e.target.value || null })}
                        placeholder="ora"
                        className="h-8 text-xs w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.5}
                        defaultValue={r.quantita}
                        onBlur={(e) => onPatch(r.id, { quantita: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-xs w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step={0.01}
                        defaultValue={r.prezzo_unitario_costo ?? ""}
                        onBlur={(e) => onPatch(r.id, { prezzo_unitario_costo: e.target.value ? Number(e.target.value) : null })}
                        className="h-8 text-xs w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step={0.01}
                        defaultValue={r.prezzo_unitario_vendita ?? ""}
                        onBlur={(e) => onPatch(r.id, { prezzo_unitario_vendita: e.target.value ? Number(e.target.value) : null })}
                        className="h-8 text-xs w-24"
                      />
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-emerald-700">
                      {formatEuro(r.prezzo_totale_vendita)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setToDelete(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Card className="bg-emerald-50/40 border-emerald-200 p-3 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-emerald-900">
              Subtotale manodopera (vendita)
            </span>
            <div className="flex gap-4 items-center">
              <span className="text-[10px] text-emerald-700">
                costo: {formatEuro(subtotaleCosto)}
              </span>
              <span className="text-lg font-bold text-emerald-800 tabular-nums">
                {formatEuro(subtotaleVendita)}
              </span>
            </div>
          </Card>
        </div>
      )}

      <TariffaPickerDialog
        open={tariffaPickerOpen}
        onOpenChange={setTariffaPickerOpen}
        onSelect={handlePickTariffa}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare voce manodopera?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.descrizione}" verrà rimossa dal preventivo. Non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SrCard>
  );
}

// ─── TariffaPickerDialog (inline qui per semplicità) ────────────────────────

function TariffaPickerDialog({
  open, onOpenChange, onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (t: TariffaMinimal) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) { setSearch(""); setDebounced(""); }
  }, [open]);

  const { data: tariffe = [], isLoading } = useTariffeManodopera(debounced);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seleziona dal listino tariffe</DialogTitle>
          <DialogDescription>
            Tariffe aziendali da `tariffe_aziendali`: posa, manodopera, sopralluogo, smontaggio, ecc.
            Configurabili in Impostazioni → Tariffe.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca tariffa (posa, sopralluogo, smontaggio...)"
            className="pl-9 h-10"
            autoFocus
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Caricamento tariffe…
            </div>
          ) : tariffe.length === 0 ? (
            <div className="py-8 text-center">
              <Wrench className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {debounced.length >= 2
                  ? "Nessuna tariffa trovata."
                  : "Configura le tariffe in Impostazioni → Tariffe aziendali per usarle nei preventivi."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {tariffe.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onSelect(t)}
                    className="w-full text-left p-3 rounded-md hover:bg-emerald-50/60 focus:bg-emerald-50 focus:outline-none transition"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{t.nome}</p>
                        {t.descrizione && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.descrizione}</p>
                        )}
                        <div className="flex gap-2 mt-1 flex-wrap text-[10px]">
                          {t.categoria_prodotto && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{t.categoria_prodotto}</span>
                          )}
                          {t.vertical_associato && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{t.vertical_associato}</span>
                          )}
                          {t.unita && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">per {t.unita}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {t.prezzo_vendita != null && (
                          <p className="text-sm font-bold text-emerald-700 tabular-nums">
                            € {Number(t.prezzo_vendita).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        {t.prezzo_costo != null && (
                          <p className="text-[10px] text-muted-foreground">
                            costo: € {Number(t.prezzo_costo).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
