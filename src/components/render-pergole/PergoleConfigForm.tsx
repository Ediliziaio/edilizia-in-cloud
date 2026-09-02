import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PERGOLE_CONFIG,
} from "./defaultPergoleConfig";
import type {
  ConfigurazionePergole,
  MaterialeStrutturaPergola,
  StatoChiusuraLaterale,
  StatoCoperturaPergola,
  TipoChiusuraLaterale,
  TipoCoperturaPergola,
  TipoIlluminazionePergola,
  TipoOperazionePergola,
  TipoPergola,
  ZonaInstallazionePergola,
} from "@/modules/render-pergole/lib/types";

const OPERAZIONI: { value: TipoOperazionePergola; label: string; desc: string }[] = [
  { value: "add_new_pergola", label: "Aggiungi pergola", desc: "Inserisce una nuova struttura nel punto scelto." },
  { value: "replace_existing_awning_with_pergola", label: "Sostituisci tenda", desc: "Rimuove tenda/bracci/cassonetto e installa pergola." },
  { value: "replace_existing_pergola", label: "Sostituisci pergola", desc: "Elimina la struttura vecchia e installa quella nuova." },
  { value: "recolor_only", label: "Solo colore", desc: "Cambia solo finitura, senza geometria nuova." },
  { value: "change_cover_only", label: "Solo copertura", desc: "Mantiene struttura e cambia telo/vetro/lamelle." },
  { value: "add_side_closures", label: "Aggiungi chiusure", desc: "Aggiunge vetrate, ZIP o pannelli laterali." },
  { value: "change_open_state", label: "Stato apertura", desc: "Cambia solo lamelle/telo/screen." },
];

const ZONE: { value: ZonaInstallazionePergola; label: string; desc: string }[] = [
  { value: "addossata_facciata", label: "Addossata facciata", desc: "Davanti a porte-finestre o parete esterna." },
  { value: "patio_centrale", label: "Patio", desc: "Area pavimentata centrale." },
  { value: "terrazzo", label: "Terrazzo", desc: "Dentro parapetti e ringhiere." },
  { value: "bordo_piscina", label: "Bordo piscina", desc: "Zona relax vicino alla piscina." },
  { value: "giardino_relax", label: "Giardino", desc: "Area verde con appoggi credibili." },
  { value: "dining_outdoor", label: "Pranzo outdoor", desc: "Sopra tavolo o zona conviviale." },
  { value: "custom", label: "Zona specifica", desc: "Descrivi tu il punto preciso." },
];

const TIPI: { value: TipoPergola; label: string }[] = [
  { value: "bioclimatica_addossata", label: "Bioclimatica addossata" },
  { value: "bioclimatica_autoportante", label: "Bioclimatica autoportante" },
  { value: "telo_addossata", label: "Telo retraibile addossata" },
  { value: "telo_autoportante", label: "Telo retraibile autoportante" },
  { value: "vetro_addossata", label: "Vetro addossata" },
  { value: "vetro_autoportante", label: "Vetro autoportante" },
  { value: "legno_addossata", label: "Legno addossata" },
  { value: "legno_autoportante", label: "Legno autoportante" },
  { value: "addossata", label: "Pergola addossata" },
  { value: "autoportante", label: "Pergola autoportante" },
];

const MATERIALI: { value: MaterialeStrutturaPergola; label: string }[] = [
  { value: "alluminio", label: "Alluminio" },
  { value: "alluminio_effetto_legno", label: "Alluminio effetto legno" },
  { value: "legno_lamellare", label: "Legno lamellare" },
  { value: "acciaio", label: "Acciaio" },
  { value: "misto", label: "Misto" },
];

const COPERTURE: { value: TipoCoperturaPergola; label: string }[] = [
  { value: "lamelle_orientabili", label: "Lamelle orientabili" },
  { value: "telo_retraibile", label: "Telo retraibile" },
  { value: "vetro", label: "Vetro" },
  { value: "policarbonato", label: "Policarbonato" },
  { value: "listelli_legno", label: "Listelli frangisole" },
  { value: "copertura_opaca_tecnica", label: "Copertura opaca tecnica" },
];

