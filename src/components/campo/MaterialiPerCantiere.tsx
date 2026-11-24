/**
 * Materiali per cantiere (24/11/2026, richiesta del founder: «vedere i materiali ritirati per i vari cantieri»).
 *
 * Un riquadro per ogni cantiere dove lavoro: quanti miei ritiri aspettano il magazzino e, aperto, cosa è
 * arrivato in cantiere (da me e dagli altri) e cosa ne rimane, letto da campo_materiali_cantiere, la stessa
 * fonte della scheda del cantiere. «Prendi materiale» apre l'inventario con quel cantiere già scelto.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, HardHat, PackagePlus } from "lucide-react";
import { RiepilogoMateriali } from "@/components/campo/CampoMaterialiCantiere";
import { useCampoCantieriPrelievo, useMieiPrelievi } from "@/hooks/campo/useCampoPrelievo";
import { useMiaGiornata } from "@/hooks/campo/useCampoGiornata";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { nomeCantierePrelievo } from "@/lib/campo/magazzino";
import { cn } from "@/lib/utils";
import { CHIP, PILLOLA } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type CantiereBase = { id: string; order_code: string | null; description: string | null; indirizzo_lavori: string | null };
interface CantiereElenco { id: string; nome: string; oggi: boolean; inAttesa: number; ritiri: number }

/** I cantieri da mostrare: quelli dove posso prelevare e quelli dei miei ritiri; prima quelli di oggi. */
export function cantieriPerMateriali(
  assegnati: CantiereBase[],
  dalRitiri: CantiereBase[],
  prelievi: { order_id: string | null; stato: string }[],
  oggi: string[],
): CantiereElenco[] {
  const tutti = new Map<string, CantiereElenco>();
  for (const c of [...assegnati, ...dalRitiri]) {
    if (tutti.has(c.id)) continue;
    const miei = prelievi.filter(p => p.order_id === c.id);
    tutti.set(c.id, {
      id: c.id, nome: nomeCantierePrelievo(c), oggi: oggi.includes(c.id),
      inAttesa: miei.filter(p => p.stato === "richiesto").length, ritiri: miei.length,
    });
  }
  return [...tutti.values()].sort((a, b) => Number(b.oggi) - Number(a.oggi) || b.ritiri - a.ritiri || a.nome.localeCompare(b.nome));
}

export function MaterialiPerCantiere({ companyId, userId, puoPrelevare }: { companyId: string; userId: string; puoPrelevare: boolean }) {
  const t = useT();
  const cantieri = useCampoCantieriPrelievo(companyId, puoPrelevare);
  const ritiri = useMieiPrelievi(companyId);
  const giornata = useMiaGiornata(14);
  const giorno = useCampoWorkDay();
  const oggi = giornata.data?.giorni.find(g => g.giorno === giorno)?.cantieri.map(c => c.order_id) ?? [];
  const elenco = cantieriPerMateriali(cantieri.data ?? [], ritiri.data?.cantieri ?? [], ritiri.data?.prelievi ?? [], oggi);
  const [aperto, setAperto] = useState<string | null>(null);
  const apertoOra = aperto ?? (elenco.length === 1 ? elenco[0].id : null);

  if (!elenco.length) return null;
  return (
    <section aria-label={t("Materiali per cantiere")} className="mb-3 space-y-2">
      {elenco.map(c => {
        const espanso = apertoOra === c.id;
        return (
          <div key={c.id} className="rounded-2xl border bg-background shadow-sm">
            <button type="button" aria-expanded={espanso} onClick={() => setAperto(espanso ? "" : c.id)}
              className="flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left">
              <HardHat aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold leading-snug">{c.nome}</span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {c.oggi && <span className={cn(CHIP, "bg-primary/10 text-primary")}>{t("Oggi")}</span>}
                  {c.inAttesa > 0 && <span className={cn(CHIP, "bg-amber-100 text-amber-900")}>{t("{n} in attesa del magazzino", { n: c.inAttesa })}</span>}
                </span>
              </span>
              <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", espanso && "rotate-180")} />
            </button>
            {espanso && (
              <div className="border-t px-3 pb-3">
                <RiepilogoMateriali companyId={companyId} orderId={c.id} userId={userId} />
                {puoPrelevare && (cantieri.data ?? []).some(a => a.id === c.id) && (
                  <Link to={`/campo/magazzino?order_id=${encodeURIComponent(c.id)}`} className={cn(PILLOLA, "mt-3 w-full text-primary")}>
                    <PackagePlus aria-hidden="true" className="size-4" />{t("Prendi materiale per questo cantiere")}
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
