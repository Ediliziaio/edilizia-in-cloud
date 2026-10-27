/**
 * «Riepilogo per ambiente» dello step Economia: quanto costa il bagno, quanto la cucina. Compare solo se almeno una
 * voce ha l'ambiente; le voci senza finiscono in «Senza ambiente». Ristrutturazione ha il suo, già in uso.
 */
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";

interface Riga { ambiente?: string | null; quantita?: number | null; prezzo_unitario?: number | null; sconto_pct?: number | null; opzionale?: boolean }

export function riepilogoPerAmbiente(righe: Riga[]): Array<{ ambiente: string; voci: number; importo: number }> {
  const mappa = new Map<string, { voci: number; centesimi: number }>();
  let almenoUno = false;
  for (const r of righe) {
    if (r.opzionale === true) continue;
    const nome = r.ambiente?.trim() || "Senza ambiente";
    if (r.ambiente?.trim()) almenoUno = true;
    const q = Math.max(0, Number(r.quantita) || 0), p = Math.max(0, Number(r.prezzo_unitario) || 0);
    const sc = Math.min(100, Math.max(0, Number(r.sconto_pct) || 0));
    const cur = mappa.get(nome) ?? { voci: 0, centesimi: 0 };
    cur.voci += 1; cur.centesimi += Math.round(q * p * (1 - sc / 100) * 100);
    mappa.set(nome, cur);
  }
  if (!almenoUno) return [];
  return [...mappa].map(([ambiente, v]) => ({ ambiente, voci: v.voci, importo: v.centesimi / 100 }))
    .sort((a, b) => (a.ambiente === "Senza ambiente" ? 1 : b.ambiente === "Senza ambiente" ? -1 : b.importo - a.importo));
}

export function RiepilogoAmbienti({ righe }: { righe: Riga[] }) {
  const elenco = riepilogoPerAmbiente(righe);
  if (!elenco.length) return null;
  return (
    <Card className="max-sm:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 text-orange-600" aria-hidden /> Riepilogo per ambiente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <tbody>
            {elenco.map((a) => (
              <tr key={a.ambiente} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{a.ambiente}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{a.voci} {a.voci === 1 ? "voce" : "voci"}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(a.importo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default RiepilogoAmbienti;
