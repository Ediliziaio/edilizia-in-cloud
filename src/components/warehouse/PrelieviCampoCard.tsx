/**
 * Prelievi da cantiere in attesa di conferma (ufficio).
 * Quando l'azienda è in modalità "a conferma", i prelievi degli operai arrivano
 * qui: l'ufficio li approva (scarica la giacenza) o li rifiuta. In modalità
 * "libero" questa lista resta vuota perché lo scarico è già avvenuto.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, PackageCheck, Check, X, User, Calendar, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Riga { stock_item_id: string; name: string; quantita: number; unita?: string | null }
interface PrelievoRow {
  id: string; data: string; righe: Riga[]; note: string | null;
  order_id: string | null; operaio_id: string | null;
}

export function PrelieviCampoCard() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id ?? null;
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: prelievi = [], isLoading } = useQuery({
    queryKey: ["prelievi-campo-attesa", companyId],
    enabled: !!companyId,
    staleTime: 15_000,
    queryFn: async (): Promise<PrelievoRow[]> => {
      const { data, error } = await supabase
        .from("prelievi_campo")
        .select("id, data, righe, note, order_id, operaio_id")
        .eq("company_id", companyId!)
        .eq("stato", "richiesto")
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PrelievoRow[];
    },
  });

  // Risolvi nomi operai e commesse (la tabella non ha FK per l'embed).
  const operaioIds = useMemo(() => [...new Set(prelievi.map((p) => p.operaio_id).filter(Boolean))] as string[], [prelievi]);
  const orderIds = useMemo(() => [...new Set(prelievi.map((p) => p.order_id).filter(Boolean))] as string[], [prelievi]);

  const { data: operai = {} } = useQuery({
    queryKey: ["prelievi-operai", operaioIds],
    enabled: operaioIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", operaioIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((p) => { m[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Operaio"; });
      return m;
    },
  });
  const { data: commesse = {} } = useQuery({
    queryKey: ["prelievi-commesse", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id, order_code, description").in("id", orderIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((o) => { m[o.id] = o.order_code || (o.description ?? "").slice(0, 30) || "Commessa"; });
      return m;
    },
  });

  const azione = useMutation({
    mutationFn: async ({ id, tipo, motivo }: { id: string; tipo: "approva" | "rifiuta"; motivo?: string }) => {
      const fn = tipo === "approva" ? "prelievo_campo_approva" : "prelievo_campo_rifiuta";
      const args = tipo === "approva" ? { p_prelievo_id: id } : { p_prelievo_id: id, p_motivo: motivo ?? null };
      const { error } = await supabase.rpc(fn as never, args as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["prelievi-campo-attesa"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      toast.success(v.tipo === "approva" ? "Prelievo approvato: giacenza scaricata" : "Prelievo rifiutato");
    },
    onError: (e: unknown) => toast.error("Operazione non riuscita", { description: e instanceof Error ? e.message : "Riprova." }),
    onSettled: () => setBusyId(null),
  });

  // Nessun prelievo in attesa: card silenziosa (non ingombra la pagina).
  if (!isLoading && prelievi.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="h-5 w-5 text-amber-600" />
          Prelievi da cantiere da confermare
          <Badge className="bg-amber-100 text-amber-700">{prelievi.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          prelievi.map((p) => {
            const busy = busyId === p.id && azione.isPending;
            return (
              <div key={p.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{p.operaio_id ? (operai[p.operaio_id] ?? "Operaio") : "—"}</span>
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(p.data), "d MMM HH:mm", { locale: it })}</span>
                  {p.order_id && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{commesse[p.order_id] ?? "Commessa"}</span>}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {(p.righe ?? []).map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">× {r.quantita}</span>
                    </li>
                  ))}
                </ul>
                {p.note && <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-destructive" disabled={busy}
                          onClick={() => { setBusyId(p.id); azione.mutate({ id: p.id, tipo: "rifiuta" }); }}>
                    <X className="h-4 w-4" /> Rifiuta
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5" disabled={busy}
                          onClick={() => { setBusyId(p.id); azione.mutate({ id: p.id, tipo: "approva" }); }}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approva
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
