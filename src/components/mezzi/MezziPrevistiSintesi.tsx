import { Truck } from "lucide-react";
import { useMezzi } from "@/hooks/useMezzi";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { pianoAttivo, pianoPerFase } from "@/lib/mezzi/pianoCantiere";

const data = (g: string) => g.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

export function MezziPrevistiSintesi({ orderId, faseId, oggi }: { orderId: string; faseId: string; oggi: string }) {
  const { data: mezzi } = useMezzi();
  const { piani } = usePianoMezziCantiere(orderId, true, false);
  const prenotati = (piani.data ?? []).filter((p) => pianoPerFase(p, faseId) && pianoAttivo(p, oggi));
  if (!prenotati.length) return null;
  return <ul className="space-y-1.5">
    {prenotati.slice(0, 3).map((p) => <li key={p.id} className="flex gap-2 text-sm">
      <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium">{mezzi?.find((m) => m.id === p.mezzo_id)?.nome ?? "Mezzo pianificato"}{p.quantita > 1 ? ` × ${p.quantita}` : ""}</p>
        <p className="text-xs text-muted-foreground">Dal {data(p.dal)}{p.al ? ` al ${data(p.al)}` : ""} · {p.fase_ids.length ? "sulla fase" : "sulla commessa"}</p>
      </div>
    </li>)}
    {prenotati.length > 3 && <li className="text-xs text-muted-foreground">Altre {prenotati.length - 3} prenotazioni nella scheda Mezzi</li>}
  </ul>;
}
