import { BuilderBlock, TextProps, ImageProps, ButtonProps, DividerProps, SpacerProps, HtmlProps, ColumnsProps, ColumnLayout, PERSONALIZATION_VARIABLES } from "./builderTypes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlignLeft, AlignCenter, AlignRight, Bold, MousePointerClick, Variable } from "lucide-react";

interface BuilderPropertiesPanelProps {
  block: BuilderBlock | null;
  onUpdate: (id: string, props: Partial<BuilderBlock["props"]>) => void;
}

const FONT_FAMILIES = ["Arial", "Georgia", "Helvetica", "Times New Roman", "Verdana", "Courier New", "Trebuchet MS"];

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

function VariableInsertButton({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs w-full">
          <Variable className="h-3 w-3 mr-1" /> Inserisci variabile
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-background z-50">
        {PERSONALIZATION_VARIABLES.map((v) => (
          <DropdownMenuItem key={v.tag} onClick={() => onInsert(v.tag)}>
            <span className="text-xs font-mono text-primary mr-2">{v.tag}</span>
            <span className="text-xs text-muted-foreground">{v.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BuilderPropertiesPanel({ block, onUpdate }: BuilderPropertiesPanelProps) {
  if (!block) {
    return (
      <div className="w-[260px] border-l bg-background p-4 shrink-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <MousePointerClick className="h-8 w-8 opacity-30" />
        <p className="text-xs text-center">Seleziona un elemento per<br />modificarne le proprietà</p>
      </div>
    );
  }

  const update = (partial: Record<string, any>) => onUpdate(block.id, partial);

  return (
    <div className="w-[260px] border-l bg-background p-4 shrink-0 overflow-y-auto">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Proprietà: {block.type === "columns" ? "Layout" : block.type}
      </p>

      <div className="space-y-4">
        {block.type === "text" && <TextProperties props={block.props as TextProps} update={update} />}
        {block.type === "image" && <ImageProperties props={block.props as ImageProps} update={update} />}
        {block.type === "button" && <ButtonProperties props={block.props as ButtonProps} update={update} />}
        {block.type === "divider" && <DividerProperties props={block.props as DividerProps} update={update} />}
        {block.type === "spacer" && <SpacerProperties props={block.props as SpacerProps} update={update} />}
        {block.type === "html" && <HtmlProperties props={block.props as HtmlProps} update={update} />}
        {block.type === "columns" && <ColumnsProperties props={block.props as ColumnsProps} update={update} />}
      </div>
    </div>
  );
}

function TextProperties({ props, update }: { props: TextProps; update: (p: Record<string, any>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Contenuto</Label>
        <Textarea className="min-h-[80px] text-sm" value={props.content} onChange={(e) => update({ content: e.target.value })} />
        <VariableInsertButton onInsert={(tag) => update({ content: props.content + " " + tag })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Font</Label>
        <Select value={props.fontFamily} onValueChange={(v) => update({ fontFamily: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{FONT_FAMILIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Dimensione</Label>
          <Input className="h-8 text-xs" value={props.fontSize} onChange={(e) => update({ fontSize: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Colore</Label>
          <div className="flex gap-1">
            <input type="color" value={props.color} onChange={(e) => update({ color: e.target.value })} className="h-8 w-8 rounded border cursor-pointer" />
            <Input className="h-8 text-xs flex-1" value={props.color} onChange={(e) => update({ color: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Allineamento</Label>
        <AlignButtons value={props.textAlign} onChange={(v) => update({ textAlign: v })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Peso</Label>
        <Button variant={props.fontWeight === "bold" ? "default" : "outline"} size="sm" className="h-8 w-8" onClick={() => update({ fontWeight: props.fontWeight === "bold" ? "normal" : "bold" })}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );
}

function ImageProperties({ props, update }: { props: ImageProps; update: (p: Record<string, any>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">URL immagine</Label>
        <Input className="h-8 text-xs" placeholder="https://..." value={props.src} onChange={(e) => update({ src: e.target.value })} />
      </div>
      {props.src && (
        <div className="border rounded p-2">
          <img src={props.src} alt={props.alt} className="max-h-24 mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

function ButtonProperties({ props, update }: { props: ButtonProps; update: (p: Record<string, any>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Testo</Label>
        <Input className="h-8 text-xs" value={props.text} onChange={(e) => update({ text: e.target.value })} />
        <VariableInsertButton onInsert={(tag) => update({ text: props.text + " " + tag })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">URL</Label>
        <Input className="h-8 text-xs" value={props.url} onChange={(e) => update({ url: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Sfondo</Label>
          <div className="flex gap-1">
            <input type="color" value={props.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} className="h-8 w-8 rounded border cursor-pointer" />
            <Input className="h-8 text-xs flex-1" value={props.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Testo</Label>
          <div className="flex gap-1">
            <input type="color" value={props.textColor} onChange={(e) => update({ textColor: e.target.value })} className="h-8 w-8 rounded border cursor-pointer" />
            <Input className="h-8 text-xs flex-1" value={props.textColor} onChange={(e) => update({ textColor: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Bordo arrotondato</Label>
        <Input className="h-8 text-xs" value={props.borderRadius} onChange={(e) => update({ borderRadius: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Allineamento</Label>
        <AlignButtons value={props.align} onChange={(v) => update({ align: v })} />
      </div>
    </>
  );
}

function DividerProperties({ props, update }: { props: DividerProps; update: (p: Record<string, any>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Spessore</Label>
        <Input className="h-8 text-xs" value={props.thickness} onChange={(e) => update({ thickness: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Colore</Label>
        <div className="flex gap-1">
          <input type="color" value={props.color} onChange={(e) => update({ color: e.target.value })} className="h-8 w-8 rounded border cursor-pointer" />
          <Input className="h-8 text-xs flex-1" value={props.color} onChange={(e) => update({ color: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Margine</Label>
        <Input className="h-8 text-xs" value={props.margin} onChange={(e) => update({ margin: e.target.value })} />
      </div>
    </>
  );
}

function SpacerProperties({ props, update }: { props: SpacerProps; update: (p: Record<string, any>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Altezza</Label>
      <Input className="h-8 text-xs" value={props.height} onChange={(e) => update({ height: e.target.value })} placeholder="32px" />
    </div>
  );
}

function HtmlProperties({ props, update }: { props: HtmlProps; update: (p: Record<string, any>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Codice HTML</Label>
      <Textarea className="min-h-[150px] text-xs font-mono" value={props.code} onChange={(e) => update({ code: e.target.value })} />
    </div>
  );
}

function ColumnsProperties({ props, update }: { props: ColumnsProps; update: (p: Record<string, any>) => void }) {
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
