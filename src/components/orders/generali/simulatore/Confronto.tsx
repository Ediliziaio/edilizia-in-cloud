// src/components/orders/generali/simulatore/Confronto.tsx
// 2-3 ipotesi affiancate («vendo 6 appartamenti» contro «vendo 4 + 2 box»): ogni numero,
// la differenza dalla prima colonna e, evidenziata, l'ipotesi migliore riga per riga.
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatta, formattaDifferenza } from "@/components/orders/generali/simulatore/formato";
import { calcolaIpotesi, confrontaIpotesi, type Ipotesi } from "@/lib/orders/generali/simulatore";
import { cn } from "@/lib/utils";

export interface IpotesiDaConfrontare {
  id: string;
  nome: string;
  ipotesi: Ipotesi;
}

const NESSUNA = "__nessuna";

export function Confronto({ disponibili, scelte, onScelte }: {
  disponibili: IpotesiDaConfrontare[];
  /** Gli id nelle colonne, in ordine; la prima è il riferimento delle differenze. */
  scelte: string[];
  onScelte: (ids: string[]) => void;
}) {
  const colonne = useMemo(
    () => scelte.map((id) => disponibili.find((d) => d.id === id)).filter((d): d is IpotesiDaConfrontare => !!d),
    [disponibili, scelte],
  );
  const righe = useMemo(() => confrontaIpotesi(colonne.map((c) => calcolaIpotesi(c.ipotesi).numeri)), [colonne]);
  const scegli = (i: number, id: string) => {
    const nuove = [...scelte];
    if (id === NESSUNA) nuove.splice(i, 1);
    else nuove[i] = id;
    onScelte(nuove.filter((x, k) => nuove.indexOf(x) === k).slice(0, 3));
  };

  if (disponibili.length < 2) {
    return <p className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">Salva almeno due ipotesi (o salvane una e cambia quella aperta) per metterle a confronto.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1">
            <Label htmlFor={`confronto-${i}`} className="text-sm font-normal text-muted-foreground">{i === 0 ? "Riferimento" : `Ipotesi ${i + 1}`}</Label>
            <Select value={scelte[i] ?? NESSUNA} onValueChange={(v) => scegli(i, v)} disabled={i > scelte.length}>
              <SelectTrigger id={`confronto-${i}`} className="h-9 text-sm"><SelectValue placeholder="Scegli un'ipotesi" /></SelectTrigger>
              <SelectContent>
                {i > 0 && <SelectItem value={NESSUNA}>Nessuna</SelectItem>}
                {disponibili.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {colonne.length >= 2 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-3 py-2 font-normal text-xs text-muted-foreground">Numero</th>
                {colonne.map((c, i) => <th key={c.id} className="px-3 py-2 text-right font-semibold">{c.nome}{i === 0 && <span className="block text-xs font-normal text-muted-foreground">riferimento</span>}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {righe.map((r) => (
                <tr key={r.metrica.chiave} className={cn("border-b last:border-0", r.diversa && "bg-muted/30")}>
                  <td className="px-3 py-1.5">{r.metrica.nome}</td>
                  {r.valori.map((v, i) => (
                    <td key={colonne[i].id} className={cn("px-3 py-1.5 text-right", r.migliore === i && "font-semibold text-emerald-700 dark:text-emerald-400")}>
                      {formatta(v, r.metrica.formato)}
                      {i > 0 && r.diversa && r.differenze[i] !== null && Math.abs(r.differenze[i]!) > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">{formattaDifferenza(r.differenze[i], r.metrica.formato)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">Le righe evidenziate cambiano tra le ipotesi; in verde la migliore. Sotto ogni numero, la differenza dal riferimento.</p>
        </div>
      )}
    </div>
  );
}
