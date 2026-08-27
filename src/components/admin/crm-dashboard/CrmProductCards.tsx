/**
 * CrmProductCards — riga "PRODOTTI · PERFORMANCE & LTV" del tab Cluster & LTV.
 *
 * Guidata dal catalogo gestibile `aedix_product_lines`. Finché la migration non
 * è applicata (tabella assente) usa un FALLBACK col seed dei 5 servizi, così le
 * card si vedono comunque. I conteggi/conv per-prodotto restano vuoti finché le
 * opportunità non vengono taggate con product_line_id.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Cloud, Megaphone, Trophy, BarChart3, Handshake, Package } from "lucide-react";

interface ProductLine {
  slug: string;
  nome: string;
  tipo: string | null;
  descrizione: string | null;
  colore: string | null;
  icona: string | null;
  ltv_target: number;
  quota_mensile: number;
  prezzo_indicativo: number;
}

// Fallback = stesso seed della migration, così la riga si vede anche prima
// di applicare la tabella.
const DEFAULTS: ProductLine[] = [
  { slug: "eic_saas", nome: "Edilizia in Cloud", tipo: "SaaS · abbonamento annuale", descrizione: null, colore: "hsl(var(--chart-3))", icona: "Cloud", ltv_target: 2670, quota_mensile: 15, prezzo_indicativo: 1200 },
  { slug: "marketing_edile", nome: "Marketing Edile", tipo: "Agenzia · retainer mensile", descrizione: null, colore: "hsl(var(--chart-2))", icona: "Megaphone", ltv_target: 8400, quota_mensile: 5, prezzo_indicativo: 1500 },
  { slug: "vendita_edile", nome: "Vendita Edile", tipo: "Corso · una tantum + upsell", descrizione: null, colore: "hsl(var(--chart-4))", icona: "Trophy", ltv_target: 1490, quota_mensile: 8, prezzo_indicativo: 990 },
  { slug: "numeri_edilizia", nome: "Numeri in Edilizia", tipo: "Controllo gestione · continuativo", descrizione: null, colore: "hsl(var(--chart-1))", icona: "BarChart3", ltv_target: 5760, quota_mensile: 4, prezzo_indicativo: 800 },
  { slug: "delega_edilizia", nome: "Delega in Edilizia", tipo: "Outsourcing · retainer mensile", descrizione: null, colore: "hsl(var(--chart-5))", icona: "Handshake", ltv_target: 14400, quota_mensile: 2, prezzo_indicativo: 2000 },
];

const ICONS: Record<string, typeof Cloud> = { Cloud, Megaphone, Trophy, BarChart3, Handshake, Package };

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n || 0));

export function CrmProductCards({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "product-lines", companyId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("aedix_product_lines") as any)
        .select("slug,nome,tipo,descrizione,colore,icona,ltv_target,quota_mensile,prezzo_indicativo,attivo,ordine")
        .eq("attivo", true)
        .order("ordine", { ascending: true });
      if (error || !data || data.length === 0) return DEFAULTS; // fallback al seed
      return data as ProductLine[];
    },
  });

  const products = q.data ?? DEFAULTS;

  return (
    <div>
      <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Prodotti · performance &amp; LTV
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {products.map((p) => {
          const Icon = ICONS[p.icona ?? "Package"] ?? Package;
          const color = p.colore ?? "hsl(var(--chart-1))";
          return (
            <Card key={p.slug} className="overflow-hidden border-t-2" style={{ borderTopColor: color }}>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-tight">{p.nome}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{p.tipo}</div>
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">LTV medio</div>
                <div className="text-xl font-bold" style={{ color }}>
                  {eur(p.ltv_target)}
                </div>
                <div className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                  Quota <strong className="font-medium text-foreground">{p.quota_mensile}</strong>/mese · da {eur(p.prezzo_indicativo)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
