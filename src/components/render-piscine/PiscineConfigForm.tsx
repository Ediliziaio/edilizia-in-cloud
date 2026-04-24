import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PISCINE_CONFIG } from "./defaultPiscineConfig";
import type {
  AccessorioPiscina,
  AreaPerimetralePiscina,
  ColoreAcquaPiscina,
  ConfigurazionePiscine,
  DimensioneApparentePiscina,
  FormaPiscina,
  ProfonditaApparentePiscina,
  RivestimentoInternoPiscina,
  SistemaAccessoPiscina,
  SistemaBordoPiscina,
  TipoCopingPiscina,
  TipoOperazionePiscina,
  TipoPiscina,
  ZonaInserimentoPiscina,
} from "@/modules/render-piscine/lib/types";

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
];

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

  const toggleAccessorio = (accessorio: AccessorioPiscina) => {
    const current = value.comfort.accessori ?? [];
    setComfort("accessori", current.includes(accessorio)
      ? current.filter((item) => item !== accessorio)
      : [...current, accessorio]);
  };

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
                className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/40"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
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
        <Label className="text-sm font-semibold">Area di inserimento</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {ZONE.map((item) => {
            const selected = value.inserimento.zona === item.value;
            return (
              <Card
                key={item.value}
                className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/40"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => !disabled && setInserimento("zona", item.value)}
              >
                <CardContent className="p-3 space-y-1">
                  <span className="text-xs font-semibold">{item.label}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
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
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipologia piscina</Label>
          <Select value={value.piscina.tipo} onValueChange={(v) => setPiscina("tipo", v as TipoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Forma</Label>
          <Select value={value.piscina.forma} onValueChange={(v) => setPiscina("forma", v as FormaPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FORME.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Dimensione apparente</Label>
          <Select value={value.piscina.dimensione_apparente} onValueChange={(v) => {
            setPiscina("dimensione_apparente", v as DimensioneApparentePiscina);
            setInserimento("footprint_apparente", v as DimensioneApparentePiscina);
          }} disabled={disabled}>
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
        <div className="space-y-2">
          <Label>Sistema acqua</Label>
          <Select value={value.piscina.sistema_bordo} onValueChange={(v) => setPiscina("sistema_bordo", v as SistemaBordoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{BORDI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Profondità percepita</Label>
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
          <Label>Quota bordo</Label>
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
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rivestimento interno</Label>
          <Select value={value.finiture.rivestimento_interno} onValueChange={(v) => setFiniture("rivestimento_interno", v as RivestimentoInternoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{RIVESTIMENTI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Colore acqua percepito</Label>
          <Select value={value.piscina.colore_acqua} onValueChange={(v) => setPiscina("colore_acqua", v as ColoreAcquaPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ACQUA.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Bordo piscina / coping</Label>
          <Select value={value.finiture.coping} onValueChange={(v) => setFiniture("coping", v as TipoCopingPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{COPING.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Area perimetrale</Label>
          <Select value={value.finiture.area_perimetrale} onValueChange={(v) => setFiniture("area_perimetrale", v as AreaPerimetralePiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{AREE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Accesso vasca</Label>
          <Select value={value.comfort.accesso} onValueChange={(v) => setComfort("accesso", v as SistemaAccessoPiscina)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ACCESSI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Illuminazione</Label>
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
          <Label>Arredo circostante</Label>
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
          <Label>Note tecniche</Label>
          <Input value={value.inserimento.interferenze_note ?? ""} onChange={(e) => setInserimento("interferenze_note", e.target.value)} placeholder="Es. non toccare ulivo a sinistra" disabled={disabled} />
        </div>
      </section>

      <section className="space-y-3">
        <Label className="text-sm font-semibold">Accessori</Label>
        <div className="flex flex-wrap gap-2">
          {ACCESSORI.map((item) => {
            const selected = value.comfort.accessori.includes(item.value);
            return (
              <button
                type="button"
                key={item.value}
                disabled={disabled}
                onClick={() => toggleAccessorio(item.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60"}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Label>Note libere per AI</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Es. acqua molto naturale, non alterare siepe, lascia libero il passaggio verso il patio"
          disabled={disabled}
          rows={3}
        />
      </section>
    </div>
  );
}
