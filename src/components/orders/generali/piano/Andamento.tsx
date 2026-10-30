// src/components/orders/generali/piano/Andamento.tsx
// Le fotografie di fine mese (job generale-piano-fotografie): come cambia nel tempo la stima
// finale del margine rispetto al previsto, e il capitale investito.
import { Camera, Loader2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { euro, euroSegno, nomeMese, tonoScostamento } from "@/components/orders/generali/piano/formato";
import { messaggioPiano, useFotografaOra, useFotografieGenerale } from "@/hooks/useGeneralePiano";
import { cn } from "@/lib/utils";

export function Andamento({ generaleId, puoModificare }: { generaleId: string; puoModificare: boolean }) {
  const { data, isLoading, isError, refetch } = useFotografieGenerale(generaleId);
  const scatta = useFotografaOra(generaleId);
  const foto = data ?? [];

  const azione = puoModificare && (
    <Button
      variant="outline" size="sm" disabled={scatta.isPending}
      onClick={() => scatta.mutate(undefined, {
        onSuccess: () => toast.success("Fotografia di questo mese aggiornata"),
        onError: (e) => toast.error(messaggioPiano(e, "la fotografia")),
      })}
    >
      {scatta.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1.5 h-3.5 w-3.5" />}
      Fotografa adesso
    </Button>
  );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        Non riesco a leggere le fotografie del piano.
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }
  if (foto.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          L'ultimo giorno di ogni mese il piano fa una fotografia dei suoi numeri: da qui vedrai come cambia la stima finale nel tempo.
        </p>
        {azione}
      </div>
    );
  }

  const dati = foto.map((f) => ({
    etichetta: nomeMese(f.mese),
    previsto: f.ricaviPrevisti - f.costiPrevisti,
    stima: f.ricaviStima - f.costiStima,
  }));

  return (
    <section aria-labelledby="andamento-titolo" className="space-y-3">
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="andamento-titolo" className="text-sm font-semibold">Margine: previsto e stima finale, mese per mese</h3>
            <p className="text-xs text-muted-foreground">Una fotografia l'ultimo giorno di ogni mese.</p>
          </div>
          {azione}
        </div>
        {dati.length > 1 && (
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dati} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="etichetta" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" width={56} tickFormatter={(v) => `${Math.round(Number(v) / 1000).toLocaleString("it-IT")}k`} />
                <RechartsTooltip formatter={(v, n) => [euro(Number(v)), n === "stima" ? "Stima finale" : "Previsto"]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Line dataKey="previsto" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                <Line dataKey="stima" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Mese</th>
              <th className="px-2 py-2 text-right font-medium">Margine previsto</th>
              <th className="px-2 py-2 text-right font-medium">Margine stimato</th>
              <th className="px-2 py-2 text-right font-medium">Scostamento</th>
              <th className="px-2 py-2 text-right font-medium">Costi a oggi</th>
              <th className="px-4 py-2 text-right font-medium">Capitale investito</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...foto].reverse().map((f) => {
              const previsto = f.ricaviPrevisti - f.costiPrevisti;
              const stima = f.ricaviStima - f.costiStima;
              return (
                <tr key={f.mese}>
                  <td className="px-4 py-1.5">
                    {nomeMese(f.mese)}
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {f.versioneNumero ? `v${f.versioneNumero}${f.versioneStato === "bozza" ? " bozza" : ""}` : ""}
                      {f.origine === "manuale" ? " · a mano" : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euro(previsto)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{euro(stima)}</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", tonoScostamento(stima - previsto, "margine"))}>{euroSegno(stima - previsto)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euro(f.costiReali)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{euro(f.capitaleInvestito)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
