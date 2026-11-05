import { ScelteVisiveStanza, RiepilogoCampioniStanza } from "./ScelteVisiveStanza";
import { useState } from "react";
import { CampioniFinitureStanza } from "./CampioniFinitureStanza";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { applicaIdea, ideaAttiva, ideePerStanza } from "@/modules/render-stanza/lib/ideePronte";
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
import {
  ROOM_FLOOR_TYPES_WITH_FREE_EFFECT,
  normalizeRoomFloorConfig,
} from "../../../shared/render-room/roomRenderConfig.ts";
import { inferVisualEffect, woodEssenceApplies } from "../../../shared/render-floor/floorReplacementRules.ts";
import { WOOD_ESSENCES } from "@/components/render-pavimento/opzioniPavimento";
import { AnteprimaFoto } from "@/components/render-pavimento/AnteprimaFoto";
import {
  floorReferenceCandidates,
  floorSurfacePhoto,
} from "../../../shared/render-references/floorReferences.ts";
import { ROOM_CLADDING_PHOTOS } from "../../../shared/render-references/roomReferences.ts";

// ── Default config ───────────────────────────────────────────────────────────
// I colori qui sono quelli che i campi colore mostrano finché l'utente non li tocca.
// Prima stavano solo nei campi: il form mostrava un pavimento #C4A882 e il prompt
// riceveva il grigio #b0b0b0 di ripiego; la pittura mostrava bianco e il prompt
// diceva «selected wall color». Il rivestimento pareti non ha un colore di partenza:
// se non lo si sceglie resta quello naturale del materiale (mattone, pietra…).
export const DEFAULT_STANZA_CONFIG: ConfigurazioneStanza = {
  tipo_stanza: "soggiorno",
  stile_target: "moderno",
  intensita: "medio",
  qualita_render: "standard",
  verniciatura: { attivo: false, colore_hex: "#FFFFFF", finitura: "satinato", applica_a: "tutte", colore_accento_hex: "#4A90D9" },
  pavimento: {
    attivo: false,
    tipo: "gres_porcellanato",
    colore_hex: "#C4A882",
    finitura: "opaco",
    effetto_visivo: "cemento",
    pattern: "dritto",
    formato_piastrella: "60x60",
    fuga_larghezza_mm: 2,
    fuga_colore: "tono_su_tono",
    battiscopa_azione: "mantieni",
  },
  arredo: { attivo: false, intensita_cambio: "stile_mantenendo_layout", materiale: "legno_chiaro", colore_principale_hex: "#8B7355", mantieni_elettrodomestici: true },
  soffitto: { attivo: false, tipo: "piano", colore_hex: "#FFFFFF" },
  illuminazione: { attivo: false, tipo: "misto", temperatura: "calda_2700k", intensita_luce: "normale" },
  carta_da_parati: { attivo: false, stile_pattern: "geometrico", applica_a: "parete_principale" },
  rivestimento_pareti: { attivo: false, tipo: "boiserie_legno", applica_a: "parete_principale" },
  tende: { attivo: false, tipo: "tende_classiche", colore_hex: "#E8DDD0" },
  restyling_cucina: { attivo: false, materiale_frontali: "laccato", colore_frontali_hex: "#FFFFFF", piano_lavoro_materiale: "quarzo", colore_piano_lavoro_hex: "#D4D0CA", maniglie: "senza_maniglia", cambia_piano_cottura: false },
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
  pavimentoBloccato?: boolean;
  /** Se presente, mostra "Dal tuo catalogo" con le foto prodotto dell'azienda. */
  companyId?: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export function StanzaConfigForm({ value, onChange, disabled, companyId, pavimentoBloccato }: Props) {
  const [sezioniAperte, setSezioniAperte] = useState<string[]>([]);
  const personalizzaPavimento = () => {
    setSezioniAperte((sezioni) => sezioni.includes("pavimento") ? sezioni : [...sezioni, "pavimento"]);
    requestAnimationFrame(() => document.getElementById("render-stanza-pavimento")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const set = <K extends keyof ConfigurazioneStanza>(key: K, val: ConfigurazioneStanza[K]) =>
    onChange({ ...value, [key]: val });

  // Il pavimento come lo legge il prompt (stessa traduzione delle chiavi della stanza).
  const pavimentoNormalizzato = normalizeRoomFloorConfig(value.pavimento as unknown as Record<string, unknown>);
  // L'effetto si sceglie solo per i materiali che imitano; per gli altri si mostra il loro.
  const pavimentoSenzaPosa = value.pavimento.tipo === "mosaico" || ["resina_continua", "microcemento", "cemento_resina", "moquette"].includes(pavimentoNormalizzato.tipo);
  const effettoPavimentoLibero = ROOM_FLOOR_TYPES_WITH_FREE_EFFECT.includes(pavimentoNormalizzato.tipo);
  const effettoPavimento = effettoPavimentoLibero
    ? value.pavimento.effetto_visivo ?? "cemento"
    : inferVisualEffect(pavimentoNormalizzato.tipo, undefined);
  // Le foto che il render riceverebbe per il pavimento (stessa funzione del motore, senza i
  // primi piani di dettaglio che la stanza non usa).
  const fotoPavimento = floorReferenceCandidates(pavimentoNormalizzato, { dettagli: false });
  const fotoPavimentoPer = (ruolo: string) => fotoPavimento.find((c) => c.role === ruolo)?.entry;
  const fotoSuperficiePavimento = floorSurfacePhoto(pavimentoNormalizzato)?.entry;
  // L'essenza si sceglie dove il prompt la usa: parquet, o un materiale effetto legno.
  const usaEssenzaPavimento = woodEssenceApplies(
    pavimentoNormalizzato.tipo,
    inferVisualEffect(pavimentoNormalizzato.tipo, pavimentoNormalizzato.effetto_visivo),
  );

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
      <CampioniFinitureStanza value={value} onChange={onChange} disabled={disabled} onPersonalizza={personalizzaPavimento} />
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

      {/* ── Idee pronte e richiesta a parole ───────────────────────── */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold block max-md:text-[13px]">Idee pronte</Label>
          <p className="text-xs text-muted-foreground">Un clic imposta stile, materiali e luci. Poi puoi ritoccare tutto qui sotto.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ideePerStanza(value.tipo_stanza).map((idea) => {
            const attiva = ideaAttiva(value) === idea.id;
            return (
              <button
                key={idea.id}
                type="button"
                disabled={disabled}
                aria-pressed={attiva}
                onClick={() => onChange(applicaIdea(value, idea))}
                className={`rounded-lg border p-2.5 text-left transition-all ${attiva ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"}`}
              >
                <div className="mb-1.5 flex h-6 overflow-hidden rounded">
                  {idea.tavolozza.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
                </div>
                <p className="text-xs font-semibold">{idea.nome}</p>
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{idea.descrizione}</p>
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs max-md:text-[11px]" htmlFor="stanza-richiesta">Cosa vuoi vedere (scrivilo come lo diresti al cliente)</Label>
          <Textarea
            id="stanza-richiesta"
            value={value.note_libere ?? ""}
            onChange={(e) => set("note_libere", e.target.value)}
            placeholder="Es. cucina con isola centrale in legno, sgabelli alti, pensili fino al soffitto; tieni la finestra libera e aggiungi piante"
            rows={3}
            disabled={disabled}
            className="text-xs max-md:placeholder:text-[13px]"
          />
        </div>
      </div>

      {/* ── Stile Target ───────────────────────────────────────────── */}
      <div>
        <Label className="text-sm font-semibold mb-2 block max-md:text-[13px]">Stile target</Label>
        <ScelteVisiveStanza gruppo="style" config={value} value={value.stile_target} onValueChange={(v) => set("stile_target", v as StileTarget)} disabled={disabled} />
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

      <div role="group" aria-label="Qualità del render">
        <Label className="mb-2 block text-sm font-semibold">Qualità del render</Label>
        <div className="grid grid-cols-2 gap-2">
          {([{ value: "standard", label: "Standard", descrizione: "Per confrontare rapidamente le soluzioni" }, { value: "alta", label: "Alta", descrizione: "Più dettaglio per materiali e finiture; richiede più tempo" }] as const).map((q) => (
            <button key={q.value} type="button" disabled={disabled} aria-pressed={(value.qualita_render ?? "standard") === q.value} onClick={() => set("qualita_render", q.value)} className={`rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${(value.qualita_render ?? "standard") === q.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}>
              <span className="block text-sm font-semibold">{q.label}</span><span className="mt-1 block text-xs text-muted-foreground">{q.descrizione}</span>
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
        <Accordion type="multiple" value={sezioniAperte} onValueChange={setSezioniAperte} className="space-y-1 max-md:space-y-0 max-md:divide-y max-md:overflow-hidden max-md:rounded-xl max-md:border max-md:bg-card">
          {/* VERNICIATURA */}
          <AccordionItem value="verniciatura" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Paintbrush className="h-4 w-4 text-pink-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Verniciatura pareti</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Verniciatura pareti"
                    checked={value.verniciatura.attivo}
                    onCheckedChange={(v) => set("verniciatura", { ...value.verniciatura, attivo: v })}
                    disabled={disabled}
                  />
                </div>
            {value.verniciatura.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["parete"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        className="w-10 h-8 p-0.5 cursor-pointer"
                        value={value.verniciatura.colore_hex ?? DEFAULT_STANZA_CONFIG.verniciatura.colore_hex}
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
                    <ScelteVisiveStanza gruppo="paint_finish" config={value} value={value.verniciatura.finitura ?? "satinato"}
                      onValueChange={(v) => set("verniciatura", { ...value.verniciatura, finitura: v as never })}
                      disabled={disabled}
                     />
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
                {value.verniciatura.applica_a === "specifiche" && (
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Quali pareti</Label>
                    <Input
                      placeholder="es. parete dietro il divano e parete della finestra"
                      value={value.verniciatura.pareti_specifiche ?? ""}
                      onChange={(e) => set("verniciatura", { ...value.verniciatura, pareti_specifiche: e.target.value })}
                      disabled={disabled}
                      className="text-xs"
                    />
                  </div>
                )}
                {value.verniciatura.applica_a === "parete_accento" && (
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-10 h-8 p-0.5 cursor-pointer"
                      value={value.verniciatura.colore_accento_hex ?? DEFAULT_STANZA_CONFIG.verniciatura.colore_accento_hex}
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
          <AccordionItem id="render-stanza-pavimento" value="pavimento" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Grid3X3 className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Pavimento{pavimentoBloccato ? " · comune al progetto" : ""}</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Pavimento"
                    checked={value.pavimento.attivo}
                    onCheckedChange={(v) => set("pavimento", { ...value.pavimento, attivo: v })}
                    disabled={disabled || pavimentoBloccato}
                  />
                </div>
            {value.pavimento.attivo && !pavimentoBloccato && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["pavimento"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                    <div className="flex items-center gap-2">
                      <AnteprimaFoto foto={fotoSuperficiePavimento} alt={`Pavimento: ${value.pavimento.tipo ?? "gres_porcellanato"}`} />
                      <div className="min-w-0 flex-1">
                        <ScelteVisiveStanza gruppo="floor_type" config={value} value={value.pavimento.tipo ?? "gres_porcellanato"}
                          onValueChange={(v) => set("pavimento", { ...value.pavimento, tipo: v })}
                          disabled={disabled || pavimentoBloccato}
                         />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore</Label>
                    <Input
                      type="color"
                      className="w-full h-8 p-0.5 cursor-pointer"
                      value={value.pavimento.colore_hex ?? DEFAULT_STANZA_CONFIG.pavimento.colore_hex}
                      onChange={(e) => set("pavimento", { ...value.pavimento, colore_hex: e.target.value })}
                      disabled={disabled || pavimentoBloccato}
                    />
                  </div>
                </div>
                {usaEssenzaPavimento && (
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Essenza legno</Label>
                    <ScelteVisiveStanza gruppo="floor_essence" config={value} value={value.pavimento.essenza_legno} disabled={disabled || pavimentoBloccato} onValueChange={(v) => {
                      const legno = WOOD_ESSENCES.find((w) => w.value === v);
                      if (legno) set("pavimento", { ...value.pavimento, essenza_legno: v, colore_nome: legno.label, colore_hex: legno.color });
                    }} />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Effetto visivo</Label>
                    <ScelteVisiveStanza gruppo="floor_effect" config={value} value={effettoPavimento}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, effetto_visivo: v })}
                      disabled={disabled || !effettoPavimentoLibero}
                     />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Formato / scala</Label>
                    <Select
                      value={value.pavimento.formato_piastrella ?? "60x60"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, formato_piastrella: v })}
                      disabled={disabled || pavimentoBloccato}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20x120">20×120 cm · listoni</SelectItem>
                        <SelectItem value="30x30">30×30 cm</SelectItem>
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Pattern</Label>
                    <div className="flex items-center gap-2">
                      <AnteprimaFoto foto={fotoPavimentoPer("LAYING PATTERN TARGET")} alt={`Posa: ${value.pavimento.pattern ?? "dritto"}`} />
                      <div className="min-w-0 flex-1">
                        <ScelteVisiveStanza gruppo="floor_pattern" config={value} value={value.pavimento.pattern ?? "dritto"}
                          onValueChange={(v) => set("pavimento", { ...value.pavimento, pattern: v })}
                          disabled={disabled || pavimentoSenzaPosa}
                         />
                        {pavimentoSenzaPosa && <p className="mt-1 text-xs text-muted-foreground">{value.pavimento.tipo === "mosaico" ? "Le tessere seguono il disegno del campione. Il formato indica il foglio." : "I materiali continui non prevedono uno schema di posa a piastrelle."}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Finitura</Label>
                    <ScelteVisiveStanza gruppo="floor_finish" config={value} value={value.pavimento.finitura ?? "opaco"}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, finitura: v })}
                      disabled={disabled || pavimentoBloccato}
                     />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Fuga / giunto</Label>
                    <Select
                      value={String(value.pavimento.fuga_larghezza_mm ?? 2)}
                      onValueChange={(v) => set("pavimento", { ...value.pavimento, fuga_larghezza_mm: Number(v) })}
                      disabled={disabled || pavimentoBloccato}
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
                      disabled={disabled || pavimentoBloccato}
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
                    disabled={disabled || pavimentoBloccato}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni esistente</SelectItem>
                      <SelectItem value="sostituisci">Sostituisci</SelectItem>
                      <SelectItem value="rimuovi">Rimuovi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {value.pavimento.battiscopa_azione === "sostituisci" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Tipo battiscopa</Label>
                      <div className="flex items-center gap-2">
                        <AnteprimaFoto foto={fotoPavimentoPer("SKIRTING BOARD TARGET")} alt={`Battiscopa: ${value.pavimento.battiscopa_tipo ?? ""}`} />
                        <div className="min-w-0 flex-1">
                          <ScelteVisiveStanza gruppo="floor_skirting" config={value} value={value.pavimento.battiscopa_tipo ?? "coordinato_pavimento"}
                            onValueChange={(v) => set("pavimento", { ...value.pavimento, battiscopa_tipo: v as never })}
                            disabled={disabled || pavimentoBloccato}
                           />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Altezza</Label>
                      <Select
                        value={String(value.pavimento.battiscopa_altezza_cm ?? 8)}
                        onValueChange={(v) => set("pavimento", { ...value.pavimento, battiscopa_altezza_cm: Number(v) as 6 | 8 | 10 })}
                        disabled={disabled || pavimentoBloccato}
                      >
                        <SelectTrigger className="text-xs" aria-label="Altezza battiscopa"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">6 cm</SelectItem>
                          <SelectItem value="8">8 cm</SelectItem>
                          <SelectItem value="10">10 cm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </AccordionContent>
            )}
          </AccordionItem>

          {/* ARREDO */}
          <AccordionItem value="arredo" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Armchair className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Arredo</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Arredo"
                    checked={value.arredo.attivo}
                    onCheckedChange={(v) => set("arredo", { ...value.arredo, attivo: v })}
                    disabled={disabled}
                  />
                </div>
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Materiale</Label>
                    <ScelteVisiveStanza gruppo="furniture_material" config={value} value={value.arredo.materiale ?? "legno_chiaro"}
                      onValueChange={(v) => set("arredo", { ...value.arredo, materiale: v as never, colore_principale_hex: ({ legno_chiaro: "#c49a63", legno_scuro: "#6d442b", metallo: "#949a9f", vetro: "#dbe5e8", tessuto: "#c9b9a4", pelle: "#965b34" } as Record<string, string>)[v] })}
                      disabled={disabled || value.arredo.intensita_cambio === "colore_sola"}
                     />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore principale</Label>
                    <Input
                      type="color"
                      className="w-full h-8 p-0.5 cursor-pointer"
                      value={value.arredo.colore_principale_hex ?? DEFAULT_STANZA_CONFIG.arredo.colore_principale_hex}
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
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Layers className="h-4 w-4 text-sky-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Soffitto</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Soffitto"
                    checked={value.soffitto.attivo}
                    onCheckedChange={(v) => set("soffitto", { ...value.soffitto, attivo: v })}
                    disabled={disabled}
                  />
                </div>
            {value.soffitto.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                    <ScelteVisiveStanza gruppo="ceiling_type" config={value} value={value.soffitto.tipo ?? "piano"}
                      onValueChange={(v) => set("soffitto", { ...value.soffitto, tipo: v as never })}
                      disabled={disabled}
                     />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Colore</Label>
                    <Input
                      type="color"
                      className="w-full h-8 p-0.5 cursor-pointer"
                      value={value.soffitto.colore_hex ?? DEFAULT_STANZA_CONFIG.soffitto.colore_hex}
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
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Lamp className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Illuminazione</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Illuminazione"
                    checked={value.illuminazione.attivo}
                    onCheckedChange={(v) => set("illuminazione", { ...value.illuminazione, attivo: v })}
                    disabled={disabled}
                  />
                </div>
            {value.illuminazione.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Tipo illuminazione</Label>
                  <ScelteVisiveStanza gruppo="lighting_type" config={value} value={value.illuminazione.tipo ?? "misto"}
                    onValueChange={(v) => set("illuminazione", { ...value.illuminazione, tipo: v as never })}
                    disabled={disabled}
                   />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Wallpaper className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Carta da parati</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Carta da parati"
                    checked={value.carta_da_parati.attivo}
                    onCheckedChange={(v) => set("carta_da_parati", { ...value.carta_da_parati, attivo: v })}
                    disabled={disabled}
                  />
                </div>
            {value.carta_da_parati.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["parete"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Pattern</Label>
                    <ScelteVisiveStanza gruppo="wallpaper_pattern" config={value} value={value.carta_da_parati.stile_pattern ?? "geometrico"}
                      onValueChange={(v) => set("carta_da_parati", { ...value.carta_da_parati, stile_pattern: v as never, colore_base: undefined, descrizione: undefined })}
                      disabled={disabled}
                     />
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
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Sun className="h-4 w-4 text-stone-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Rivestimento pareti</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Rivestimento pareti"
                    checked={value.rivestimento_pareti.attivo}
                    onCheckedChange={(v) => set("rivestimento_pareti", { ...value.rivestimento_pareti, attivo: v })}
                    disabled={disabled}
                  />
                </div>
            {value.rivestimento_pareti.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <CatalogReferencePicker companyId={companyId} verticale="stanza" categorie={["parete"]} selectedIds={value.catalogo_reference_ids ?? []} onChange={(ids) => set("catalogo_reference_ids", ids)} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                    <div className="flex items-center gap-2">
                      <AnteprimaFoto foto={ROOM_CLADDING_PHOTOS[value.rivestimento_pareti.tipo ?? "boiserie_legno"]} alt={`Rivestimento: ${value.rivestimento_pareti.tipo ?? "boiserie_legno"}`} />
                      <div className="min-w-0 flex-1">
                        <ScelteVisiveStanza gruppo="cladding_type" config={value} value={value.rivestimento_pareti.tipo ?? "boiserie_legno"}
                          onValueChange={(v) => set("rivestimento_pareti", { ...value.rivestimento_pareti, tipo: v as never, colore_hex: undefined })}
                          disabled={disabled}
                         />
                      </div>
                    </div>
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
                  {!value.rivestimento_pareti.colore_hex && (
                    <p className="text-[11px] text-muted-foreground">Se non lo scegli resta il colore naturale del materiale.</p>
                  )}
                </div>
              </AccordionContent>
            )}
          </AccordionItem>

          {/* TENDE */}
          <AccordionItem value="tende" className="border rounded-lg px-3 max-md:rounded-none max-md:border-0">
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <Blinds className="h-4 w-4 text-teal-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Tende</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Tende"
                    checked={value.tende.attivo}
                    onCheckedChange={(v) => set("tende", { ...value.tende, attivo: v })}
                    disabled={disabled}
                  />
                </div>
            {value.tende.attivo && (
              <AccordionContent className="pb-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs max-md:text-[11px]">Tipo</Label>
                  <ScelteVisiveStanza gruppo="curtain_type" config={value} value={value.tende.tipo ?? "tende_classiche"}
                    onValueChange={(v) => set("tende", { ...value.tende, tipo: v as never, colore_nome: undefined, colore_hex: ({ tende_a_pannello: "#e8e2d8", tende_classiche: "#e8ddd0", veneziane: "#dededb", rullo: "#e8e4dc", tende_lino: "#e8ddce", tende_velluto: "#4d5c45" } as Record<string, string>)[v] })}
                    disabled={disabled}
                   />
                </div>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    className="w-10 h-8 p-0.5 cursor-pointer"
                    value={value.tende.colore_hex ?? DEFAULT_STANZA_CONFIG.tende.colore_hex}
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
              <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
                <div className="flex items-center gap-2 flex-1">
                  <ChefHat className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium max-md:text-[13px]">Restyling cucina</span>

                </div>
              </AccordionTrigger>
                    <Switch aria-label="Attiva Restyling cucina"
                      checked={value.restyling_cucina?.attivo ?? false}
                      onCheckedChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, attivo: v })}
                      disabled={disabled}
                    />
                  </div>
              {value.restyling_cucina?.attivo && (
                <AccordionContent className="pb-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Materiale frontali</Label>
                      <ScelteVisiveStanza gruppo="kitchen_front" config={value} value={value.restyling_cucina.materiale_frontali ?? "laccato"}
                        onValueChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, materiale_frontali: v as never, colore_frontali_hex: ({ laccato: "#ffffff", legno: "#b58b5d", effetto_legno: "#b58b5d", vetro: "#dbdfdd", metallo: "#b4b8bc" } as Record<string, string>)[v] })}
                        disabled={disabled}
                       />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Colore frontali</Label>
                      <Input
                        type="color"
                        className="w-full h-8 p-0.5 cursor-pointer"
                        value={value.restyling_cucina.colore_frontali_hex ?? DEFAULT_STANZA_CONFIG.restyling_cucina?.colore_frontali_hex}
                        onChange={(e) => set("restyling_cucina", { ...value.restyling_cucina!, colore_frontali_hex: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Piano lavoro</Label>
                      <ScelteVisiveStanza gruppo="kitchen_worktop" config={value} value={value.restyling_cucina.piano_lavoro_materiale ?? "quarzo"}
                        onValueChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, piano_lavoro_materiale: v as never, colore_piano_lavoro_hex: ({ marmo: "#f2f0eb", granito: "#7c7e7b", quarzo: "#e6e1d5", laminato: "#c5c3bb", legno: "#b58b5d" } as Record<string, string>)[v] })}
                        disabled={disabled}
                       />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs max-md:text-[11px]">Colore piano</Label>
                      <Input
                        type="color"
                        className="w-full h-8 p-0.5 cursor-pointer"
                        value={value.restyling_cucina.colore_piano_lavoro_hex ?? DEFAULT_STANZA_CONFIG.restyling_cucina?.colore_piano_lavoro_hex}
                        onChange={(e) => set("restyling_cucina", { ...value.restyling_cucina!, colore_piano_lavoro_hex: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs max-md:text-[11px]">Maniglie</Label>
                    <ScelteVisiveStanza gruppo="kitchen_handle" config={value} value={value.restyling_cucina.maniglie ?? "senza_maniglia"}
                      onValueChange={(v) => set("restyling_cucina", { ...value.restyling_cucina!, maniglie: v as never })}
                      disabled={disabled}
                     />
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
            <div className="flex items-center gap-2 [&>h3]:min-w-0 [&>h3]:flex-1"><AccordionTrigger className="py-2.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1">
                <LayoutList className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium max-md:text-[13px]">Spazi e dettagli</span>

              </div>
            </AccordionTrigger>
                  <Switch aria-label="Attiva Spazi e dettagli"
                    checked={value.spazi_dettagli?.attivo ?? false}
                    onCheckedChange={(v) => set("spazi_dettagli", { ...(value.spazi_dettagli ?? { layout_strategy: "mantieni_layout" }), attivo: v })}
                    disabled={disabled}
                  />
                </div>
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

      <RiepilogoCampioniStanza config={value} />
    </div>
  );
}
