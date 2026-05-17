/**
 * ListinoManutenzione — Tab "Tariffe"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 */
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import type { ListinoPrezzo, TipoImpianto, TipoIntervento } from "../types";

interface Props {
  listino: ListinoPrezzo[];
  loadingListino: boolean;
  tipiImpianto: TipoImpianto[];
  tipiIntervento: TipoIntervento[];
  onAdd: () => void;
  onEdit: (l: ListinoPrezzo) => void;
  onDelete: (id: string) => void;
}

export function TariffeTab({
  listino, loadingListino, tipiImpianto, tipiIntervento, onAdd, onEdit, onDelete,
}: Props) {
  const noTipi = tipiImpianto.length === 0 || tipiIntervento.length === 0;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button
          size="sm"
          onClick={onAdd}
          disabled={noTipi}
        >
          <Plus className="h-4 w-4 mr-1" />Nuova tariffa
        </Button>
      </div>
      {noTipi ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Aggiungi prima almeno un tipo impianto e un tipo intervento, oppure clicca &quot;Importa da template&quot;.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Impianto</TableHead>
                <TableHead>Intervento</TableHead>
                <TableHead className="w-28">Prezzo</TableHead>
                <TableHead className="w-16">IVA</TableHead>
                <TableHead className="w-28">Unità</TableHead>
                <TableHead className="text-right w-24">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingListino ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Caricamento...
                  </TableCell>
                </TableRow>
              ) : listino.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nessuna tariffa configurata. Aggiungine una o clicca &quot;Importa da template&quot;.
                  </TableCell>
                </TableRow>
              ) : listino.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.tipo_impianto
                      ? `${l.tipo_impianto.icona ?? ""} ${l.tipo_impianto.nome}`.trim()
                      : <span className="text-muted-foreground italic">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    {l.tipo_intervento?.nome ?? <span className="text-muted-foreground italic">—</span>}
                  </TableCell>
                  <TableCell>
                    {l.prezzo_base != null && l.prezzo_base > 0
                      ? formatCurrency(l.prezzo_base)
                      : <Badge className="bg-amber-100 text-amber-700 border-amber-200">€0</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.iva_percentuale ?? 22}%</TableCell>
                  <TableCell className="text-muted-foreground">{l.unita}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => onEdit(l)}
                        aria-label="Modifica tariffa"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-destructive"
                        onClick={() => onDelete(l.id)}
                        aria-label="Elimina tariffa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
