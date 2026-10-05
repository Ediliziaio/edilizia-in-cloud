import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PISCINE_CONFIG } from "./defaultPiscineConfig";
import { conDimensione, conTipo, misuraDaInput } from "./aggiornaConfigPiscina";
import { MiniaturaPiscina, OpzioneConFoto, fotoOpzionePiscina } from "./fotoOpzioniPiscina";
import {
  RIVESTIMENTI_ESTERNI_PISCINA,
  SUPERFICI_RIPRISTINO_PISCINA,
} from "../../../shared/render-piscine/types.ts";
import { vascaRialzata } from "../../../shared/render-piscine/piscineCoerenza.ts";
import { avvisiConfigurazionePiscina } from "../../../shared/render-piscine/piscineValidation.ts";
import type {
  AccessorioPiscina,
  AreaPerimetralePiscina,
  ColoreAcquaPiscina,
  ConfigurazionePiscine,
  DimensioneApparentePiscina,
  FormaPiscina,
  ProfonditaApparentePiscina,
  RivestimentoEsternoPiscina,
  RivestimentoInternoPiscina,
  SistemaAccessoPiscina,
  SistemaBordoPiscina,
  SuperficieRipristinoPiscina,
  TipoCopingPiscina,
  TipoOperazionePiscina,
  TipoPiscina,
  ZonaInserimentoPiscina,
} from "@/modules/render-piscine/lib/types";
import { DettagliTelefono } from "@/components/render/DettagliTelefono";

const OPERAZIONI: { value: TipoOperazionePiscina; label: string; desc: string }[] = [
  { value: "add_new_pool", label: "Aggiungi piscina", desc: "Nuova vasca integrata nello spazio." },
  { value: "replace_existing_pool", label: "Sostituisci piscina", desc: "Rimuove la vecchia e crea la nuova." },
  { value: "remove_existing_pool", label: "Rimuovi piscina", desc: "Ripristina prato, deck o pavimento." },
  { value: "recolor_waterlook_or_liner_only", label: "Solo acqua/rivestimento", desc: "Mantiene forma e bordo." },
  { value: "change_coping_only", label: "Solo bordo", desc: "Aggiorna coping e giunto piscina." },
  { value: "add_access_system", label: "Aggiungi accesso", desc: "Gradini, scala o spiaggetta." },
  { value: "add_pool_features", label: "Aggiungi accessori", desc: "Luci, lama d'acqua, spa, doccia." },
];

const ZONE: { value: ZonaInserimentoPiscina; label: string; desc: string }[] = [
  { value: "giardino_centrale", label: "Giardino centrale", desc: "Vasca integrata nel prato." },
  { value: "laterale_casa", label: "Laterale casa", desc: "Vicino al fabbricato, accessi liberi." },
  { value: "vicino_patio", label: "Vicino patio", desc: "Raccordo con pavimentazione esistente." },
  { value: "bordo_terrazza", label: "Bordo terrazza", desc: "Dentro quote/parapetti visibili." },
  { value: "dietro_casa", label: "Dietro casa", desc: "Area backyard o cortile." },
  { value: "vista_panoramica", label: "Vista panoramica", desc: "Compatibile con sfioro/infinity." },
  { value: "plunge_compatta", label: "Plunge compatta", desc: "Spazio ridotto, look premium." },
  { value: "rooftop_terrazza", label: "Rooftop/terrazza", desc: "Solo se la foto lo consente." },
  { value: "custom", label: "Zona specifica", desc: "Descrivi punto e limiti." },
];

const TIPI: { value: TipoPiscina; label: string }[] = [
  { value: "interrata_rettangolare", label: "Interrata rettangolare" },
  { value: "sfioro_rettangolare", label: "Interrata a sfioro" },
  { value: "infinity_pool", label: "Infinity edge" },
  { value: "interrata_organica", label: "Forma libera / organica" },
  { value: "lap_pool", label: "Lap pool" },
  { value: "plunge_pool", label: "Plunge pool" },
  { value: "semi_incassata", label: "Semi-incassata" },
  { value: "fuori_terra_premium", label: "Fuori terra premium" },
  { value: "minipiscina", label: "Minipiscina" },
  { value: "terrazzo_compatta", label: "Compatta da terrazzo" },
  { value: "biopiscina", label: "Biopiscina / naturale" },
];

