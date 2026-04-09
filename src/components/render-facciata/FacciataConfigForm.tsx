import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2, Paintbrush, Layers, Thermometer, Columns,
} from "lucide-react";

import type { ConfigurazioneFacciata, TipoInterventoFacciata } from "@/modules/render-facciata/lib/types";

// ── DEFAULT ──────────────────────────────────────────────────────────────────
export const DEFAULT_FACCIATA_CONFIG: ConfigurazioneFacciata = {
  tipo_intervento: "tinteggiatura",
  intonaco: {
    attivo: true,
    colore_hex: "#F5F5DC",
    colore_ral: "1013",
    colore_nome: "Bianco perla",
    finitura: "liscio",
    zona: "tutta",
  },
  rivestimento: {
    attivo: false,
    tipo: "pietra_serena",
    zona: "piano_terra",
  },
  cappotto: {
    attivo: false,
    spessore_cm: 10,
    sistema: "eps",
    colore_finitura_hex: "#F5F5DC",
  },
  elementi: {
    cornici_finestre: { azione: "mantieni" },
    marcapiani: { azione: "mantieni" },
    davanzali: { azione: "mantieni" },
    zoccolatura: { azione: "mantieni" },
    gronde: { azione: "mantieni" },
    balconi_ringhiere: { azione: "mantieni" },
  },
  note_libere: "",
};

// ── Tipo Intervento Cards ────────────────────────────────────────────────────
const TIPO_INTERVENTO_OPTIONS: { value: TipoInterventoFacciata; label: string; desc: string }[] = [
  { value: "tinteggiatura", label: "Tinteggiatura", desc: "Solo ritinteggiatura della facciata" },
  { value: "cappotto", label: "Cappotto", desc: "Isolamento termico esterno + finitura" },
  { value: "rivestimento", label: "Rivestimento", desc: "Applicazione rivestimento in pietra/clinker" },
  { value: "misto", label: "Misto", desc: "Combinazione di intonaco e rivestimento" },
  { value: "rifacimento_totale", label: "Rifacimento totale", desc: "Intervento completo sulla facciata" },
];

const FINITURA_OPTIONS = [
  { value: "liscio", label: "Liscio" },
  { value: "graffiato_fine", label: "Graffiato fine" },
  { value: "graffiato_medio", label: "Graffiato medio" },
  { value: "rasato", label: "Rasato" },
  { value: "bucciato", label: "Bucciato" },
  { value: "strutturato_grosso", label: "Strutturato grosso" },
  { value: "rustico", label: "Rustico" },
  { value: "veneziana", label: "Veneziana" },
  { value: "bugnato", label: "Bugnato" },
];

const ZONA_INTONACO_OPTIONS = [
  { value: "tutta", label: "Tutta la facciata" },
  { value: "piano_terra", label: "Solo piano terra" },
  { value: "piani_superiori", label: "Solo piani superiori" },
  { value: "zoccolatura", label: "Solo zoccolatura" },
  { value: "fasce_orizzontali", label: "Fasce orizzontali" },
];

const RIVESTIMENTO_TIPO_OPTIONS = [
  { value: "pietra_serena", label: "Pietra Serena" },
  { value: "travertino", label: "Travertino" },
  { value: "arenaria_beige", label: "Arenaria beige" },
  { value: "luserna", label: "Luserna" },
  { value: "marmo_bianco", label: "Marmo bianco" },
  { value: "porfido", label: "Porfido" },
  { value: "splitface_grigio", label: "Splitface grigio" },
  { value: "pietra_rustica", label: "Pietra rustica" },
  { value: "cotto_rosso", label: "Cotto rosso" },
  { value: "clinker_rosso", label: "Clinker rosso" },
  { value: "clinker_grigio", label: "Clinker grigio" },
  { value: "clinker_beige", label: "Clinker beige" },
  { value: "cotto_mattone", label: "Cotto mattone" },
  { value: "laterizio_bianco", label: "Laterizio bianco" },
];

const ZONA_RIVESTIMENTO_OPTIONS = [
  { value: "tutta", label: "Tutta la facciata" },
  { value: "piano_terra", label: "Solo piano terra" },
  { value: "piani_superiori", label: "Solo piani superiori" },
  { value: "zoccolatura", label: "Solo zoccolatura" },
  { value: "cantonali", label: "Cantonali (angoli)" },
  { value: "marcapiano", label: "Marcapiano" },
];

