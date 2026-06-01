/**
 * ListinoManutenzione — Tab "Tariffe"
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Upgrade UX: ricerca (impianto/intervento/unità/note) + filtri impianto,
 * intervento e stato + chip rimovibili + conteggio + colonna Attivo, come la
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
                  <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Impianto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli impianti</SelectItem>
                    {tipiImpianto.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{`${t.icona ?? ""} ${t.nome}`.trim()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={interventoId} onValueChange={setInterventoId}>
                  <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Intervento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli interventi</SelectItem>
                    {tipiIntervento.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
                  <SelectTrigger className="w-full md:w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli stati</SelectItem>
                    <SelectItem value="attivi">Solo attive</SelectItem>
                    <SelectItem value="disattivi">Solo disattive</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <Button size="sm" onClick={onAdd}>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Impianto</TableHead>
                  <TableHead>Intervento</TableHead>
                  <TableHead className="w-28">Prezzo</TableHead>
                  <TableHead className="w-16">IVA</TableHead>
                  <TableHead className="w-28">Unità</TableHead>
                  <TableHead className="w-20">Attivo</TableHead>
                  <TableHead className="text-right w-24">Azioni</TableHead>
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
                    <TableCell>
                      <Badge variant={l.attivo ? "default" : "secondary"}>
                        {l.attivo ? "Attiva" : "Disattiva"}
                      </Badge>
                    </TableCell>
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
        </>
      )}
    </div>
  );
}