const STATI_COPERTURA: { value: StatoCoperturaPergola; label: string }[] = [
  { value: "chiusa", label: "Chiusa" },
  { value: "semi_aperta", label: "Semi aperta" },
  { value: "aperta", label: "Aperta" },
  { value: "lamelle_15", label: "Lamelle 15°" },
  { value: "lamelle_30", label: "Lamelle 30°" },
  { value: "lamelle_45", label: "Lamelle 45°" },
  { value: "lamelle_90", label: "Lamelle 90°" },
  { value: "telo_raccolto", label: "Telo raccolto" },
  { value: "telo_disteso", label: "Telo disteso" },
];

const CHIUSURE: { value: TipoChiusuraLaterale; label: string }[] = [
  { value: "nessuna", label: "Nessuna" },
  { value: "vetrata_slide", label: "Vetrate scorrevoli" },
  { value: "screen_zip", label: "Screen ZIP" },
  { value: "tenda_tecnica", label: "Tenda tecnica" },
  { value: "frangivento", label: "Frangivento" },
  { value: "pannelli_fissi", label: "Pannelli fissi" },
  { value: "brise_soleil", label: "Brise-soleil" },
];

const STATI_CHIUSURE: { value: StatoChiusuraLaterale; label: string }[] = [
  { value: "chiuse", label: "Chiuse" },
  { value: "parzialmente_aperte", label: "Parzialmente aperte" },
  { value: "aperte", label: "Aperte" },
  { value: "raccolte", label: "Raccolte" },
];

const LUCI: { value: TipoIlluminazionePergola; label: string }[] = [
  { value: "nessuna", label: "Nessuna" },
  { value: "strip_led_perimetrale", label: "Strip LED perimetrale" },
  { value: "spot_integrati", label: "Spot integrati" },
  { value: "downlight_lineari", label: "Downlight lineari" },
  { value: "applique_coordinate", label: "Applique coordinate" },
];

interface Props {
  value: ConfigurazionePergole;
  onChange: (value: ConfigurazionePergole) => void;
  disabled?: boolean;
}

