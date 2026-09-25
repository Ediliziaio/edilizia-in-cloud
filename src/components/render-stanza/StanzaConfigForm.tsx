import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CookingPot, Sofa, Bed, Bath, BookOpen, DoorOpen, Wine,
  UtensilsCrossed, LayoutList, HelpCircle,
  Paintbrush, Grid3X3, Armchair, Lamp, Wallpaper,
  Blinds, Layers, Sun, ChefHat,
} from "lucide-react";

import type {
  ConfigurazioneStanza,
  TipoStanza,
  StileTarget,
  IntensitaTrasformazione,
} from "@/modules/render-stanza/lib/types";
import { CatalogReferencePicker } from "@/components/render-bagno/CatalogReferencePicker";

// ── Default config ───────────────────────────────────────────────────────────
export const DEFAULT_STANZA_CONFIG: ConfigurazioneStanza = {
  tipo_stanza: "soggiorno",
  stile_target: "moderno",
  intensita: "medio",
  verniciatura: { attivo: false, finitura: "satinato", applica_a: "tutte" },
  pavimento: {
    attivo: false,
    tipo: "gres_porcellanato",
    finitura: "opaco",
    effetto_visivo: "cemento",
    pattern: "dritto",
    formato_piastrella: "60x60",
    fuga_larghezza_mm: 2,
    fuga_colore: "tono_su_tono",
    battiscopa_azione: "mantieni",
  },
  arredo: { attivo: false, intensita_cambio: "stile_mantenendo_layout", materiale: "legno_chiaro", mantieni_elettrodomestici: true },
  soffitto: { attivo: false, tipo: "piano" },
  illuminazione: { attivo: false, tipo: "misto", temperatura: "calda_2700k", intensita_luce: "normale" },
  carta_da_parati: { attivo: false, stile_pattern: "geometrico", applica_a: "parete_principale" },
  rivestimento_pareti: { attivo: false, tipo: "boiserie_legno", applica_a: "parete_principale" },
  tende: { attivo: false, tipo: "tende_classiche" },
  restyling_cucina: { attivo: false, materiale_frontali: "laccato", piano_lavoro_materiale: "quarzo", maniglie: "senza_maniglia", cambia_piano_cottura: false },
  spazi_dettagli: { attivo: false, layout_strategy: "mantieni_layout" },
  note_libere: "",
};

// ── Dictionaries ─────────────────────────────────────────────────────────────
const TIPI_STANZA: { value: TipoStanza; label: string; icon: typeof Sofa }[] = [
  { value: "cucina", label: "Cucina", icon: CookingPot },
  { value: "soggiorno", label: "Soggiorno", icon: Sofa },
  { value: "camera_da_letto", label: "Camera da letto", icon: Bed },
  { value: "bagno", label: "Bagno", icon: Bath },
  { value: "studio", label: "Studio", icon: BookOpen },
  { value: "ingresso", label: "Ingresso", icon: DoorOpen },
  { value: "taverna", label: "Taverna", icon: Wine },
  { value: "sala_da_pranzo", label: "Sala da pranzo", icon: UtensilsCrossed },
  { value: "corridoio", label: "Corridoio", icon: LayoutList },
  { value: "altro", label: "Altro", icon: HelpCircle },
];

const STILI: { value: StileTarget; label: string; color: string }[] = [
  { value: "moderno", label: "Moderno", color: "bg-gray-800" },
  { value: "scandinavo", label: "Scandinavo", color: "bg-amber-100" },
  { value: "industriale", label: "Industriale", color: "bg-stone-600" },
  { value: "classico", label: "Classico", color: "bg-amber-700" },
  { value: "rustico", label: "Rustico", color: "bg-orange-800" },
  { value: "minimalista", label: "Minimalista", color: "bg-white border" },
  { value: "mediterraneo", label: "Mediterraneo", color: "bg-blue-500" },
  { value: "art_deco", label: "Art Deco", color: "bg-emerald-700" },
  { value: "giapponese", label: "Giapponese", color: "bg-stone-300" },
  { value: "provenzale", label: "Provenzale", color: "bg-purple-200" },
  { value: "eclettico", label: "Eclettico", color: "bg-rose-500" },
  { value: "luxe_contemporaneo", label: "Luxe", color: "bg-yellow-600" },
];

