/**
 * «Da assegnare a una commessa» (01/11/2026, lotto 6 di docs/piano-costi-commessa.md, G1).
 *
 * Le fatture già registrate come costo ma senza commessa: il margine dei cantieri non le vede. Il
 * 01/11/2026 erano 931 su 1.298, e 93 avevano già la commessa proposta dall'AI (ai-fattura-classify)
 * che nessuno aveva confermato. Qui la proposta si conferma in un clic; le fatture dei fornitori di
 * spese generali (tipo «generali», «banche ed enti») non si chiedono.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { INFO_TIPO_FORNITORE, isTipoFornitore } from "@/lib/fornitori/tipiFornitore";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";

interface Riga {
  id: string;
  numero_fattura: string | null;
  data_fattura: string | null;
  cedente_ragione_sociale: string | null;
  totale_documento: number | null;
  order_match_confidenza: number | null;
  costo: { id: string; order_id: string | null; supplier: { tipo: string | null } | null } | null;
  suggerito: { id: string; order_code: string | null; client_name: string | null; deleted_at: string | null } | null;
}

/** Il fornitore è di quelli il cui costo non va mai su una commessa? */
export function eSpesaGenerale(tipo: string | null | undefined): boolean {
  return isTipoFornitore(tipo) && INFO_TIPO_FORNITORE[tipo].commessa === "no";
}

export function FattureDaAssegnare({ companyId, puoModificare }: { companyId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const [tutte, setTutte] = useState(false);
  const q = useQuery({
    queryKey: ["fatture-da-assegnare", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatture_ricevute")
        .select(
          "id,numero_fattura,data_fattura,cedente_ragione_sociale,totale_documento,order_match_confidenza,costo:company_costs!inner(id,order_id,supplier:suppliers(tipo)),suggerito:orders!fatture_ricevute_order_id_suggerito_fkey(id,order_code,client_name,deleted_at)",
        )
        .eq("company_id", companyId)
        .eq("stato", "contabilizzata")
        .is("costo.order_id", null)
        .order("data_fattura", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as Riga[]).filter((r) => !eSpesaGenerale(r.costo?.supplier?.tipo));
    },
  });

  const assegna = useMutation({
    mutationFn: async ({ costoId, orderId }: { costoId: string; orderId: string }) => {
      const { data, error } = await supabase
        .from("company_costs")
        .update({ order_id: orderId })
        .eq("id", costoId)
        .is("order_id", null)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Il costo ha già una commessa o non hai il permesso di modificarlo.");
    },
    onSuccess: () => {
      toast.success("Fattura assegnata alla commessa");
      qc.invalidateQueries({ queryKey: ["fatture-da-assegnare", companyId] });
      qc.invalidateQueries({ queryKey: queryKeys.costs.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const righe = q.data ?? [];
  const conProposta = useMemo(() => righe.filter((r) => r.suggerito && !r.suggerito.deleted_at), [righe]);
  if (!righe.length) return null;
  const totale = righe.reduce((t, r) => t + (Number(r.totale_documento) || 0), 0);
  const visibili = tutte ? conProposta : conProposta.slice(0, 5);

  return (
    <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20" aria-label="Fatture da assegnare a una commessa">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {righe.length} {righe.length === 1 ? "fattura registrata" : "fatture registrate"} senza commessa · {formatCurrency(totale)}
        </h2>
        <p className="text-xs text-muted-foreground">Il margine dei cantieri non le conta finché non hanno la commessa.</p>
      </div>
      {conProposta.length > 0 ? (
        <>
          <ul className="divide-y rounded-lg border bg-background text-sm">
            {visibili.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{r.cedente_ragione_sociale ?? "Fornitore"}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {r.numero_fattura ?? ""} {r.data_fattura ? `· ${formatDateIt(r.data_fattura)}` : ""}
                  </span>
                </span>
                <span className="tabular-nums">{formatCurrency(Number(r.totale_documento) || 0)}</span>
                {puoModificare && r.costo && r.suggerito && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={assegna.isPending}
                    onClick={() => assegna.mutate({ costoId: r.costo!.id, orderId: r.suggerito!.id })}
                  >
                    Assegna a {r.suggerito.order_code ?? "commessa"}
                    {r.suggerito.client_name ? ` · ${r.suggerito.client_name}` : ""}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {conProposta.length > 5 && (
            <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setTutte((v) => !v)}>
              {tutte ? "Mostra meno" : `Mostra tutte le ${conProposta.length} con la commessa proposta`}
            </Button>
          )}
        </>
      ) : null}
      {righe.length > conProposta.length && (
        <p className="text-xs text-muted-foreground">
          {righe.length - conProposta.length} senza proposta: apri la fattura e scegli la commessa, oppure segna il fornitore
          come «Spese generali» nei tipi dei fornitori.
        </p>
      )}
    </section>
  );
}
