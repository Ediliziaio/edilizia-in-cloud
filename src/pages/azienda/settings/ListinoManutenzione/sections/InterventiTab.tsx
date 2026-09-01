/**
 * ListinoManutenzione — Tab "Tipi Intervento"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Redesign allineato a "Manodopera e Servizi": tabella table-fixed compatta,
 * tutta la riga apre Modifica, azioni nel menu ⋮, CTA arancione.
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
import { CATEGORIE_INTERVENTO, categoriaBadge } from "../constants";
import { ListinoFilterBar, type FilterChip } from "./ListinoFilterBar";
import type { CategoriaIntervento, TipoIntervento } from "../types";

type StatoFilter = "all" | "attivi" | "disattivi";
type CategoriaFilter = "all" | CategoriaIntervento;

interface Props {
  tipiIntervento: TipoIntervento[];
  loadingInterventi: boolean;
  onAdd: () => void;
  onEdit: (t: TipoIntervento) => void;
  onDelete: (id: string) => void;
}

export function InterventiTab({ tipiIntervento, loadingInterventi, onAdd, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState<CategoriaFilter>("all");
  const [stato, setStato] = useState<StatoFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tipiIntervento.filter((t) => {
      if (stato === "attivi" && !t.attivo) return false;
      if (stato === "disattivi" && t.attivo) return false;
      if (categoria !== "all" && t.categoria !== categoria) return false;
      if (q && !t.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tipiIntervento, search, categoria, stato]);

  const hasActiveFilters = search.trim() !== "" || categoria !== "all" || stato !== "all";
  const resetFilters = () => { setSearch(""); setCategoria("all"); setStato("all"); };

  const chips: FilterChip[] = [];
  if (search.trim()) chips.push({ key: "search", label: `Cerca: "${search.trim()}"`, onRemove: () => setSearch("") });
  if (categoria !== "all") chips.push({ key: "categoria", label: `Categoria: ${categoriaBadge(categoria).label}`, onRemove: () => setCategoria("all") });
  if (stato !== "all") chips.push({ key: "stato", label: stato === "attivi" ? "Stato: attivi" : "Stato: disattivi", onRemove: () => setStato("all") });

  /** Tutta la riga apre Modifica — tranne i controlli veri (menu, checkbox…). */
  const rowClick = (t: TipoIntervento) => (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, [role="checkbox"], [role="switch"], [role="menu"], [role="menuitem"]')) return;
    onEdit(t);
  };

  return (
    <div className="space-y-3">
      <ListinoFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca tipo intervento…"
        filters={
          <>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaFilter)}>
              <SelectTrigger className="h-9 w-full md:w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {CATEGORIE_INTERVENTO.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
              <SelectTrigger className="h-9 w-full md:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="attivi">Solo attivi</SelectItem>
                <SelectItem value="disattivi">Solo disattivi</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <Button
            size="sm"
            onClick={onAdd}
            className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1" />Nuovo intervento
          </Button>
        }
        chips={chips}
        shownCount={filtered.length}
        totalCount={tipiIntervento.length}
        unit={["tipo", "tipi"]}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />
      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed min-w-[640px] [&_thead_th]:h-10 [&_thead_th]:px-3 [&_tbody_td]:px-3 [&_tbody_td]:py-2">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[136px]">Categoria</TableHead>
              <TableHead className="w-[110px] text-right">Durata stimata</TableHead>
              <TableHead className="w-[96px]">Attivo</TableHead>
              <TableHead className="w-[48px]"><span className="sr-only">Azioni</span></TableHead>
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
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nessun tipo intervento corrisponde ai filtri.
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => {
              const cat = categoriaBadge(t.categoria);
              return (
                <TableRow key={t.id} onClick={rowClick(t)} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <span className="block truncate" title={t.nome}>{t.nome}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-medium ${cat.color}`}>
                      {cat.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {t.durata_stimata_h != null ? `${t.durata_stimata_h}h` : "—"}
                  </TableCell>
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
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
