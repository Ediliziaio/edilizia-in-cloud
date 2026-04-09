import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import type {
  ConfigurazioneBagno,
  TipoIntervento,
} from "@/modules/render-bagno/lib/types";

// Re-export type as BathroomConfig alias
export type BathroomConfig = ConfigurazioneBagno;

// ── Default config ──────────────────────────────────────────────────
export const DEFAULT_BATHROOM_CONFIG: BathroomConfig = {
  tipo_intervento: "restyling_completo",
  sostituzione: {
    piastrelle_parete: true,
    pavimento: true,
    doccia: false,
    vasca: false,
    mobile_bagno: false,
    sanitari: false,
    rubinetteria: false,
    parete_colore: false,
    illuminazione: false,
  },
  piastrelle_parete: {
    attivo: true,
    effetto: "marmo_carrara",
    formato: "60x120",
    posa: "sfalsata",
    fuga_colore: "grigio chiaro",
    altezza_rivestimento: "fino al soffitto",
  },
  pavimento: {
    attivo: true,
    effetto: "cemento_grigio",
    formato: "60x60",
    posa: "dritta",
    fuga_colore: "grigio",
  },
  doccia: {
    attivo: false,
    tipo: "walk_in",
    box_vetro: "trasparente",
    piatto: "filo_pavimento",
    profilo: "nero_opaco",
    soffione: "pioggia_soffitto",
  },
  vasca: {
    attivo: false,
    tipo: "freestanding_ovale",
    materiale: "acrilico_bianco",
    rubinetteria_vasca: "a_pavimento",
  },
  vanity: {
    attivo: false,
    stile: "sospeso_moderno",
    colore: "bianco opaco",
    piano: "marmo_bianco",
    lavabo: "integrato",
    larghezza_cm: 100,
  },
  sanitari: {
    attivo: false,
    azione_wc: "sostituisci",
    tipo_wc: "rimless_sospeso",
    azione_bidet: "sostituisci",
    tipo_bidet: "sospeso",
    colore: "bianco",
  },
  rubinetteria: {
    attivo: false,
    finitura: "nero_opaco",
    stile: "quadro_moderno",
  },
  parete: {
    attivo: false,
    azione: "tinta_unita",
    colore_hex: "#F5F5F0",
  },
  illuminazione_tipo: "",
  note_libere: "",
};

// ── Intervention cards ──────────────────────────────────────────────
const INTERVENTO_OPTIONS: { value: TipoIntervento; label: string; desc: string }[] = [
  { value: "restyling_piastrelle", label: "Restyling piastrelle", desc: "Solo cambio piastrelle" },
  { value: "restyling_completo", label: "Restyling completo", desc: "Piastrelle + arredi + sanitari" },
  { value: "demolizione_parziale", label: "Demolizione parziale", desc: "Modifiche strutturali parziali" },
  { value: "demolizione_completa", label: "Demolizione completa", desc: "Rifacimento totale del bagno" },
];

const TILE_EFFECTS = [
  { value: "marmo_carrara", label: "Marmo Carrara" },
  { value: "marmo_calacatta", label: "Marmo Calacatta" },
  { value: "marmo_sahara_noir", label: "Marmo Sahara Noir" },
  { value: "marmo_marquinia", label: "Marmo Marquinia" },
  { value: "marmo_verde_guatemala", label: "Marmo Verde Guatemala" },
  { value: "marmo_statuario", label: "Marmo Statuario" },
  { value: "marmo_emperador", label: "Marmo Emperador" },
  { value: "cemento_grigio", label: "Cemento grigio" },
  { value: "cemento_bianco", label: "Cemento bianco" },
  { value: "cemento_antracite", label: "Cemento antracite" },
  { value: "legno_rovere_chiaro", label: "Legno rovere chiaro" },
  { value: "legno_rovere_scuro", label: "Legno rovere scuro" },
  { value: "legno_wenge", label: "Legno wenge" },
  { value: "ardesia", label: "Ardesia" },
  { value: "travertino", label: "Travertino" },
  { value: "basalto", label: "Basalto" },
  { value: "mono_bianco", label: "Bianco monocromo" },
  { value: "mono_nero", label: "Nero monocromo" },
  { value: "mono_grigio", label: "Grigio monocromo" },
  { value: "mono_verde_salvia", label: "Verde salvia" },
  { value: "mono_blu_navy", label: "Blu navy" },
  { value: "mono_terracotta", label: "Terracotta" },
  { value: "mono_greige", label: "Greige" },
  { value: "mosaico_esagoni", label: "Mosaico esagoni" },
  { value: "mosaico_penny", label: "Mosaico penny" },
  { value: "zellige", label: "Zellige" },
  { value: "cotto_toscano", label: "Cotto toscano" },
  { value: "resina_spatolata", label: "Resina spatolata" },
  { value: "pietra_ardesia", label: "Pietra ardesia" },
];