const SPESSORE_OPTIONS = [4, 6, 8, 10, 12, 14] as const;

const SISTEMA_OPTIONS = [
  { value: "eps", label: "EPS (Polistirene)" },
  { value: "lana_roccia", label: "Lana di roccia" },
  { value: "fibra_legno", label: "Fibra di legno" },
];

// ── Props ────────────────────────────────────────────────────────────────────
interface FacciataConfigFormProps {
  config: ConfigurazioneFacciata;
  onChange: (config: ConfigurazioneFacciata) => void;
}

export function FacciataConfigForm({ config, onChange }: FacciataConfigFormProps) {
  const update = (partial: Partial<ConfigurazioneFacciata>) =>
    onChange({ ...config, ...partial });

  return (
    <div className="space-y-4">
      {/* ── Tipo intervento ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-orange-600" />
            Tipo di intervento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TIPO_INTERVENTO_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className={`cursor-pointer rounded-lg border-2 p-3 transition-all ${
                  config.tipo_intervento === opt.value
                    ? "border-orange-500 bg-orange-50"
                    : "border-muted hover:border-orange-300"
                }`}
                onClick={() => update({ tipo_intervento: opt.value })}
              >
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Intonaco ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Paintbrush className="h-4 w-4 text-orange-600" />
              Intonaco
            </CardTitle>
            <Switch
              checked={config.intonaco.attivo}
              onCheckedChange={(attivo) =>
                update({ intonaco: { ...config.intonaco, attivo } })
              }
            />
          </div>
        </CardHeader>
        {config.intonaco.attivo && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Colore (hex)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={config.intonaco.colore_hex}
                    onChange={(e) =>
                      update({ intonaco: { ...config.intonaco, colore_hex: e.target.value } })
                    }
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={config.intonaco.colore_hex}
                    onChange={(e) =>
                      update({ intonaco: { ...config.intonaco, colore_hex: e.target.value } })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Nome colore</Label>
                <Input
                  value={config.intonaco.colore_nome || ""}
                  onChange={(e) =>
                    update({ intonaco: { ...config.intonaco, colore_nome: e.target.value } })
                  }
                  placeholder="Es. Bianco perla"
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Finitura</Label>
                <Select
                  value={config.intonaco.finitura}
                  onValueChange={(v) =>
                    update({ intonaco: { ...config.intonaco, finitura: v as ConfigurazioneFacciata["intonaco"]["finitura"] } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINITURA_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Zona</Label>
                <Select
                  value={config.intonaco.zona}
                  onValueChange={(v) =>
                    update({ intonaco: { ...config.intonaco, zona: v as ConfigurazioneFacciata["intonaco"]["zona"] } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZONA_INTONACO_OPTIONS.map((z) => (
                      <SelectItem key={z.value} value={z.value} className="text-xs">
                        {z.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Rivestimento ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-orange-600" />
              Rivestimento
            </CardTitle>
            <Switch
              checked={config.rivestimento.attivo}
              onCheckedChange={(attivo) =>
                update({ rivestimento: { ...config.rivestimento, attivo } })
              }
            />
          </div>
        </CardHeader>
        {config.rivestimento.attivo && (
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Tipo materiale</Label>
              <Select
                value={config.rivestimento.tipo}
                onValueChange={(v) =>
                  update({ rivestimento: { ...config.rivestimento, tipo: v as ConfigurazioneFacciata["rivestimento"]["tipo"] } })
                }
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RIVESTIMENTO_TIPO_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Zona applicazione</Label>
              <Select
                value={config.rivestimento.zona}
                onValueChange={(v) =>
                  update({ rivestimento: { ...config.rivestimento, zona: v as ConfigurazioneFacciata["rivestimento"]["zona"] } })
                }
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONA_RIVESTIMENTO_OPTIONS.map((z) => (
                    <SelectItem key={z.value} value={z.value} className="text-xs">
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Cappotto termico ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-orange-600" />
              Cappotto termico
            </CardTitle>
            <Switch
              checked={config.cappotto.attivo}
              onCheckedChange={(attivo) =>
                update({ cappotto: { ...config.cappotto, attivo } })
              }
            />
          </div>
        </CardHeader>
        {config.cappotto.attivo && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Spessore (cm)</Label>
                <Select
                  value={String(config.cappotto.spessore_cm)}
                  onValueChange={(v) =>
                    update({ cappotto: { ...config.cappotto, spessore_cm: Number(v) as ConfigurazioneFacciata["cappotto"]["spessore_cm"] } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPESSORE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">
                        {s} cm
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sistema</Label>
                <Select
                  value={config.cappotto.sistema}
                  onValueChange={(v) =>
                    update({ cappotto: { ...config.cappotto, sistema: v as ConfigurazioneFacciata["cappotto"]["sistema"] } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SISTEMA_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Colore finitura</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={config.cappotto.colore_finitura_hex}
                  onChange={(e) =>
                    update({ cappotto: { ...config.cappotto, colore_finitura_hex: e.target.value } })
                  }
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={config.cappotto.colore_finitura_hex}
                  onChange={(e) =>
                    update({ cappotto: { ...config.cappotto, colore_finitura_hex: e.target.value } })
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Elementi architettonici ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Columns className="h-4 w-4 text-orange-600" />
            Elementi architettonici
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cornici finestre */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Cornici finestre</Label>
              <Select
                value={config.elementi.cornici_finestre.azione}
                onValueChange={(v) =>
                  update({
                    elementi: {
                      ...config.elementi,
                      cornici_finestre: { ...config.elementi.cornici_finestre, azione: v as "mantieni" | "aggiungi" | "rimuovi" },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni" className="text-xs">Mantieni</SelectItem>
                  <SelectItem value="aggiungi" className="text-xs">Aggiungi</SelectItem>
                  <SelectItem value="rimuovi" className="text-xs">Rimuovi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.elementi.cornici_finestre.azione === "aggiungi" && (
              <div className="flex items-center gap-2 ml-4">
                <Label className="text-[10px]">Colore</Label>
                <input
                  type="color"
                  value={config.elementi.cornici_finestre.colore_hex || "#FFFFFF"}
                  onChange={(e) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        cornici_finestre: { ...config.elementi.cornici_finestre, colore_hex: e.target.value },
                      },
                    })
                  }
                  className="w-6 h-6 rounded border cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Marcapiani */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Marcapiani</Label>
              <Select
                value={config.elementi.marcapiani.azione}
                onValueChange={(v) =>
                  update({
                    elementi: {
                      ...config.elementi,
                      marcapiani: { ...config.elementi.marcapiani, azione: v as "mantieni" | "aggiungi" },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni" className="text-xs">Mantieni</SelectItem>
                  <SelectItem value="aggiungi" className="text-xs">Aggiungi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.elementi.marcapiani.azione === "aggiungi" && (
              <div className="flex items-center gap-2 ml-4">
                <Label className="text-[10px]">Colore</Label>
                <input
                  type="color"
                  value={config.elementi.marcapiani.colore_hex || "#FFFFFF"}
                  onChange={(e) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        marcapiani: { ...config.elementi.marcapiani, colore_hex: e.target.value },
                      },
                    })
                  }
                  className="w-6 h-6 rounded border cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Davanzali */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Davanzali</Label>
              <Select
                value={config.elementi.davanzali.azione}
                onValueChange={(v) =>
                  update({
                    elementi: {
                      ...config.elementi,
                      davanzali: { ...config.elementi.davanzali, azione: v as "mantieni" | "sostituisci" },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni" className="text-xs">Mantieni</SelectItem>
                  <SelectItem value="sostituisci" className="text-xs">Sostituisci</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.elementi.davanzali.azione === "sostituisci" && (
              <div className="flex items-center gap-3 ml-4">
                <Select
                  value={config.elementi.davanzali.materiale || "pietra"}
                  onValueChange={(v) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        davanzali: { ...config.elementi.davanzali, materiale: v as "pietra" | "marmo" | "alluminio" },
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pietra" className="text-xs">Pietra</SelectItem>
                    <SelectItem value="marmo" className="text-xs">Marmo</SelectItem>
                    <SelectItem value="alluminio" className="text-xs">Alluminio</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="color"
                  value={config.elementi.davanzali.colore_hex || "#FFFFFF"}
                  onChange={(e) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        davanzali: { ...config.elementi.davanzali, colore_hex: e.target.value },
                      },
                    })
                  }
                  className="w-6 h-6 rounded border cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Zoccolatura */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Zoccolatura</Label>
              <Select
                value={config.elementi.zoccolatura.azione}
                onValueChange={(v) =>
                  update({
                    elementi: {
                      ...config.elementi,
                      zoccolatura: { ...config.elementi.zoccolatura, azione: v as "mantieni" | "aggiungi" },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni" className="text-xs">Mantieni</SelectItem>
                  <SelectItem value="aggiungi" className="text-xs">Aggiungi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.elementi.zoccolatura.azione === "aggiungi" && (
              <div className="flex items-center gap-3 ml-4">
                <Select
                  value={config.elementi.zoccolatura.tipo || "intonaco"}
                  onValueChange={(v) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        zoccolatura: { ...config.elementi.zoccolatura, tipo: v as "intonaco" | "pietra" | "ceramica" },
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intonaco" className="text-xs">Intonaco</SelectItem>
                    <SelectItem value="pietra" className="text-xs">Pietra</SelectItem>
                    <SelectItem value="ceramica" className="text-xs">Ceramica</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="color"
                  value={config.elementi.zoccolatura.colore_hex || "#808080"}
                  onChange={(e) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        zoccolatura: { ...config.elementi.zoccolatura, colore_hex: e.target.value },
                      },
                    })
                  }
                  className="w-6 h-6 rounded border cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Gronde */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Gronde</Label>
              <Select
                value={config.elementi.gronde.azione}
                onValueChange={(v) =>
                  update({
                    elementi: {
                      ...config.elementi,
                      gronde: { ...config.elementi.gronde, azione: v as "mantieni" | "sostituisci" },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni" className="text-xs">Mantieni</SelectItem>
                  <SelectItem value="sostituisci" className="text-xs">Sostituisci</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.elementi.gronde.azione === "sostituisci" && (
              <div className="flex items-center gap-3 ml-4">
                <Select
                  value={config.elementi.gronde.materiale || "alluminio"}
                  onValueChange={(v) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        gronde: { ...config.elementi.gronde, materiale: v as "rame" | "alluminio" | "pvc" },
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rame" className="text-xs">Rame</SelectItem>
                    <SelectItem value="alluminio" className="text-xs">Alluminio</SelectItem>
                    <SelectItem value="pvc" className="text-xs">PVC</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="color"
                  value={config.elementi.gronde.colore_hex || "#808080"}
                  onChange={(e) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        gronde: { ...config.elementi.gronde, colore_hex: e.target.value },
                      },
                    })
                  }
                  className="w-6 h-6 rounded border cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Balconi/Ringhiere */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Balconi / Ringhiere</Label>
              <Select
                value={config.elementi.balconi_ringhiere.azione}
                onValueChange={(v) =>
                  update({
                    elementi: {
                      ...config.elementi,
                      balconi_ringhiere: { ...config.elementi.balconi_ringhiere, azione: v as "mantieni" | "vernicia" },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni" className="text-xs">Mantieni</SelectItem>
                  <SelectItem value="vernicia" className="text-xs">Vernicia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.elementi.balconi_ringhiere.azione === "vernicia" && (
              <div className="flex items-center gap-2 ml-4">
                <Label className="text-[10px]">Colore</Label>
                <input
                  type="color"
                  value={config.elementi.balconi_ringhiere.colore_hex || "#000000"}
                  onChange={(e) =>
                    update({
                      elementi: {
                        ...config.elementi,
                        balconi_ringhiere: { ...config.elementi.balconi_ringhiere, colore_hex: e.target.value },
                      },
                    })
                  }
                  className="w-6 h-6 rounded border cursor-pointer"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Note libere ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Note libere</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.note_libere || ""}
            onChange={(e) => update({ note_libere: e.target.value })}
            placeholder="Es. Mantenere il colore degli infissi, aggiungere fioriere ai balconi..."
            rows={3}
            className="text-xs"
          />
        </CardContent>
      </Card>
    </div>
  );
}