const INTENSITA: { value: IntensitaTrasformazione; label: string; desc: string }[] = [
  { value: "leggero", label: "Leggero", desc: "Solo gli interventi selezionati, il resto resta identico" },
  { value: "medio", label: "Medio", desc: "Interventi + armonizzazione degli elementi circostanti" },
  { value: "radicale", label: "Radicale", desc: "Redesign completo mantenendo la struttura architettonica" },
];

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  value: ConfigurazioneStanza;
  onChange: (v: ConfigurazioneStanza) => void;
  disabled?: boolean;
  /** Se presente, mostra "Dal tuo catalogo" con le foto prodotto dell'azienda. */
  companyId?: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export function StanzaConfigForm({ value, onChange, disabled, companyId }: Props) {
  const set = <K extends keyof ConfigurazioneStanza>(key: K, val: ConfigurazioneStanza[K]) =>
    onChange({ ...value, [key]: val });

  const activeCount = [
    value.verniciatura.attivo,
    value.pavimento.attivo,
    value.arredo.attivo,
    value.soffitto.attivo,
    value.illuminazione.attivo,
    value.carta_da_parati.attivo,
    value.rivestimento_pareti.attivo,
    value.tende.attivo,
    value.tipo_stanza === "cucina" && value.restyling_cucina?.attivo,
    value.spazi_dettagli?.attivo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 max-md:space-y-4">
      {/* ── Tipo Stanza ────────────────────────────────────────────── */}
      <div>
        <Label className="text-sm font-semibold mb-2 block max-md:text-[13px]">Tipo di stanza</Label>
        {/* Telefono: cinque per riga troncavano i nomi («Camera da l…»): quattro, a 11px. */}
        <div className="grid grid-cols-5 gap-2 max-sm:grid-cols-4 max-sm:gap-1.5">
          {TIPI_STANZA.map(({ value: v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all ${
                value.tipo_stanza === v
                  ? "border-primary bg-primary/5 ring-1 ring-primary font-semibold"
                  : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
              }`}
              onClick={() => set("tipo_stanza", v)}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate w-full text-center max-md:whitespace-normal max-md:text-[11px] max-md:leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Stile Target ───────────────────────────────────────────── */}
      <div>
        <Label className="text-sm font-semibold mb-2 block max-md:text-[13px]">Stile target</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-sm:gap-1.5">
          {STILI.map(({ value: v, label, color }) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-all max-md:gap-1.5 max-md:px-2 max-md:text-[11px] ${
                value.stile_target === v
                  ? "border-primary bg-primary/5 ring-1 ring-primary font-semibold"
                  : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
              }`}
              onClick={() => set("stile_target", v)}
            >
              <div className={`w-5 h-5 rounded-full shrink-0 max-md:h-4 max-md:w-4 ${color}`} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Intensita ──────────────────────────────────────────────── */}
      <div>
        <Label className="text-sm font-semibold mb-2 block max-md:text-[13px]">Intensità trasformazione</Label>
        <div className="grid grid-cols-3 gap-2">
          {INTENSITA.map(({ value: v, label, desc }) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all max-md:p-2 ${
                value.intensita === v
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
              }`}
              onClick={() => set("intensita", v)}
            >
              <span className="font-semibold text-sm max-md:text-[13px]">{label}</span>
              {/* Telefono: la spiegazione (tre righe a 10px) resta al computer. */}
              <span className="text-[10px] text-muted-foreground leading-tight max-md:hidden">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Interventi (accordion) ─────────────────────────────────── */}
      <div>
        <Label className="text-sm font-semibold mb-2 block max-md:text-[13px]">
          Interventi ({activeCount} attivi)
        </Label>
        {/* Telefono: un elenco unico a righe invece di schede staccate. */}
        <Accordion type="multiple" className="space-y-1 max-md:space-y-0 max-md:divide-y max-md:overflow-hidden max-md:rounded-xl max-md:border max-md:bg-card">
          {/* VERNICIATURA */}
          <AccordionItem value="verniciatura" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Paintbrush className="h-4 w-4 text-pink-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Verniciatura pareti</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.verniciatura.attivo}
                    onCheckedChange={(v) => set("verniciatura", { ...value.verniciatura, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.verniciatura.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["parete"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        className="w-10 h-8 p-0.5 cursor-pointer"
                        value={value.verniciatura.colore_hex ?? "#FFFFFF"}
                        onChange={(e) => set("verniciatura", { ...value.verniciatura, colore_hex: e.target.value })}
                        disabled={disabled}
                      />
                      <Input
                        placeholder="Nome colore"
                        value={value.verniciatura.colore_nome ?? ""}
                        onChange={(e) => set("verniciatura", { ...value.verniciatura, colore_nome: e.target.value })}
                        disabled={disabled}
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Finitura</Label>
                    <Select
                      value={value.verniciatura.finitura ?? "satinato"}
                      onValueChange={(v) => set("verniciatura", { ...value.verniciatura, finitura: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opaco">Opaco</SelectItem>
                        <SelectItem value="satinato">Satinato</SelectItem>
                        <SelectItem value="lucido">Lucido</SelectItem>
                        <SelectItem value="lavabile">Lavabile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Applica a</Label>
                  <Select
                    value={value.verniciatura.applica_a ?? "tutte"}
                    onValueChange={(v) => set("verniciatura", { ...value.verniciatura, applica_a: v as never })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tutte">Tutte le pareti</SelectItem>
                      <SelectItem value="parete_principale">Parete principale</SelectItem>
                      <SelectItem value="parete_accento">Parete accento</SelectItem>
                      <SelectItem value="specifiche">Specifiche</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {value.verniciatura.applica_a === "parete_accento" && (
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-10 h-8 p-0.5 cursor-pointer"
                      value={value.verniciatura.colore_accento_hex ?? "#4A90D9"}
                      onChange={(e) => set("verniciatura", { ...value.verniciatura, colore_accento_hex: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      placeholder="Colore accento"
                      value={value.verniciatura.colore_accento_nome ?? ""}
                      onChange={(e) => set("verniciatura", { ...value.verniciatura, colore_accento_nome: e.target.value })}
                      disabled={disabled}
                      className="text-xs"
                    />
                  </div>
                )}
              </AccordionContent>
            )}
          </AccordionItem>

          {/* PAVIMENTO */}
          <AccordionItem value="pavimento" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Grid3X3 className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Pavimento</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.pavimento.attivo}
                    onCheckedChange={(v) => set("pavimento", { ...value.pavimento, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.pavimento.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["pavimento"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                    <Select
                      value={value.pavimento.tipo ?? "gres_porcellanato"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, tipo: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gres_porcellanato">Gres porcellanato</SelectItem>
                        <SelectItem value="parquet_legno">Parquet legno</SelectItem>
                        <SelectItem value="parquet_laminato">Laminato effetto legno</SelectItem>
                        <SelectItem value="vinile_lvt">Vinile LVT/SPC</SelectItem>
                        <SelectItem value="cotto">Cotto</SelectItem>
                        <SelectItem value="marmo">Marmo</SelectItem>
                        <SelectItem value="resina">Resina</SelectItem>
                        <SelectItem value="cemento_spatolato">Cemento spatolato</SelectItem>
                        <SelectItem value="microcemento">Microcemento</SelectItem>
                        <SelectItem value="moquette">Moquette</SelectItem>
                        <SelectItem value="terrazzo_veneziano">Terrazzo veneziano</SelectItem>
                        <SelectItem value="mosaico">Mosaico</SelectItem>
                        <SelectItem value="pietra_naturale">Pietra naturale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore</Label>
                    <Input
                      type="color"
                      className="w-full h-8 p-0.5 cursor-pointer"
                      value={value.pavimento.colore_hex ?? "#C4A882"}
                      onChange={(e) => set("pavimento", { ...value.pavimento, colore_hex: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Effetto visivo</Label>
                    <Select
                      value={value.pavimento.effetto_visivo ?? "cemento"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, effetto_visivo: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legno">Legno</SelectItem>
                        <SelectItem value="marmo">Marmo</SelectItem>
                        <SelectItem value="pietra">Pietra</SelectItem>
                        <SelectItem value="cemento">Cemento</SelectItem>
                        <SelectItem value="resina">Resina continua</SelectItem>
                        <SelectItem value="cotto">Cotto</SelectItem>
                        <SelectItem value="tessile">Tessile</SelectItem>
                        <SelectItem value="terrazzo">Terrazzo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Formato / scala</Label>
                    <Select
                      value={value.pavimento.formato_piastrella ?? "60x60"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, formato_piastrella: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30x60">30x60</SelectItem>
                        <SelectItem value="60x60">60x60</SelectItem>
                        <SelectItem value="60x120">60x120</SelectItem>
                        <SelectItem value="80x80">80x80</SelectItem>
                        <SelectItem value="120x120">120x120 grande formato</SelectItem>
                        <SelectItem value="120x240">120x240 maxi lastra</SelectItem>
                        <SelectItem value="listelli_standard">Listelli standard</SelectItem>
                        <SelectItem value="continuo">Continuo senza fughe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Pattern</Label>
                    <Select
                      value={value.pavimento.pattern ?? "dritto"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, pattern: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dritto">Dritto</SelectItem>
                        <SelectItem value="diagonale">Diagonale</SelectItem>
                        <SelectItem value="spina_pesce">Spina di pesce</SelectItem>
                        <SelectItem value="spina_ungherese">Spina ungherese</SelectItem>
                        <SelectItem value="cassero_regolare">Cassero regolare</SelectItem>
                        <SelectItem value="cassero_irregolare">Cassero irregolare</SelectItem>
                        <SelectItem value="opus_romano">Opus romano</SelectItem>
                        <SelectItem value="sfalsato_33">Sfalsato 33%</SelectItem>
                        <SelectItem value="esagonale">Esagonale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Finitura</Label>
                    <Select
                      value={value.pavimento.finitura ?? "opaco"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, finitura: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opaco">Opaco</SelectItem>
                        <SelectItem value="satinato">Satinato</SelectItem>
                        <SelectItem value="lucido">Lucido</SelectItem>
                        <SelectItem value="strutturato">Strutturato</SelectItem>
                        <SelectItem value="spazzolato">Spazzolato</SelectItem>
                        <SelectItem value="naturale">Naturale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Fuga / giunto</Label>
                    <Select
                      value={String(value.pavimento.fuga_larghezza_mm ?? 2)}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, fuga_larghezza_mm: Number(v) })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 mm (senza fughe)</SelectItem>
                        <SelectItem value="1">1 mm</SelectItem>
                        <SelectItem value="2">2 mm</SelectItem>
                        <SelectItem value="3">3 mm</SelectItem>
                        <SelectItem value="5">5 mm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore fuga</Label>
                    <Select
                      value={value.pavimento.fuga_colore ?? "tono_su_tono"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, fuga_colore: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tono_su_tono">Tono su tono</SelectItem>
                        <SelectItem value="bianco">Bianco</SelectItem>
                        <SelectItem value="grigio_chiaro">Grigio chiaro</SelectItem>
                        <SelectItem value="grigio_scuro">Grigio scuro</SelectItem>
                        <SelectItem value="beige">Beige</SelectItem>
                        <SelectItem value="nero">Nero</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Battiscopa</Label>
                  <Select
                    value={value.pavimento.battiscopa_azione ?? "mantieni"}
                    onValueChange={(v) => set("pavimento", { ...value.pavimento, battiscopa_azione: v as never })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni esistente</SelectItem>
                      <SelectItem value="sostituisci">Sostituisci coordinato</SelectItem>
                      <SelectItem value="rimuovi">Rimuovi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* ARREDO */}
          <AccordionItem value="arredo" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Armchair className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Arredo</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.arredo.attivo}
                    onCheckedChange={(v) => set("arredo", { ...value.arredo, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.arredo.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["arredo"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Intensita cambio</Label>
                  <Select
                    value={value.arredo.intensita_cambio ?? "stile_mantenendo_layout"}
                    onValueChange={(v) => set("arredo", { ...value.arredo, intensita_cambio: v as never })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="colore_sola">Solo colore (mantieni i mobili)</SelectItem>
                      <SelectItem value="stile_mantenendo_layout">Cambia stile, mantieni layout</SelectItem>
                      <SelectItem value="arredo_completo">Arredo completo nuovo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Materiale</Label>
                    <Select
                      value={value.arredo.materiale ?? "legno_chiaro"}
                      onValueChange={(v) => set("arredo", { ...value.arredo, materiale: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legno_chiaro">Legno chiaro</SelectItem>
                        <SelectItem value="legno_scuro">Legno scuro</SelectItem>
                        <SelectItem value="metallo">Metallo</SelectItem>
                        <SelectItem value="vetro">Vetro</SelectItem>
                        <SelectItem value="tessuto">Tessuto</SelectItem>
                        <SelectItem value="pelle">Pelle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore principale</Label>
                    <Input
                      type="color"
                      className="w-full h-8 p-0.5 cursor-pointer"
                      value={value.arredo.colore_principale_hex ?? "#8B7355"}
                      onChange={(e) => set("arredo", { ...value.arredo, colore_principale_hex: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs max-md:text-[11px]">Mantieni elettrodomestici</Label>
                  <Switch
                    checked={value.arredo.mantieni_elettrodomestici ?? true}
                    onCheckedChange={(v) => set("arredo", { ...value.arredo, mantieni_elettrodomestici: v })}
                    disabled={disabled}
                  />
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* SOFFITTO */}
          <AccordionItem value="soffitto" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Layers className="h-4 w-4 text-sky-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Soffitto</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.soffitto.attivo}
                    onCheckedChange={(v) => set("soffitto", { ...value.soffitto, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.soffitto.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                    <Select
                      value={value.soffitto.tipo ?? "piano"}
                      onValueChange={(v) => set("soffitto", { ...value.soffitto, tipo: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="piano">Piano liscio</SelectItem>
                        <SelectItem value="controsoffitto_cartongesso">Controsoffitto cartongesso</SelectItem>
                        <SelectItem value="travi_legno">Travi in legno</SelectItem>
                        <SelectItem value="boiserie_soffitto">Boiserie soffitto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore</Label>
                    <Input
                      type="color"
                      className="w-full h-8 p-0.5 cursor-pointer"
                      value={value.soffitto.colore_hex ?? "#FFFFFF"}
                      onChange={(e) => set("soffitto", { ...value.soffitto, colore_hex: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                </div>
                {value.soffitto.tipo === "travi_legno" && (
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore travi</Label>
                    <Input
                      placeholder="es. noce scuro, rovere naturale"
                      value={value.soffitto.colore_travi ?? ""}
                      onChange={(e) => set("soffitto", { ...value.soffitto, colore_travi: e.target.value })}
                      disabled={disabled}
                      className="text-xs"
                    />
                  </div>
                )}
              </AccordionContent>
            )}
          </AccordionItem>

          {/* ILLUMINAZIONE */}
          <AccordionItem value="illuminazione" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Lamp className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Illuminazione</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.illuminazione.attivo}
                    onCheckedChange={(v) => set("illuminazione", { ...value.illuminazione, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.illuminazione.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Tipo illuminazione</Label>
                  <Select
                    value={value.illuminazione.tipo ?? "misto"}
                    onValueChange={(v) => set("illuminazione", { ...value.illuminazione, tipo: v as never })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="faretti_incassati">Faretti incassati</SelectItem>
                      <SelectItem value="lampadario_centrale">Lampadario centrale</SelectItem>
                      <SelectItem value="led_strip_perimetrale">LED strip perimetrale</SelectItem>
                      <SelectItem value="lampade_sospensione">Lampade a sospensione</SelectItem>
                      <SelectItem value="applique_parete">Applique a parete</SelectItem>
                      <SelectItem value="misto">Misto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Temperatura</Label>
                    <Select
                      value={value.illuminazione.temperatura ?? "calda_2700k"}
                      onValueChange={(v) => set("illuminazione", { ...value.illuminazione, temperatura: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="calda_2700k">Calda (2700K)</SelectItem>
                        <SelectItem value="neutra_3000k">Neutra (3000K)</SelectItem>
                        <SelectItem value="fredda_4000k">Fredda (4000K)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Intensita</Label>
                    <Select
                      value={value.illuminazione.intensita_luce ?? "normale"}
                      onValueChange={(v) => set("illuminazione", { ...value.illuminazione, intensita_luce: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soffusa">Soffusa</SelectItem>
                        <SelectItem value="normale">Normale</SelectItem>
                        <SelectItem value="forte">Forte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* CARTA DA PARATI */}
          <AccordionItem value="carta_da_parati" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Wallpaper className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Carta da parati</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.carta_da_parati.attivo}
                    onCheckedChange={(v) => set("carta_da_parati", { ...value.carta_da_parati, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.carta_da_parati.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["parete"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Pattern</Label>
                    <Select
                      value={value.carta_da_parati.stile_pattern ?? "geometrico"}
                      onValueChange={(v) => set("carta_da_parati", { ...value.carta_da_parati, stile_pattern: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geometrico">Geometrico</SelectItem>
                        <SelectItem value="floreale">Floreale</SelectItem>
                        <SelectItem value="tropicale">Tropicale</SelectItem>
                        <SelectItem value="astratto">Astratto</SelectItem>
                        <SelectItem value="righe">Righe</SelectItem>
                        <SelectItem value="damasco">Damasco</SelectItem>
                        <SelectItem value="toile_de_jouy">Toile de Jouy</SelectItem>
                        <SelectItem value="botanico">Botanico</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Applica a</Label>
                    <Select
                      value={value.carta_da_parati.applica_a ?? "parete_principale"}
                      onValueChange={(v) => set("carta_da_parati", { ...value.carta_da_parati, applica_a: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parete_principale">Parete principale</SelectItem>
                        <SelectItem value="tutte">Tutte le pareti</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Colore base</Label>
                  <Input
                    placeholder="es. bianco ghiaccio, grigio perla..."
                    value={value.carta_da_parati.colore_base ?? ""}
                    onChange={(e) => set("carta_da_parati", { ...value.carta_da_parati, colore_base: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Descrizione aggiuntiva</Label>
                  <Input
                    placeholder="Descrivi il motivo desiderato..."
                    value={value.carta_da_parati.descrizione ?? ""}
                    onChange={(e) => set("carta_da_parati", { ...value.carta_da_parati, descrizione: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* RIVESTIMENTO PARETI */}
          <AccordionItem value="rivestimento" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Sun className="h-4 w-4 text-stone-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Rivestimento pareti</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.rivestimento_pareti.attivo}
                    onCheckedChange={(v) => set("rivestimento_pareti", { ...value.rivestimento_pareti, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.rivestimento_pareti.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["parete"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                    <Select
                      value={value.rivestimento_pareti.tipo ?? "boiserie_legno"}
                      onValueChange={(v) => set("rivestimento_pareti", { ...value.rivestimento_pareti, tipo: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boiserie_legno">Boiserie legno</SelectItem>
                        <SelectItem value="mattone_vista">Mattone a vista</SelectItem>
                        <SelectItem value="pietra_naturale">Pietra naturale</SelectItem>
                        <SelectItem value="pannelli_3d">Pannelli 3D</SelectItem>
                        <SelectItem value="intonaco_spatolato">Intonaco spatolato</SelectItem>
                        <SelectItem value="stucco_veneziano">Stucco veneziano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Applica a</Label>
                    <Select
                      value={value.rivestimento_pareti.applica_a ?? "parete_principale"}
                      onValueChange={(v) => set("rivestimento_pareti", { ...value.rivestimento_pareti, applica_a: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parete_principale">Parete principale</SelectItem>
                        <SelectItem value="tutte">Tutte le pareti</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Colore</Label>
                  <Input
                    type="color"
                    className="w-full h-8 p-0.5 cursor-pointer"
                    value={value.rivestimento_pareti.colore_hex ?? "#A0917B"}
                    onChange={(e) => set("rivestimento_pareti", { ...value.rivestimento_pareti, colore_hex: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* TENDE */}
          <AccordionItem value="tende" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Blinds className="h-4 w-4 text-teal-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Tende</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.tende.attivo}
                    onCheckedChange={(v) => set("tende", { ...value.tende, attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.tende.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                  <Select
                    value={value.tende.tipo ?? "tende_classiche"}
                    onValueChange={(v) => set("tende", { ...value.tende, tipo: v as never })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tende_a_pannello">Pannello</SelectItem>
                      <SelectItem value="tende_classiche">Classiche</SelectItem>
                      <SelectItem value="veneziane">Veneziane</SelectItem>
                      <SelectItem value="rullo">A rullo</SelectItem>
                      <SelectItem value="tende_lino">Lino</SelectItem>
                      <SelectItem value="tende_velluto">Velluto</SelectItem>
                      <SelectItem value="nessuna">Nessuna tenda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    className="w-10 h-8 p-0.5 cursor-pointer"
                    value={value.tende.colore_hex ?? "#E8DDD0"}
                    onChange={(e) => set("tende", { ...value.tende, colore_hex: e.target.value })}
                    disabled={disabled}
                  />
                  <Input
                    placeholder="Nome colore"
                    value={value.tende.colore_nome ?? ""}
                    onChange={(e) => set("tende", { ...value.tende, colore_nome: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* RESTYLING CUCINA (solo se tipo_stanza = cucina) */}
          {value.tipo_stanza === "cucina" && (
            <AccordionItem value="cucina" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
              <AccordionTrigger className="py-2.5 hover:no-underline">
                <div className="flex items-center gap-2 flex-1">
                  <ChefHat className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium max-md:text-[13px]">Restyling cucina</span>
                  <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={value.restyling_cucina?.attivo ?? false}
                      onCheckedChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, attivo: v })}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </AccordionTrigger>
              {value.restyling_cucina?.attivo && (
                <AccordionContent className="pb-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Materiale frontali</Label>
                      <Select
                        value={value.restyling_cucina.materiale_frontali ?? "laccato"}
                        onValueChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, materiale_frontali: v as never })}
                        disabled={disabled}
                      >
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="laccato">Laccato</SelectItem>
                          <SelectItem value="legno">Legno</SelectItem>
                          <SelectItem value="effetto_legno">Effetto legno</SelectItem>
                          <SelectItem value="vetro">Vetro</SelectItem>
                          <SelectItem value="metallo">Metallo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Colore frontali</Label>
                      <Input
                        type="color"
                        className="w-full h-8 p-0.5 cursor-pointer"
                        value={value.restyling_cucina.colore_frontali_hex ?? "#FFFFFF"}
                        onChange={(e) => set("restyling_cucina", { ...value.restyling_cucina!, colore_frontali_hex: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Piano lavoro</Label>
                      <Select
                        value={value.restyling_cucina.piano_lavoro_materiale ?? "quarzo"}
                        onValueChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, piano_lavoro_materiale: v as never })}
                        disabled={disabled}
                      >
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="marmo">Marmo</SelectItem>
                          <SelectItem value="granito">Granito</SelectItem>
                          <SelectItem value="quarzo">Quarzo</SelectItem>
                          <SelectItem value="laminato">Laminato</SelectItem>
                          <SelectItem value="legno">Legno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Colore piano</Label>
                      <Input
                        type="color"
                        className="w-full h-8 p-0.5 cursor-pointer"
                        value={value.restyling_cucina.colore_piano_lavoro_hex ?? "#D4D0CA"}
                        onChange={(e) => set("restyling_cucina", { ...value.restyling_cucina!, colore_piano_lavoro_hex: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Maniglie</Label>
                    <Select
                      value={value.restyling_cucina.maniglie ?? "senza_maniglia"}
                      onValueChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, maniglie: v as never })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="senza_maniglia">Senza maniglia (push)</SelectItem>
                        <SelectItem value="metallo_nero">Metallo nero</SelectItem>
                        <SelectItem value="metallo_oro">Metallo oro</SelectItem>
                        <SelectItem value="legno">Legno</SelectItem>
                        <SelectItem value="cromato">Cromato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs max-md:text-[11px]">Cambia piano cottura</Label>
                    <Switch
                      checked={value.restyling_cucina.cambia_piano_cottura ?? false}
                      onCheckedChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, cambia_piano_cottura: v })}
                      disabled={disabled}
                    />
                  </div>
                </AccordionContent>
              )}
            </AccordionItem>
          )}

          {/* SPAZI E DETTAGLI */}
          <AccordionItem value="spazi_dettagli" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <LayoutList className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Spazi e dettagli</span>
                <div className="ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={value.spazi_dettagli?.attivo ?? false}
                    onCheckedChange={(v) => set("spazi_dettagli", { ...(value.spazi_dettagli ?? { layout_strategy: "mantieni_layout" }), attivo: v })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionTrigger>
            {value.spazi_dettagli?.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Logica spazio</Label>
                  <Select
                    value={value.spazi_dettagli.layout_strategy ?? "mantieni_layout"}
                    onValueChange={(v) => set("spazi_dettagli", { ...value.spazi_dettagli!, layout_strategy: v as never })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni_layout">Mantieni layout</SelectItem>
                      <SelectItem value="ottimizza_spazio">Ottimizza spazio senza cambiare architettura</SelectItem>
                      <SelectItem value="aggiungi_arredo_leggero">Aggiungi arredo leggero</SelectItem>
                      <SelectItem value="declutter">Semplifica / declutter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Elementi da mantenere</Label>
                  <Input
                    placeholder="es. divano, tavolo, finestra, radiatore..."
                    value={value.spazi_dettagli.elementi_da_mantenere ?? ""}
                    onChange={(e) => set("spazi_dettagli", { ...value.spazi_dettagli!, elementi_da_mantenere: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Aggiungi</Label>
                    <Textarea
                      placeholder="es. due applique, pianta, tappeto neutro..."
                      value={value.spazi_dettagli.elementi_da_aggiungere ?? ""}
                      onChange={(e) => set("spazi_dettagli", { ...value.spazi_dettagli!, elementi_da_aggiungere: e.target.value })}
                      disabled={disabled}
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Rimuovi</Label>
                    <Textarea
                      placeholder="es. mobile basso, tende vecchie..."
                      value={value.spazi_dettagli.elementi_da_rimuovere ?? ""}
                      onChange={(e) => set("spazi_dettagli", { ...value.spazi_dettagli!, elementi_da_rimuovere: e.target.value })}
                      disabled={disabled}
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Note tecniche per il render</Label>
                  <Textarea
                    placeholder="es. lascia passaggio libero verso la finestra, non coprire il termosifone..."
                    value={value.spazi_dettagli.note_tecniche ?? ""}
                    onChange={(e) => set("spazi_dettagli", { ...value.spazi_dettagli!, note_tecniche: e.target.value })}
                    disabled={disabled}
                    rows={2}
                    className="text-xs"
                  />
                </div>
              </AccordionContent>
            )}
          </AccordionItem>
        </Accordion>
      </div>

      {/* ── Note libere ────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs max-md:text-[11px]">Note libere</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Istruzioni aggiuntive per l'AI (es. mantieni il divano rosso, aggiungi piante...)"
          rows={2}
          disabled={disabled}
          className="text-xs max-md:placeholder:text-[13px]"
        />
      </div>
    </div>
  );
}
