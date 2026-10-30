// src/components/orders/generali/unita/TabelloneUnita.tsx
// Il tabellone disponibilità: una casella per unità, colorata per stato, come la facciata
// (per edificio, piani dall'alto in basso). Una casella si tocca per aprire l'unità.
import { NOMI_STATO, raggruppaTabellone, prezzoCorrente, type UnitaGenerale } from "@/lib/orders/generali/unita";
import { formattaNumero } from "@/lib/orders/generali/unitaConti";
import { STILE_STATO, euroBreve } from "@/components/orders/generali/unita/aspetto";
import { cn } from "@/lib/utils";

interface Props {
  unita: UnitaGenerale[];
  vedeImporti: boolean;
  onApri: (orderId: string) => void;
  /** Da telefono: caselle in griglia da quattro, etichetta del piano sopra e non a lato. */
  telefono: boolean;
}

export function TabelloneUnita({ unita, vedeImporti, onApri, telefono }: Props) {
  const edifici = raggruppaTabellone(unita);
  const conEdifici = edifici.some((e) => e.edificio !== null);
  return (
    <div className="space-y-4">
      {edifici.map((e) => {
        // Un solo piano non indicato: niente etichetta del piano, solo le caselle.
        const conPiani = e.piani.length > 1 || e.piani[0]?.piano !== null;
        return (
          <section key={e.edificio ?? "-"} aria-label={e.edificio ? `Edificio ${e.edificio}` : "Unità"} className="space-y-2">
            {conEdifici && <h3 className="text-sm font-semibold">{e.edificio ?? "Senza edificio"}</h3>}
            <div className={cn(telefono ? "space-y-2" : "space-y-1.5")}>
              {e.piani.map((p) => (
                <div key={p.piano ?? "-"} className={cn(!telefono && "flex items-start gap-3")}>
                  {conPiani && (
                    <p className={cn("text-[11px] text-muted-foreground", telefono ? "mb-1" : "w-24 shrink-0 pt-2 text-right")}>{p.etichetta}</p>
                  )}
                  <ul className={cn(telefono ? "grid grid-cols-4 gap-1.5" : "flex flex-1 flex-wrap gap-1.5")}>
                    {p.unita.map((u) => (
                      <li key={u.orderId}>
                        <Casella u={u} vedeImporti={vedeImporti} telefono={telefono} onApri={onApri} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Casella({ u, vedeImporti, telefono, onApri }: { u: UnitaGenerale; vedeImporti: boolean; telefono: boolean; onApri: (id: string) => void }) {
  const prezzo = vedeImporti ? prezzoCorrente(u) : null;
  const dettagli = [u.tipologia, u.mq !== null ? `${formattaNumero(u.mq)} m²` : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onApri(u.orderId)}
      aria-label={`${u.sigla}, ${NOMI_STATO[u.stato].una}${u.acquirente ? `, ${u.acquirente}` : ""}`}
      className={cn(
        "tap-compact flex w-full flex-col items-start rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        STILE_STATO[u.stato].casella,
        telefono ? "min-h-[3rem] px-2 py-1.5" : "h-[4.25rem] w-32 px-2.5 py-1.5",
      )}
    >
      <span className="w-full truncate text-sm font-semibold leading-tight">{u.sigla}</span>
      {!telefono && <span className="w-full truncate text-[11px] leading-tight opacity-80">{dettagli || NOMI_STATO[u.stato].una}</span>}
      <span className="mt-auto w-full truncate text-[11px] leading-tight tabular-nums opacity-90">
        {telefono ? euroBreve(prezzo) : u.stato !== "libera" && u.acquirente ? u.acquirente : euroBreve(prezzo)}
      </span>
    </button>
  );
}
