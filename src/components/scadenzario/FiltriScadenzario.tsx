import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRUPPI_METODO } from "@/lib/finance/metodoScadenza";
import { SceltaFiltro } from "@/components/mobile/FiltriMobile";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface ValoriFiltriScadenzario {
  periodo: string;
  dal: string;
  al: string;
  metodo: string;
  tipo: string;
  stato: string;
}
interface Props {
  valore: ValoriFiltriScadenzario;
  anno: string;
  periodi: Array<{ value: string; label: string }>;
  aperto: boolean;
  onAperto: (aperto: boolean) => void;
  cambia: (patch: Partial<ValoriFiltriScadenzario>) => void;
  azzera: () => void;
}
const TIPI = [["incasso_cliente", "Incasso cliente"], ["pagamento_fornitore", "Pagamento fornitore"],
  ["costo_aziendale", "Costo aziendale"], ["scadenza_fiscale", "Scadenza fiscale"], ["altro", "Altro"]];
const STATI = [["da_pagare", "Da saldare"], ["parziale", "Parziale"], ["pagata", "Saldata"], ["annullata", "Annullata"]];
const attivo = (v: string) => !!v && v !== "all";

export function FiltroStatoScadenzeCompatto({ stato, cambia }: { stato: string; cambia: (stato: string) => void }) {
  const t = useT();
  return <SceltaFiltro titolo={t("Stato")} valore={stato || "all"}
    onScegli={valore => cambia(valore === "all" ? "" : valore)}
    scelte={[{ value: "all", label: t("Tutti") }, ...STATI.map(([value, label]) => ({ value, label: t(label) }))]} />;
}

export function FiltriScadenzario({ valore: v, anno, periodi, aperto, onAperto, cambia, azzera }: Props) {
  const t = useT();
  const altri = [v.periodo === "custom", attivo(v.tipo), attivo(v.stato)].filter(Boolean).length;
  return <>
    <Select value={v.periodo || "all"} onValueChange={periodo => cambia({ periodo: periodo === "all" ? "" : periodo })}>
      <SelectTrigger aria-label={t("Periodo scadenze")} className="h-9 w-[170px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{anno === "all" ? t("Tutti gli anni") : t("Tutto il {anno}", { anno: String(anno ?? "") })}</SelectItem>
        {periodi.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select value={v.metodo || "all"} onValueChange={metodo => cambia({ metodo: metodo === "all" ? "" : metodo })}>
      <SelectTrigger aria-label={t("Modalità di pagamento")} className="h-9 w-[160px] text-xs"><SelectValue placeholder={t("Modalità")} /></SelectTrigger>
      <SelectContent><SelectItem value="all">{t("Tutte le modalità")}</SelectItem>
        {GRUPPI_METODO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Popover open={aperto} onOpenChange={onAperto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-label={t("Filtri avanzati scadenzario")}>
          <Filter className="h-3.5 w-3.5" />{t("Altri filtri")}{altri > 0 && <span className="rounded bg-muted px-1.5 text-xs">{altri}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
        <p className="text-sm font-semibold">{t("Filtra le scadenze")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="scad-da">{t("Da")}</Label>
            <Input id="scad-da" type="date" value={v.dal} onChange={e => cambia({ periodo: "custom", dal: e.target.value, al: v.al })} className="h-9 min-w-0 text-xs" />
          </div>
          <div className="space-y-1"><Label htmlFor="scad-a">{t("A")}</Label>
            <Input id="scad-a" type="date" value={v.al} min={v.dal || undefined} onChange={e => cambia({ periodo: "custom", dal: v.dal, al: e.target.value })} className="h-9 min-w-0 text-xs" />
          </div>
        </div>
        {([["tipo", "Tipo di scadenza", TIPI], ["stato", "Stato della scadenza", STATI]] as const).map(([campo, label, opzioni]) =>
          <div key={campo} className="space-y-1"><Label>{t(label)}</Label>
            <Select value={v[campo] || "all"} onValueChange={val => cambia({ [campo]: val === "all" ? "" : val })}>
              <SelectTrigger aria-label={t(label)} className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("Tutti")}</SelectItem>
                {opzioni.map(([val, testo]) => <SelectItem key={val} value={val}>{t(testo)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>)}
        <Button variant="ghost" size="sm" onClick={azzera} className="gap-1.5"><X className="h-3.5 w-3.5" />{t("Reimposta filtri")}</Button>
      </PopoverContent>
    </Popover>
  </>;
}

export function FiltriScadenzarioAttivi({ valore: v, cambia, azzera }: Pick<Props, "valore" | "cambia" | "azzera">) {
  const t = useT();
  const filtri = [
    ...(v.periodo === "custom" && (v.dal || v.al) ? [{ nome: v.dal && v.al
      ? t("Dal {dal} al {al}", { dal: v.dal.split("-").reverse().join("/"), al: v.al.split("-").reverse().join("/") })
      : v.dal ? t("Dal {dal} in poi", { dal: v.dal.split("-").reverse().join("/") })
      : t("Fino al {al}", { al: v.al.split("-").reverse().join("/") }), rimuovi: () => cambia({ periodo: "", dal: "", al: "" }) }] : []),
    ...(attivo(v.tipo) ? [{ nome: t(TIPI.find(([val]) => val === v.tipo)?.[1] ?? v.tipo), rimuovi: () => cambia({ tipo: "" }) }] : []),
    ...(attivo(v.stato) ? [{ nome: t(STATI.find(([val]) => val === v.stato)?.[1] ?? v.stato), rimuovi: () => cambia({ stato: "" }) }] : []),
  ];
  if (!filtri.length) return null;
  return <div className="flex flex-wrap items-center gap-1.5">
    {filtri.map(f => <Button key={f.nome} variant="secondary" size="sm" className="h-7 gap-1 text-xs" aria-label={t("Rimuovi filtro {nome}", { nome: String(f.nome ?? "") })} onClick={f.rimuovi}>{f.nome}<X className="h-3 w-3" /></Button>)}
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={azzera}>{t("Reimposta")}</Button>
  </div>;
}