const TILE_FORMATS = [
  { value: "30x30", label: "30x30 cm" },
  { value: "30x60", label: "30x60 cm" },
  { value: "60x60", label: "60x60 cm" },
  { value: "60x120", label: "60x120 cm" },
  { value: "80x80", label: "80x80 cm" },
  { value: "120x120", label: "120x120 cm" },
  { value: "120x240", label: "120x240 cm (lastra)" },
  { value: "15x90", label: "15x90 cm (listoncino)" },
  { value: "20x120", label: "20x120 cm (listoncino)" },
];

const POSA_OPTIONS = [
  { value: "dritta", label: "Dritta (griglia)" },
  { value: "sfalsata", label: "Sfalsata (mattone)" },
  { value: "diagonale", label: "Diagonale 45°" },
  { value: "spina_pesce", label: "Spina di pesce" },
  { value: "spina_ungherese", label: "Spina ungherese" },
  { value: "chevron", label: "Chevron" },
  { value: "casuale", label: "Casuale / mista" },
];

interface Props {
  value: BathroomConfig;
  onChange: (config: BathroomConfig) => void;
}

export function BathroomConfigForm({ value, onChange }: Props) {
  const update = (partial: Partial<BathroomConfig>) =>
    onChange({ ...value, ...partial });

  return (
    <div className="space-y-4">
      {/* ── Tipo intervento ──────────────────────────────────────── */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">Tipo intervento</Label>
        <div className="grid grid-cols-2 gap-2">
          {INTERVENTO_OPTIONS.map((opt) => (
            <Card
              key={opt.value}
              className={`cursor-pointer transition-all ${
                value.tipo_intervento === opt.value
                  ? "border-primary ring-1 ring-primary bg-primary/5"
                  : "hover:border-primary/30"
              }`}
              onClick={() => update({ tipo_intervento: opt.value })}
            >
              <CardContent className="p-3">
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["piastrelle_parete", "pavimento"]} className="space-y-1">
        {/* ── Piastrelle parete ─────────────────────────────────── */}
        <AccordionItem value="piastrelle_parete" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.piastrelle_parete}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, piastrelle_parete: v },
                    piastrelle_parete: { ...value.piastrelle_parete, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Piastrelle parete</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Effetto</Label>
              <Select
                value={value.piastrelle_parete.effetto}
                onValueChange={(v) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, effetto: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TILE_EFFECTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formato</Label>
              <Select
                value={value.piastrelle_parete.formato}
                onValueChange={(v) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, formato: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TILE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Posa</Label>
              <Select
                value={value.piastrelle_parete.posa}
                onValueChange={(v) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, posa: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSA_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Colore fuga</Label>
              <Input
                value={value.piastrelle_parete.fuga_colore}
                onChange={(e) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, fuga_colore: e.target.value } })
                }
                placeholder="es. grigio chiaro"
              />
            </div>
            <div>
              <Label className="text-xs">Altezza rivestimento</Label>
              <Select
                value={value.piastrelle_parete.altezza_rivestimento || "fino al soffitto"}
                onValueChange={(v) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, altezza_rivestimento: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="120cm">120 cm</SelectItem>
                  <SelectItem value="150cm">150 cm</SelectItem>
                  <SelectItem value="200cm">200 cm</SelectItem>
                  <SelectItem value="fino al soffitto">Fino al soffitto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Pavimento ─────────────────────────────────────────── */}
        <AccordionItem value="pavimento" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.pavimento}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, pavimento: v },
                    pavimento: { ...value.pavimento, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Pavimento</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Effetto</Label>
              <Select
                value={value.pavimento.effetto}
                onValueChange={(v) =>
                  update({ pavimento: { ...value.pavimento, effetto: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TILE_EFFECTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formato</Label>
              <Select
                value={value.pavimento.formato}
                onValueChange={(v) =>
                  update({ pavimento: { ...value.pavimento, formato: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TILE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Posa</Label>
              <Select
                value={value.pavimento.posa}
                onValueChange={(v) =>
                  update({ pavimento: { ...value.pavimento, posa: v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSA_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Colore fuga</Label>
              <Input
                value={value.pavimento.fuga_colore}
                onChange={(e) =>
                  update({ pavimento: { ...value.pavimento, fuga_colore: e.target.value } })
                }
                placeholder="es. grigio"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Doccia ────────────────────────────────────────────── */}
        <AccordionItem value="doccia" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.doccia}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, doccia: v },
                    doccia: { ...value.doccia, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Doccia</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={value.doccia.tipo}
                onValueChange={(v) =>
                  update({ doccia: { ...value.doccia, tipo: v as BathroomConfig["doccia"]["tipo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="nicchia_box">Box nicchia</SelectItem>
                  <SelectItem value="angolare">Angolare</SelectItem>
                  <SelectItem value="semicircolare">Semicircolare</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Vetro box</Label>
              <Select
                value={value.doccia.box_vetro}
                onValueChange={(v) =>
                  update({ doccia: { ...value.doccia, box_vetro: v as BathroomConfig["doccia"]["box_vetro"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trasparente">Trasparente</SelectItem>
                  <SelectItem value="satinato">Satinato</SelectItem>
                  <SelectItem value="fume">Fume</SelectItem>
                  <SelectItem value="serigrafato">Serigrafato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Piatto doccia</Label>
              <Select
                value={value.doccia.piatto}
                onValueChange={(v) =>
                  update({ doccia: { ...value.doccia, piatto: v as BathroomConfig["doccia"]["piatto"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="filo_pavimento">Filo pavimento</SelectItem>
                  <SelectItem value="rialzato_3cm">Rialzato 3cm</SelectItem>
                  <SelectItem value="rialzato_5cm">Rialzato 5cm</SelectItem>
                  <SelectItem value="pietra">Pietra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Profilo</Label>
              <Select
                value={value.doccia.profilo}
                onValueChange={(v) =>
                  update({ doccia: { ...value.doccia, profilo: v as BathroomConfig["doccia"]["profilo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cromato">Cromato</SelectItem>
                  <SelectItem value="nero_opaco">Nero opaco</SelectItem>
                  <SelectItem value="oro_spazzolato">Oro spazzolato</SelectItem>
                  <SelectItem value="senza_profilo">Senza profilo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Soffione</Label>
              <Select
                value={value.doccia.soffione}
                onValueChange={(v) =>
                  update({ doccia: { ...value.doccia, soffione: v as BathroomConfig["doccia"]["soffione"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_parete">A parete</SelectItem>
                  <SelectItem value="pioggia_soffitto">Pioggia soffitto</SelectItem>
                  <SelectItem value="colonna_completa">Colonna completa</SelectItem>
                  <SelectItem value="combinato">Combinato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Vasca ─────────────────────────────────────────────── */}
        <AccordionItem value="vasca" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.vasca}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, vasca: v },
                    vasca: { ...value.vasca, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Vasca</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={value.vasca.tipo}
                onValueChange={(v) =>
                  update({ vasca: { ...value.vasca, tipo: v as BathroomConfig["vasca"]["tipo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="freestanding_ovale">Freestanding ovale</SelectItem>
                  <SelectItem value="freestanding_rettangolare">Freestanding rettangolare</SelectItem>
                  <SelectItem value="incassata">Incassata</SelectItem>
                  <SelectItem value="angolare">Angolare</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Materiale</Label>
              <Select
                value={value.vasca.materiale}
                onValueChange={(v) =>
                  update({ vasca: { ...value.vasca, materiale: v as BathroomConfig["vasca"]["materiale"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acrilico_bianco">Acrilico bianco</SelectItem>
                  <SelectItem value="solid_surface">Solid surface</SelectItem>
                  <SelectItem value="ghisa_smaltata">Ghisa smaltata</SelectItem>
                  <SelectItem value="pietra">Pietra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rubinetteria vasca</Label>
              <Select
                value={value.vasca.rubinetteria_vasca}
                onValueChange={(v) =>
                  update({ vasca: { ...value.vasca, rubinetteria_vasca: v as BathroomConfig["vasca"]["rubinetteria_vasca"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_parete">A parete</SelectItem>
                  <SelectItem value="a_pavimento">A pavimento</SelectItem>
                  <SelectItem value="bordo_vasca">Bordo vasca</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Mobile bagno ──────────────────────────────────────── */}
        <AccordionItem value="mobile_bagno" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.mobile_bagno}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, mobile_bagno: v },
                    vanity: { ...value.vanity, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Mobile bagno</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Stile</Label>
              <Select
                value={value.vanity.stile}
                onValueChange={(v) =>
                  update({ vanity: { ...value.vanity, stile: v as BathroomConfig["vanity"]["stile"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sospeso_moderno">Sospeso moderno</SelectItem>
                  <SelectItem value="sospeso_minimal">Sospeso minimal</SelectItem>
                  <SelectItem value="a_terra_classico">A terra classico</SelectItem>
                  <SelectItem value="a_terra_industrial">A terra industrial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Colore mobile</Label>
              <Input
                value={value.vanity.colore}
                onChange={(e) =>
                  update({ vanity: { ...value.vanity, colore: e.target.value } })
                }
                placeholder="es. bianco opaco, rovere naturale"
              />
            </div>
            <div>
              <Label className="text-xs">Piano</Label>
              <Select
                value={value.vanity.piano}
                onValueChange={(v) =>
                  update({ vanity: { ...value.vanity, piano: v as BathroomConfig["vanity"]["piano"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marmo_bianco">Marmo bianco</SelectItem>
                  <SelectItem value="marmo_nero">Marmo nero</SelectItem>
                  <SelectItem value="quarzo">Quarzo</SelectItem>
                  <SelectItem value="legno">Legno</SelectItem>
                  <SelectItem value="ceramica">Ceramica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Lavabo</Label>
              <Select
                value={value.vanity.lavabo}
                onValueChange={(v) =>
                  update({ vanity: { ...value.vanity, lavabo: v as BathroomConfig["vanity"]["lavabo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="integrato">Integrato</SelectItem>
                  <SelectItem value="appoggio_ovale">Appoggio ovale</SelectItem>
                  <SelectItem value="appoggio_rettangolare">Appoggio rettangolare</SelectItem>
                  <SelectItem value="semincasso">Semincasso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Larghezza (cm)</Label>
              <Select
                value={String(value.vanity.larghezza_cm)}
                onValueChange={(v) =>
                  update({ vanity: { ...value.vanity, larghezza_cm: Number(v) as BathroomConfig["vanity"]["larghezza_cm"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60 cm</SelectItem>
                  <SelectItem value="80">80 cm</SelectItem>
                  <SelectItem value="100">100 cm</SelectItem>
                  <SelectItem value="120">120 cm</SelectItem>
                  <SelectItem value="140">140 cm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Sanitari ──────────────────────────────────────────── */}
        <AccordionItem value="sanitari" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.sanitari}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, sanitari: v },
                    sanitari: { ...value.sanitari, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Sanitari</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">WC</Label>
              <Select
                value={value.sanitari.azione_wc}
                onValueChange={(v) =>
                  update({ sanitari: { ...value.sanitari, azione_wc: v as BathroomConfig["sanitari"]["azione_wc"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni">Mantieni attuale</SelectItem>
                  <SelectItem value="sostituisci">Sostituisci</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.sanitari.azione_wc === "sostituisci" && (
              <div>
                <Label className="text-xs">Tipo WC</Label>
                <Select
                  value={value.sanitari.tipo_wc}
                  onValueChange={(v) =>
                    update({ sanitari: { ...value.sanitari, tipo_wc: v as BathroomConfig["sanitari"]["tipo_wc"] } })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sospeso">Sospeso</SelectItem>
                    <SelectItem value="a_terra">A terra</SelectItem>
                    <SelectItem value="rimless_sospeso">Rimless sospeso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Bidet</Label>
              <Select
                value={value.sanitari.azione_bidet}
                onValueChange={(v) =>
                  update({ sanitari: { ...value.sanitari, azione_bidet: v as BathroomConfig["sanitari"]["azione_bidet"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni">Mantieni attuale</SelectItem>
                  <SelectItem value="sostituisci">Sostituisci</SelectItem>
                  <SelectItem value="rimuovi">Rimuovi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.sanitari.azione_bidet === "sostituisci" && (
              <div>
                <Label className="text-xs">Tipo bidet</Label>
                <Select
                  value={value.sanitari.tipo_bidet || "sospeso"}
                  onValueChange={(v) =>
                    update({ sanitari: { ...value.sanitari, tipo_bidet: v as "sospeso" | "a_terra" } })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sospeso">Sospeso</SelectItem>
                    <SelectItem value="a_terra">A terra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Colore sanitari</Label>
              <Select
                value={value.sanitari.colore}
                onValueChange={(v) =>
                  update({ sanitari: { ...value.sanitari, colore: v as BathroomConfig["sanitari"]["colore"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bianco">Bianco</SelectItem>
                  <SelectItem value="grigio_chiaro">Grigio chiaro</SelectItem>
                  <SelectItem value="nero_opaco">Nero opaco</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Rubinetteria ──────────────────────────────────────── */}
        <AccordionItem value="rubinetteria" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.rubinetteria}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, rubinetteria: v },
                    rubinetteria: { ...value.rubinetteria, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Rubinetteria</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Finitura</Label>
              <Select
                value={value.rubinetteria.finitura}
                onValueChange={(v) =>
                  update({ rubinetteria: { ...value.rubinetteria, finitura: v as BathroomConfig["rubinetteria"]["finitura"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cromo">Cromo</SelectItem>
                  <SelectItem value="nero_opaco">Nero opaco</SelectItem>
                  <SelectItem value="oro_spazzolato">Oro spazzolato</SelectItem>
                  <SelectItem value="oro_rosa">Oro rosa</SelectItem>
                  <SelectItem value="acciaio_spazzolato">Acciaio spazzolato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stile</Label>
              <Select
                value={value.rubinetteria.stile}
                onValueChange={(v) =>
                  update({ rubinetteria: { ...value.rubinetteria, stile: v as BathroomConfig["rubinetteria"]["stile"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quadro_moderno">Quadro moderno</SelectItem>
                  <SelectItem value="tondo_classico">Tondo classico</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="vintage_crosshead">Vintage crosshead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Pareti non piastrellate ───────────────────────────── */}
        <AccordionItem value="parete_colore" className="border rounded-lg px-3">
          <div className="flex items-center gap-2 py-2">
              <Switch
                checked={value.sostituzione.parete_colore}
                onCheckedChange={(v) =>
                  update({
                    sostituzione: { ...value.sostituzione, parete_colore: v },
                    parete: { ...value.parete, attivo: v },
                  })
                }
              />
              <AccordionTrigger className="text-sm flex-1 py-0">
                <span>Pareti non piastrellate</span>
              </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <Label className="text-xs">Azione</Label>
              <Select
                value={value.parete.azione}
                onValueChange={(v) =>
                  update({ parete: { ...value.parete, azione: v as BathroomConfig["parete"]["azione"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni">Mantieni</SelectItem>
                  <SelectItem value="tinta_unita">Tinta unita</SelectItem>
                  <SelectItem value="lastra_decorativa">Lastra decorativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(value.parete.azione === "tinta_unita" || value.parete.azione === "lastra_decorativa") && (
              <div>
                <Label className="text-xs">Colore</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={value.parete.colore_hex || "#F5F5F0"}
                    onChange={(e) =>
                      update({ parete: { ...value.parete, colore_hex: e.target.value } })
                    }
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={value.parete.colore_hex || "#F5F5F0"}
                    onChange={(e) =>
                      update({ parete: { ...value.parete, colore_hex: e.target.value } })
                    }
                    className="flex-1"
                    placeholder="#F5F5F0"
                  />
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ── Note libere ──────────────────────────────────────────── */}
      <div>
        <Label className="text-xs font-semibold">Note libere</Label>
        <Textarea
          value={value.note_libere || ""}
          onChange={(e) => update({ note_libere: e.target.value })}
          placeholder="Indicazioni aggiuntive per l'AI (es. 'stile scandinavo minimalista', 'aggiungi specchio rotondo sopra il lavabo')"
          rows={3}
          className="mt-1"
        />
      </div>
    </div>
  );
}
