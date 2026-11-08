/**
 * Cosa è arrivato giusto e cosa manca, sulla commessa. Si programma la posa di ciò che è verde.
 * Non si vede se la commessa non ha articoli su misura.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useArrivoCommessa } from "@/hooks/useArrivoPosizioni";
import { fraseCosaManca, type RigaCommessaArrivo } from "@/lib/arrivi/arrivoPosizioni";
import { cn } from "@/lib/utils";

const STATI: Record<RigaCommessaArrivo["stato"], { testo: string; classe: string }> = {
  arrivata: { testo: "Si può posare", classe: "bg-green-100 text-green-800" },
  da_sostituire: { testo: "Da sostituire", classe: "bg-red-100 text-red-800" },
  parziale: { testo: "Arrivata in parte", classe: "bg-amber-100 text-amber-800" },
  non_arrivata: { testo: "Non arrivata", classe: "bg-amber-100 text-amber-800" },
  non_ordinata: { testo: "Non ordinata", classe: "bg-muted text-muted-foreground" },
};

export function ArrivoCommessaCard({ orderId }: { orderId: string }) {
  const { data } = useArrivoCommessa(orderId);
  const [aperta, setAperta] = useState(false);
  if (!data || data.posizioni === 0) return null;

  const manca = fraseCosaManca(data);
  const ordini = Array.from(new Map(data.righe.flatMap(r => r.ordini).map(o => [o.id, o])).values());

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <button type="button" className="flex min-h-11 w-full items-center gap-2 text-left" aria-expanded={aperta} onClick={() => setAperta(v => !v)}>
          <PackageCheck className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{data.arrivate === 1 ? "Si può posare 1 posizione" : `Si possono posare ${data.arrivate} posizioni`} su {data.posizioni}</span>
            <span className={cn("block text-sm", manca ? "text-red-700" : "text-green-700")}>{manca ?? "È arrivato tutto giusto"}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aperta && "rotate-180")} aria-hidden="true" />
        </button>
        {aperta && (
          <>
            <ul className="divide-y">
              {data.righe.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0">{[r.riferimento, r.nome].filter(Boolean).join(" — ")}{Number(r.quantita) > 1 ? ` · ${Number(r.buoni)}/${Number(r.quantita)}` : ""}{Number(r.in_riordino) > 0 ? " · in riordino" : ""}</span>
                  <Badge variant="secondary" className={cn("shrink-0", STATI[r.stato].classe)}>{STATI[r.stato].testo}</Badge>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ordini.map(o => <Link key={o.id} to={`/azienda/ordini-acquisto/${o.id}/arrivo`} className="flex min-h-11 items-center text-sm font-medium text-primary underline">Spunta {o.numero}</Link>)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
