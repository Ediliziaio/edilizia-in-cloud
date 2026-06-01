/**
 * ListinoManutenzione — Tab "Tipi Impianto"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Upgrade UX: ricerca + filtro stato + chip rimovibili + conteggio, come la
 * pagina "Manodopera e Servizi".
 */
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListinoFilterBar, type FilterChip } from "./ListinoFilterBar";
import type { TipoImpianto } from "../types";

type StatoFilter = "all" | "attivi" | "disattivi";

interface Props {
  tipiImpianto: TipoImpianto[];
  loadingImpianti: boolean;
  onAdd: () => void;
  onEdit: (t: TipoImpianto) => void;
  onDelete: (id: string) => void;
}

export function ImpiantiTab({ tipiImpianto, loadingImpianti, onAdd, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState("");
  const [stato, setStato] = useState<StatoFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tipiImpianto.filter((t) => {
      if (stato === "attivi" && !t.attivo) return false;
      if (stato === "disattivi" && t.attivo) return false;
      if (q && !t.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tipiImpianto, search, stato]);

  const hasActiveFilters = search.trim() !== "" || stato !== "all";
  const resetFilters = () => { setSearch(""); setStato("all"); };

  const chips: FilterChip[] = [];
  if (search.trim()) chips.push({ key: "search", label: `Cerca: "${search.trim()}"`, onRemove: () => setSearch("") });
  if (stato !== "all") chips.push({ key: "stato", label: stato === "attivi" ? "Stato: attivi" : "Stato: disattivi", onRemove: () => setStato("all") });

  return (
    <div className="space-y-3">
      <ListinoFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca tipo impianto…"
        filters={
          <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
            <SelectTrigger className="w-full md:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="attivi">Solo attivi</SelectItem>
              <SelectItem value="disattivi">Solo disattivi</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />Nuovo impianto
          </Button>
        }
        chips={chips}
        shownCount={filtered.length}
        totalCount={tipiImpianto.length}
        unit={["tipo", "tipi"]}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />
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
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nessun tipo impianto corrisponde ai filtri.
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => (
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
    </div>
  );
}
