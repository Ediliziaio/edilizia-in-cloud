import { useMemo, useState } from "react";
import { BuilderBlock, TextProps, ImageProps, ButtonProps, DividerProps, SpacerProps, HtmlProps, ColumnsProps, ColumnLayout, PERSONALIZATION_VARIABLES } from "./builderTypes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Link, Plus, Sparkles, Variable, Palette, ExternalLink } from "lucide-react";

interface BuilderPlaceholder {
  key: string;
  label: string;
  example?: string;
  category?: string;
}

interface BuilderPropertiesPanelProps {
  block: BuilderBlock | null;
  onUpdate: (id: string, props: Partial<BuilderBlock["props"]>) => void;
  placeholders?: BuilderPlaceholder[];
  onInsertVariable?: (tag: string) => void;
  onAddQuickSection?: (kind: "greeting" | "cta" | "signature") => void;
  /** Applica un colore a TUTTI i pulsanti del template (ricorsivo, incl. colonne). */
  onApplyButtonColor?: (color: string) => void;
  /** Applica un colore a TUTTI i blocchi di testo del template. */
  onApplyTextColor?: (color: string) => void;
  /** Override outer wrapper className (e.g. to remove fixed width when embedded). */
  className?: string;
}

const FONT_FAMILIES = ["Arial", "Georgia", "Helvetica", "Times New Roman", "Verdana", "Courier New", "Trebuchet MS"];

const FONT_WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Black" },
];

// Palette brand EiC + neutri/semantici, usata negli swatch dei color picker.
const BRAND_SWATCHES = [
  "#F97316", "#1E3A5F", "#1a1a1a", "#333333", "#64748b",
  "#16a34a", "#dc2626", "#2563eb", "#e2e8f0", "#FFFFFF",
];

