// src/components/campo/SottofasiContate.tsx
import { riepilogoSottofasi, type Sottofase } from "@/lib/orders/sottofasi";

const MASSIMO_NOMI = 3;

/** Sotto la barra di una fase, nella scheda del cantiere: quante sottofasi sono fatte e cosa manca. */
export function SottofasiContate({ sottofasi }: { sottofasi: ReadonlyArray<Pick<Sottofase, "name" | "fatta">> }) {
  const { fatte, totale } = riepilogoSottofasi(sottofasi);
  if (totale === 0) return null;
  const mancanti = sottofasi.filter((s) => !s.fatta).map((s) => s.name);
  if (mancanti.length === 0) return <p className="mt-1 text-[11px] text-muted-foreground">Tutte le {totale} sottofasi sono fatte</p>;
  const visibili = mancanti.slice(0, MASSIMO_NOMI).join(", ");
  const altre = mancanti.length - MASSIMO_NOMI;
  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      <p>{fatte} di {totale} sottofasi</p>
      <p className="truncate">Mancano: {visibili}{altre > 0 ? ` e altre ${altre}` : ""}</p>
    </div>
  );
}
