import { useState } from "react";
import { Ruler, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { Switch } from "@/components/ui/switch";
import ComputoMisure from "@/components/computo/ComputoMisure";
import { misuraVuota } from "@/lib/computo/editorNativo";
import { quantitaDaMisure, type MisurePreventivo } from "@/lib/preventivi/misurePreventivo";
import type { QuoteItemPro } from "@/types/quoteItem";

export function QuoteMisureRiga({ item, onChange }: { item: QuoteItemPro; onChange: (misure: MisurePreventivo) => void }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const m = item.misureComputo ?? { attive: false, manuale: item.quantity, righe: [] };
  const q = quantitaDaMisure(m);
  return <section className="mt-2 rounded-lg border border-dashed bg-slate-50/60 px-3 py-2" aria-label={t("Misure di {nome}", { nome: item.name || t("riga") })}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" className="h-8 -ml-2 gap-1.5 px-2 text-xs" aria-expanded={aperto} onClick={() => setAperto(!aperto)}><Ruler className="h-3.5 w-3.5" />{t("Misure e formule")}{m.righe.length ? ` · ${m.righe.length}` : ""}<ChevronDown className={`h-3 w-3 ${aperto ? "rotate-180" : ""}`} /></Button>
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><span>{t("Calcola la quantità")}</span><Switch aria-label={t("Calcola quantità dalle misure: {nome}", { nome: item.name || t("riga") })} checked={m.attive} onCheckedChange={attive => {
        const prossimo = { ...m, attive, manuale: m.attive ? m.manuale : item.quantity, righe: attive && !m.righe.length ? [misuraVuota()] : m.righe };
        onChange(prossimo); if (attive) setAperto(true);
      }} /></label>
    </div>
    {aperto && <div className="pb-2 pt-2">
      {!m.attive && <p className="mb-3 text-xs text-muted-foreground">{t("Attiva il calcolo per usare le misure. Spegnendolo torni alla quantità manuale e conservi tutte le righe.")}</p>}
      <fieldset disabled={!m.attive} className="min-w-0"><div className="max-w-full overflow-x-auto"><div className="sm:min-w-[720px]"><ComputoMisure misure={m.righe} unita={item.unit_of_measure} onChange={righe => onChange({ ...m, righe })} /></div></div></fieldset>
      {m.attive && q == null && <p role="alert" className="mt-2 text-xs text-amber-800">{t("Completa le misure o correggi la formula prima di salvare il preventivo.")}</p>}
    </div>}
  </section>;
}
