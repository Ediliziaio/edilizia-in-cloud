/**
 * ListinoManutenzione — Tab "Tipi Intervento"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 */
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { categoriaBadge } from "../constants";
import type { TipoIntervento } from "../types";

interface Props {
  tipiIntervento: TipoIntervento[];
  loadingInterventi: boolean;
  onAdd: () => void;
  onEdit: (t: TipoIntervento) => void;
  onDelete: (id: string) => void;
}

export function InterventiTab({ tipiIntervento, loadingInterventi, onAdd, onEdit, onDelete }: Props) {
  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />Nuovo intervento
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-36">Categoria</TableHead>
              <TableHead className="w-36">Durata stimata</TableHead>
              <TableHead className="w-20">Attivo</TableHead>
              <TableHead className="text-right w-24">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInterventi ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : tipiIntervento.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nessun tipo intervento. Aggiungine uno o clicca &quot;Importa da template&quot;.
                </TableCell>
              </TableRow>
            ) : tipiIntervento.map((t) => {
              const cat = categoriaBadge(t.categoria);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                      {cat.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.durata_stimata_h != null ? `${t.durata_stimata_h}h` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.attivo ? "default" : "secondary"}>
                      {t.attivo ? "Attivo" : "Disattivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => onEdit(t)}
                        aria-label={`Modifica ${t.nome}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-destructive"
                        onClick={() => onDelete(t.id)}
                        aria-label={`Elimina ${t.nome}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
