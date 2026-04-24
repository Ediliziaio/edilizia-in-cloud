import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_INTERIOR_DOOR_CONFIG } from "./defaultInteriorDoorConfig";
import type {
  ConfigurazionePortaInterna,
  InteriorDoorContext,
  InteriorDoorFinish,
  InteriorDoorFrameType,
  InteriorDoorHardwareType,
  InteriorDoorInterventionType,
  InteriorDoorLeafConfig,
  InteriorDoorType,
} from "@/modules/render-porte-interne/lib/types";

const INTERVENTI: { value: InteriorDoorInterventionType; label: string; desc: string }[] = [
  { value: "replace_existing_door", label: "Sostituisci porta", desc: "Rimuove il vecchio sistema e installa una porta completa." },
  { value: "recolor_or_restyle_only", label: "Solo finitura", desc: "Mantiene apertura e geometria, cambia look e materiale." },
  { value: "convert_to_pocket_sliding", label: "Scorrevole interno muro", desc: "Elimina lettura battente e crea passaggio a scomparsa." },
  { value: "convert_to_wall_sliding", label: "Scorrevole esterno muro", desc: "Usa parete libera e binario visibile se coerente." },
  { value: "convert_to_flush_door", label: "Rasomuro", desc: "Riduce coprifili e integra la porta nella parete." },
  { value: "add_glazing", label: "Aggiungi vetro", desc: "Aggiunge vetro, satinatura o inglesine solo se selezionate." },
  { value: "change_frame_only", label: "Solo telaio", desc: "Interviene su telaio/coprifili senza cambiare anta." },
  { value: "change_hardware_only", label: "Solo ferramenta", desc: "Cambia maniglia, cerniere o privacy lock." },
];

const TIPI: { value: InteriorDoorType; label: string }[] = [
  { value: "battente_liscia", label: "Battente liscia" },
  { value: "battente_classica", label: "Battente pantografata" },
  { value: "scorrevole_interno_muro", label: "Scorrevole interno muro" },
  { value: "scorrevole_esterno_muro", label: "Scorrevole esterno muro" },
  { value: "a_libro", label: "A libro" },
  { value: "rasomuro", label: "Rasomuro" },
  { value: "tutta_altezza", label: "Tutta altezza" },
  { value: "vetrata", label: "Vetrata" },
  { value: "doppia_anta", label: "Doppia anta" },
];

const ANTE: { value: InteriorDoorLeafConfig; label: string }[] = [
  { value: "singola", label: "Anta singola" },
  { value: "doppia_simmetrica", label: "Doppia simmetrica" },
  { value: "doppia_asimmetrica", label: "Doppia asimmetrica" },
  { value: "libro_doppia", label: "Libro doppia" },
  { value: "scorrevole_singola", label: "Scorrevole singola" },
  { value: "scorrevole_doppia", label: "Scorrevole doppia" },
];

const CONTESTI: { value: InteriorDoorContext; label: string }[] = [
  { value: "soggiorno", label: "Soggiorno" },
  { value: "corridoio", label: "Corridoio" },
  { value: "camera", label: "Camera" },
  { value: "bagno", label: "Bagno" },
  { value: "cucina", label: "Cucina" },
  { value: "disimpegno", label: "Disimpegno" },
  { value: "open_space", label: "Open space" },
];

const FINITURE: { value: InteriorDoorFinish; label: string }[] = [
  { value: "laccato_bianco", label: "Laccato bianco" },
  { value: "laccato_colorato", label: "Laccato colorato" },
  { value: "effetto_legno_chiaro", label: "Legno chiaro" },
  { value: "effetto_legno_scuro", label: "Legno scuro" },
  { value: "laminato", label: "Laminato" },
  { value: "materico", label: "Materico" },
  { value: "vetro_trasparente", label: "Vetro trasparente" },
  { value: "vetro_satinato", label: "Vetro satinato" },
  { value: "vetro_fume", label: "Vetro fume" },
];

const TELAI: { value: InteriorDoorFrameType; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "minimale", label: "Minimale" },
  { value: "rasomuro", label: "Rasomuro" },
  { value: "complanare", label: "Complanare" },
  { value: "coprifilo_classico", label: "Coprifilo classico" },
];

const HARDWARE: { value: InteriorDoorHardwareType; label: string }[] = [
  { value: "maniglia_moderna", label: "Maniglia moderna" },
  { value: "maniglia_classica", label: "Maniglia classica" },
  { value: "pomolo", label: "Pomolo" },
  { value: "serratura_privacy", label: "Privacy lock" },
  { value: "binario_visibile", label: "Binario visibile" },
  { value: "cerniere_scomparse", label: "Cerniere scomparse" },
  { value: "cerniere_visibili", label: "Cerniere visibili" },
];

