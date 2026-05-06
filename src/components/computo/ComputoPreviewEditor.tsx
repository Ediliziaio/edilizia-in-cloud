/**
 * Tabella editabile per revisione voci estratte da computo metrico.
 * Raggruppa per capitolo, consente edit prezzo/ricarico con ricalcolo live.
 */
import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronRight,
  Percent,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { ComputoVoceLocal } from "@/types/computo";

interface Props {
  voci: ComputoVoceLocal[];
  onChange: (voci: ComputoVoceLocal[]) => void;
}

function ConfidenceBadge({ value }: { value: number }) {
  if (value >= 0.9)
    return <Badge variant="outline" className="text-[9px] py-0 border-green-400 text-green-600">{(value * 100).toFixed(0)}%</Badge>;
  if (value >= 0.7)
    return <Badge variant="outline" className="text-[9px] py-0 border-amber-400 text-amber-600">{(value * 100).toFixed(0)}%</Badge>;
  return <Badge variant="outline" className="text-[9px] py-0 border-red-400 text-red-600">{(value * 100).toFixed(0)}%</Badge>;
}

export function ComputoPreviewEditor({ voci, onChange }: Props) {
  const [collapsedCaps, setCollapsedCaps] = useState<Set<string>>(new Set());
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set());
  const [bulkRicarico, setBulkRicarico] = useState(15);

  // Group by capitolo
  const capitoli = useMemo(() => {
    const map = new Map<string, ComputoVoceLocal[]>();
    for (const v of voci) {
      const key = v.capitolo_nome || "Generale";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return [...map.entries()];
  }, [voci]);

  const updateVoce = useCallback(
    (id: string, updates: Partial<ComputoVoceLocal>) => {
      onChange(
        voci.map((v) => {
          if (v.id !== id) return v;
          const updated = { ...v, ...updates };
          // Recalc importo if price or ricarico changed
          if ("_prezzoImpresa" in updates) {
            updated._importoImpresa = updated.quantita * updated._prezzoImpresa;
            updated._ricarico =
              updated.prezzo_unitario_computo > 0
                ? ((updated._prezzoImpresa - updated.prezzo_unitario_computo) /
                    updated.prezzo_unitario_computo) *
                  100
                : 0;
          }
          if ("_ricarico" in updates) {
            updated._prezzoImpresa =
              updated.prezzo_unitario_computo * (1 + updated._ricarico / 100);
            updated._importoImpresa = updated.quantita * updated._prezzoImpresa;
          }
          if ("quantita" in updates) {
            updated._importoImpresa = updated.quantita * updated._prezzoImpresa;
          }
          return updated;
        })
      );
    },
    [voci, onChange]
  );

  const toggleAll = (checked: boolean) => {
    onChange(voci.map((v) => ({ ...v, _isIncluded: checked })));
  };

  const applyBulkRicaricoToAll = () => {
    onChange(
      voci.map((v) => ({
        ...v,
        _ricarico: bulkRicarico,
        _prezzoImpresa: v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
        _importoImpresa: v.quantita * v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
      }))
    );
  };

  const applyBulkRicaricoToCapitolo = (capNome: string) => {
    onChange(
      voci.map((v) => {
        // Match on capitolo_nome, treating null as "Generale"
        const voceCapNome = v.capitolo_nome || "Generale";
        if (voceCapNome !== capNome) return v;
        return {
          ...v,
          _ricarico: bulkRicarico,
          _prezzoImpresa: v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
          _importoImpresa: v.quantita * v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
        };
      })
    );
  };

  const toggleCapitolo = (capNome: string) => {
    setCollapsedCaps((prev) => {
      const next = new Set(prev);
      if (next.has(capNome)) next.delete(capNome);
      else next.add(capNome);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {/* Bulk actions */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
          Seleziona tutto
        </Button>
        <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
          Deseleziona
        </Button>
        <div className="flex items-center gap-1 ml-auto">
          <Input
            type="number"
            value={bulkRicarico}
            onChange={(e) => setBulkRicarico(Number(e.target.value))}
            className="w-16 h-7 text-xs"
            min={0}
            max={200}
          />
          <span className="text-xs">%</span>
          <Button variant="outline" size="sm" onClick={applyBulkRicaricoToAll}>
            <Percent className="h-3 w-3 mr-1" /> Applica a tutto
          </Button>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[32px_60px_1fr_50px_70px_80px_80px_70px_80px_40px] gap-1 text-[10px] font-medium text-muted-foreground px-1 border-b pb-1">
        <span></span>
        <span>Codice</span>
        <span>Descrizione</span>
        <span>U.M.</span>
        <span className="text-right">Q.tà</span>
        <span className="text-right text-slate-400">Pr. Computo</span>
        <span className="text-right text-orange-500">Pr. Impresa</span>
        <span className="text-right">Ric. %</span>
        <span className="text-right text-orange-500">Importo</span>
        <span className="text-center">AI</span>
      </div>

      {/* Capitoli + voci */}
      {capitoli.map(([capNome, capVoci]) => {
        const collapsed = collapsedCaps.has(capNome);
        const totaleCapitolo = capVoci
          .filter((v) => v._isIncluded)
          .reduce((s, v) => s + v._importoImpresa, 0);

        return (
          <div key={capNome}>
            {/* Capitolo header */}
            <div
              className="flex items-center gap-2 py-1.5 px-1 bg-slate-50 rounded cursor-pointer hover:bg-slate-100 group"
              onClick={() => toggleCapitolo(capNome)}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span className="text-xs font-semibold flex-1">{capNome}</span>
              <span className="text-xs text-muted-foreground">{capVoci.length} voci</span>
              <span className="text-xs font-semibold text-orange-600">
                {formatCurrency(totaleCapitolo)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  applyBulkRicaricoToCapitolo(capNome);
                }}
              >
                <Percent className="h-2.5 w-2.5 mr-0.5" />
                {bulkRicarico}%
              </Button>
            </div>

            {/* Voci */}
            {!collapsed &&
              capVoci.map((v) => (
                <div
                  key={v.id}
                  className={`grid grid-cols-[32px_60px_1fr_50px_70px_80px_80px_70px_80px_40px] gap-1 items-center text-xs px-1 py-1 border-b border-slate-100 ${
                    !v._isIncluded ? "opacity-40" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={v._isIncluded}
                    onCheckedChange={(c) => updateVoce(v.id, { _isIncluded: !!c })}
                    className="h-3.5 w-3.5"
                  />

                  {/* Codice */}
                  <span className="text-[10px] text-muted-foreground truncate" title={v.codice_voce || ""}>
                    {v.codice_voce}
                  </span>

                  {/* Descrizione */}
                  <div
                    className="truncate cursor-pointer hover:text-clip"
                    title={v.descrizione_estesa || v.descrizione_breve}
                    onClick={() =>
                      setExpandedDesc((prev) => {
                        const next = new Set(prev);
                        if (next.has(v.id)) next.delete(v.id);
                        else next.add(v.id);
                        return next;
                      })
                    }
                  >
                    {expandedDesc.has(v.id)
                      ? v.descrizione_estesa || v.descrizione_breve
                      : v.descrizione_breve}
                  </div>

                  {/* U.M. */}
                  <span className="text-[10px] text-muted-foreground">{v.unita_misura}</span>

                  {/* Quantità (editable) */}
                  <Input
                    type="number"
                    value={v.quantita}
                    onChange={(e) =>
                      updateVoce(v.id, { quantita: Number(e.target.value) })
                    }
                    className="h-6 text-[11px] text-right px-1"
                    step="0.01"
                  />

                  {/* Prezzo computo (read-only) */}
                  <span className="text-right text-[10px] text-slate-400">
                    {formatCurrency(v.prezzo_unitario_computo)}
                  </span>

                  {/* Prezzo impresa (editable) */}
                  <Input
                    type="number"
                    value={Math.round(v._prezzoImpresa * 100) / 100}
                    onChange={(e) =>
                      updateVoce(v.id, { _prezzoImpresa: Number(e.target.value) })
                    }
                    className="h-6 text-[11px] text-right px-1 border-orange-200 focus:border-orange-400"
                    step="0.01"
                  />

                  {/* Ricarico % (editable) */}
                  <Input
                    type="number"
                    value={Math.round(v._ricarico * 10) / 10}
                    onChange={(e) =>
                      updateVoce(v.id, { _ricarico: Number(e.target.value) })
                    }
                    className="h-6 text-[10px] text-right px-1"
                    step="0.5"
                  />

                  {/* Importo impresa (calculated) */}
                  <span className="text-right text-[11px] font-medium text-orange-600">
                    {formatCurrency(v._importoImpresa)}
                  </span>

                  {/* Confidence */}
                  <div className="flex justify-center">
                    <ConfidenceBadge value={v.confidence} />
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