const FORME: { value: FormaPiscina; label: string }[] = [
  { value: "rettangolare", label: "Rettangolare" },
  { value: "organica", label: "Organica" },
  { value: "stretta_lunga", label: "Stretta e lunga" },
  { value: "compatta", label: "Compatta" },
  { value: "a_l", label: "A L" },
  { value: "su_misura", label: "Su misura" },
];

const BORDI: { value: SistemaBordoPiscina; label: string }[] = [
  { value: "skimmer", label: "Skimmer premium" },
  { value: "sfioro", label: "Sfioro" },
  { value: "infinity_edge", label: "Infinity edge" },
  { value: "sfioro_nascosto", label: "Sfioro nascosto" },
];

const RIVESTIMENTI: { value: RivestimentoInternoPiscina; label: string }[] = [
  { value: "mosaico_bianco", label: "Mosaico bianco" },
  { value: "mosaico_azzurro", label: "Mosaico azzurro" },
  { value: "mosaico_grigio", label: "Mosaico grigio" },
  { value: "mosaico_antracite", label: "Mosaico antracite" },
  { value: "gres_effetto_pietra", label: "Gres effetto pietra" },
  { value: "gres_effetto_sabbia", label: "Gres effetto sabbia" },
  { value: "liner_chiaro", label: "Liner chiaro" },
  { value: "liner_scuro", label: "Liner scuro" },
  { value: "resina_premium", label: "Resina premium" },
  { value: "pietra_naturale_pool_finish", label: "Pietra naturale" },
];

const COPING: { value: TipoCopingPiscina; label: string }[] = [
  { value: "pietra_chiara", label: "Pietra chiara" },
  { value: "pietra_grigia", label: "Pietra grigia" },
  { value: "gres_2cm", label: "Gres 2 cm" },
  { value: "travertino", label: "Travertino" },
  { value: "legno_wpc", label: "Legno/WPC" },
  { value: "cemento_spazzolato", label: "Cemento spazzolato" },
  { value: "bordo_sottile_moderno", label: "Bordo sottile moderno" },
  { value: "bordo_massivo_classico", label: "Bordo massivo classico" },
];

const ACQUA: { value: ColoreAcquaPiscina; label: string }[] = [
  { value: "cristallina_chiara", label: "Cristallina chiara" },
  { value: "azzurra_classica", label: "Azzurra classica" },
  { value: "turchese", label: "Turchese" },
  { value: "grigio_verde_naturale", label: "Grigio-verde naturale" },
  { value: "blu_profondo", label: "Blu profondo" },
  { value: "sabbia_chiara", label: "Sabbia chiara" },
];

const ACCESSI: { value: SistemaAccessoPiscina; label: string }[] = [
  { value: "nessuno", label: "Nessuno" },
  { value: "scala_inox", label: "Scala inox" },
  { value: "gradini_angolo", label: "Gradini angolo" },
  { value: "gradini_frontali", label: "Gradini frontali" },
  { value: "gradoni_lounge", label: "Gradoni lounge" },
  { value: "spiaggetta", label: "Spiaggetta / baja shelf" },
  { value: "beach_entry", label: "Beach entry" },
];

const AREE: { value: AreaPerimetralePiscina; label: string }[] = [
  { value: "mantieni_esistente", label: "Mantieni esistente" },
  { value: "deck_wpc", label: "Deck WPC" },
  { value: "solarium_gres", label: "Solarium gres" },
  { value: "pietra_naturale", label: "Pietra naturale" },
  { value: "prato_raccordato", label: "Prato raccordato" },
  { value: "ghiaia_drenante", label: "Ghiaia drenante" },
];