interface Props {
  value: ConfigurazionePortaInterna;
  onChange: (value: ConfigurazionePortaInterna) => void;
  disabled?: boolean;
}

export function InteriorDoorConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ConfigurazionePortaInterna>(key: K, next: ConfigurazionePortaInterna[K]) =>
    onChange({ ...value, [key]: next });

  const setFrame = <K extends keyof ConfigurazionePortaInterna["frame"]>(key: K, next: ConfigurazionePortaInterna["frame"][K]) =>
    onChange({ ...value, frame: { ...value.frame, [key]: next } });

  const setGlass = <K extends keyof ConfigurazionePortaInterna["glass"]>(key: K, next: ConfigurazionePortaInterna["glass"][K]) =>
    onChange({ ...value, glass: { ...value.glass, [key]: next } });

  const setHardware = <K extends keyof ConfigurazionePortaInterna["hardware"]>(key: K, next: ConfigurazionePortaInterna["hardware"][K]) =>
    onChange({ ...value, hardware: { ...value.hardware, [key]: next } });

  const setApertura = <K extends keyof ConfigurazionePortaInterna["apertura"]>(key: K, next: ConfigurazionePortaInterna["apertura"][K]) =>
    onChange({ ...value, apertura: { ...(value.apertura ?? DEFAULT_INTERIOR_DOOR_CONFIG.apertura), [key]: next } });

  const toggleIntervento = (intervento: InteriorDoorInterventionType) => {
    const current = value.interventi ?? [];
    const next = current.includes(intervento)
      ? current.filter((item) => item !== intervento)
      : [...current, intervento];
    set("interventi", next.length ? next : ["replace_existing_door"]);
  };

  const toggleHardware = (item: InteriorDoorHardwareType) => {
    const current = value.hardware.elementi ?? [];
    setHardware("elementi", current.includes(item)
      ? current.filter((entry) => entry !== item)
      : [...current, item]);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Label className="text-sm font-semibold">Tipo intervento</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {INTERVENTI.map((item) => {
            const selected = value.interventi.includes(item.value);
            return (
              <Card
                key={item.value}
                className={`cursor-pointer transition-all ${selected ? "border-primary bg-primary/5 ring-2 ring-primary" : "hover:border-primary/40"} ${disabled ? "pointer-events-none opacity-50" : ""}`}
                onClick={() => !disabled && toggleIntervento(item.value)}
              >
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{item.label}</span>
                    {selected ? <Badge className="px-1.5 py-0 text-[10px]">Attivo</Badge> : null}
                  </div>
                  <p className="text-[10px] leading-tight text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Ambiente</Label>
          <Select value={value.context} onValueChange={(next) => set("context", next as InteriorDoorContext)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CONTESTI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Vano target</Label>
          <Select value={value.apertura.vano_target} onValueChange={(next) => setApertura("vano_target", next as ConfigurazionePortaInterna["apertura"]["vano_target"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="porta_principale">Porta principale</SelectItem>
              <SelectItem value="porta_sinistra">Porta sinistra</SelectItem>
              <SelectItem value="porta_destra">Porta destra</SelectItem>
              <SelectItem value="porta_centrale">Porta centrale</SelectItem>
              <SelectItem value="passaggio_specifico">Passaggio specifico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipologia porta</Label>
          <Select value={value.door_type} onValueChange={(next) => set("door_type", next as InteriorDoorType)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Configurazione anta</Label>
          <Select value={value.leaf_config} onValueChange={(next) => set("leaf_config", next as InteriorDoorLeafConfig)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ANTE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Finitura</Label>
          <Select value={value.finish} onValueChange={(next) => set("finish", next as InteriorDoorFinish)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FINITURE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Colore / look</Label>
          <Input value={value.colore} onChange={(event) => set("colore", event.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label>Stile</Label>
          <Select value={value.stile} onValueChange={(next) => set("stile", next as ConfigurazionePortaInterna["stile"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="moderno">Moderno</SelectItem>
              <SelectItem value="classico">Classico</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="contemporaneo">Contemporaneo</SelectItem>
              <SelectItem value="neutro">Neutro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Telaio</Label>
          <Select value={value.frame.tipo} onValueChange={(next) => setFrame("tipo", next as InteriorDoorFrameType)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TELAI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Coprifili</Label>
          <Select value={value.frame.coprifilo ?? "standard"} onValueChange={(next) => setFrame("coprifilo", next as ConfigurazionePortaInterna["frame"]["coprifilo"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="assente">Assenti</SelectItem>
              <SelectItem value="minimale">Minimali</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="classico">Classici</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Colore telaio</Label>
          <Input value={value.frame.colore ?? ""} onChange={(event) => setFrame("colore", event.target.value)} disabled={disabled} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold">Vetro nella porta</Label>
              <p className="text-xs text-muted-foreground">Gestisce trasparenza, satinatura, privacy e telai coerenti.</p>
            </div>
            <Switch checked={value.glass.enabled} onCheckedChange={(checked) => setGlass("enabled", checked)} disabled={disabled} />
          </div>
          {value.glass.enabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select value={value.glass.type ?? "satinato"} onValueChange={(next) => setGlass("type", next as ConfigurazionePortaInterna["glass"]["type"])} disabled={disabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trasparente">Trasparente</SelectItem>
                  <SelectItem value="satinato">Satinato</SelectItem>
                  <SelectItem value="fume">Fume</SelectItem>
                  <SelectItem value="inglesine">Inglesine</SelectItem>
                  <SelectItem value="parziale">Parziale</SelectItem>
                </SelectContent>
              </Select>
              <Select value={value.glass.privacy_level ?? "medio"} onValueChange={(next) => setGlass("privacy_level", next as ConfigurazionePortaInterna["glass"]["privacy_level"])} disabled={disabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basso">Privacy bassa</SelectItem>
                  <SelectItem value="medio">Privacy media</SelectItem>
                  <SelectItem value="alto">Privacy alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border p-3">
          <Label className="text-sm font-semibold">Maniglie e ferramenta</Label>
          <div className="mt-3 flex flex-wrap gap-2">
            {HARDWARE.map((item) => {
              const selected = value.hardware.elementi.includes(item.value);
              return (
                <Badge
                  key={item.value}
                  variant={selected ? "default" : "outline"}
                  className={`cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}
                  onClick={() => !disabled && toggleHardware(item.value)}
                >
                  {item.label}
                </Badge>
              );
            })}
          </div>
          <div className="mt-3">
            <Select value={value.hardware.finitura} onValueChange={(next) => setHardware("finitura", next as ConfigurazionePortaInterna["hardware"]["finitura"])} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cromo">Cromo</SelectItem>
                <SelectItem value="nero_opaco">Nero opaco</SelectItem>
                <SelectItem value="ottone">Ottone</SelectItem>
                <SelectItem value="bronzo">Bronzo</SelectItem>
                <SelectItem value="acciaio">Acciaio</SelectItem>
                <SelectItem value="bianco">Bianco</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Altezza</Label>
          <Select value={value.height} onValueChange={(next) => set("height", next as ConfigurazionePortaInterna["height"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="tutta_altezza">Tutta altezza</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Spazio parete per scorrevole</Label>
          <Select value={value.apertura.spazio_scorrimento_parete} onValueChange={(next) => setApertura("spazio_scorrimento_parete", next as ConfigurazionePortaInterna["apertura"]["spazio_scorrimento_parete"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="assente">Assente</SelectItem>
              <SelectItem value="ridotto">Ridotto</SelectItem>
              <SelectItem value="sufficiente">Sufficiente</SelectItem>
              <SelectItem value="ampio">Ampio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Direzione apertura</Label>
          <Select value={value.opening_direction ?? "non_visibile"} onValueChange={(next) => set("opening_direction", next as ConfigurazionePortaInterna["opening_direction"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="verso_sinistra">Verso sinistra</SelectItem>
              <SelectItem value="verso_destra">Verso destra</SelectItem>
              <SelectItem value="scorrevole_sx">Scorrevole sx</SelectItem>
              <SelectItem value="scorrevole_dx">Scorrevole dx</SelectItem>
              <SelectItem value="non_visibile">Non visibile</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Rapporto con parete, pavimento e zoccolino</Label>
          <Textarea
            value={`${value.apertura.rapporto_con_parete}\n${value.apertura.rapporto_con_zoccolino}\n${value.apertura.rapporto_con_soffitto}`}
            onChange={(event) => {
              const [wall = "", skirting = "", ceiling = ""] = event.target.value.split("\n");
              onChange({
                ...value,
                apertura: {
                  ...value.apertura,
                  rapporto_con_parete: wall,
                  rapporto_con_zoccolino: skirting,
                  rapporto_con_soffitto: ceiling,
                },
              });
            }}
            disabled={disabled}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <Label>Note tecniche aggiuntive</Label>
          <Textarea
            value={value.note_libere ?? ""}
            onChange={(event) => set("note_libere", event.target.value)}
            placeholder="Es. mantenere interruttore a destra, non coprire quadro, preservare vista nella stanza adiacente"
            disabled={disabled}
            rows={4}
          />
        </div>
      </section>
    </div>
  );
}
