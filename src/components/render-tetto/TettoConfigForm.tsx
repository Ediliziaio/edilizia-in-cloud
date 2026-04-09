import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  ConfigurazioneTetto,
  TipoManto,
  FinituraMantoTetto,
  MaterialeGrondaia,
  TipoLucernario,
} from "@/modules/render-tetto/lib/types";

// ── Roof type dictionary ─────────────────────────────────────────────────────
interface MantoOption {
  value: TipoManto;
  label: string;
  desc: string;
  defaultColor: string;
}

const MANTI: MantoOption[] = [
  { value: "tegole_coppi", label: "Coppi", desc: "Tegole tradizionali a coppo", defaultColor: "#b5651d" },
  { value: "tegole_marsigliesi", label: "Marsigliesi", desc: "Tegole con nervatura centrale", defaultColor: "#a0522d" },
  { value: "tegole_portoghesi", label: "Portoghesi", desc: "Profilo a S ondulato", defaultColor: "#8b4513" },
  { value: "tegole_piane", label: "Piane", desc: "Tegole piatte moderne", defaultColor: "#696969" },
  { value: "ardesia_naturale", label: "Ardesia naturale", desc: "Lastre di pietra naturale", defaultColor: "#2f4f4f" },
  { value: "ardesia_sintetica", label: "Ardesia sintetica", desc: "Fibrocemento effetto ardesia", defaultColor: "#3c3c3c" },
  { value: "lamiera_grecata", label: "Lamiera grecata", desc: "Profilo trapezoidale in metallo", defaultColor: "#708090" },
  { value: "lamiera_aggraffata", label: "Aggraffatura", desc: "Giunti verticali a standing seam", defaultColor: "#505050" },
  { value: "lamiera_zinco_titanio", label: "Zinco-titanio", desc: "Lega zinco con patina naturale", defaultColor: "#7a8b8b" },
  { value: "guaina_bituminosa", label: "Guaina bituminosa", desc: "Membrana impermeabile granigliata", defaultColor: "#3b3b3b" },
  { value: "guaina_tpo", label: "Guaina TPO", desc: "Membrana termoplastica bianca", defaultColor: "#e8e8e8" },
  { value: "tegole_fotovoltaiche", label: "Tegole solari", desc: "Tegole con celle fotovoltaiche", defaultColor: "#1a1a2e" },
];

const FINITURE: { value: FinituraMantoTetto; label: string }[] = [
  { value: "opaco", label: "Opaco" },
  { value: "semi_lucido", label: "Semi-lucido" },
  { value: "lucido", label: "Lucido" },
];

const MATERIALI_GRONDAIA: { value: MaterialeGrondaia; label: string }[] = [
  { value: "alluminio", label: "Alluminio" },
  { value: "rame", label: "Rame" },
  { value: "acciaio_zincato", label: "Acciaio zincato" },
  { value: "pvc", label: "PVC" },
  { value: "zinco_titanio", label: "Zinco-titanio" },
];

const TIPI_LUCERNARIO: { value: TipoLucernario; label: string }[] = [
  { value: "piatto", label: "Piatto (Velux)" },
  { value: "sporgente", label: "Sporgente (cupola)" },
  { value: "abbaino", label: "Abbaino" },
];