const ACCESSORI: { value: AccessorioPiscina; label: string }[] = [
  { value: "illuminazione_subacquea", label: "Luci subacquee" },
  { value: "lama_dacqua", label: "Lama d'acqua" },
  { value: "cascata", label: "Cascata" },
  { value: "idromassaggio_integrato", label: "Idromassaggio" },
  { value: "copertura_isotermica", label: "Copertura isotermica" },
  { value: "copertura_rigida", label: "Copertura rigida" },
  { value: "doccia_esterna", label: "Doccia esterna" },
  { value: "zona_prendisole", label: "Zona prendisole" },
  { value: "recinzione_vetro", label: "Recinzione in vetro" },
];

/** Pareti della vasca rialzata: compare solo se la vasca è rialzata. */
const RIVESTIMENTI_ESTERNI_LABEL: Record<RivestimentoEsternoPiscina, string> = {
  doghe_legno_wpc: "Doghe legno/WPC",
  pietra_naturale: "Pietra naturale",
  gres_effetto_pietra: "Gres effetto pietra",
  intonaco_liscio: "Intonaco liscio",
};

/** Rimozione: cosa va al posto della piscina. */
const RIPRISTINO_LABEL: Record<SuperficieRipristinoPiscina, string> = {
  prato_raccordato: "Prato",
  deck_wpc: "Deck WPC",
  solarium_gres: "Pavimento in gres",
  pietra_naturale: "Pietra naturale",
  ghiaia_drenante: "Ghiaia drenante",
};

/** Nome dell'opzione scelta, per il bottone della tendina (le voci hanno anche la miniatura). */
function etichetta<T extends string>(opzioni: { value: T; label: string }[], valore: T | undefined): string {
  return opzioni.find((item) => item.value === valore)?.label ?? String(valore ?? "");
}

/** Valore del select che vuol dire «non specificato» (Radix non accetta il valore vuoto). */
const NON_SPECIFICATO = "non_specificato";

const formattaMisura = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","));

/**
 * Misura in metri, scritta all'italiana («8,5»). Il testo resta quello digitato (la
 * virgola a metà non sparisce); il config riceve il numero, o niente se il campo è vuoto.
 */
