/**
 * Le varianti in attesa della firma del committente, dentro il portale.
 *
 * Il flusso di firma esiste già ed è pubblico, a token: l'impresa manda un link
 * `/firma-odv/<token>` e il cliente firma. Ma se quel messaggio si perde, il
 * cliente non ha nessun posto dove trovare la variante che deve approvare — e
 * il cantiere si ferma aspettando una firma che nessuno sa dove sia.
 *
 * Qui le varianti del proprio cantiere compaiono nel portale, con quanto
 * costano e quanti giorni aggiungono, e il pulsante che porta alla stessa
 * pagina di firma. Non si firma da qui: la firma resta dove sta il suo audit.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSignature, CheckCircle2, Clock, CalendarPlus, Euro } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface Variante {
  id: string;
  numero_odv: number;
  titolo: string;
  descrizione: string | null;
  impatto_economico: number;
  impatto_giorni: number | null;
  status: string;
  firma_token: string | null;
  firmato_il: string | null;
  firmato_da: string | null;
}

/** Stati in cui la variante aspetta il cliente. */
const IN_ATTESA = new Set(["inviata", "in_attesa_firma", "da_firmare"]);

export function VariantiDaApprovare({ orderId }: { orderId: string }) {
  const { data: varianti = [], isLoading } = useQuery<Variante[]>({
    queryKey: ["cliente-varianti", orderId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordini_variazione")
        .select("id, numero_odv, titolo, descrizione, impatto_economico, impatto_giorni, status, firma_token, firmato_il, firmato_da")
        .eq("order_id", orderId)
        .order("numero_odv", { ascending: false })
        .limit(30);
      if (error) throw error;
      // Le bozze non riguardano il cliente: sono lavoro interno dell'impresa.
      return ((data ?? []) as Variante[]).filter((v) => v.status !== "bozza");
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSignature className="h-5 w-5" /> Varianti
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  if (varianti.length === 0) return null;

  const daFirmare = varianti.filter((v) => IN_ATTESA.has(v.status) && !v.firmato_il);

  return (
    <Card className={daFirmare.length > 0 ? "border-amber-300" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSignature className="h-5 w-5" /> Varianti
          {daFirmare.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {daFirmare.length} da approvare
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {daFirmare.length > 0 && (
          <p className="text-sm text-amber-800">
            Finché non approvi, questi lavori non partono.
          </p>
        )}

        {varianti.map((v) => {
          const attesa = IN_ATTESA.has(v.status) && !v.firmato_il;
          return (
            <div key={v.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Variante n. {v.numero_odv} — {v.titolo}
                  </p>
                  {v.descrizione && (
                    <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{v.descrizione}</p>
                  )}
                </div>
                {v.firmato_il ? (
                  <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                    <CheckCircle2 className="h-3 w-3" />
                    Approvata il {format(parseISO(v.firmato_il), "d MMM yyyy", { locale: it })}
                  </Badge>
                ) : attesa ? (
                  <Badge variant="destructive" className="shrink-0 gap-1 text-[10px]">
                    <Clock className="h-3 w-3" /> In attesa della tua firma
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-[10px]">{v.status}</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Euro className="h-3.5 w-3.5" />
                  {v.impatto_economico >= 0 ? "+" : ""}{formatCurrency(v.impatto_economico)}
                </span>
                {v.impatto_giorni != null && v.impatto_giorni !== 0 && (
                  <span className="flex items-center gap-1">
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {v.impatto_giorni > 0 ? "+" : ""}{v.impatto_giorni} giorni sui tempi
                  </span>
                )}
              </div>

              {attesa && v.firma_token && (
                <Button asChild size="sm" className="w-full sm:w-auto">
                  <Link to={`/firma-odv/${v.firma_token}`}>
                    <FileSignature className="mr-1.5 h-4 w-4" />
                    Leggi e firma
                  </Link>
                </Button>
              )}
              {attesa && !v.firma_token && (
                <p className="text-xs text-muted-foreground">
                  Il link per firmare non è ancora stato generato: chiedilo all'impresa.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