export function PergoleConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ConfigurazionePergole>(key: K, next: ConfigurazionePergole[K]) =>
    onChange({ ...value, [key]: next });

  const setInstallazione = <K extends keyof ConfigurazionePergole["installazione"]>(key: K, next: ConfigurazionePergole["installazione"][K]) =>
    onChange({ ...value, installazione: { ...(value.installazione ?? DEFAULT_PERGOLE_CONFIG.installazione), [key]: next } });

  const setStruttura = <K extends keyof ConfigurazionePergole["struttura"]>(key: K, next: ConfigurazionePergole["struttura"][K]) =>
    onChange({ ...value, struttura: { ...value.struttura, [key]: next } });

  const setCopertura = <K extends keyof ConfigurazionePergole["copertura"]>(key: K, next: ConfigurazionePergole["copertura"][K]) =>
    onChange({ ...value, copertura: { ...value.copertura, [key]: next } });

  const setChiusure = <K extends keyof ConfigurazionePergole["chiusure_laterali"]>(key: K, next: ConfigurazionePergole["chiusure_laterali"][K]) =>
    onChange({ ...value, chiusure_laterali: { ...value.chiusure_laterali, [key]: next } });

  const setArredo = <K extends keyof ConfigurazionePergole["arredo"]>(key: K, next: ConfigurazionePergole["arredo"][K]) =>
    onChange({ ...value, arredo: { ...value.arredo, [key]: next } });

  const wallMounted = value.installazione.addossata_si_no;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Label className="text-sm font-semibold">Tipo intervento</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {OPERAZIONI.map((item) => {
            const selected = value.operazione === item.value;
            return (
              <Card
                key={item.value}
                className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary border-primary bg-primary/5" : "border-slate-300 shadow-sm hover:border-primary/60 hover:shadow"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => !disabled && set("operazione", item.value)}
              >
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{item.label}</span>
                    {selected && <Badge className="text-[10px] px-1.5 py-0">Attivo</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-semibold">Pergola addossata alla facciata</Label>
            <p className="text-xs text-muted-foreground">Attacco a muro, quote porta-finestra e interferenze vengono vincolate nel prompt.</p>
          </div>
          <Switch checked={wallMounted} onCheckedChange={(checked) => setInstallazione("addossata_si_no", checked)} disabled={disabled} />
        </div>
        <Label className="text-sm font-semibold">Zona installazione</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {ZONE.map((item) => {
            const selected = value.installazione.zona === item.value;
            return (
              <Card
                key={item.value}
                className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary border-primary bg-primary/5" : "border-slate-300 shadow-sm hover:border-primary/60 hover:shadow"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => !disabled && setInstallazione("zona", item.value)}
              >
                <CardContent className="p-3 space-y-1">
                  <span className="text-xs font-semibold">{item.label}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {value.installazione.zona === "custom" && (
          <Textarea
            value={value.installazione.descrizione_zona ?? ""}
            onChange={(e) => setInstallazione("descrizione_zona", e.target.value)}
            placeholder="Descrivi la zona precisa: es. sopra il tavolo esterno, lasciando libero il passaggio a destra"
            disabled={disabled}
          />
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipologia pergola</Label>
          <Select value={value.struttura.tipo} onValueChange={(v) => setStruttura("tipo", v as TipoPergola)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Materiale struttura</Label>
          <Select value={value.struttura.materiale} onValueChange={(v) => setStruttura("materiale", v as MaterialeStrutturaPergola)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MATERIALI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Colore struttura</Label>
          <Input value={value.struttura.colore_nome} onChange={(e) => setStruttura("colore_nome", e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label>Campione colore</Label>
          <div className="flex gap-2">
            <Input type="color" value={value.struttura.colore_hex} onChange={(e) => setStruttura("colore_hex", e.target.value)} disabled={disabled} className="w-16 p-1" />
            <Input value={value.struttura.colore_hex} onChange={(e) => setStruttura("colore_hex", e.target.value)} disabled={disabled} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo copertura</Label>
          <Select value={value.copertura.tipo} onValueChange={(v) => setCopertura("tipo", v as TipoCoperturaPergola)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{COPERTURE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Stato copertura / lamelle / telo</Label>
          <Select value={value.copertura.stato} onValueChange={(v) => setCopertura("stato", v as StatoCoperturaPergola)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATI_COPERTURA.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Chiusure laterali</Label>
          <Select value={value.chiusure_laterali.tipo} onValueChange={(v) => setChiusure("tipo", v as TipoChiusuraLaterale)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CHIUSURE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Stato chiusure</Label>
          <Select value={value.chiusure_laterali.stato} onValueChange={(v) => setChiusure("stato", v as StatoChiusuraLaterale)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATI_CHIUSURE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Illuminazione integrata</Label>
          <Select value={value.illuminazione} onValueChange={(v) => set("illuminazione", v as TipoIlluminazionePergola)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{LUCI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Arredo sottostante</Label>
          <Select value={value.arredo.gestisci_arredo} onValueChange={(v) => setArredo("gestisci_arredo", v as ConfigurazionePergole["arredo"]["gestisci_arredo"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mantieni">Mantieni arredo esistente</SelectItem>
              <SelectItem value="aggiungi_minimo">Aggiungi arredo minimo</SelectItem>
              <SelectItem value="rimuovi_superfluo">Rimuovi superfluo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Ingombro larghezza</Label>
          <Select value={value.installazione.larghezza_apparente} onValueChange={(v) => setInstallazione("larghezza_apparente", v as ConfigurazionePergole["installazione"]["larghezza_apparente"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compatta">Compatta</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="ampia">Ampia</SelectItem>
              <SelectItem value="su_misura">Su misura</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Profondità</Label>
          <Select value={value.installazione.profondita_apparente} onValueChange={(v) => setInstallazione("profondita_apparente", v as ConfigurazionePergole["installazione"]["profondita_apparente"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ridotta">Ridotta</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="profonda">Profonda</SelectItem>
              <SelectItem value="su_misura">Su misura</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Montanti visibili</Label>
          <Select value={String(value.installazione.numero_montanti ?? 2)} onValueChange={(v) => setInstallazione("numero_montanti", Number(v) as 2 | 4 | 6)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 montanti</SelectItem>
              <SelectItem value="4">4 montanti</SelectItem>
              <SelectItem value="6">6 montanti</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-2">
        <Label>Note tecniche per AI</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Esempio: lascia libera la portafinestra, non invadere il bordo piscina, pergola sobria e realistica."
          disabled={disabled}
        />
      </section>
    </div>
  );
}
