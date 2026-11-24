/**
 * ListinoManutenzione — scheda «Interventi» (i tipi di intervento)
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Redesign allineato a "Manodopera e servizi": tabella table-fixed compatta,
 * tutta la riga apre Modifica, azioni nel menu ⋮, CTA arancione.
 * Chi può solo consultare non vede «Nuovo intervento», il menu ⋮ né la riga che apre la modifica.
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type StatoFilter = "all" | "attivi" | "disattivi";
type CategoriaFilter = "all" | CategoriaIntervento;

interface Props {
  tipiIntervento: TipoIntervento[];
  loadingInterventi: boolean;
  /** Chi può cambiare i tipi di intervento: solo l'amministratore (il database rifiuta gli altri). */
  puoModificare: boolean;
  /** «Importa un catalogo pronto» è a disposizione: lo dice il messaggio di elenco vuoto. */
  puoImportare: boolean;
  onAdd: () => void;
  onEdit: (t: TipoIntervento) => void;
  onDelete: (id: string) => void;
}

export function InterventiTab({ tipiIntervento, loadingInterventi, puoModificare, puoImportare, onAdd, onEdit, onDelete }: Props) {
  const tr = useT();
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
  if (search.trim()) chips.push({ key: "search", label: tr("Cerca: \"{testo}\"", { testo: search.trim() }), onRemove: () => setSearch("") });
  if (categoria !== "all") chips.push({ key: "categoria", label: tr("Categoria: {nome}", { nome: tr(categoriaBadge(categoria).label) }), onRemove: () => setCategoria("all") });
  if (stato !== "all") chips.push({ key: "stato", label: stato === "attivi" ? tr("Stato: attivi") : tr("Stato: disattivi"), onRemove: () => setStato("all") });

  /** Tutta la riga apre Modifica — tranne i controlli veri (menu, checkbox…). */
  const rowClick = (t: TipoIntervento) => (e: React.MouseEvent) => {
    if (!puoModificare) return;
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, [role="checkbox"], [role="switch"], [role="menu"], [role="menuitem"]')) return;
    onEdit(t);
  };

  const colonne = puoModificare ? 5 : 4;

  return (
    <div className="space-y-3">
      <ListinoFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={tr("Cerca tipo di intervento…")}
        searchLabel={tr("Cerca tra i tipi di intervento")}
        filters={
          <>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaFilter)}>
              <SelectTrigger aria-label={tr("Filtra per categoria")} className="h-9 w-full md:w-[180px] max-md:h-11"><SelectValue placeholder={tr("Categoria")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("Tutte le categorie")}</SelectItem>
                {CATEGORIE_INTERVENTO.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{tr(c.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
              <SelectTrigger aria-label={tr("Filtra per stato")} className="h-9 w-full md:w-[150px] max-md:h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("Tutti gli stati")}</SelectItem>
                <SelectItem value="attivi">{tr("Solo attivi")}</SelectItem>
                <SelectItem value="disattivi">{tr("Solo disattivi")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={puoModificare ? (
          <Button
            size="sm"
            onClick={onAdd}
            className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden />{tr("Nuovo intervento")}
          </Button>
        ) : undefined}
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
              <TableHead>{tr("Nome")}</TableHead>
              <TableHead className="w-[136px]">{tr("Categoria")}</TableHead>
              <TableHead className="w-[110px] text-right">{tr("Durata stimata")}</TableHead>
              <TableHead className="w-[96px]">{tr("Attivo")}</TableHead>
              {puoModificare && <TableHead className="w-[48px]"><span className="sr-only">{tr("Azioni")}</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInterventi ? (
              <TableRow>
                <TableCell colSpan={colonne} className="text-center py-8 text-muted-foreground">
                  {tr("Caricamento...")}
                </TableCell>
              </TableRow>
            ) : tipiIntervento.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colonne} className="text-center py-8 text-muted-foreground">
                  {puoModificare
                    ? (puoImportare ? tr("Nessun tipo di intervento. Aggiungine uno o usa «Importa un catalogo pronto».") : tr("Nessun tipo di intervento. Aggiungine uno."))
                    : tr("Nessun tipo di intervento.")}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colonne} className="text-center py-8 text-muted-foreground">
                  {tr("Nessun tipo di intervento corrisponde ai filtri.")}
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => {
              const cat = categoriaBadge(t.categoria);
              return (
                <TableRow key={t.id} onClick={rowClick(t)} className={puoModificare ? "cursor-pointer" : undefined}>
                  <TableCell className="font-medium">
                    <span className="block truncate" title={t.nome}>{t.nome}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-medium ${cat.color}`}>
                      {tr(cat.label)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {t.durata_stimata_h != null ? `${t.durata_stimata_h}h` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.attivo ? "default" : "secondary"} className="h-5 px-2 text-[11px]">
                      {t.attivo ? tr("Attivo") : tr("Disattivo")}
                    </Badge>
                  </TableCell>
                  {puoModificare && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tr("Azioni per {nome}", { nome: String(t.nome ?? "") })}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(t)}>
                            <Pencil className="h-4 w-4 mr-2" />{tr("Modifica")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(t.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />{tr("Elimina")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
