/**
 * ListinoPickerDialog — sceglie un articolo dal listino aziendale
 * (article_families + listino_griglia) per popolare una riga del BOM
 * Serramenti con tipologia, dimensioni, prezzo vendita.
 *
 * Flusso:
 *  1. Cerca famiglia (es. "Finestra 1 anta", "Costruzione 2 IT — ...")
 *  2. Dopo aver scelto la famiglia, mostra la griglia misure×prezzi
 *  3. Click su una riga → pick: ritorna {family, valore_x, valore_y, prezzo}
 */
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Package, ArrowLeft, Tag } from "lucide-react";
import { useListinoFamilies, useListinoGriglia } from "@/lib/serramenti/queries";
import type { ListinoFamily, ListinoGrigliaItem } from "@/lib/serramenti/api";

export interface ListinoPickResult {
  family_id: string;
  family_nome: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  prezzo_unitario: number | null;
  griglia_id?: string | null;
  // Auto-link manodopera dal FamilyEditor
  manodopera?: {
    modalita: "tariffa" | "manuale" | "nessuna" | null;
    tariffa_default_id: string | null;
    quantita_default: number | null;
    posa_linked: boolean | null;
    unita: string | null;
    costo_acquisto: number | null;
    prezzo_vendita: number | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ListinoPickResult) => void;
}

export function ListinoPickerDialog({ open, onOpenChange, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<ListinoFamily | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
      setSelectedFamily(null);
    }
  }, [open]);

  const { data: families = [], isLoading: loadingFam } = useListinoFamilies(debounced);
  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(selectedFamily?.id);

  const manodoperaPayload = (f: ListinoFamily): ListinoPickResult["manodopera"] => ({
    modalita: f.manodopera_modalita,
    tariffa_default_id: f.posa_tariffa_default_id,
    quantita_default: f.posa_quantita_default != null ? Number(f.posa_quantita_default) : null,
    posa_linked: f.posa_linked,
    unita: f.manodopera_unita,
    costo_acquisto: f.manodopera_costo_acquisto != null ? Number(f.manodopera_costo_acquisto) : null,
    prezzo_vendita: f.manodopera_prezzo_vendita != null ? Number(f.manodopera_prezzo_vendita) : null,
  });

  const handlePickGriglia = (g: ListinoGrigliaItem) => {
    if (!selectedFamily) return;
    onSelect({
      family_id: selectedFamily.id,
      family_nome: selectedFamily.nome,
      larghezza_mm: g.valore_x,
      altezza_mm: g.valore_y,
      prezzo_unitario: g.prezzo_vendita != null ? Number(g.prezzo_vendita) : null,
      griglia_id: g.id,
      manodopera: manodoperaPayload(selectedFamily),
    });
    onOpenChange(false);
  };

  const handlePickFamilyOnly = (f: ListinoFamily) => {
    // Caso "modalita_prezzo_base = pz/mq/misura_libera": niente griglia → uso il prezzo base
    if (f.modalita_prezzo_base && f.modalita_prezzo_base !== "griglia") {
      onSelect({
        family_id: f.id,
        family_nome: f.nome,
        larghezza_mm: null,
        altezza_mm: null,
        prezzo_unitario: f.prezzo_base_vendita != null ? Number(f.prezzo_base_vendita) : null,
        manodopera: manodoperaPayload(f),
      });
      onOpenChange(false);
    } else {
      setSelectedFamily(f);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {selectedFamily ? (
              <span className="flex items-center gap-2">
                <Button
                  size="icon" variant="ghost"
                  onClick={() => setSelectedFamily(null)}
                  className="h-7 w-7"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Tag className="h-4 w-4 text-emerald-700" />
                <span>{selectedFamily.nome}</span>
              </span>
            ) : (
              "Seleziona dal listino"
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedFamily
              ? "Scegli la combinazione misure × prezzo. Verranno applicati alla riga del preventivo."
              : "Scegli una tipologia di serramento dal listino della tua azienda."}
          </DialogDescription>
        </DialogHeader>

        {!selectedFamily ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca tipologia (es. 'Finestra', 'Porta-finestra', codice produttore)..."
                className="pl-9 h-10"
                autoFocus
              />
            </div>

            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1">
              {loadingFam ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Caricamento listino…
                </div>
              ) : families.length === 0 ? (
                <div className="py-8 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {debounced.length >= 2
                      ? "Nessuna famiglia trovata con questi criteri."
                      : "Nessun articolo nel listino. Configura il listino in Impostazioni → Listino prodotti."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {families.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => handlePickFamilyOnly(f)}
                        className="w-full text-left p-3 rounded-md hover:bg-emerald-50/60 focus:bg-emerald-50 focus:outline-none transition"
                      >
                        <p className="text-sm font-semibold text-slate-900">{f.nome}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                          {f.vertical && <span>📦 {f.vertical}</span>}
                          {f.modalita_prezzo_base && <span>💰 prezzo {f.modalita_prezzo_base}</span>}
                          {f.prezzo_base_vendita != null && (
                            <span className="text-emerald-700 font-semibold">
                              base €{Number(f.prezzo_base_vendita).toLocaleString("it-IT")}
                            </span>
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          // Mostra griglia misure × prezzo
          <div className="max-h-[55vh] overflow-y-auto">
            {loadingGriglia ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Caricamento griglia prezzi…
              </div>
            ) : griglia.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Nessuna griglia misure×prezzo per questa famiglia.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    onSelect({
                      family_id: selectedFamily.id,
                      family_nome: selectedFamily.nome,
                      larghezza_mm: null,
                      altezza_mm: null,
                      prezzo_unitario: selectedFamily.prezzo_base_vendita != null
                        ? Number(selectedFamily.prezzo_base_vendita)
                        : null,
                      manodopera: manodoperaPayload(selectedFamily),
                    });
                    onOpenChange(false);
                  }}
                  variant="outline"
                  className="border-emerald-300 text-emerald-700"
                >
                  Usa famiglia con prezzo base (€{Number(selectedFamily.prezzo_base_vendita ?? 0).toFixed(2)})
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Larghezza</th>
                      <th className="text-left p-2">Altezza</th>
                      <th className="text-right p-2">Prezzo vendita</th>
                      <th className="text-left p-2 hidden md:table-cell">Note</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {griglia.map((g) => (
                      <tr key={g.id} className="hover:bg-emerald-50/50 cursor-pointer" onClick={() => handlePickGriglia(g)}>
                        <td className="p-2 tabular-nums">{g.valore_x ?? "—"} mm</td>
                        <td className="p-2 tabular-nums">{g.valore_y ?? "—"} mm</td>
                        <td className="p-2 text-right tabular-nums font-semibold text-emerald-700">
                          {g.prezzo_vendita != null
                            ? `€ ${Number(g.prezzo_vendita).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                        <td className="p-2 text-muted-foreground hidden md:table-cell truncate max-w-xs">
                          {g.note ?? ""}
                        </td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs">Scegli</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
