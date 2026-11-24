import { useId } from "react";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { altezzaPensiliCucina, altezzaTestieraLetto, PROFONDITA_PISCINA_CM, quotePiscina, richiedeAltezzaComplemento } from "../../../../shared/planimetrie/modelliArredo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Misure = { larghezza: number; profondita: number; altezza: number };
export type TestoMisureArredo = Record<keyof Misure, string>;

const TAGLIE: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  cucina: [[180, 60], [240, 60], [300, 60], [360, 60]],
  cucina_angolare: [[240, 180], [300, 240], [360, 270]],
  isola_cucina: [[120, 80], [160, 90], [180, 90], [220, 110]],
  letto_singolo: [[80, 200], [90, 200], [120, 200]],
  letto_matrimoniale: [[140, 200], [160, 200], [180, 200], [200, 200]],
  armadio: [[120, 60], [180, 60], [200, 60], [240, 60]],
  divano: [[160, 85], [210, 90], [240, 95]],
  divano_angolare: [[240, 160], [280, 170], [320, 200]],
  tavolo: [[120, 80], [140, 80], [180, 90]],
  piscina: [[250, 500], [350, 650], [400, 800]],
};
const cucina = (tipo: string) => tipo === "cucina" || tipo === "cucina_angolare" || tipo === "isola_cucina";
const letto = (tipo: string) => tipo === "letto" || tipo === "letto_singolo" || tipo === "letto_matrimoniale";
const QUOTE: Readonly<Record<string, string>> = {
  tenda: "Quota binario", quadro: "Bordo superiore", specchio_parete: "Bordo superiore", scaldasalviette: "Bordo superiore",
};
const altezzaMinima = (tipo: string) => letto(tipo) || cucina(tipo) || richiedeAltezzaComplemento(tipo) ? 1 : 0;
const numero = (testo: string) => /^[0-9]+(?:[.,][0-9]*)?$/.test(testo.trim()) ? Number(testo.trim().replace(",", ".")) : NaN;
export const quotaArredo = (cm: number) => String(cm).replace(".", ",");

export const testoMisureArredo = ({ larghezza, profondita, altezza }: Misure): TestoMisureArredo => ({
  larghezza: quotaArredo(larghezza), profondita: quotaArredo(profondita), altezza: quotaArredo(altezza),
});

export function leggiMisureArredo(testo: TestoMisureArredo, tipo: string): Misure | null {
  const larghezza = numero(testo.larghezza), profondita = numero(testo.profondita), altezza = numero(testo.altezza);
  if (![larghezza, profondita, altezza].every(Number.isFinite)) return null;
  if (larghezza < 1 || profondita < 1 || altezza < altezzaMinima(tipo)) return null;
  return { larghezza, profondita, altezza };
}

export function MisureArredo3D({ tipo, valore, onChange }: {
  tipo: string; valore: TestoMisureArredo; onChange: (valore: TestoMisureArredo) => void;
}) {
  const t = useT();
  const id = useId();
  const taglie = TAGLIE[tipo === "letto" ? "letto_matrimoniale" : tipo];
  const angolare = tipo === "cucina_angolare", eLetto = letto(tipo);
  const piscina = tipo === "piscina";
  const etichette: Record<keyof Misure, string> = {
    larghezza: angolare ? "Lato lungo" : "Larghezza",
    profondita: angolare ? "Ritorno" : eLetto || piscina || tipo === "auto" ? "Lunghezza" : "Profondità",
    altezza: piscina ? "Profondità vasca" : cucina(tipo) ? "Altezza piano" : eLetto ? "Altezza letto" : (QUOTE[tipo] ?? "Altezza"),
  };
  const misure = leggiMisureArredo(valore, tipo);
  const vasca = piscina && misure ? quotePiscina(misure.larghezza, misure.profondita, misure.altezza) : null;
  return <div role="group" aria-labelledby={id} className="space-y-2.5 rounded-lg border bg-muted/35 p-2.5">
    <h3 id={id} className="flex items-center gap-1.5 text-xs font-semibold">
      <Ruler aria-hidden className="size-3.5 text-primary" />
      {t("Misure")} <span className="font-normal text-muted-foreground">(cm)</span>
    </h3>
    {taglie && <div role="group" aria-label={t("Misure rapide")} className="flex flex-wrap gap-1">
      {taglie.map(([larghezza, profondita]) => <Button type="button" size="sm"
        variant="outline" className="h-8 px-2 text-xs tabular-nums aria-pressed:border-primary/50 aria-pressed:bg-primary/10 aria-pressed:text-primary"
        key={`${larghezza}x${profondita}`}
        aria-pressed={numero(valore.larghezza) === larghezza && numero(valore.profondita) === profondita}
        onClick={() => onChange({ ...valore, larghezza: String(larghezza), profondita: String(profondita) })}>
        {larghezza} × {profondita}
      </Button>)}
    </div>}
    <div className="grid grid-cols-3 gap-1.5">
      {(Object.keys(etichette) as Array<keyof Misure>).map(campo => {
        const n = numero(valore[campo]), minimo = campo === "altezza" ? altezzaMinima(tipo) : 1;
        const errato = !Number.isFinite(n) || n < minimo;
        return <label key={campo} className="flex min-w-0 flex-col justify-between gap-1 text-[11px] font-medium leading-tight">
          {t(etichette[campo])}
          <Input inputMode="decimal" value={valore[campo]} placeholder={piscina && campo === "altezza" ? String(PROFONDITA_PISCINA_CM) : undefined}
            spellCheck={false} aria-invalid={errato}
            onChange={e => onChange({ ...valore, [campo]: e.target.value })}
            className={cn("h-9 px-2 tabular-nums", errato && "border-destructive")} />
        </label>;
      })}
    </div>
    {!misure && <p className="text-xs text-destructive">{t("Inserisci una misura valida in ogni campo.")}</p>}
    {misure && eLetto && <p className="text-xs text-muted-foreground">{t("Misure esterne del letto. L’altezza arriva al materasso. Testiera a {valore} cm.", { valore: quotaArredo(altezzaTestieraLetto(misure.altezza)) })}</p>}
    {misure && angolare && <p className="text-xs text-muted-foreground">{t("I lati comprendono l’angolo. I pensili arrivano a {valore} cm.", { valore: quotaArredo(altezzaPensiliCucina(misure.altezza) + 70) })}</p>}
    {misure && tipo === "isola_cucina" && <p className="text-xs text-muted-foreground">{t("La profondità comprende gli sgabelli.")}</p>}
    {vasca && <p className="text-xs text-muted-foreground">{t("Vasca interna {luce} × {lungo} cm. Fondo a {vasca} cm sotto il bordo.", { luce: quotaArredo(vasca.luce), lungo: quotaArredo(vasca.lungo), vasca: quotaArredo(vasca.vasca) })}</p>}
  </div>;
}
