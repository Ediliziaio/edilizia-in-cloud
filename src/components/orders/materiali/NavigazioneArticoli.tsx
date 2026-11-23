import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Layers, Truck, Warehouse } from "lucide-react";
import type { GruppoArticoli, VistaArticoli } from "@/lib/distinta/navigazioneArticoli";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function NavigazioneArticoli({ vista, onVista, gruppi, scelto, onGruppo, totale, aggiornamento, errore }: {
  vista: VistaArticoli; onVista: (v: VistaArticoli) => void; gruppi: GruppoArticoli[]; scelto: string;
  onGruppo: (id: string) => void; totale: number; aggiornamento?: boolean; errore?: boolean;
}) {
  const t = useT();
  const etichetta = vista === "fasi" ? t("Tutte le fasi") : vista === "fornitori" ? t("Tutti i fornitori") : t("Tutti gli articoli");
  const voci = [{ id: "_tutti", nome: etichetta, articoli: Array(totale).fill("") }, ...gruppi];
  const Icona = vista === "fasi" ? Layers : vista === "fornitori" ? Truck : Warehouse;
  return <aside className="min-w-0 space-y-3 rounded-xl border border-border/70 bg-card p-2 shadow-sm max-md:space-y-2 max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none lg:sticky lg:top-3 lg:self-start" aria-label={t("Navigazione degli articoli")}>
    <div className="grid grid-cols-3 gap-0.5 rounded-md bg-muted p-0.5" role="group" aria-label={t("Raggruppa articoli")}>
      {(["fasi", "fornitori", "magazzino"] as const).map(v => <Button key={v} type="button" size="sm" variant="ghost"
        className={cn("h-12 flex-col gap-1 px-1 text-[11px] max-md:h-9 max-md:flex-row max-md:gap-1.5 max-md:text-xs", vista === v && "bg-background font-semibold shadow-sm")} aria-pressed={vista === v} onClick={() => onVista(v)}>
        {v === "fasi" ? <Layers className="h-3.5 w-3.5" aria-hidden /> : v === "fornitori" ? <Truck className="h-3.5 w-3.5" aria-hidden /> : <Warehouse className="h-3.5 w-3.5" aria-hidden />}
        {{ fasi: t("Fasi"), fornitori: t("Fornitori"), magazzino: t("Magazzino") }[v]}</Button>)}
    </div>
    {aggiornamento && <p role="status" className="px-1 text-xs text-muted-foreground">{t("Verifico le disponibilità…")}</p>}
    {errore && <p role="alert" className="px-1 text-xs text-amber-800">{t("Disponibilità non verificabile. Apri il piano acquisti per riprovare.")}</p>}
    {/* Sotto i 768px niente tendina: l'elenco è già diviso per gruppo con i titoli, ed era il
        quarto comando impilato sopra gli articoli (collaudo 23/11/2026). */}
    <select aria-label={t("Scegli il gruppo di articoli")} value={scelto} onChange={e => onGruppo(e.target.value)} className="h-9 w-full rounded border bg-background px-2 text-sm max-md:hidden lg:hidden">
      {voci.map(g => <option key={g.id} value={g.id}>{g.nome} ({g.articoli.length})</option>)}
    </select>
    <nav className="max-h-[65dvh] space-y-1 overflow-y-auto max-lg:hidden" aria-label={vista === "fasi" ? t("Fasi degli articoli") : vista === "fornitori" ? t("Fornitori degli articoli") : t("Disponibilità degli articoli")}>
      {voci.map(g => <button type="button" key={g.id} aria-current={scelto === g.id ? "true" : undefined} onClick={() => onGruppo(g.id)}
        title={g.nome} className={cn("flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left text-sm", scelto === g.id ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted")}>
        <Icona className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        <span className="min-w-0 flex-1 line-clamp-2 text-[13px] leading-5">{g.nome}</span><span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{g.articoli.length}</span>
      </button>)}
    </nav>
    {vista === "magazzino" && <p className="px-1 text-[11px] text-muted-foreground">{t("La disponibilità può coprire solo una parte del fabbisogno. Il residuo si verifica nel piano acquisti.")}</p>}
  </aside>;
}
