/**
 * ListinoManutenzione — Tab "Tariffe"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Redesign allineato a "Manodopera e Servizi": tabella table-fixed compatta,
 * prezzi a destra in tabular-nums (prima erano allineati a sinistra), tutta
 * la riga apre Modifica, azioni nel menu ⋮, CTA arancione.
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
import { formatCurrency } from "@/lib/formatters";
import { ListinoFilterBar, type FilterChip } from "./ListinoFilterBar";
import type { ListinoPrezzo, TipoImpianto, TipoIntervento } from "../types";

type StatoFilter = "all" | "attivi" | "disattivi";

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

  const [search, setSearch] = useState("");
  const [impiantoId, setImpiantoId] = useState<string>("all");
  const [interventoId, setInterventoId] = useState<string>("all");
  const [stato, setStato] = useState<StatoFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listino.filter((l) => {
      if (stato === "attivi" && !l.attivo) return false;
      if (stato === "disattivi" && l.attivo) return false;
      if (impiantoId !== "all" && l.tipo_impianto_id !== impiantoId) return false;
      if (interventoId !== "all" && l.tipo_intervento_id !== interventoId) return false;
      if (q) {
        const haystack = `${l.tipo_impianto?.nome ?? ""} ${l.tipo_intervento?.nome ?? ""} ${l.unita ?? ""} ${l.note ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [listino, search, impiantoId, interventoId, stato]);

  const hasActiveFilters =
    search.trim() !== "" || impiantoId !== "all" || interventoId !== "all" || stato !== "all";
  const resetFilters = () => { setSearch(""); setImpiantoId("all"); setInterventoId("all"); setStato("all"); };

  const chips: FilterChip[] = [];
  if (search.trim()) chips.push({ key: "search", label: `Cerca: "${search.trim()}"`, onRemove: () => setSearch("") });
  if (impiantoId !== "all") {
    const nome = tipiImpianto.find((t) => t.id === impiantoId)?.nome ?? "—";
    chips.push({ key: "impianto", label: `Impianto: ${nome}`, onRemove: () => setImpiantoId("all") });
  }
  if (interventoId !== "all") {
    const nome = tipiIntervento.find((t) => t.id === interventoId)?.nome ?? "—";
    chips.push({ key: "intervento", label: `Intervento: ${nome}`, onRemove: () => setInterventoId("all") });
  }
  if (stato !== "all") chips.push({ key: "stato", label: stato === "attivi" ? "Stato: attive" : "Stato: disattive", onRemove: () => setStato("all") });

  /** Tutta la riga apre Modifica — tranne i controlli veri (menu, checkbox…). */
  const rowClick = (l: ListinoPrezzo) => (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, [role="checkbox"], [role="switch"], [role="menu"], [role="menuitem"]')) return;
    onEdit(l);
  };

  return (
    <div className="space-y-3">
      {noTipi ? (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={onAdd} disabled>
              <Plus className="h-4 w-4 mr-1" />Nuova tariffa
            </Button>
          </div>
          <div className="rounded-md border p-8 text-center text-muted-foreground">
            Aggiungi prima almeno un tipo impianto e un tipo intervento, oppure clicca &quot;Importa da template&quot;.
          </div>
        </>
      ) : (
        <>
          <ListinoFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per impianto, intervento, unità o note…"
            filters={
              <>
                <Select value={impiantoId} onValueChange={setImpiantoId}>
                  <SelectTrigger className="h-9 w-full md:w-[170px]"><SelectValue placeholder="Impianto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli impianti</SelectItem>
                    {tipiImpianto.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{`${t.icona ?? ""} ${t.nome}`.trim()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={interventoId} onValueChange={setInterventoId}>
                  <SelectTrigger className="h-9 w-full md:w-[170px]"><SelectValue placeholder="Intervento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli interventi</SelectItem>
                    {tipiIntervento.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
                  <SelectTrigger className="h-9 w-full md:w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli stati</SelectItem>
                    <SelectItem value="attivi">Solo attive</SelectItem>
                    <SelectItem value="disattivi">Solo disattive</SelectItem>
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
                <Plus className="h-4 w-4 mr-1" />Nuova tariffa
              </Button>
            }
            chips={chips}
            shownCount={filtered.length}
            totalCount={listino.length}
            unit={["tariffa", "tariffe"]}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
          />
          <div className="rounded-md border overflow-x-auto">
            <Table className="table-fixed min-w-[720px] [&_thead_th]:h-10 [&_thead_th]:px-3 [&_tbody_td]:px-3 [&_tbody_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[168px]">Impianto</TableHead>
                  <TableHead>Intervento</TableHead>
                  <TableHead className="w-[104px] text-right">Prezzo</TableHead>
                  <TableHead className="w-[56px] text-right">IVA</TableHead>
                  <TableHead className="w-[96px]">Unità</TableHead>
                  <TableHead className="w-[96px]">Attivo</TableHead>
                  <TableHead className="w-[48px]"><span className="sr-only">Azioni</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingListino ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : listino.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nessuna tariffa configurata. Aggiungine una o clicca &quot;Importa da template&quot;.
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nessuna tariffa corrisponde ai filtri.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((l) => (
                  <TableRow key={l.id} onClick={rowClick(l)} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <span className="block truncate" title={l.tipo_impianto?.nome ?? undefined}>
                        {l.tipo_impianto
                          ? `${l.tipo_impianto.icona ?? ""} ${l.tipo_impianto.nome}`.trim()
                          : <span className="text-muted-foreground italic">—</span>
                        }
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate" title={l.tipo_intervento?.nome ?? undefined}>
                        {l.tipo_intervento?.nome ?? <span className="text-muted-foreground italic">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                      {l.prezzo_base != null && l.prezzo_base > 0
                        ? formatCurrency(l.prezzo_base)
                        : <Badge className="bg-amber-100 text-amber-700 border-amber-200">€0</Badge>
                      }
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{l.iva_percentuale ?? 22}%</TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="block truncate">{l.unita}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.attivo ? "default" : "secondary"} className="h-5 px-2 text-[11px]">
                        {l.attivo ? "Attiva" : "Disattiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Azioni tariffa">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(l)}>
                            <Pencil className="h-4 w-4 mr-2" />Modifica
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(l.id)}
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
        </>
      )}
    </div>
  );
}
