/**
 * ListinoManutenzione — Tab "Tipi Intervento"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Upgrade UX: ricerca + filtro categoria + filtro stato + chip rimovibili +
 * conteggio, come la pagina "Manodopera e Servizi".
 */
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-3">
      <ListinoFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca tipo intervento…"
        filters={
          <>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaFilter)}>
              <SelectTrigger className="w-full md:w-[210px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {CATEGORIE_INTERVENTO.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
              <SelectTrigger className="w-full md:w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="attivi">Solo attivi</SelectItem>
                <SelectItem value="disattivi">Solo disattivi</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <Button size="sm" onClick={onAdd}>
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
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nessun tipo intervento corrisponde ai filtri.
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => {
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
    </div>
  );
}