function CampoMisura({ id, label, valore, onCambia, placeholder, disabled }: {
  id: string;
  label: string;
  valore: number | undefined;
  onCambia: (valore: number | undefined) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [testo, setTesto] = useState(formattaMisura(valore));
  const [ultimo, setUltimo] = useState(valore);
  // Il valore è cambiato da fuori (nuovo render): il testo si riallinea.
  if (valore !== ultimo) {
    setUltimo(valore);
    if (misuraDaInput(testo) !== valore) setTesto(formattaMisura(valore));
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="max-md:text-[11px]">{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={testo}
        onChange={(e) => {
          setTesto(e.target.value);
          onCambia(misuraDaInput(e.target.value));
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="max-md:placeholder:text-[13px]"
      />
    </div>
  );
}

interface Props {
  value: ConfigurazionePiscine;
  onChange: (value: ConfigurazionePiscine) => void;
  disabled?: boolean;
}

export function PiscineConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ConfigurazionePiscine>(key: K, next: ConfigurazionePiscine[K]) =>
    onChange({ ...value, [key]: next });

  const setInserimento = <K extends keyof ConfigurazionePiscine["inserimento"]>(key: K, next: ConfigurazionePiscine["inserimento"][K]) =>
    onChange({ ...value, inserimento: { ...(value.inserimento ?? DEFAULT_PISCINE_CONFIG.inserimento), [key]: next } });

  const setPiscina = <K extends keyof ConfigurazionePiscine["piscina"]>(key: K, next: ConfigurazionePiscine["piscina"][K]) =>
    onChange({ ...value, piscina: { ...value.piscina, [key]: next } });

  const setFiniture = <K extends keyof ConfigurazionePiscine["finiture"]>(key: K, next: ConfigurazionePiscine["finiture"][K]) =>
    onChange({ ...value, finiture: { ...value.finiture, [key]: next } });

  const setComfort = <K extends keyof ConfigurazionePiscine["comfort"]>(key: K, next: ConfigurazionePiscine["comfort"][K]) =>
    onChange({ ...value, comfort: { ...value.comfort, [key]: next } });

  // Scelte che si contraddicono (tipologia/forma, rivestimento/acqua…): il render le
  // risolve da solo, qui si dice come.
  const avvisi = avvisiConfigurazionePiscina(value);

  const toggleAccessorio = (accessorio: AccessorioPiscina) => {
    const current = value.comfort.accessori ?? [];
    setComfort("accessori", current.includes(accessorio)
      ? current.filter((item) => item !== accessorio)
      : [...current, accessorio]);
  };

  return (
    <div className="space-y-6 max-md:space-y-4">
      <section className="space-y-3">
        <Label className="text-sm font-semibold max-md:text-[13px]">Tipo intervento</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-sm:grid-cols-2 max-sm:gap-1.5">
          {OPERAZIONI.map((item) => {
            const selected = value.operazione === item.value;
            return (
              <Card
                key={item.value}
                className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary border-primary bg-primary/5" : "border-slate-300 shadow-sm hover:border-primary/60 hover:shadow"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => !disabled && set("operazione", item.value)}
              >
                <CardContent className="p-3 space-y-1 max-md:p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold max-md:text-[13px] max-md:leading-tight">{item.label}</span>
                    {selected && <Badge className="text-[10px] px-1.5 py-0 max-md:hidden">Attivo</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight max-md:hidden">{item.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {value.operazione === "remove_existing_pool" && (
          <div className="space-y-2">
            <Label className="max-md:text-[11px]">Al posto della piscina</Label>
            <Select
              value={value.finiture.superficie_ripristino ?? NON_SPECIFICATO}
              onValueChange={(v) => setFiniture("superficie_ripristino", v === NON_SPECIFICATO ? undefined : v as SuperficieRipristinoPiscina)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue>{value.finiture.superficie_ripristino ? RIPRISTINO_LABEL[value.finiture.superficie_ripristino] : "Come il resto della foto"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NON_SPECIFICATO}>Come il resto della foto</SelectItem>
                {SUPERFICI_RIPRISTINO_PISCINA.map((item) => <SelectItem key={item} value={item}><OpzioneConFoto dimensione="superficie_ripristino" valore={item} label={RIPRISTINO_LABEL[item]} /></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <Label className="text-sm font-semibold max-md:text-[13px]">Area di inserimento</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-sm:grid-cols-2 max-sm:gap-1.5">
          {ZONE.map((item) => {
            const selected = value.inserimento.zona === item.value;
            return (
              <Card
                key={item.value}
                className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary border-primary bg-primary/5" : "border-slate-300 shadow-sm hover:border-primary/60 hover:shadow"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => !disabled && setInserimento("zona", item.value)}
              >
                <CardContent className="p-3 space-y-1 max-md:p-2.5">
                  <span className="text-xs font-semibold max-md:text-[13px] max-md:leading-tight">{item.label}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight max-md:hidden">{item.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Textarea
          value={value.inserimento.posizione_descrittiva ?? ""}
          onChange={(e) => setInserimento("posizione_descrittiva", e.target.value)}
          placeholder="Es. nel prato davanti al patio, lasciando libero il passaggio verso la porta-finestra"
          disabled={disabled}
          className="max-md:min-h-[64px] max-md:placeholder:text-[13px]"
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-md:grid-cols-2 max-md:gap-2">
        {/* Telefono: la tipologia a tutta riga (a metà il nome si tagliava). */}
        <div className="space-y-2 max-md:col-span-2">
          <Label className="max-md:text-[11px]">Tipologia piscina</Label>
          <Select value={value.piscina.tipo} onValueChange={(v) => onChange(conTipo(value, v as TipoPiscina))} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(TIPI, value.piscina.tipo)}</SelectValue></SelectTrigger>
            <SelectContent>{TIPI.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="tipo" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Forma</Label>
          <Select value={value.piscina.forma} onValueChange={(v) => setPiscina("forma", v as FormaPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FORME.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Dimensione apparente</Label>
          {/* Un solo onChange: con due setter di fila il secondo cancellava il primo e la dimensione restava «Media». */}
          <Select value={value.piscina.dimensione_apparente} onValueChange={(v) => onChange(conDimensione(value, v as DimensioneApparentePiscina))} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compatta">Compatta</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="ampia">Ampia</SelectItem>
              <SelectItem value="stretta_lunga">Stretta e lunga</SelectItem>
              <SelectItem value="su_misura">Su misura</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Misure reali (facoltative): se ci sono, contano più della dimensione apparente. */}
        <CampoMisura
          id="piscina-lunghezza"
          label="Lunghezza (m)"
          valore={value.piscina.lunghezza_m}
          onCambia={(v) => setPiscina("lunghezza_m", v)}
          placeholder="Es. 8"
          disabled={disabled}
        />
        <CampoMisura
          id="piscina-larghezza"
          label="Larghezza (m)"
          valore={value.piscina.larghezza_m}
          onCambia={(v) => setPiscina("larghezza_m", v)}
          placeholder="Es. 4"
          disabled={disabled}
        />
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Sistema acqua</Label>
          <Select value={value.piscina.sistema_bordo} onValueChange={(v) => setPiscina("sistema_bordo", v as SistemaBordoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(BORDI, value.piscina.sistema_bordo)}</SelectValue></SelectTrigger>
            <SelectContent>{BORDI.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="sistema_bordo" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Profondità percepita</Label>
          <Select value={value.inserimento.profondita_apparente} onValueChange={(v) => setInserimento("profondita_apparente", v as ProfonditaApparentePiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bassa_relax">Bassa relax</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="profonda">Profonda</SelectItem>
              <SelectItem value="variabile">Variabile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Quota bordo</Label>
          <Select value={value.inserimento.quota_bordo} onValueChange={(v) => setInserimento("quota_bordo", v as ConfigurazionePiscine["inserimento"]["quota_bordo"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a_filo_terreno">A filo terreno</SelectItem>
              <SelectItem value="leggermente_rialzata">Leggermente rialzata</SelectItem>
              <SelectItem value="semi_incassata">Semi-incassata</SelectItem>
              <SelectItem value="fuori_terra">Fuori terra</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(vascaRialzata(value.piscina.tipo, value.inserimento.quota_bordo) || value.finiture.rivestimento_esterno) && (
          <div className="space-y-2">
            <Label className="max-md:text-[11px]">Rivestimento esterno vasca</Label>
            <Select
              value={value.finiture.rivestimento_esterno ?? NON_SPECIFICATO}
              onValueChange={(v) => setFiniture("rivestimento_esterno", v === NON_SPECIFICATO ? undefined : v as RivestimentoEsternoPiscina)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NON_SPECIFICATO}>Non specificato</SelectItem>
                {RIVESTIMENTI_ESTERNI_PISCINA.map((item) => <SelectItem key={item} value={item}>{RIVESTIMENTI_ESTERNI_LABEL[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-md:grid-cols-2 max-md:gap-2">
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Rivestimento interno</Label>
          <Select value={value.finiture.rivestimento_interno} onValueChange={(v) => setFiniture("rivestimento_interno", v as RivestimentoInternoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(RIVESTIMENTI, value.finiture.rivestimento_interno)}</SelectValue></SelectTrigger>
            <SelectContent>{RIVESTIMENTI.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="rivestimento" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Colore acqua percepito</Label>
          <Select value={value.piscina.colore_acqua} onValueChange={(v) => setPiscina("colore_acqua", v as ColoreAcquaPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(ACQUA, value.piscina.colore_acqua)}</SelectValue></SelectTrigger>
            <SelectContent>{ACQUA.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="colore_acqua" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Bordo piscina / coping</Label>
          <Select value={value.finiture.coping} onValueChange={(v) => setFiniture("coping", v as TipoCopingPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(COPING, value.finiture.coping)}</SelectValue></SelectTrigger>
            <SelectContent>{COPING.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="coping" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Area perimetrale</Label>
          <Select value={value.finiture.area_perimetrale} onValueChange={(v) => setFiniture("area_perimetrale", v as AreaPerimetralePiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(AREE, value.finiture.area_perimetrale)}</SelectValue></SelectTrigger>
            <SelectContent>{AREE.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="area_perimetrale" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
      </section>

      {avvisi.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 max-md:text-[13px]">
          {avvisi.map((avviso) => <p key={avviso}>{avviso}</p>)}
        </div>
      )}

      {/* Telefono: accesso, luci, arredo e note tecniche hanno già valori sensati: riga chiusa. */}
      <DettagliTelefono titolo="Accesso, luci e arredo">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-md:grid-cols-2 max-md:gap-2">
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Accesso vasca</Label>
          <Select value={value.comfort.accesso} onValueChange={(v) => setComfort("accesso", v as SistemaAccessoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue>{etichetta(ACCESSI, value.comfort.accesso)}</SelectValue></SelectTrigger>
            <SelectContent>{ACCESSI.map((item) => <SelectItem key={item.value} value={item.value}><OpzioneConFoto dimensione="accesso" valore={item.value} label={item.label} /></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Illuminazione</Label>
          <Select value={value.comfort.illuminazione} onValueChange={(v) => setComfort("illuminazione", v as ConfigurazionePiscine["comfort"]["illuminazione"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nessuna">Nessuna</SelectItem>
              <SelectItem value="subacquea_soft">Subacquea soft</SelectItem>
              <SelectItem value="perimetrale_calda">Perimetrale calda</SelectItem>
              <SelectItem value="subacquea_e_perimetrale">Subacquea + perimetrale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Arredo circostante</Label>
          <Select value={value.comfort.arredo} onValueChange={(v) => setComfort("arredo", v as ConfigurazionePiscine["comfort"]["arredo"])} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mantieni">Mantieni esistente</SelectItem>
              <SelectItem value="aggiungi_minimo">Aggiungi minimo</SelectItem>
              <SelectItem value="rimuovi_superfluo">Rimuovi superfluo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="max-md:text-[11px]">Note tecniche</Label>
          <Input value={value.inserimento.interferenze_note ?? ""} onChange={(e) => setInserimento("interferenze_note", e.target.value)} placeholder="Es. non toccare ulivo a sinistra" disabled={disabled} className="max-md:placeholder:text-[13px]" />
        </div>
      </section>
      </DettagliTelefono>

      <section className="space-y-3">
        <Label className="text-sm font-semibold max-md:text-[13px]">Accessori</Label>
        {/* Card con la foto che il motore allega (40 px); senza foto resta il solo nome. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACCESSORI.map((item) => {
            const selected = value.comfort.accessori.includes(item.value);
            const foto = fotoOpzionePiscina("accessori", item.value);
            return (
              <button
                type="button"
                key={item.value}
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => toggleAccessorio(item.value)}
                className={`flex min-h-[52px] items-center gap-2 rounded-lg border p-1.5 text-left text-xs font-medium leading-tight transition-colors max-md:text-[13px] ${selected ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60"}`}
              >
                {foto && <MiniaturaPiscina foto={foto} alt={item.label} />}
                <span className="min-w-0">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Label className="max-md:text-[13px] max-md:font-semibold">Note libere per AI</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Es. acqua molto naturale, non alterare siepe, lascia libero il passaggio verso il patio"
          disabled={disabled}
          rows={3}
          className="max-md:placeholder:text-[13px]"
        />
      </section>
    </div>
  );
}
