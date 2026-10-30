import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Lavorazione, SezionePos, VoceMancante } from "../../../../supabase/functions/_shared/posModello";

interface Props {
  voci: VoceMancante[];
  lavorazioni: Lavorazione[];
  ro: boolean;
  onVai: (sezione: SezionePos) => void;
  /** Conferma, per le lavorazioni indicate, di aver verificato l'elenco dei prodotti realmente usati. */
  onConfermaProdotti: (idLavorazioni: string[]) => void;
}

type Gruppo = NonNullable<VoceMancante["gruppo"]>;
type Elemento = { tipo: "voce"; voce: VoceMancante } | { tipo: "gruppo"; gruppo: Gruppo; voci: VoceMancante[] };

const TITOLO_GRUPPO: Record<Gruppo, (n: number) => string> = {
  "prodotti-riesame": (n) => `Elenco dei prodotti da riesaminare in ${n} lavorazioni`,
  "prodotti-identifica": (n) => `Prodotti e schede di sicurezza (SDS) da identificare in ${n} lavorazioni`,
};

/**
 * Raggruppa le voci dello stesso tipo ripetute per ogni lavorazione (in un POS vero erano 10 voci su 12): un riquadro solo,
 * con le lavorazioni coinvolte. Il gruppo prende il posto della sua prima voce, l'ordine delle altre non cambia.
 */
export function raggruppaVoci(voci: VoceMancante[]): Elemento[] {
  const perGruppo = new Map<Gruppo, VoceMancante[]>();
  for (const v of voci) if (v.gruppo) perGruppo.set(v.gruppo, [...(perGruppo.get(v.gruppo) ?? []), v]);
  const fatti = new Set<Gruppo>();
  const out: Elemento[] = [];
  for (const v of voci) {
    const g = v.gruppo;
    if (!g || (perGruppo.get(g)?.length ?? 0) < 2) { out.push({ tipo: "voce", voce: v }); continue; }
    if (fatti.has(g)) continue;
    fatti.add(g);
    out.push({ tipo: "gruppo", gruppo: g, voci: perGruppo.get(g)! });
  }
  return out;
}

export function CosaManca({ voci, lavorazioni, ro, onVai, onConfermaProdotti }: Props) {
  const [confermo, setConfermo] = useState(false);
  const nome = (id?: string) => {
    const i = lavorazioni.findIndex((l) => l.id === id);
    return i < 0 ? "lavorazione" : lavorazioni[i].titolo.trim() || `n. ${i + 1}`;
  };
  return (
    <ul className="space-y-1.5">
      {raggruppaVoci(voci).map((e, i) => e.tipo === "voce" ? (
        <li key={`${e.voce.sezione}-${i}`}>
          <button type="button" className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onVai(e.voce.sezione)}>
            {e.voce.testo}
            <span className="ml-1 text-xs text-muted-foreground">({e.voce.riferimento})</span>
          </button>
        </li>
      ) : (
        <li key={e.gruppo} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
          <p className="font-medium">{TITOLO_GRUPPO[e.gruppo](e.voci.length)}<span className="ml-1 text-xs font-normal text-muted-foreground">({e.voci[0].riferimento})</span></p>
          <p className="text-xs text-muted-foreground">{e.voci.map((v) => `«${nome(v.lavorazione_id)}»`).join(", ")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="tap-compact" onClick={() => onVai("lavorazioni")}>Apri le lavorazioni</Button>
          </div>
          {e.gruppo === "prodotti-riesame" && !ro && (
            <div className="space-y-2 rounded-md border bg-background p-2">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={confermo} onChange={(ev) => setConfermo(ev.target.checked)} />
                Ho verificato l’elenco dei prodotti realmente usati in queste lavorazioni, anche dove non sono previste sostanze pericolose. La conferma non è una valutazione del rischio chimico.
              </label>
              <Button type="button" size="sm" disabled={!confermo} className="tap-compact"
                onClick={() => { onConfermaProdotti(e.voci.map((v) => v.lavorazione_id).filter((x): x is string => !!x)); setConfermo(false); }}>
                Conferma per tutte e {e.voci.length}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
