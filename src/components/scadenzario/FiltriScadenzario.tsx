import { useId } from "react";
import { Filter, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRUPPI_METODO } from "@/lib/finance/metodoScadenza";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { SceltaEntitaScadenzario, type OpzioneEntita } from "./SceltaEntitaScadenzario";

export interface ValoriFiltriScadenzario {
  periodo: string;
  dal: string;
  al: string;
  metodo: string;
  fornitore: OpzioneEntita | null;
  commessa: OpzioneEntita | null;
  /** Dentro «Altri filtri»: importo da/a (testo del campo), solo con note, solo con documento. */
  importoMin: string;
  importoMax: string;
  soloNote: boolean;
  soloDocumento: boolean;
}
export type AltriFiltriScadenzario = Pick<ValoriFiltriScadenzario, "importoMin" | "importoMax" | "soloNote" | "soloDocumento">;
export const ALTRI_FILTRI_VUOTI: AltriFiltriScadenzario = { importoMin: "", importoMax: "", soloNote: false, soloDocumento: false };
/** «12,5» o «12.5» → 12.5; vuoto o illeggibile → null (il filtro non si applica). */
export const importoDaTesto = (t: string): number | null => {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) ? n : null;
};
interface Props {
  valore: ValoriFiltriScadenzario;
  anno: string;
  companyId: string;
  periodi: Array<{ value: string; label: string }>;
  cambia: (patch: Partial<ValoriFiltriScadenzario>) => void;
  azzera: () => void;
  /** Il periodo lo sceglie il navigatore del mese: qui restano solo le date del «Personalizzato». */
  senzaPeriodo?: boolean;
  /** In «Arretrato» il limite è già nel chip: niente campi data. */
  senzaDate?: boolean;
}
const attivo = (v: string) => !!v && v !== "all";
const dataIt = (d: string) => d.split("-").reverse().join("/");

/** Quanti filtri «extra» sono accesi: sono quelli che il riepilogo del database non conosce. */
export const nFiltriPannello = (v: Partial<AltriFiltriScadenzario>) =>
  Number(importoDaTesto(v.importoMin ?? "") !== null) + Number(importoDaTesto(v.importoMax ?? "") !== null) + Number(!!v.soloNote) + Number(!!v.soloDocumento);
export const nFiltriSoloElenco = (v: Pick<ValoriFiltriScadenzario, "metodo" | "fornitore" | "commessa"> & Partial<AltriFiltriScadenzario>) =>
  Number(attivo(v.metodo)) + Number(!!v.fornitore) + Number(!!v.commessa) + nFiltriPannello(v);

/** I campi di «Altri filtri»: stessi sul computer (tendina) e sul telefono (pannello). */
export function CampiAltriFiltriScadenzario({ valore: v, cambia, compatto }: Pick<Props, "valore" | "cambia"> & { compatto: boolean }) {
  const t = useT();
  const id = useId();
  return <div className={cn("space-y-3", compatto && "p-3")}>
    <div className={cn("grid gap-2", compatto ? "min-[380px]:grid-cols-2" : "grid-cols-2")}>
      <div className="min-w-0 space-y-1"><Label htmlFor={id + "-min"}>{t("Importo da (€)")}</Label>
        <Input id={id + "-min"} inputMode="decimal" placeholder="0" value={v.importoMin} onChange={e => cambia({ importoMin: e.target.value })} /></div>
      <div className="min-w-0 space-y-1"><Label htmlFor={id + "-max"}>{t("Importo fino a (€)")}</Label>
        <Input id={id + "-max"} inputMode="decimal" value={v.importoMax} onChange={e => cambia({ importoMax: e.target.value })} /></div>
    </div>
    {([["soloNote", "Solo con note"], ["soloDocumento", "Solo con fattura o costo collegato"]] as const).map(([campo, testo]) => (
      <label key={campo} className={cn("flex items-center gap-2 text-sm", compatto && "min-h-11")}>
        <Checkbox checked={v[campo]} onCheckedChange={c => cambia({ [campo]: c === true })} />{t(testo)}
      </label>
    ))}
  </div>;
}