/** Campo colore riutilizzabile: swatch brand + hex + picker nativo. */
function ColorField({
  value,
  onChange,
  allowClear = false,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  allowClear?: boolean;
}) {
  const current = value || "";
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        <input
          type="color"
          value={current || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border"
          aria-label="Scegli colore"
        />
        <Input
          className="h-8 flex-1 text-xs font-mono"
          value={current}
          placeholder={allowClear ? "nessuno" : "#000000"}
          onChange={(e) => onChange(e.target.value || (allowClear ? undefined : ""))}
        />
        {allowClear && current && (
          <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => onChange(undefined)}>
            ✕
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {BRAND_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${current.toLowerCase() === c.toLowerCase() ? "ring-2 ring-primary ring-offset-1" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {([
        { v: "left", icon: AlignLeft },
        { v: "center", icon: AlignCenter },
        { v: "right", icon: AlignRight },
      ] as const).map(({ v, icon: Icon }) => (
        <Button key={v} variant={value === v ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => onChange(v)}>
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  );
}

function tagForPlaceholder(key: string) {
  return key.trim().startsWith("{{") ? key.trim() : `{{${key.trim()}}}`;
}

function VariableInsertButton({
  onInsert,
  placeholders = [],
}: {
  onInsert: (tag: string) => void;
  placeholders?: BuilderPlaceholder[];
}) {
  const [search, setSearch] = useState("");
  const variables = useMemo(() => {
    if (placeholders.length === 0) {
      return PERSONALIZATION_VARIABLES.map((variable) => ({
        tag: variable.tag,
        label: variable.label,
      }));
    }
    return placeholders.map((placeholder) => ({
      tag: tagForPlaceholder(placeholder.key),
      label: placeholder.label,
    }));
  }, [placeholders]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter((variable) =>
      variable.tag.toLowerCase().includes(q) || variable.label.toLowerCase().includes(q),
    );
  }, [search, variables]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs w-full">
          <Variable className="h-3 w-3 mr-1" /> Inserisci variabile
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-background z-50 max-h-[360px] w-[320px] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b bg-background p-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Cerca variabile"
            className="h-8 text-xs"
          />
        </div>
        {filtered.slice(0, 120).map((v) => (
          <DropdownMenuItem key={v.tag} onClick={() => onInsert(v.tag)}>
            <span className="mr-2 min-w-0 flex-1 truncate text-xs font-mono text-primary">{v.tag}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{v.label}</span>
          </DropdownMenuItem>
        ))}
        {filtered.length > 120 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Mostro i primi 120 risultati. Usa la ricerca per filtrare meglio.
          </div>
        )}
        {filtered.length === 0 && (
          <div className="px-3 py-5 text-center text-xs text-muted-foreground">
            Nessuna variabile trovata.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BuilderPropertiesPanel({
  block,
  onUpdate,
  placeholders = [],
  onInsertVariable,
  onAddQuickSection,
  onApplyButtonColor,
  onApplyTextColor,
  className,
}: BuilderPropertiesPanelProps) {
  const [librarySearch, setLibrarySearch] = useState("");
  const [themeBtnColor, setThemeBtnColor] = useState("#F97316");
  const [themeTextColor, setThemeTextColor] = useState("#333333");
  const filteredPlaceholders = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return placeholders;
    return placeholders.filter((placeholder) => {
      return (
        placeholder.key.toLowerCase().includes(q) ||
        placeholder.label.toLowerCase().includes(q) ||
        (placeholder.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [librarySearch, placeholders]);

  if (!block) {
    return (
      <div className={className ?? "w-[340px] shrink-0 overflow-y-auto border-l bg-background p-5"}>
        <div className="space-y-5">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Personalizzazione
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Seleziona un blocco per modificarlo oppure aggiungi subito sezioni e variabili dinamiche.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Sezioni rapide</Label>
            <div className="grid gap-2">
              <Button variant="outline" size="sm" className="justify-start" onClick={() => onAddQuickSection?.("greeting")}>
                <Plus className="mr-2 h-4 w-4" />
                Saluto con nome utente
              </Button>
              <Button variant="outline" size="sm" className="justify-start" onClick={() => onAddQuickSection?.("cta")}>
                <Link className="mr-2 h-4 w-4" />
                Pulsante accesso
              </Button>
              <Button variant="outline" size="sm" className="justify-start" onClick={() => onAddQuickSection?.("signature")}>
                <Plus className="mr-2 h-4 w-4" />
                Firma aziendale
              </Button>
            </div>
          </div>

          {(onApplyButtonColor || onApplyTextColor) && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                <Palette className="h-3.5 w-3.5 text-primary" /> Tema colori (tutta l'email)
              </Label>
              {onApplyButtonColor && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Colore di tutti i pulsanti</Label>
                  <ColorField value={themeBtnColor} onChange={(v) => setThemeBtnColor(v ?? "#F97316")} />
                  <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => onApplyButtonColor(themeBtnColor)}>
                    Applica a tutti i pulsanti
                  </Button>
                </div>
              )}
              {onApplyTextColor && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Colore di tutti i testi</Label>
                  <ColorField value={themeTextColor} onChange={(v) => setThemeTextColor(v ?? "#333333")} />
                  <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => onApplyTextColor(themeTextColor)}>
                    Applica a tutti i testi
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Variabili email</Label>
            <Input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Cerca nome, email, fattura..."
              className="h-8 text-xs"
            />
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {filteredPlaceholders.slice(0, 160).map((placeholder) => {
                const tag = tagForPlaceholder(placeholder.key);
                return (
                  <button
                    key={placeholder.key}
                    type="button"
                    onClick={() => onInsertVariable?.(tag)}
                    className="w-full rounded-md border bg-muted/30 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    title={placeholder.example ? `Esempio: ${placeholder.example}` : undefined}
                  >
                    <span className="block truncate text-xs font-medium">{placeholder.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-primary">{tag}</span>
                  </button>
                );
              })}
              {filteredPlaceholders.length > 160 && (
                <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                  Mostro i primi 160 risultati. Cerca una parola specifica per restringere.
                </p>
              )}
              {filteredPlaceholders.length === 0 && (
                <p className="rounded-md border border-dashed px-2.5 py-3 text-xs text-muted-foreground">
                  Nessuna variabile trovata.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const update = (partial: Partial<BuilderBlock["props"]>) => onUpdate(block.id, partial);

  return (
    <div className={className ?? "w-[340px] border-l bg-background p-5 shrink-0 overflow-y-auto"}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Proprietà: {block.type === "columns" ? "Layout" : block.type}
      </p>

      <div className="space-y-4">
        {block.type === "text" && <TextProperties props={block.props as TextProps} update={update} placeholders={placeholders} />}
        {block.type === "image" && <ImageProperties props={block.props as ImageProps} update={update} />}
        {block.type === "button" && <ButtonProperties props={block.props as ButtonProps} update={update} placeholders={placeholders} />}
        {block.type === "divider" && <DividerProperties props={block.props as DividerProps} update={update} />}
        {block.type === "spacer" && <SpacerProperties props={block.props as SpacerProps} update={update} />}
        {block.type === "html" && <HtmlProperties props={block.props as HtmlProps} update={update} placeholders={placeholders} />}
        {block.type === "columns" && <ColumnsProperties props={block.props as ColumnsProps} update={update} />}
      </div>
    </div>
  );
}

function TextProperties({
  props,
  update,
  placeholders,
}: {
  props: TextProps;
  update: (p: Partial<TextProps>) => void;
  placeholders: BuilderPlaceholder[];
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Contenuto</Label>
        <Textarea className="min-h-[120px] text-sm" value={props.content} onChange={(e) => update({ content: e.target.value })} />
        <VariableInsertButton placeholders={placeholders} onInsert={(tag) => update({ content: props.content + " " + tag })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Font</Label>
          <Select value={props.fontFamily} onValueChange={(v) => update({ fontFamily: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{FONT_FAMILIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Peso</Label>
          <Select value={normalizeWeight(props.fontWeight)} onValueChange={(v) => update({ fontWeight: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{FONT_WEIGHTS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Dimensione</Label>
          <Input className="h-8 text-xs" value={props.fontSize} onChange={(e) => update({ fontSize: e.target.value })} placeholder="16px" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Interlinea</Label>
          <Input className="h-8 text-xs" value={props.lineHeight ?? "1.6"} onChange={(e) => update({ lineHeight: e.target.value })} placeholder="1.6" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Colore testo</Label>
        <ColorField value={props.color} onChange={(v) => update({ color: v ?? "#333333" })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Sfondo blocco (opzionale)</Label>
        <ColorField value={props.backgroundColor} onChange={(v) => update({ backgroundColor: v })} allowClear />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Allineamento</Label>
          <AlignButtons value={props.textAlign} onChange={(v) => update({ textAlign: v })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Stile</Label>
          <div className="flex gap-1">
            <Button variant={isBold(props.fontWeight) ? "default" : "outline"} size="icon" className="h-8 w-8" title="Grassetto" onClick={() => update({ fontWeight: isBold(props.fontWeight) ? "400" : "700" })}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button variant={props.italic ? "default" : "outline"} size="icon" className="h-8 w-8" title="Corsivo" onClick={() => update({ italic: !props.italic })}>
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button variant={props.underline ? "default" : "outline"} size="icon" className="h-8 w-8" title="Sottolineato" onClick={() => update({ underline: !props.underline })}>
              <Underline className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function normalizeWeight(w: string): string {
  if (w === "normal") return "400";
  if (w === "bold") return "700";
  return FONT_WEIGHTS.some((x) => x.value === w) ? w : "400";
}
function isBold(w: string): boolean {
  return w === "bold" || parseInt(w, 10) >= 600;
}

function ImageProperties({ props, update }: { props: ImageProps; update: (p: Partial<ImageProps>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">URL immagine</Label>
        <Input className="h-8 text-xs" placeholder="https://..." value={props.src} onChange={(e) => update({ src: e.target.value })} />
      </div>
      {props.src && (
        <div className="border rounded p-2">
          <img loading="lazy" src={props.src} alt={props.alt} className="max-h-24 mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Testo alternativo</Label>
        <Input className="h-8 text-xs" value={props.alt} onChange={(e) => update({ alt: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Larghezza</Label>
        <Input className="h-8 text-xs" value={props.width} onChange={(e) => update({ width: e.target.value })} placeholder="100% o 300px" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Allineamento</Label>
        <AlignButtons value={props.align} onChange={(v) => update({ align: v })} />
      </div>
    </>
  );
}

function ButtonProperties({
  props,
  update,
  placeholders,
}: {
  props: ButtonProps;
  update: (p: Partial<ButtonProps>) => void;
  placeholders: BuilderPlaceholder[];
}) {
  return (
    <>
      {/* URL prima di tutto — è il campo più importante per un bottone */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground">Link (URL)</Label>
        <div className="flex gap-1">
          <Input
            className={`h-8 text-xs flex-1 ${!props.url ? "border-destructive focus-visible:ring-destructive" : ""}`}
            value={props.url}
            placeholder="https://... oppure {{variabile}}"
            onChange={(e) => update({ url: e.target.value })}
          />
          {props.url && !props.url.startsWith("{{") && (
            <a href={props.url} target="_blank" rel="noopener noreferrer" title="Apri link in nuova scheda">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
        </div>
        {!props.url && (
          <p className="text-[11px] text-destructive">URL obbligatorio: il bottone non funzionerà senza link.</p>
        )}
        <VariableInsertButton placeholders={placeholders} onInsert={(tag) => update({ url: props.url + tag })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Testo del pulsante</Label>
        <Input className="h-8 text-xs" value={props.text} onChange={(e) => update({ text: e.target.value })} />
        <VariableInsertButton placeholders={placeholders} onInsert={(tag) => update({ text: props.text + " " + tag })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Colore sfondo</Label>
        <ColorField value={props.backgroundColor} onChange={(v) => update({ backgroundColor: v ?? "#F97316" })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Colore testo</Label>
        <ColorField value={props.textColor} onChange={(v) => update({ textColor: v ?? "#FFFFFF" })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Dimensione testo</Label>
          <Input className="h-8 text-xs" value={props.fontSize ?? "16px"} onChange={(e) => update({ fontSize: e.target.value })} placeholder="16px" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bordo arrotondato</Label>
          <Input className="h-8 text-xs" value={props.borderRadius} onChange={(e) => update({ borderRadius: e.target.value })} placeholder="6px" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Padding verticale</Label>
          <Input className="h-8 text-xs" value={props.paddingY ?? "13px"} onChange={(e) => update({ paddingY: e.target.value })} placeholder="13px" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Padding orizzontale</Label>
          <Input className="h-8 text-xs" value={props.paddingX ?? "26px"} onChange={(e) => update({ paddingX: e.target.value })} placeholder="26px" />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <Label className="text-xs">Larghezza piena</Label>
        <Button variant={props.fullWidth ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => update({ fullWidth: !props.fullWidth })}>
          {props.fullWidth ? "Sì" : "No"}
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Allineamento</Label>
        <AlignButtons value={props.align} onChange={(v) => update({ align: v })} />
      </div>
    </>
  );
}

function DividerProperties({ props, update }: { props: DividerProps; update: (p: Partial<DividerProps>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Spessore</Label>
        <Input className="h-8 text-xs" value={props.thickness} onChange={(e) => update({ thickness: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Colore</Label>
        <ColorField value={props.color} onChange={(v) => update({ color: v ?? "#E5E7EB" })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Margine</Label>
        <Input className="h-8 text-xs" value={props.margin} onChange={(e) => update({ margin: e.target.value })} />
      </div>
    </>
  );
}

function SpacerProperties({ props, update }: { props: SpacerProps; update: (p: Partial<SpacerProps>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Altezza</Label>
      <Input className="h-8 text-xs" value={props.height} onChange={(e) => update({ height: e.target.value })} placeholder="32px" />
    </div>
  );
}

function HtmlProperties({
  props,
  update,
  placeholders,
}: {
  props: HtmlProps;
  update: (p: Partial<HtmlProps>) => void;
  placeholders: BuilderPlaceholder[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Codice HTML</Label>
      <Textarea className="min-h-[150px] text-xs font-mono" value={props.code} onChange={(e) => update({ code: e.target.value })} />
      <VariableInsertButton placeholders={placeholders} onInsert={(tag) => update({ code: props.code + tag })} />
    </div>
  );
}

function ColumnsProperties({ props, update }: { props: ColumnsProps; update: (p: Partial<ColumnsProps>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Layout</Label>
        <Select value={props.layout} onValueChange={(v) => update({ layout: v as ColumnLayout })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 colonna</SelectItem>
            <SelectItem value="1/2-1/2">2 colonne (50/50)</SelectItem>
            <SelectItem value="1/3-1/3-1/3">3 colonne</SelectItem>
            <SelectItem value="1/3-2/3">1/3 + 2/3</SelectItem>
            <SelectItem value="2/3-1/3">2/3 + 1/3</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Spaziatura</Label>
        <Input className="h-8 text-xs" value={props.gap} onChange={(e) => update({ gap: e.target.value })} />
      </div>
    </>
  );
}
