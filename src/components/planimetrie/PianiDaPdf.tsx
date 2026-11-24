import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type PianoPdf = { pagina: number; nome: string; quota: string };

export function PianiDaPdf({ piani, pagina, pronto, errore, onAggiungi, onMostra, onModifica, onRimuovi }: {
  piani: PianoPdf[];
  pagina: number;
  pronto: boolean;
  errore: string;
  onAggiungi: () => void;
  onMostra: (pagina: number) => void;
  onModifica: (pagina: number, campi: Partial<Pick<PianoPdf, "nome" | "quota">>) => void;
  onRimuovi: (pagina: number) => void;
}) {
  const t = useT();
  const assegnata = piani.some((piano) => piano.pagina === pagina);
  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <h3 className="text-xs font-semibold">{t("Piani del PDF")}</h3>
        {!piani.length && <p className="mt-1 text-xs text-muted-foreground">{t("Aggiungi le pagine da aprire come piani dello stesso progetto.")}</p>}
      </div>
      <Button type="button" size="sm" variant="outline" className="w-full gap-1.5"
        disabled={!pronto || assegnata} onClick={onAggiungi}>
        {assegnata ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        {assegnata ? t("Pagina {pagina} aggiunta", { pagina }) : t("Aggiungi pagina {pagina}", { pagina })}
      </Button>
      {!!piani.length && <ul aria-label={t("Piani selezionati")} className="space-y-2">
        {piani.map((piano) => <li key={piano.pagina} className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary" onClick={() => onMostra(piano.pagina)}
              aria-current={piano.pagina === pagina ? "page" : undefined}>{t("Pagina {pagina}", { pagina: piano.pagina })}</Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
              aria-label={t("Rimuovi pagina {pagina} dai piani", { pagina: piano.pagina })}
              onClick={() => onRimuovi(piano.pagina)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] gap-2">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`pdf-nome-${piano.pagina}`} className="text-xs">{t("Nome")}</Label>
              <Input id={`pdf-nome-${piano.pagina}`} aria-label={t("Nome del piano, pagina {pagina}", { pagina: piano.pagina })} className="h-8 bg-card" maxLength={70}
                value={piano.nome} onChange={(e) => onModifica(piano.pagina, { nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pdf-quota-${piano.pagina}`} className="text-xs" title={t("Quota del pavimento rispetto al piano terra")}>{t("Quota (m)")}</Label>
              <Input id={`pdf-quota-${piano.pagina}`} aria-label={t("Quota in metri, pagina {pagina}", { pagina: piano.pagina })} className="h-8 bg-card" inputMode="decimal"
                value={piano.quota} onChange={(e) => onModifica(piano.pagina, { quota: e.target.value })} />
            </div>
          </div>
        </li>)}
      </ul>}
      {errore && <p className="text-xs text-destructive" aria-live="polite">{errore}</p>}
    </div>
  );
}