export function FiltriScadenzario({ valore: v, anno, companyId, periodi, cambia, senzaPeriodo, senzaDate }: Props) {
  const t = useT();
  return <>
    {!senzaPeriodo && <Select value={v.periodo || "all"} onValueChange={periodo => cambia({ periodo: periodo === "all" ? "" : periodo })}>
      <SelectTrigger aria-label={t("Periodo scadenze")} className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{anno === "all" ? t("Tutti gli anni") : t("Tutto il {anno}", { anno: String(anno ?? "") })}</SelectItem>
        {periodi.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
      </SelectContent>
    </Select>}
    {v.periodo === "custom" && !senzaDate && <span className="flex items-center gap-1">
      <Input aria-label={t("Da")} type="date" value={v.dal} onChange={e => cambia({ periodo: "custom", dal: e.target.value, al: v.al })} className="h-8 w-[130px] min-w-0 px-2 text-xs" />
      <span className="text-xs text-muted-foreground">–</span>
      <Input aria-label={t("A")} type="date" value={v.al} min={v.dal || undefined} onChange={e => cambia({ periodo: "custom", dal: v.dal, al: e.target.value })} className="h-8 w-[130px] min-w-0 px-2 text-xs" />
    </span>}
    <SceltaEntitaScadenzario tipo="fornitore" companyId={companyId} valore={v.fornitore} onScegli={fornitore => cambia({ fornitore })} />
    <SceltaEntitaScadenzario tipo="cantiere" companyId={companyId} valore={v.commessa} onScegli={commessa => cambia({ commessa })} />
    <Select value={v.metodo || "all"} onValueChange={metodo => cambia({ metodo: metodo === "all" ? "" : metodo })}>
      <SelectTrigger aria-label={t("Modalità di pagamento")} className="h-8 w-[150px] text-xs"><SelectValue placeholder={t("Modalità")} /></SelectTrigger>
      <SelectContent><SelectItem value="all">{t("Tutte le modalità")}</SelectItem>
        {GRUPPI_METODO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs"><Filter className="h-3.5 w-3.5" />{t("Altri filtri")}{nFiltriPannello(v) > 0 && ` (${nFiltriPannello(v)})`}</Button></PopoverTrigger>
      <PopoverContent className="w-80 max-w-[90vw] space-y-3" align="start">
        <p className="text-sm font-semibold">{t("Filtra le scadenze")}</p>
        <CampiAltriFiltriScadenzario valore={v} cambia={cambia} compatto={false} />
      </PopoverContent>
    </Popover>
  </>;
}

export function FiltriScadenzarioAttivi({ valore: v, cambia, azzera }: Pick<Props, "valore" | "cambia" | "azzera">) {
  const t = useT();
  const filtri = [
    ...(v.periodo === "custom" && (v.dal || v.al) ? [{ nome: v.dal && v.al
      ? t("Dal {dal} al {al}", { dal: dataIt(v.dal), al: dataIt(v.al) })
      : v.dal ? t("Dal {dal} in poi", { dal: dataIt(v.dal) })
      : t("Fino al {al}", { al: dataIt(v.al) }), rimuovi: () => cambia({ periodo: "", dal: "", al: "" }) }] : []),
    ...(v.fornitore ? [{ nome: `${t("Fornitore")}: ${v.fornitore.label}`, rimuovi: () => cambia({ fornitore: null }) }] : []),
    ...(v.commessa ? [{ nome: `${t("Cantiere")}: ${v.commessa.label}`, rimuovi: () => cambia({ commessa: null }) }] : []),
    ...(importoDaTesto(v.importoMin) !== null ? [{ nome: t("Da {importo} €", { importo: v.importoMin }), rimuovi: () => cambia({ importoMin: "" }) }] : []),
    ...(importoDaTesto(v.importoMax) !== null ? [{ nome: t("Fino a {importo} €", { importo: v.importoMax }), rimuovi: () => cambia({ importoMax: "" }) }] : []),
    ...(v.soloNote ? [{ nome: t("Con note"), rimuovi: () => cambia({ soloNote: false }) }] : []),
    ...(v.soloDocumento ? [{ nome: t("Con fattura o costo"), rimuovi: () => cambia({ soloDocumento: false }) }] : []),
    ...(attivo(v.metodo) ? [{ nome: `${t("Pagamento")}: ${GRUPPI_METODO.find(m => m.value === v.metodo)?.label ?? v.metodo}`, rimuovi: () => cambia({ metodo: "" }) }] : []),
  ];
  if (!filtri.length) return null;
  return <div className="flex flex-wrap items-center gap-1.5">
    {filtri.map(f => <Button key={f.nome} variant="secondary" size="sm" className="h-7 max-w-[260px] gap-1 text-xs" aria-label={t("Rimuovi filtro {nome}", { nome: String(f.nome ?? "") })} onClick={f.rimuovi}><span className="truncate">{f.nome}</span><X className="h-3 w-3 shrink-0" /></Button>)}
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={azzera}>{t("Reimposta")}</Button>
  </div>;
}
