/**
 * ListinoManutenzione — Tab "Tipi Impianto"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Redesign allineato a "Manodopera e Servizi": tabella table-fixed compatta
 * (l'icona sta accanto al nome, non in una colonna da 68px), tutta la riga
 * apre Modifica, azioni nel menu ⋮, CTA arancione come il resto della pagina.
 */
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  /** Tutta la riga apre Modifica — tranne i controlli veri (menu, checkbox…). */
  const rowClick = (t: TipoImpianto) => (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, [role="checkbox"], [role="switch"], [role="menu"], [role="menuitem"]')) return;
    onEdit(t);
  };

  return (
    <div className="space-y-3">
      <ListinoFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca tipo impianto…"
        filters={
          <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
            <SelectTrigger className="h-9 w-full md:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="attivi">Solo attivi</SelectItem>
              <SelectItem value="disattivi">Solo disattivi</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          <Button
            size="sm"
            onClick={onAdd}
            className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
          >
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
        <Table className="table-fixed min-w-[520px] [&_thead_th]:h-10 [&_thead_th]:px-3 [&_tbody_td]:px-3 [&_tbody_td]:py-2">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[72px]">Ordine</TableHead>
              <TableHead className="w-[96px]">Attivo</TableHead>
              <TableHead className="w-[48px]"><span className="sr-only">Azioni</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingImpianti ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : tipiImpianto.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nessun tipo impianto. Aggiungine uno o clicca &quot;Importa da template&quot;.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nessun tipo impianto corrisponde ai filtri.
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => (
              <TableRow key={t.id} onClick={rowClick(t)} className="cursor-pointer">
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="shrink-0 text-base leading-none" aria-hidden>{t.icona ?? "🔧"}</span>
                    <span className="truncate" title={t.nome}>{t.nome}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{t.ordine ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={t.attivo ? "default" : "secondary"} className="h-5 px-2 text-[11px]">
                    {t.attivo ? "Attivo" : "Disattivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Azioni per ${t.nome}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(t)}>
                        <Pencil className="h-4 w-4 mr-2" />Modifica
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(t.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
