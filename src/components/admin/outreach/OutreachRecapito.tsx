import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface RigaCasella {
  id: string; email: string; status: string; last_sent_at: string | null;
  inviate: number; risposte: number; positive: number; bounce: number;
}
interface RigaGruppo { gruppo: string; inviate: number; risposte: number; bounce: number }
interface Recapito { per_casella: RigaCasella[]; per_gruppo_mx: RigaGruppo[]; calcolato_il: string }

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

/**
 * Recapito a finestra mobile di 7 giorni. Senza pixel («stile umano») la
 * risposta è l'unico segnale vero di inbox; il bounce l'unico segnale vero di
 * lista sporca. Risposte e bounce sono attribuiti alla casella e al server di
 * destinazione dell'ultimo invio, così si vede subito quale casella o quale
 * provider (Google, Microsoft, Aruba…) sta andando male.
 */
export function OutreachRecapito({ companyId }: { companyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["outreach-recapito-7g", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("outreach_recapito_7g" as never, { p_company: companyId } as never);
      if (error) throw error;
      return data as unknown as Recapito;
    },
    staleTime: 5 * 60_000,
  });

  const caselle = (data?.per_casella ?? []).filter((c) => c.inviate > 0 || c.risposte > 0 || c.bounce > 0);
  const gruppi = data?.per_gruppo_mx ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-5 w-5 text-sky-600" /> Recapito, ultimi 7 giorni
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Senza pixel la risposta è l'unico segnale vero di inbox, il bounce l'unico segnale di lista sporca.
          Sopra il 3% di bounce una casella va fermata; sotto l'1% di risposte su 100+ invii si sta parlando allo spam.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && caselle.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessun invio negli ultimi 7 giorni.</p>
        )}
        {caselle.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Casella</TableHead>
                  <TableHead className="text-right">Inviate</TableHead>
                  <TableHead className="text-right">Risposte</TableHead>
                  <TableHead className="text-right">Interessati</TableHead>
                  <TableHead className="text-right">Bounce</TableHead>
                  <TableHead>Ultimo invio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caselle.map((c) => {
                  const tassoBounce = c.inviate > 0 ? c.bounce / c.inviate : 0;
                  const tassoRisposte = c.inviate > 0 ? c.risposte / c.inviate : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.email}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.inviate}</TableCell>
                      <TableCell className={`text-right tabular-nums ${c.inviate >= 100 && tassoRisposte < 0.01 ? "text-amber-600" : c.risposte > 0 ? "text-emerald-600" : ""}`}>
                        {c.risposte} <span className="text-xs text-muted-foreground">({pct(c.risposte, c.inviate)})</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.positive}</TableCell>
                      <TableCell className={`text-right tabular-nums ${tassoBounce > 0.03 ? "font-semibold text-destructive" : ""}`}>
                        {c.bounce} <span className="text-xs text-muted-foreground">({pct(c.bounce, c.inviate)})</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {c.last_sent_at ? formatDistanceToNow(new Date(c.last_sent_at), { addSuffix: true, locale: it }) : "mai"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {gruppi.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Per server di destinazione</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gruppo MX</TableHead>
                    <TableHead className="text-right">Inviate</TableHead>
                    <TableHead className="text-right">Risposte</TableHead>
                    <TableHead className="text-right">Bounce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gruppi.map((g) => (
                    <TableRow key={g.gruppo}>
                      <TableCell className="text-xs">{g.gruppo}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.inviate}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.risposte} <span className="text-xs text-muted-foreground">({pct(g.risposte, g.inviate)})</span></TableCell>
                      <TableCell className={`text-right tabular-nums ${g.inviate > 0 && g.bounce / g.inviate > 0.03 ? "font-semibold text-destructive" : ""}`}>{g.bounce} <span className="text-xs text-muted-foreground">({pct(g.bounce, g.inviate)})</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