// ── Default config ────────────────────────────────────────────────────────────
export const DEFAULT_TETTO_CONFIG: ConfigurazioneTetto = {
  manto: {
    tipo: "tegole_coppi",
    colore_hex: "#b5651d",
    colore_nome: "Terracotta classico",
    finitura: "opaco",
  },
  grondaie: {
    attivo: false,
    materiale: "alluminio",
    colore_hex: "#8b4513",
  },
  lucernari: {
    attivo: false,
    azione: "mantieni",
  },
  pannelli_solari: {
    attivo: false,
    tipo: "fotovoltaico_nero",
    quantita: "medi",
    posizione: "falda_principale",
  },
  note_libere: "",
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  value: ConfigurazioneTetto;
  onChange: (v: ConfigurazioneTetto) => void;
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TettoConfigForm({ value, onChange, disabled }: Props) {
  const setManto = <K extends keyof typeof value.manto>(key: K, val: (typeof value.manto)[K]) =>
    onChange({ ...value, manto: { ...value.manto, [key]: val } });

  const setGrondaie = <K extends keyof typeof value.grondaie>(key: K, val: (typeof value.grondaie)[K]) =>
    onChange({ ...value, grondaie: { ...value.grondaie, [key]: val } });

  const setLucernari = <K extends keyof typeof value.lucernari>(key: K, val: (typeof value.lucernari)[K]) =>
    onChange({ ...value, lucernari: { ...value.lucernari, [key]: val } });

  const setPannelli = <K extends keyof NonNullable<typeof value.pannelli_solari>>(key: K, val: NonNullable<typeof value.pannelli_solari>[K]) =>
    onChange({
      ...value,
      pannelli_solari: { ...(value.pannelli_solari ?? DEFAULT_TETTO_CONFIG.pannelli_solari!), [key]: val },
    });

  const handleMantoSelect = (tipo: TipoManto) => {
    const opt = MANTI.find(m => m.value === tipo);
    onChange({
      ...value,
      manto: {
        ...value.manto,
        tipo,
        colore_hex: opt?.defaultColor ?? value.manto.colore_hex,
        colore_nome: opt?.label ?? value.manto.colore_nome,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Tipo manto (card grid) ──────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Tipo copertura *</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MANTI.map(m => {
            const selected = value.manto.tipo === m.value;
            return (
              <Card
                key={m.value}
                className={`cursor-pointer transition-all ${
                  selected
                    ? "ring-2 ring-primary border-primary"
                    : "hover:border-primary/40"
                } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => !disabled && handleMantoSelect(m.value)}
              >
                <CardContent className="p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full border"
                      style={{ backgroundColor: m.defaultColor }}
                    />
                    <span className="text-xs font-semibold truncate">{m.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{m.desc}</p>
                  {selected && (
                    <Badge variant="default" className="text-[10px] w-fit mt-0.5 px-1.5 py-0">
                      Selezionato
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Colore + finitura ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Colore manto</Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={value.manto.colore_hex}
              onChange={e => setManto("colore_hex", e.target.value)}
              disabled={disabled}
              className="w-10 h-10 p-1 cursor-pointer"
            />
            <Input
              value={value.manto.colore_hex}
              onChange={e => setManto("colore_hex", e.target.value)}
              disabled={disabled}
              className="flex-1"
              placeholder="#b5651d"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Finitura</Label>
          <Select value={value.manto.finitura} onValueChange={v => setManto("finitura", v as FinituraMantoTetto)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FINITURE.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Grondaie ────────────────────────────────────────────────────── */}
      <div className="space-y-3 border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Grondaie e pluviali</Label>
          <Switch
            checked={value.grondaie.attivo}
            onCheckedChange={v => setGrondaie("attivo", v)}
            disabled={disabled}
          />
        </div>
        {value.grondaie.attivo && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Materiale</Label>
              <Select value={value.grondaie.materiale} onValueChange={v => setGrondaie("materiale", v as MaterialeGrondaia)} disabled={disabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIALI_GRONDAIA.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Colore grondaia</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={value.grondaie.colore_hex}
                  onChange={e => setGrondaie("colore_hex", e.target.value)}
                  disabled={disabled}
                  className="w-8 h-8 p-0.5 cursor-pointer"
                />
                <Input
                  value={value.grondaie.colore_hex}
                  onChange={e => setGrondaie("colore_hex", e.target.value)}
                  disabled={disabled}
                  className="flex-1 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Lucernari ───────────────────────────────────────────────────── */}
      <div className="space-y-3 border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Lucernari</Label>
          <Switch
            checked={value.lucernari.attivo}
            onCheckedChange={v => setLucernari("attivo", v)}
            disabled={disabled}
          />
        </div>
        {value.lucernari.attivo && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Azione</Label>
                <Select value={value.lucernari.azione} onValueChange={v => setLucernari("azione", v as "mantieni" | "aggiungi" | "rimuovi")} disabled={disabled}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mantieni">Mantieni esistenti</SelectItem>
                    <SelectItem value="aggiungi">Aggiungi nuovi</SelectItem>
                    <SelectItem value="rimuovi">Rimuovi tutti</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {value.lucernari.azione === "aggiungi" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={value.lucernari.tipo ?? "piatto"} onValueChange={v => setLucernari("tipo", v as TipoLucernario)} disabled={disabled}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPI_LUCERNARIO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {value.lucernari.azione === "aggiungi" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantita</Label>
                  <Select
                    value={String(value.lucernari.quantita ?? 1)}
                    onValueChange={v => setLucernari("quantita", parseInt(v) as 1 | 2 | 3 | 4)}
                    disabled={disabled}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Posizione</Label>
                  <Select
                    value={value.lucernari.posizione ?? "centrale"}
                    onValueChange={v => setLucernari("posizione", v as "centrale" | "laterale_sx" | "laterale_dx" | "distribuiti")}
                    disabled={disabled}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="centrale">Centrale</SelectItem>
                      <SelectItem value="laterale_sx">Laterale SX</SelectItem>
                      <SelectItem value="laterale_dx">Laterale DX</SelectItem>
                      <SelectItem value="distribuiti">Distribuiti</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Pannelli solari ─────────────────────────────────────────────── */}
      <div className="space-y-3 border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Pannelli solari</Label>
          <Switch
            checked={value.pannelli_solari?.attivo ?? false}
            onCheckedChange={v => setPannelli("attivo", v)}
            disabled={disabled}
          />
        </div>
        {value.pannelli_solari?.attivo && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo pannello</Label>
                <Select
                  value={value.pannelli_solari.tipo ?? "fotovoltaico_nero"}
                  onValueChange={v => setPannelli("tipo", v as "fotovoltaico_nero" | "fotovoltaico_blu" | "tegola_solare_integrata")}
                  disabled={disabled}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fotovoltaico_nero">Fotovoltaico nero</SelectItem>
                    <SelectItem value="fotovoltaico_blu">Fotovoltaico blu</SelectItem>
                    <SelectItem value="tegola_solare_integrata">Tegola solare integrata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantita</Label>
                <Select
                  value={value.pannelli_solari.quantita ?? "medi"}
                  onValueChange={v => setPannelli("quantita", v as "pochi" | "medi" | "tanti")}
                  disabled={disabled}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pochi">Pochi (20%)</SelectItem>
                    <SelectItem value="medi">Medi (40-50%)</SelectItem>
                    <SelectItem value="tanti">Tanti (70-90%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Posizione</Label>
              <Select
                value={value.pannelli_solari.posizione ?? "falda_principale"}
                onValueChange={v => setPannelli("posizione", v as "falda_sud" | "falda_principale" | "distribuiti")}
                disabled={disabled}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="falda_sud">Falda sud</SelectItem>
                  <SelectItem value="falda_principale">Falda principale</SelectItem>
                  <SelectItem value="distribuiti">Distribuiti</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ── Note libere ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={e => onChange({ ...value, note_libere: e.target.value })}
          placeholder="Specifiche aggiuntive (es. mantieni antenna TV, aggiungi parafulmini...)"
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
