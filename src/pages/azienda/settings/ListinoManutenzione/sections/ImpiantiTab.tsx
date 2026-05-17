/**
 * ListinoManutenzione — Tab "Tipi Impianto"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 */
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { TipoImpianto } from "../types";

interface Props {
  tipiImpianto: TipoImpianto[];
  loadingImpianti: boolean;
  onAdd: () => void;
  onEdit: (t: TipoImpianto) => void;
  onDelete: (id: string) => void;
}

export function ImpiantiTab({ tipiImpianto, loadingImpianti, onAdd, onEdit, onDelete }: Props) {
  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />Nuovo impianto
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Icona</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-20">Ordine</TableHead>
              <TableHead className="w-20">Attivo</TableHead>
              <TableHead className="text-right w-24">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingImpianti ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : tipiImpianto.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nessun tipo impianto. Aggiungine uno o clicca &quot;Importa da template&quot;.
                </TableCell>
              </TableRow>
            ) : tipiImpianto.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xl">{t.icona ?? "🔧"}</TableCell>
                <TableCell className="font-medium">{t.nome}</TableCell>
                <TableCell className="text-muted-foreground">{t.ordine ?? "—"}</TableCell>
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
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
