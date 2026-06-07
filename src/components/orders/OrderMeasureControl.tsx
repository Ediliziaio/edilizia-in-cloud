import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ruler, CheckCircle2, AlertTriangle, Pencil } from "lucide-react";

/**
 * OrderMeasureControl — "Controllo misure" della commessa.
 *
 * Mostra SOLO gli articoli su misura (order_items.measure_status != null):
 * mette a confronto le misure di PREVENTIVO con quelle RILEVATE al sopralluogo,
 * evidenzia lo scostamento (solo avviso) e permette di rilevare/confermare le
 * misure definitive prima di ordinare al fornitore.
 *
 * Reso null se non ci sono articoli su misura → nessun rumore sulle commesse
 * normali. Le colonne usate esistono dopo la migration
 * 20270630000000_order_items_measure_lifecycle.sql.
 */

type MeasureMap = Record<string, number>;
type Variance = Record<string, { prev: number; def: number; delta: number }>;

interface MeasureItem {
  id: string;
  name: string;
  misure_preventivo: MeasureMap | null;
  misure_rilevate: MeasureMap | null;
  measure_status: "da_rilevare" | "rilevato" | "confermato" | null;
  measure_variance: Variance | null;
}

const STATUS: Record<string, { label: string; color: string }> = {
  da_rilevare: { label: "Da rilevare", color: "bg-amber-100 text-amber-700 border-amber-300" },
  rilevato: { label: "Rilevato", color: "bg-blue-100 text-blue-700 border-blue-300" },
  confermato: { label: "Confermato", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
};

function axesOf(item: MeasureItem): string[] {
  return Array.from(
    new Set([
      ...Object.keys(item.misure_preventivo ?? {}),
      ...Object.keys(item.misure_rilevate ?? {}),
    ]),
  );
}

function computeVariance(prev: MeasureMap | null, def: MeasureMap): Variance {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(def)]);
  const out: Variance = {};
  for (const k of keys) {
    const p = Number(prev?.[k] ?? 0);
    const d = Number(def[k] ?? 0);
    out[k] = { prev: p, def: d, delta: Math.round((d - p) * 100) / 100 };
  }
  return out;
}

function cleanDraft(d: Record<string, string>): MeasureMap {
  const out: MeasureMap = {};
  for (const [k, v] of Object.entries(d)) {
    if (v.trim() === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n)) out[k] = n;
  }
  return out;
}

export function OrderMeasureControl({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MeasureItem | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Le colonne spina misure non sono ancora nei tipi generati (migration
  // applicata lato DB dall'utente) → client non tipizzato, come in lib/api/surveys.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: items } = useQuery({
    queryKey: ["order-measure-items", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<MeasureItem[]> => {
      const { data, error } = await sb
        .from("order_items")
        .select("id, name, misure_preventivo, misure_rilevate, measure_status, measure_variance")
        .eq("order_id", orderId)
        .not("measure_status", "is", null)
        .order("position");
      if (error) throw error;
      return (data ?? []) as MeasureItem[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["order-measure-items", orderId] });
  };

  const save = useMutation({
    mutationFn: async (p: { item: MeasureItem; def: MeasureMap; confirm: boolean }) => {
      const variance = computeVariance(p.item.misure_preventivo, p.def);
      const { error } = await sb
        .from("order_items")
        .update({
          misure_rilevate: p.def,
          measure_variance: variance,
          measure_status: p.confirm ? "confermato" : "rilevato",
        })
        .eq("id", p.item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Misure aggiornate");
      setEditing(null);
    },
    onError: (e) => toast.error("Errore salvataggio misure: " + (e as Error).message),
  });

  const confirmOnly = useMutation({
    mutationFn: async (item: MeasureItem) => {
      const { error } = await sb
        .from("order_items")
        .update({ measure_status: "confermato" })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Misure confermate");
    },
    onError: (e) => toast.error("Errore: " + (e as Error).message),
  });

  if (!items || items.length === 0) return null; // nessun articolo su misura → niente rumore

  const openEdit = (item: MeasureItem) => {
    const base = item.misure_rilevate ?? item.misure_preventivo ?? {};
    const asStrings: Record<string, string> = {};
    for (const ax of axesOf(item)) {
      const v = base[ax];
      asStrings[ax] = v != null ? String(v) : "";
    }
    setDraft(asStrings);
    setEditing(item);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="h-4 w-4 text-orange-500" />
          Controllo misure
          <span className="text-xs font-normal text-muted-foreground">
            ({items.length} su misura)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const cfg = STATUS[item.measure_status ?? "da_rilevare"] ?? STATUS.da_rilevare;
          const axes = axesOf(item);
          const hasAlert =
            !!item.misure_rilevate &&
            axes.some((ax) => {
              const p = item.misure_preventivo?.[ax];
              const d = item.misure_rilevate?.[ax];
              return p != null && d != null && Number(p) !== Number(d);
            });
          return (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{item.name}</span>
                <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                  {cfg.label}
                </Badge>
              </div>

              {axes.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left font-normal">Misura</th>
                        <th className="text-right font-normal">Preventivo</th>
                        <th className="text-right font-normal">Rilevata</th>
                        <th className="text-right font-normal">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {axes.map((ax) => {
                        const p = item.misure_preventivo?.[ax];
                        const d = item.misure_rilevate?.[ax];
                        const delta =
                          d != null && p != null
                            ? Math.round((Number(d) - Number(p)) * 100) / 100
                            : null;
                        return (
                          <tr key={ax}>
                            <td className="py-0.5 capitalize">{ax}</td>
                            <td className="text-right tabular-nums">{p ?? "—"}</td>
                            <td className="text-right tabular-nums">{d ?? "—"}</td>
                            <td
                              className={`text-right tabular-nums ${
                                delta != null && delta !== 0 ? "font-medium text-amber-600" : ""
                              }`}
                            >
                              {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {hasAlert && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> Scostamento rispetto al preventivo — verifica prima di ordinare.
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => openEdit(item)}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  {item.misure_rilevate ? "Modifica misure" : "Rileva misure"}
                </Button>
                {item.measure_status === "rilevato" && (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => confirmOnly.mutate(item)}
                    disabled={confirmOnly.isPending}
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Conferma
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Misure definitive — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {editing &&
              axesOf(editing).map((ax) => (
                <div key={ax} className="grid grid-cols-[1fr_auto_7rem] items-center gap-2">
                  <Label className="text-sm capitalize">{ax}</Label>
                  <span className="text-xs text-muted-foreground">
                    prev: {editing.misure_preventivo?.[ax] ?? "—"}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft[ax] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [ax]: e.target.value }))}
                    placeholder="mm"
                  />
                </div>
              ))}
            {editing && axesOf(editing).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Questo articolo non ha assi misura configurati dal preventivo.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                editing && save.mutate({ item: editing, def: cleanDraft(draft), confirm: false })
              }
              disabled={save.isPending}
            >
              Salva come rilevata
            </Button>
            <Button
              onClick={() =>
                editing && save.mutate({ item: editing, def: cleanDraft(draft), confirm: true })
              }
              disabled={save.isPending}
            >
              Salva e conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
