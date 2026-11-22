import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRUPPI_METODO } from "@/lib/finance/metodoScadenza";
import { PilloleFiltro } from "@/components/mobile/FiltriMobile";

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
  return <PilloleFiltro titolo="Stato" valore={stato || "all"}
    onScegli={valore => cambia(valore === "all" ? "" : valore)}
    scelte={[{ value: "all", label: "Tutti" }, ...STATI.map(([value, label]) => ({ value, label }))]} />;
}

export function FiltriScadenzario({ valore: v, anno, periodi, aperto, onAperto, cambia, azzera }: Props) {
  const altri = [v.periodo === "custom", attivo(v.tipo), attivo(v.stato)].filter(Boolean).length;
  return <>
    <Select value={v.periodo || "all"} onValueChange={periodo => cambia({ periodo: periodo === "all" ? "" : periodo })}>
      <SelectTrigger aria-label="Periodo scadenze" className="h-9 w-[170px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{anno === "all" ? "Tutti gli anni" : `Tutto il ${anno}`}</SelectItem>
        {periodi.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select value={v.metodo || "all"} onValueChange={metodo => cambia({ metodo: metodo === "all" ? "" : metodo })}>
      <SelectTrigger aria-label="Modalità di pagamento" className="h-9 w-[160px] text-xs"><SelectValue placeholder="Modalità" /></SelectTrigger>
      <SelectContent><SelectItem value="all">Tutte le modalità</SelectItem>
        {GRUPPI_METODO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Popover open={aperto} onOpenChange={onAperto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-label="Filtri avanzati scadenzario">
          <Filter className="h-3.5 w-3.5" />Altri filtri{altri > 0 && <span className="rounded bg-muted px-1.5 text-xs">{altri}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
        <p className="text-sm font-semibold">Filtra le scadenze</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="scad-da">Da</Label>
            <Input id="scad-da" type="date" value={v.dal} onChange={e => cambia({ periodo: "custom", dal: e.target.value, al: v.al })} className="h-9 min-w-0 text-xs" />
          </div>
          <div className="space-y-1"><Label htmlFor="scad-a">A</Label>
            <Input id="scad-a" type="date" value={v.al} min={v.dal || undefined} onChange={e => cambia({ periodo: "custom", dal: v.dal, al: e.target.value })} className="h-9 min-w-0 text-xs" />
          </div>
        </div>
        {([["tipo", "Tipo di scadenza", TIPI], ["stato", "Stato della scadenza", STATI]] as const).map(([campo, label, opzioni]) =>
          <div key={campo} className="space-y-1"><Label>{label}</Label>
            <Select value={v[campo] || "all"} onValueChange={val => cambia({ [campo]: val === "all" ? "" : val })}>
              <SelectTrigger aria-label={label} className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tutti</SelectItem>
                {opzioni.map(([val, testo]) => <SelectItem key={val} value={val}>{testo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>)}
        <Button variant="ghost" size="sm" onClick={azzera} className="gap-1.5"><X className="h-3.5 w-3.5" />Reimposta filtri</Button>
      </PopoverContent>
    </Popover>
  </>;
}

export function FiltriScadenzarioAttivi({ valore: v, cambia, azzera }: Pick<Props, "valore" | "cambia" | "azzera">) {
  const filtri = [
    ...(v.periodo === "custom" && (v.dal || v.al) ? [{ nome: `${v.dal ? `Dal ${v.dal.split("-").reverse().join("/")}` : "Fino"}${v.al ? ` al ${v.al.split("-").reverse().join("/")}` : " in poi"}`, rimuovi: () => cambia({ periodo: "", dal: "", al: "" }) }] : []),
    ...(attivo(v.tipo) ? [{ nome: TIPI.find(([val]) => val === v.tipo)?.[1] ?? v.tipo, rimuovi: () => cambia({ tipo: "" }) }] : []),
    ...(attivo(v.stato) ? [{ nome: STATI.find(([val]) => val === v.stato)?.[1] ?? v.stato, rimuovi: () => cambia({ stato: "" }) }] : []),
  ];
  if (!filtri.length) return null;
  return <div className="flex flex-wrap items-center gap-1.5">
    {filtri.map(f => <Button key={f.nome} variant="secondary" size="sm" className="h-7 gap-1 text-xs" aria-label={`Rimuovi filtro ${f.nome}`} onClick={f.rimuovi}>{f.nome}<X className="h-3 w-3" /></Button>)}
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={azzera}>Reimposta</Button>
  </div>;
}
