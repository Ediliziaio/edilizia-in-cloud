/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.5
 *
 * Editor matrice L × H per famiglie in modalità prezzo 'griglia'.
 * Ogni cella = { prezzo_vendita, prezzo_acquisto }.
 * Salvataggio: delete-tutte-le-righe-della-famiglia + insert nuove righe.
 * Atomicità approssimata client-side; eventuale fallimento mid-way è
 * recuperabile rilanciando il salvataggio (cells ricostruite dal form).
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Cell {
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface GridRow {
  id: string;
  family_id: string | null;
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface Props {
  familyId: string;
  asseXLabel: string;
  asseYLabel: string;
}

export function FamilyGridEditor({ familyId, asseXLabel, asseYLabel }: Props) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: queryKeys.articleFamilies.grid(familyId),
    enabled: !!companyId && !!familyId,
    queryFn: async (): Promise<GridRow[]> => {
      const { data, error } = await supabase
        .from("listino_griglia")
        .select("id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
        .eq("family_id", familyId)
        .eq("company_id", companyId!)
        .order("valore_x", { ascending: true })
        .order("valore_y", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as GridRow[]);
    },
    staleTime: 60 * 1000,
  });

  // Stato locale: assi + matrice
  const [xAxis, setXAxis] = useState<number[]>([]);
  const [yAxis, setYAxis] = useState<number[]>([]);
  // cells indicizzata da `${x}_${y}`
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");

  // Bootstrap dallo stato server
  useEffect(() => {
    const xs = Array.from(new Set(rows.map((r) => r.valore_x))).sort((a, b) => a - b);
    const ys = Array.from(new Set(rows.map((r) => r.valore_y))).sort((a, b) => a - b);
    const cellMap = new Map<string, Cell>();
    for (const r of rows) {
      cellMap.set(`${r.valore_x}_${r.valore_y}`, {
        prezzo_vendita: Number(r.prezzo_vendita),
        prezzo_acquisto: Number(r.prezzo_acquisto),
      });
    }
    setXAxis(xs);
    setYAxis(ys);
    setCells(cellMap);
  }, [rows]);

  const addX = () => {
    const v = parseInt(newX, 10);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Valore X non valido");
      return;
    }
    if (xAxis.includes(v)) {
      toast.error("Valore già presente");
      return;
    }
    setXAxis([...xAxis, v].sort((a, b) => a - b));
    setNewX("");
  };

  const addY = () => {
    const v = parseInt(newY, 10);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Valore Y non valido");
      return;
    }
    if (yAxis.includes(v)) {
      toast.error("Valore già presente");
      return;
    }
    setYAxis([...yAxis, v].sort((a, b) => a - b));
    setNewY("");
  };

  const removeX = (v: number) => {
    setXAxis(xAxis.filter((x) => x !== v));
    setCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.startsWith(`${v}_`)) next.delete(k);
      }
      return next;
    });
  };

  const removeY = (v: number) => {
    setYAxis(yAxis.filter((y) => y !== v));
    setCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.endsWith(`_${v}`)) next.delete(k);
      }
      return next;
    });
  };

  const setCell = (x: number, y: number, field: keyof Cell, value: number) => {
    setCells((prev) => {
      const next = new Map(prev);
      const curr = next.get(`${x}_${y}`) ?? { prezzo_vendita: 0, prezzo_acquisto: 0 };
      next.set(`${x}_${y}`, { ...curr, [field]: value });
      return next;
    });
  };

  // Salvataggio: delete tutte + insert le nuove
  const saveGrid = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non identificata");

      // Costruisci payload
      const newRows: Array<{
        company_id: string;
        family_id: string;
        valore_x: number;
        valore_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number;
      }> = [];
      for (const x of xAxis) {
        for (const y of yAxis) {
          const c = cells.get(`${x}_${y}`);
          if (!c) continue; // celle vuote = non inserite
          newRows.push({
            company_id: companyId,
            family_id: familyId,
            valore_x: x,
            valore_y: y,
            prezzo_vendita: c.prezzo_vendita,
            prezzo_acquisto: c.prezzo_acquisto,
          });
        }
      }

      // Step 1: delete esistenti per famiglia
      const { error: delErr } = await supabase
        .from("listino_griglia")
        .delete()
        .eq("family_id", familyId)
        .eq("company_id", companyId);
      if (delErr) throw new Error(`Errore pulizia griglia: ${delErr.message}`);

      // Step 2: insert nuove (se ce ne sono)
      if (newRows.length > 0) {
        const { error: insErr } = await supabase
          .from("listino_griglia")
          .insert(newRows);
        if (insErr) throw new Error(`Errore salvataggio celle: ${insErr.message}`);
      }

      return newRows.length;
    },
    onSuccess: (count) => {
      toast.success(`Griglia salvata: ${count} celle`);
      qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.grid(familyId) });
    },
    onError: (err: Error) => {
      captureVelocityError("family.grid.save", err, { companyId, familyId });
      toast.error("Errore salvataggio griglia", { description: err.message });
    },
  });

  const totalCells = useMemo(() => xAxis.length * yAxis.length, [xAxis, yAxis]);
  const filledCells = cells.size;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento griglia…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Matrice prezzi {asseXLabel} × {asseYLabel}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Definisci le taglie standard. Ogni cella contiene prezzo vendita (€) e acquisto (€). Celle vuote = taglia non disponibile.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Asse X */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{asseXLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            {xAxis.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeX(v)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Rimuovi ${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newX}
                onChange={(e) => setNewX(e.target.value)}
                placeholder="Aggiungi valore"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addX();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addX}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Asse Y */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{asseYLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            {yAxis.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeY(v)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Rimuovi ${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newY}
                onChange={(e) => setNewY(e.target.value)}
                placeholder="Aggiungi valore"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addY();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addY}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Matrice */}
        {xAxis.length > 0 && yAxis.length > 0 ? (
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left border-r sticky left-0 bg-muted/50 z-10">
                    {asseYLabel} \ {asseXLabel}
                  </th>
                  {xAxis.map((x) => (
                    <th key={x} className="p-2 text-center border-r min-w-[180px]">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yAxis.map((y) => (
                  <tr key={y} className="border-t">
                    <td className="p-2 font-medium border-r sticky left-0 bg-background z-10">
                      {y}
                    </td>
                    {xAxis.map((x) => {
                      const c = cells.get(`${x}_${y}`);
                      return (
                        <td key={x} className="p-1 border-r">
                          <div className="flex flex-col gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Vend. €"
                              value={c?.prezzo_vendita ?? ""}
                              onChange={(e) =>
                                setCell(
                                  x,
                                  y,
                                  "prezzo_vendita",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 text-xs"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Acq. €"
                              value={c?.prezzo_acquisto ?? ""}
                              onChange={(e) =>
                                setCell(
                                  x,
                                  y,
                                  "prezzo_acquisto",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 text-xs text-muted-foreground"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCells((prev) => {
                                  const next = new Map(prev);
                                  next.delete(`${x}_${y}`);
                                  return next;
                                })
                              }
                              className="text-xs text-muted-foreground hover:text-destructive"
                              disabled={!c}
                              aria-label={`Svuota cella ${x}×${y}`}
                            >
                              <Trash2 className="h-3 w-3 inline" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
            Aggiungi valori ai due assi per iniziare a compilare la matrice.
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {filledCells} / {totalCells} celle compilate
          </span>
          <Button
            type="button"
            onClick={() => saveGrid.mutate()}
            disabled={saveGrid.isPending}
          >
            {saveGrid.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                Salva griglia
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
