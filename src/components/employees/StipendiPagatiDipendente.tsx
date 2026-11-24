/**
 * Quanto ha ricevuto un dipendente nell'anno (23/11/2026): la somma delle quote «stipendio»
 * registrate in Prima Nota per lui. Si vede solo se chi guarda può leggere la Prima Nota.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function StipendiPagatiDipendente({ employeeId, anno = new Date().getFullYear() }: { employeeId: string; anno?: number }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["stipendi-pagati-dipendente", employeeId, anno],
    queryFn: async () => {
      const { data, error } = await supabase.from("prima_nota_entries")
        .select("amount, entry_date")
        .eq("employee_id" as never, employeeId as never)
        .eq("category", "stipendi")
        .gte("entry_date", `${anno}-01-01`).lte("entry_date", `${anno}-12-31`)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { amount: number; entry_date: string }[];
    },
  });
  if (!q.data?.length) return null;
  const totale = q.data.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <span className="font-medium">{t("Stipendi pagati nel {anno}: {totale}", { anno: String(anno ?? ""), totale: formatCurrency(totale) })}</span>
      <span className="block text-xs text-muted-foreground">
        {t(q.data.length === 1 ? "{n} pagamento · l'ultimo il {data}" : "{n} pagamenti · l'ultimo il {data}", { n: q.data.length, data: q.data[0].entry_date.split("-").reverse().join("/") })}
      </span>
    </div>
  );
}
