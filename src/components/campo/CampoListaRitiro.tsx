import { MapPin } from "lucide-react";
import type { StockCampo } from "@/hooks/campo/useCampoPrelievo";
import type { BozzaPrelievo } from "@/lib/campo/bozzaPrelievo";
import { formatoQuantitaMagazzino, quantitaPrelievo } from "@/lib/campo/magazzino";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type PrelievoDaRitirare = { cantiere: string; nome: string; righe: BozzaPrelievo["righe"] };
type Materiale = {
  id: string;
  nome: string;
  codice: string | null;
  warehouseId: string | null;
  magazzino: string;
  ubicazioni: Set<string>;
  unita: string | null;
  quantita: number;
  cantieri: Map<string, { nome: string; quantita: number }>;
};
type Ubicazione = { id: string; magazzino: string; nome: string; daVerificare: boolean; materiali: Materiale[] };

const ordina = new Intl.Collator("it-IT", { numeric: true, sensitivity: "base" });

function raggruppaRitiro(prelievi: PrelievoDaRitirare[], inventario: ReadonlyMap<string, StockCampo>, t: (testo: string) => string) {
  const materiali = new Map<string, Materiale>();
  for (const prelievo of prelievi) {
    for (const { articolo, quantita } of prelievo.righe) {
      const valore = quantitaPrelievo(quantita);
      if (!(valore > 0)) continue;

      const corrente = inventario.get(articolo.id);
      const scheda = corrente?.warehouse_id === articolo.warehouse_id ? corrente : undefined;
      const unita = articolo.unita_misura || scheda?.unita_misura || null;
      const id = JSON.stringify([articolo.id, articolo.warehouse_id, unita]);
      let materiale = materiali.get(id);
      if (!materiale) {
        materiale = {
          id, nome: scheda?.name ?? articolo.name, codice: scheda?.internal_code || articolo.internal_code || null,
          warehouseId: articolo.warehouse_id, magazzino: scheda?.magazzino || articolo.magazzino || t("Magazzino non indicato"),
          ubicazioni: new Set(), unita, quantita: 0, cantieri: new Map(),
        };
        materiali.set(id, materiale);
      }

      const posizione = scheda ? scheda.ubicazione : articolo.ubicazione;
      if (posizione?.trim()) materiale.ubicazioni.add(posizione.trim());
      materiale.quantita += valore;
      const quota = materiale.cantieri.get(prelievo.cantiere)?.quantita ?? 0;
      materiale.cantieri.set(prelievo.cantiere, { nome: prelievo.nome, quantita: quota + valore });
    }
  }

  const ubicazioni = new Map<string, Ubicazione>();
  for (const materiale of materiali.values()) {
    const { magazzino, warehouseId } = materiale;
    const daVerificare = materiale.ubicazioni.size !== 1;
    const nome = materiale.ubicazioni.size === 1 ? [...materiale.ubicazioni][0]
      : materiale.ubicazioni.size ? t("Verifica ubicazione") : t("Senza ubicazione");
    const id = JSON.stringify([warehouseId, magazzino, nome, daVerificare]);
    const gruppo = ubicazioni.get(id) ?? { id, magazzino, nome, daVerificare, materiali: [] };
    gruppo.materiali.push(materiale);
    ubicazioni.set(id, gruppo);
  }

  return [...ubicazioni.values()].sort((a, b) => ordina.compare(a.magazzino, b.magazzino)
    || Number(a.daVerificare) - Number(b.daVerificare) || ordina.compare(a.nome, b.nome));
}

export function CampoListaRitiro({ prelievi, inventario }: {
  prelievi: PrelievoDaRitirare[];
  inventario: ReadonlyMap<string, StockCampo>;
}) {
  const t = useT();
  const cantieri = new Map(prelievi.map((prelievo) => [prelievo.cantiere, prelievo.nome]));
  const ubicazioni = raggruppaRitiro(prelievi, inventario, t);

  return (
    <section className="space-y-2" aria-label={t("Lista ritiro")}>
      {cantieri.size === 1 && <p className="text-xs font-medium text-muted-foreground">{[...cantieri.values()][0]}</p>}
      {ubicazioni.map(({ id, magazzino, nome, materiali }) => (
        <section key={id} aria-label={`${magazzino} · ${nome}`} className="min-w-0 rounded-xl border">
          <h3 className="flex flex-wrap items-baseline justify-between gap-x-2 rounded-t-xl bg-muted/50 px-2 py-1.5 sm:px-3">
            <span className="flex min-w-0 items-start gap-1.5 break-words text-sm font-semibold leading-snug">
              <MapPin aria-hidden="true" className="mt-px size-4 shrink-0 text-primary" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{nome}</span>
            </span>
            <span className="break-words text-xs font-medium text-muted-foreground">{magazzino}</span>
          </h3>
          <ul className="divide-y border-t">
            {materiali.sort((a, b) => ordina.compare(a.nome, b.nome)).map((articolo) => (
              <li key={articolo.id} className="px-2 py-2 sm:px-3">
                <div className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0 leading-snug">
                    <p className="break-words font-semibold">{articolo.nome}</p>
                    {articolo.codice && <p className="break-words text-xs text-muted-foreground">{articolo.codice}</p>}
                  </div>
                  <p className="max-w-[44%] text-right font-bold tabular-nums [overflow-wrap:anywhere]">
                    <span className="sr-only">{t("Totale")} </span>{formatoQuantitaMagazzino.format(articolo.quantita)} {articolo.unita}
                  </p>
                </div>
                {cantieri.size > 1 && (
                  <ul aria-label={t("Destinazioni di {nome}", { nome: articolo.nome })} className="mt-1 space-y-0.5 text-xs">
                    {[...articolo.cantieri].map(([cantiere, quota]) => (
                      <li key={cantiere} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-muted-foreground">{quota.nome}</span>
                        <span className="max-w-[44%] text-right font-medium tabular-nums [overflow-wrap:anywhere]">
                          {formatoQuantitaMagazzino.format(quota.quantita)} {articolo.unita}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
