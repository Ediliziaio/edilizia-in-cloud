import { useId } from "react";
import { Filter, X } from "lucide-react";
import { SceltaFiltro } from "@/components/mobile/FiltriMobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export const FILTRI_EMESSE_VUOTI = { sdi: "all", incasso: "all", cliente: "", commessa: "", dal: "", al: "", conNote: false, conAllegati: false };
export type FiltriEmesse = typeof FILTRI_EMESSE_VUOTI;
const SDI = [ ["all", "Tutti gli stati SDI"], ["da_inviare", "Da inviare SDI"], ["invio_in_corso", "Invio SDI in corso"], ["in_elaborazione", "In elaborazione SDI"], ["inviata", "Inviata SDI"], ["accettata", "Accettata SDI"], ["scartata", "Scartata SDI"], ["rifiutata_ente", "Rifiutata dall’ente"], ["manuale", "Invio manuale"], ["esterna", "Gestita esternamente"] ];
const INCASSO = [["all", "Tutti gli incassi"], ["da_incassare", "Da incassare"], ["parziale", "Parz. incassata"], ["incassata", "Incassata"], ["scaduta", "Scaduta da incassare"], ["non_previsto", "Incasso non previsto"]];

type PropsFiltriEmesse = { valore: FiltriEmesse; cambia: (patch: Partial<FiltriEmesse>) => void };

const FILTRI_PRINCIPALI = [["sdi", SDI, "SdI"], ["incasso", INCASSO, "Incasso"]] as const;

function CampiAltriFiltri({ valore, cambia, compatto }: PropsFiltriEmesse & { compatto: boolean }) {
  const t = useT();
  const id = useId();
  return (
    <div className={cn("space-y-3", compatto && "p-3")}>
      <div className="space-y-1"><Label htmlFor={id + "-cliente"}>{t("Cliente")}</Label><Input id={id + "-cliente"} placeholder={t("Nome o ragione sociale")} value={valore.cliente} onChange={e => cambia({ cliente: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={id + "-commessa"}>{t("Commessa o lavoro")}</Label><Input id={id + "-commessa"} placeholder={t("Codice o descrizione")} value={valore.commessa} onChange={e => cambia({ commessa: e.target.value })} /></div>
      <div className={cn("grid gap-2", compatto ? "min-[380px]:grid-cols-2" : "grid-cols-2")}>
        <div className="min-w-0 space-y-1"><Label htmlFor={id + "-dal"}>{t("Emessa dal")}</Label><Input id={id + "-dal"} type="date" value={valore.dal} max={valore.al || undefined} onChange={e => cambia({ dal: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor={id + "-al"}>{t("Emessa fino al")}</Label><Input id={id + "-al"} type="date" value={valore.al} min={valore.dal || undefined} onChange={e => cambia({ al: e.target.value })} /></div>
      </div>
      {([["conNote", "Solo con note"], ["conAllegati", "Solo con allegati"]] as const).map(([campo, testo]) => (
        <label key={campo} className={cn("flex items-center gap-2 text-sm", compatto && "min-h-11")}>
          <Checkbox checked={valore[campo]} onCheckedChange={v => cambia({ [campo]: v === true })} />{t(testo)}
        </label>
      ))}
    </div>
  );
}

export function FiltriFattureEmesse({ valore, cambia, compatto = false }: PropsFiltriEmesse & { compatto?: boolean }) {
  const t = useT();
  if (compatto) return <>
    {FILTRI_PRINCIPALI.map(([campo, opzioni, titolo]) => (
      <SceltaFiltro key={campo} titolo={t(titolo)} valore={valore[campo]} onScegli={v => cambia({ [campo]: v })}
        scelte={opzioni.map(([value, label]) => ({ value, label: t(label) }))} />
    ))}
    <CampiAltriFiltri valore={valore} cambia={cambia} compatto />
  </>;

  const altri = [valore.cliente, valore.commessa, valore.dal, valore.al, valore.conNote, valore.conAllegati].filter(Boolean).length;
  return <>
    {FILTRI_PRINCIPALI.map(([campo, opzioni, titolo]) => <Select key={campo} value={valore[campo]} onValueChange={v => cambia({ [campo]: v })}>
      <SelectTrigger aria-label={campo === "sdi" ? t("Filtra per SDI") : t("Filtra per incasso")} className="h-9 w-[190px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{opzioni.map(([v, l]) => <SelectItem key={v} value={v}>{t(l)}</SelectItem>)}</SelectContent>
    </Select>)}
    <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-3.5 w-3.5" />{t("Altri filtri")}{altri > 0 && ` (${altri})`}</Button></PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw] space-y-3" align="start">
        <p className="text-sm font-semibold">{t("Filtra le fatture emesse")}</p>
        <CampiAltriFiltri valore={valore} cambia={cambia} compatto={false} />
      </PopoverContent>
    </Popover>
  </>;
}

export function FiltriEmesseAttivi({ valore, cambia }: { valore: FiltriEmesse; cambia: (patch: Partial<FiltriEmesse>) => void }) {
  const t = useT();
  const voci = (Object.keys(valore) as (keyof FiltriEmesse)[]).filter(k => valore[k] !== FILTRI_EMESSE_VUOTI[k]);
  if (!voci.length) return null;
  const label = (k: keyof FiltriEmesse) => k === "sdi" ? t(SDI.find(o => o[0] === valore.sdi)?.[1] ?? "") : k === "incasso" ? t(INCASSO.find(o => o[0] === valore.incasso)?.[1] ?? "") : k === "cliente" ? t("Cliente: {valore}", { valore: valore[k] }) : k === "commessa" ? t("Commessa: {valore}", { valore: valore[k] }) : k === "dal" ? t("Dal {valore}", { valore: valore[k] }) : k === "al" ? t("Fino al {valore}", { valore: valore[k] }) : k === "conNote" ? t("Con note") : t("Con allegati");
  return <div className="flex flex-wrap gap-2">{voci.map(k => <Button key={k} variant="secondary" size="sm" className="h-7 gap-1 text-xs" aria-label={t("Rimuovi filtro {filtro}", { filtro: label(k) })} onClick={() => cambia({ [k]: FILTRI_EMESSE_VUOTI[k] })}>{label(k)}<X className="h-3 w-3" /></Button>)}</div>;
}
