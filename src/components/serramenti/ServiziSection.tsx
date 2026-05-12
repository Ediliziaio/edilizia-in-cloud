/**
 * ServiziSection — sezione "Servizi aggiuntivi" del preventivo Serramenti.
 *
 * Servizi tipici: trasporto, tiro al piano, pratica ENEA, smaltimento,
 * sopralluogo extra, ponteggio, occupazione suolo pubblico, ecc.
 *
 * NOTA importante: la MANODOPERA / POSA è inclusa nel prezzo del singolo
 * prodotto (vedi FamilyEditor.posa_tariffa_default_id) — NON entra qui.
 * Qui ci sono solo servizi che vengono fatturati a parte rispetto ai
 * serramenti veri e propri.
 *
 * DB: riusa sr_servizi_progetto (rinominata da sr_manodopera_progetto).
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Truck, Plus, Trash2, Loader2, Search, Settings,
} from "lucide-react";
import {
  useTariffeManodopera, useAddManodopera, useUpdateManodopera, useDeleteManodopera,
} from "@/lib/serramenti/queries";
import type { SrServizioRow, SrProgettoDetail } from "@/types/serramenti";
import type { TariffaMinimal } from "@/lib/serramenti/api";
import { SrCard } from "@/lib/serramenti/wizardUI";
import { formatEuro } from "@/lib/serramenti/format";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

// Servizi tipici suggeriti come quick-add
const SERVIZI_RAPIDI = [
  { tipo: "trasporto", label: "Trasporto", unita: "a_corpo", emoji: "🚚" },
  { tipo: "tiro_al_piano", label: "Tiro al piano", unita: "pz", emoji: "🏗️" },
  { tipo: "pratica_enea", label: "Pratica ENEA", unita: "a_corpo", emoji: "📋" },
  { tipo: "smaltimento", label: "Smaltimento materiali", unita: "a_corpo", emoji: "♻️" },
  { tipo: "sopralluogo_extra", label: "Sopralluogo extra", unita: "pz", emoji: "📏" },
  { tipo: "ponteggio", label: "Ponteggio / piattaforma", unita: "giorno", emoji: "🚧" },
];

export function ServiziSection({ progettoId, detail }: Props) {
  const addMut = useAddManodopera(progettoId);
  const updateMut = useUpdateManodopera(progettoId);
  const deleteMut = useDeleteManodopera(progettoId);
  const [tariffaPickerOpen, setTariffaPickerOpen] = useState(false);
  const [toDelete, setToDelete] = useState<SrServizioRow | null>(null);

  const righe = detail.servizi ?? detail.manodopera ?? [];

  const subtotaleVendita = righe.reduce(
    (acc, r) => acc + Number(r.prezzo_totale_vendita ?? 0), 0,
  );

  const handleAddQuick = (servizio: typeof SERVIZI_RAPIDI[0]) => {
    addMut.mutate({
      descrizione: servizio.label,
      unita: servizio.unita,
      quantita: 1,
      position: righe.length,
    });
  };

  const handlePickTariffa = (t: TariffaMinimal) => {
    addMut.mutate({
      tariffa_id: t.id,
      descrizione: t.nome,
      unita: t.unita ?? "pz",
      quantita: 1,
      prezzo_unitario_costo: t.prezzo_costo != null ? Number(t.prezzo_costo) : null,
      prezzo_unitario_vendita: t.prezzo_vendita != null ? Number(t.prezzo_vendita) : null,
      position: righe.length,
    });
    setTariffaPickerOpen(false);
  };

  const onPatch = (id: string, patch: Partial<SrServizioRow>) => {
    updateMut.mutate({ id, patch });
  };

  return (
    <SrCard
      title="Servizi aggiuntivi"
      description="Trasporto, tiro al piano, pratica ENEA, smaltimento, ponteggio… La posa è già inclusa nel prezzo dei serramenti."
      icon={<Truck className="h-4 w-4" />}
    >
      {/* Quick-add chip per i servizi tipici */}
      <div className="mb-3">
        <p className="text-[11px] text-muted-foreground mb-1.5">Servizi tipici (click per aggiungere):</p>
        <div className="flex flex-wrap gap-1.5">
          {SERVIZI_RAPIDI.map((s) => (
            <button
              key={s.tipo}
              onClick={() => handleAddQuick(s)}
              disabled={addMut.isPending}
              className="text-xs px-2.5 py-1.5 rounded-full border border-orange-200 bg-white hover:bg-orange-50 hover:border-orange-300 transition disabled:opacity-50"
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Button
          onClick={() => setTariffaPickerOpen(true)}
          variant="outline"
          className="flex-1 gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
          disabled={addMut.isPending}
        >
          <Settings className="h-4 w-4" /> Da listino tariffe
        </Button>
        <Button
          onClick={() => addMut.mutate({ descrizione: "Servizio personalizzato", unita: "a_corpo", quantita: 1, position: righe.length })}
          variant="outline"
          className="flex-1 gap-1"
          disabled={addMut.isPending}
        >
          <Plus className="h-4 w-4" /> Voce custom
        </Button>
      </div>

      {righe.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-md p-4 text-center bg-slate-50/30">
          <Truck className="h-7 w-7 mx-auto text-slate-300 mb-1.5" />
          <p className="text-xs text-muted-foreground">
            Nessun servizio aggiuntivo. Sono <strong>opzionali</strong>: aggiungi solo quelli effettivamente concordati col cliente.
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
                        placeholder="pz"
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
                        defaultValue={r.prezzo_unitario_vendita ?? ""}
                        onBlur={(e) => onPatch(r.id, { prezzo_unitario_vendita: e.target.value ? Number(e.target.value) : null })}
                        className="h-8 text-xs w-24"
                      />
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-orange-600">
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

          <Card className="bg-slate-50 border-slate-200 p-3 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-slate-700">Subtotale servizi</span>
            <span className="text-lg font-bold text-slate-800 tabular-nums">
              {formatEuro(subtotaleVendita)}
            </span>
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
            <AlertDialogTitle>Eliminare il servizio?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.descrizione}" verrà rimosso dal preventivo.
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

// ─── TariffaPickerDialog inline ─────────────────────────────────────────────

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
  useEffect(() => { if (!open) { setSearch(""); setDebounced(""); } }, [open]);

  const { data: tariffe = [], isLoading } = useTariffeManodopera(debounced);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seleziona dal listino tariffe</DialogTitle>
          <DialogDescription>
            Tariffe configurate in Impostazioni → Tariffe aziendali. Filtra per cercare servizi (trasporto, ENEA, ecc.).
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca (trasporto, ENEA, smaltimento, sopralluogo…)"
            className="pl-9 h-10"
            autoFocus
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Caricamento…
            </div>
          ) : tariffe.length === 0 ? (
            <div className="py-8 text-center">
              <Truck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nessuna tariffa trovata. Configurale in Impostazioni → Tariffe aziendali.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {tariffe.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onSelect(t)}
                    className="w-full text-left p-3 rounded-md hover:bg-orange-50/60 focus:bg-orange-50 focus:outline-none transition"
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
                          {t.unita && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">per {t.unita}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {t.prezzo_vendita != null && (
                          <p className="text-sm font-bold text-orange-600 tabular-nums">
                            € {Number(t.prezzo_vendita).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
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
