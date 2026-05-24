import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Wrench, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";

export interface ComputoTariffaCatalogItem {
  id: string;
  nome: string;
  tipo: string;
  unita: string | null;
  unita_fatturazione: string | null;
  prezzo_vendita: number | null;
  costo_interno: number | null;
  prezzo_costo: number | null;
  vertical_associato: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onSelect: (item: ComputoTariffaCatalogItem) => void;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatUnit(item: ComputoTariffaCatalogItem) {
  return item.unita_fatturazione || item.unita || "pz";
}

function tipoLabel(tipo: string) {
  return tipo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MatchTariffaPickerDialog({
  open,
  onOpenChange,
  initialQuery = "",
  onSelect,
}: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [searchRaw, setSearchRaw] = useState(initialQuery);
  const [searchDebounced, setSearchDebounced] = useState(initialQuery);
  const [tipoFilter, setTipoFilter] = useState<string>("all");

  useEffect(() => {
    if (!open) return;
    setSearchRaw(initialQuery);
    setSearchDebounced(initialQuery);
    setTipoFilter("all");
  }, [open, initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchRaw), 180);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const { data: tariffe = [], isLoading } = useQuery({
    queryKey: ["computo-tariffe-picker", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id,nome,tipo,unita,unita_fatturazione,prezzo_vendita,costo_interno,prezzo_costo,vertical_associato,attiva,attivo")
        .eq("company_id", companyId!)
        .order("tipo", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((item) => item.attiva !== false && item.attivo !== false)
        .map(({ attiva: _attiva, attivo: _attivo, ...item }) => item) as ComputoTariffaCatalogItem[];
    },
  });

  const tipi = useMemo(() => {
    const map = new Map<string, number>();
    for (const tariffa of tariffe) map.set(tariffa.tipo, (map.get(tariffa.tipo) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tariffe]);

  const filtered = useMemo(() => {
    const q = normalize(searchDebounced.trim());
    return tariffe.filter((tariffa) => {
      if (tipoFilter !== "all" && tariffa.tipo !== tipoFilter) return false;
      if (!q) return true;
      return normalize([
        tariffa.nome,
        tariffa.tipo,
        tariffa.unita,
        tariffa.unita_fatturazione,
        tariffa.vertical_associato,
      ].filter(Boolean).join(" ")).includes(q);
    });
  }, [searchDebounced, tariffe, tipoFilter]);

  const handleSelect = (item: ComputoTariffaCatalogItem) => {
    onSelect(item);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="shrink-0 border-b px-6 pb-3 pt-6">
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-500" />
            Abbina tariffa / manodopera
          </SheetTitle>
          <SheetDescription>
            Usa il listino tariffe per posa, manodopera, trasporti, smaltimenti, pratiche e noli.
          </SheetDescription>
        </SheetHeader>

        <div className="shrink-0 space-y-3 border-b bg-muted/30 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Cerca posa, manodopera, trasporto..."
              className="pl-9 pr-9"
              autoFocus
            />
            {searchRaw ? (
              <button
                type="button"
                onClick={() => setSearchRaw("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Cancella ricerca tariffa"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={tipoFilter === "all" ? "default" : "outline"}
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={() => setTipoFilter("all")}
            >
              Tutte {tariffe.length}
            </Button>
            {tipi.map(([tipo, count]) => (
              <Button
                key={tipo}
                type="button"
                size="sm"
                variant={tipoFilter === tipo ? "default" : "outline"}
                className="h-7 rounded-md px-2 text-[11px]"
                onClick={() => setTipoFilter(tipo)}
              >
                {tipoLabel(tipo)} {count}
              </Button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Nessuna tariffa trovata</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aggiungila da Impostazioni → Tariffe, poi torna qui per abbinarla.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((tariffa) => {
                const unit = formatUnit(tariffa);
                const costo = tariffa.costo_interno ?? tariffa.prezzo_costo ?? null;
                return (
                  <button
                    key={tariffa.id}
                    type="button"
                    onClick={() => handleSelect(tariffa)}
                    className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{tariffa.nome}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {tipoLabel(tariffa.tipo)}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Unità: {unit}</span>
                          {tariffa.vertical_associato ? <span>Verticale: {tariffa.vertical_associato}</span> : null}
                          {costo != null ? <span>Costo: {formatCurrency(costo)}</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-orange-600">
                          {formatCurrency(tariffa.prezzo_vendita ?? 0)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">/{unit}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
