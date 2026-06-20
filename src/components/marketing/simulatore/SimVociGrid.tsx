/**
 * SimVociGrid — griglia editabile delle voci della simulazione.
 *
 * In Tappa A tutte le voci stanno in un unico gruppo "Voci" (il raggruppamento
 * per fase arriva in Tappa B). Header con le colonne, righe `SimVoceRow`,
 * riga TOTALE in fondo (somma dei totali di riga), empty-state quando vuoto.
 *
 * Pulsanti in alto:
 *   - "Riga libera" → aggiunge una `VoceSim` vuota (fonte:'libera') in coda.
 *   - "Da listino"  → apre il dialog (`onApriListino`) per listino/prezzari.
 *
 * Riordino righe con frecce ↑↓ (scambio con la riga adiacente). Ogni modifica
 * passa per `onChange(voci)` → l'editor ricalcola i KPI e autosalva.
 */
import { ListPlus, Plus, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { calcolaVoce } from "@/lib/simulatore/calcoli";
import { SimVoceRow } from "./SimVoceRow";
import type { VoceSim } from "@/lib/simulatore/tipi";

interface SimVociGridProps {
  voci: VoceSim[];
  onChange: (voci: VoceSim[]) => void;
  onApriListino: () => void;
}

/** Prossimo `ordine` libero (coda): max(ordine)+1, o 0 se vuoto. */
function nextOrdine(voci: VoceSim[]): number {
  return voci.length ? Math.max(...voci.map((v) => v.ordine)) + 1 : 0;
}

/** Crea una riga libera vuota con default sensati. */
function makeRigaLibera(voci: VoceSim[]): VoceSim {
  return {
    id: crypto.randomUUID(),
    fase_id: null,
    descrizione: "",
    fonte: "libera",
    riferimento_id: null,
    codice: null,
    quantita: 1,
    unita: "pz",
    costo_unitario: 0,
    ricarico_pct: 0,
    prezzo_unitario: 0,
    vat_rate: 10,
    bene_significativo: false,
    valore_posa_associata: null,
    is_manodopera: false,
    ordine: nextOrdine(voci),
  };
}

export function SimVociGrid({ voci, onChange, onApriListino }: SimVociGridProps) {
  // Ordine visivo stabile per `ordine` (poi per posizione, come tie-break).
  const ordered = [...voci].sort((a, b) => a.ordine - b.ordine);

  const totale = ordered.reduce((acc, v) => acc + calcolaVoce(v).imponibile_ricavo, 0);

  const patchVoce = (id: string, patch: Partial<VoceSim>) => {
    onChange(voci.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const removeVoce = (id: string) => {
    onChange(voci.filter((v) => v.id !== id));
  };

  const addRigaLibera = () => {
    onChange([...voci, makeRigaLibera(voci)]);
  };

  // Scambia la voce con la riga adiacente (nell'ordine visivo) scambiandone `ordine`.
  const move = (id: string, dir: -1 | 1) => {
    const idx = ordered.findIndex((v) => v.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swapIdx];
    onChange(
      voci.map((v) => {
        if (v.id === a.id) return { ...v, ordine: b.ordine };
        if (v.id === b.id) return { ...v, ordine: a.ordine };
        return v;
      }),
    );
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Voci</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addRigaLibera} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Riga libera
            </Button>
            <Button size="sm" onClick={onApriListino} className="gap-1.5">
              <Library className="h-4 w-4" />
              Da listino
            </Button>
          </div>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            size="sm"
            title="Nessuna voce"
            description="Aggiungi una voce da listino/prezzari o inserisci una riga libera."
            action={{ label: "Da listino", onClick: onApriListino, icon: Library }}
            secondaryAction={{ label: "Riga libera", onClick: addRigaLibera, icon: Plus }}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Descrizione</TableHead>
                  <TableHead className="w-[88px] text-right">Q.tà</TableHead>
                  <TableHead className="w-[84px]">UM</TableHead>
                  <TableHead className="w-[112px] text-right">Costo</TableHead>
                  <TableHead className="w-[88px] text-right">Ric. %</TableHead>
                  <TableHead className="w-[76px]">IVA</TableHead>
                  <TableHead className="w-[112px] text-right">Prezzo</TableHead>
                  <TableHead className="w-[120px] text-right">Totale</TableHead>
                  <TableHead className="w-[88px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((voce, i) => (
                  <SimVoceRow
                    key={voce.id}
                    voce={voce}
                    onChange={(patch) => patchVoce(voce.id, patch)}
                    onRemove={() => removeVoce(voce.id)}
                    reorder={{
                      isFirst: i === 0,
                      isLast: i === ordered.length - 1,
                      onMoveUp: () => move(voce.id, -1),
                      onMoveDown: () => move(voce.id, 1),
                    }}
                  />
                ))}
              </TableBody>
              <tfoot>
                <TableRow className="border-t-2 bg-secondary/40 hover:bg-secondary/40">
                  <TableCell colSpan={7} className="text-right text-sm font-semibold">
                    Totale imponibile
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums">
                    {formatCurrency(totale)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </tfoot>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
