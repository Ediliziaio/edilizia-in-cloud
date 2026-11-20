import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Metriche {
  totalCalls: number; totalErrors: number; totalPaymentBlocks: number; avgLatency: number;
  byFunction: Array<{ name: string; calls: number; errors: number; avgLatency: number }>;
}
const db = supabase as unknown as {
  rpc: (name: string) => Promise<{ data: Metriche | null; error: unknown }>;
};

/** I totali sono aggregati sul server, prima di limitare la tabella delle funzioni. */
export function MetricheFunzioni() {
  const q = useQuery({
    queryKey: ["admin-edge-perf"], staleTime: 60_000, refetchInterval: 60_000, retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_metriche_funzioni_24h");
      if (error) throw error;
      if (!data || !Number.isFinite(data.totalCalls) || !Number.isFinite(data.totalErrors)
        || !Number.isFinite(data.totalPaymentBlocks) || !Number.isFinite(data.avgLatency)
        || !Array.isArray(data.byFunction)) throw new Error("Metriche non disponibili");
      return data;
    },
  });
  if (q.isError) return <div role="alert" className="rounded-lg border border-destructive/30 p-4 space-y-2">
    <p>Non riesco a caricare le metriche. I valori non sono disponibili.</p>
    <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}>Riprova metriche</Button>
  </div>;
  if (!q.data) return <p role="status" className="p-4 text-sm text-muted-foreground">Carico le metriche delle ultime 24 ore…</p>;
  const m = q.data;
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Chiamate (24h)</p><p className="text-xl font-bold">{m.totalCalls.toLocaleString("it-IT")}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Risposte non riuscite</p><p className="text-xl font-bold">{m.totalErrors.toLocaleString("it-IT")}</p>
        <p className="text-xs text-muted-foreground">Di cui {m.totalPaymentBlocks.toLocaleString("it-IT")} blocchi per pagamento o credito.</p>
      </CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Latenza media</p><p className="text-xl font-bold">{m.avgLatency.toLocaleString("it-IT")} ms</p></CardContent></Card>
    </div>
    <p className="text-xs text-muted-foreground">Totali di tutte le chiamate misurate nelle ultime 24 ore. I blocchi per pagamento o credito richiedono uno sblocco dell'azienda.</p>
    <Card><CardHeader><CardTitle className="text-sm">Funzioni con latenza maggiore</CardTitle></CardHeader><CardContent className="p-0">
      <Table><TableHeader><TableRow><TableHead>Funzione</TableHead><TableHead className="text-right">Chiamate</TableHead><TableHead className="text-right">Risposte non riuscite</TableHead><TableHead className="text-right">Latenza media</TableHead></TableRow></TableHeader>
        <TableBody>{m.byFunction.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nessun dato nelle ultime 24 ore</TableCell></TableRow> : m.byFunction.map(f =>
          <TableRow key={f.name}><TableCell className="font-mono text-xs">{f.name}</TableCell><TableCell className="text-right">{f.calls.toLocaleString("it-IT")}</TableCell><TableCell className="text-right">{f.errors.toLocaleString("it-IT")}</TableCell><TableCell className="text-right"><Badge variant={f.avgLatency > 2000 ? "destructive" : "outline"}>{f.avgLatency.toLocaleString("it-IT")} ms</Badge></TableCell></TableRow>
        )}</TableBody>
      </Table>
    </CardContent></Card>
  </div>;
}
