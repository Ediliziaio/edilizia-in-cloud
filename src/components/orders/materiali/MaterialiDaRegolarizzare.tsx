/**
 * Materiali usati in cantiere che la commessa non aveva: si raccolgono in una
 * bolla di entrata. Il costo poi arriva dall'ordine o dalla fattura del fornitore.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

interface Riga { rapportino_id: string; chiave: string; data_lavoro: string; nome: string; quantita: number | null; unita: string | null; fornitore: string | null }
const db = supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: Error | null }> };
const id = (r: Riga) => `${r.rapportino_id}/${r.chiave}`;

export function MaterialiDaRegolarizzare({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [numero, setNumero] = useState("");
  const [fornitore, setFornitore] = useState("");
  const chiave = ["materiali-da-regolarizzare", orderId];
  const { data: righe = [] } = useQuery({
    queryKey: chiave,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("materiali_da_regolarizzare", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as Riga[];
    },
  });
  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori-nomi", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && righe.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("company_id", effectiveCompany!.id).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const fai = useMutation({
    mutationFn: async (azione: "bolla" | "ignora") => {
      const selezione = righe.filter((r) => scelti.has(id(r))).map((r) => ({ rapportino_id: r.rapportino_id, chiave: r.chiave }));
      const { error } = await db.rpc("materiali_regolarizza", {
        p_order_id: orderId, p_righe: selezione, p_azione: azione, p_supplier_id: azione === "bolla" && fornitore ? fornitore : null, p_numero: numero || null, p_data: null,
      });
      if (error) throw error;
      return azione;
    },
    onSuccess: (azione) => {
      toast.success(azione === "bolla" ? "Bolla di entrata creata" : "Tolti dall'elenco");
      setScelti(new Set()); setNumero(""); setFornitore("");
      void qc.invalidateQueries({ queryKey: chiave });
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && /ddt/i.test(queryKey[0]) });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });
  if (!Array.isArray(righe) || !righe.length) return null;
  const inverti = (k: string) => setScelti((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <section aria-label="Materiali da regolarizzare" className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-[13px]">
      <h3 className="font-semibold text-slate-900">Materiali da regolarizzare ({righe.length})</h3>
      <p className="text-xs text-muted-foreground">Usati in cantiere ma non previsti in commessa. Scegli quali mettere in una bolla di entrata.</p>
      <ul className="mt-2 divide-y">
        {righe.map((r) => (
          <li key={id(r)} className="flex items-center gap-2 py-1.5">
            <Checkbox checked={scelti.has(id(r))} onCheckedChange={() => inverti(id(r))} aria-label={`Scegli ${r.nome}`} />
            <span className="min-w-0 flex-1 truncate">{r.nome}{r.fornitore ? <span className="text-muted-foreground"> · {r.fornitore}</span> : null}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{format(parseISO(r.data_lavoro), "d MMM", { locale: it })}</span>
            <span className="shrink-0 font-semibold tabular-nums">{r.quantita?.toLocaleString("it-IT") ?? "—"} {r.unita ?? ""}</span>
          </li>
        ))}
      </ul>
      {scelti.size > 0 && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-[1fr_1fr_auto_auto]">
          <select aria-label="Fornitore" className="h-8 rounded-md border bg-background px-2 text-[13px]" value={fornitore} onChange={(e) => setFornitore(e.target.value)}>
            <option value="">Fornitore (se lo sai)</option>
            {fornitori.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Input aria-label="Numero bolla" placeholder="Numero bolla (se c'è)" className="h-8 text-[13px]" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <Button size="sm" disabled={fai.isPending} onClick={() => fai.mutate("bolla")}>Crea bolla di entrata</Button>
          <Button size="sm" variant="outline" disabled={fai.isPending} onClick={() => fai.mutate("ignora")}>Non serve</Button>
        </div>
      )}
    </section>
  );
}
