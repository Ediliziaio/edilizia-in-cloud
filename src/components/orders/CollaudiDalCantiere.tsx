/**
 * Cantiere → Consegna e assistenza: i collaudi firmati dal cliente in cantiere, dal telefono.
 * Sono rapporti del cantiere con la firma del cliente (campo_rapportini con lavoro_completato o
 * firma): prima comparivano solo nel Diario, mentre qui l'ufficio cerca la consegna.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ClipboardSignature, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { openRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Collaudo {
  id: string;
  data_lavoro: string;
  stato: string | null;
  firma_cliente_nome: string | null;
  descrizione_lavori: string | null;
  pdf_url: string | null;
  autore: { first_name: string | null; last_name: string | null } | null;
}

const STATO: Record<string, string> = { inviato: "Da approvare", approvato: "Approvato", rifiutato: "Rimandato indietro", bozza: "Bozza" };

export function CollaudiDalCantiere({ orderId, companyId }: { orderId: string; companyId: string }) {
  const qc = useQueryClient();
  const { data = [], isError } = useQuery({
    queryKey: ["campo-rapportini-ordine", orderId, "collaudi-ufficio"],
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<Collaudo[]> => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("id, data_lavoro, stato, firma_cliente_nome, descrizione_lavori, pdf_url, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .or("lavoro_completato.eq.true,firma_cliente_url.not.is.null")
        .order("data_lavoro", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Collaudo[];
    },
  });
  if (isError || data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardSignature className="h-5 w-5 text-primary" aria-hidden="true" />Collaudi firmati in cantiere
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {format(parseISO(c.data_lavoro), "d MMMM yyyy", { locale: it })} · firmato da {c.firma_cliente_nome?.trim() || "cliente"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[c.autore?.first_name, c.autore?.last_name].filter(Boolean).join(" ") || "Cantiere"} · {STATO[c.stato ?? ""] ?? "Inviato"}
                </p>
                {c.descrizione_lavori && <p className="mt-1 line-clamp-2 text-sm">{c.descrizione_lavori}</p>}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void openRapportinoPdf(c, orderId, qc)}>
                <Download className="h-4 w-4" aria-hidden="true" />{c.pdf_url ? "Apri PDF" : "Genera PDF"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
