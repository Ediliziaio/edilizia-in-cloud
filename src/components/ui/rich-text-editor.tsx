/**
 * RichTextEditor — editor WYSIWYG basato su TipTap.
 *
 * Toolbar:
 *  - Grassetto / Corsivo / Sottolineato / Barrato
 *  - Dimensione testo (8/10/12/14/16/18/24pt)
 *  - Font family (Sans / Serif / Mono)
 *  - Allineamento (Left / Center / Right / Justify)
 *  - Lista puntata / numerata
 *  - Link
 *  - Reset formattazione
 *
 * Output: HTML stringa (es. `<p style="font-size: 14pt"><strong>...</strong></p>`).
 * Per il PDF: usare l'helper `htmlToPdfNodes` in src/lib/serramenti/htmlToPdf.tsx
 * che mappa i tag base ai @react-pdf/renderer Text nodes.
 *
 * Sicurezza: l'HTML viene sanitizzato in input via DOMPurify (vedi onUpdate).
 * Nessuno script/style/iframe può passare attraverso.
 */
import { useEffect, useState, useRef } from "react";
import DOMPurify from "dompurify";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
// In TipTap 3.x i sub-pacchetti @tiptap/extension-color e @tiptap/extension-font-family
// sono solo re-export da @tiptap/extension-text-style — consolidare gli import qui
// evita problemi di risoluzione default-export sul bundle cache di Vite.
import { TextStyle, FontSize, FontFamily, Color } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon, Eraser, Type, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export interface RichTextEditorProps {
  /** Valore HTML iniziale. */
  value: string | null | undefined;
  /** Callback con HTML sanitizzato. */
  onChange: (html: string) => void;
  placeholder?: string;
  /** Altezza minima editor in px (default 120). */
  minHeight?: number;
  /** Classe aggiuntiva per il container. */
  className?: string;
  /** Modalità readonly (anteprima). */
  readOnly?: boolean;
}

const FONT_SIZES = [
  { value: "8pt",  label: "8pt — Piccolissimo" },
  { value: "10pt", label: "10pt — Piccolo (condizioni)" },
  { value: "11pt", label: "11pt — Normale" },
  { value: "12pt", label: "12pt — Leggermente più grande" },
  { value: "14pt", label: "14pt — Grande" },
  { value: "18pt", label: "18pt — Titolo" },
  { value: "24pt", label: "24pt — Titolo grande" },
];

const FONT_FAMILIES = [
  { value: "Inter, system-ui, sans-serif",       label: "Sans (predefinito)" },
  { value: "Georgia, 'Times New Roman', serif",   label: "Serif (classico)" },
  { value: "'Courier New', monospace",            label: "Monospace (tecnico)" },
];

/** Pulisce l'HTML rimuovendo script, style, iframe e attributi pericolosi. */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
      "h1", "h2", "h3", "ul", "ol", "li", "a", "span", "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "style"],
    // Permetti solo style: color, font-size, font-family, text-align, font-weight
    ALLOWED_CSS_PROPERTIES: ["color", "font-size", "font-family", "text-align", "font-weight", "font-style", "text-decoration"],
  });
}

export function RichTextEditor({
  value, onChange, placeholder, minHeight = 120, className, readOnly = false,
}: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disabilitato code/codeBlock: non serve nei preventivi, riduce noise toolbar
        code: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      FontSize,
      FontFamily.configure({ types: ["textStyle"] }),
      Color.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank", class: "text-orange-600 underline" },
      }),
    ],
    content: value ?? "",
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(sanitize(editor.getHTML()));
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none px-3 py-2",
          "[&_p]:my-1 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-semibold",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_a]:text-orange-600 [&_a]:underline",
        ),
        style: `min-height: ${minHeight}px;`,
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  // Sync esterno: se il `value` prop cambia dall'esterno (es. reset form, hydration
  // da server), aggiorniamo l'editor SOLO se HTML differisce. Senza questa guard
  // ogni keystroke ri-setterebbe il content perdendo il caret.
  const lastEmitRef = useRef<string>("");
  useEffect(() => {
    if (!editor) return;
    const incoming = value ?? "";
    if (incoming === lastEmitRef.current) return;
    const current = editor.getHTML();
    if (current === incoming) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
    lastEmitRef.current = incoming;
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className={cn("rounded-md border border-slate-200 bg-slate-50", className)}
        style={{ minHeight }}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("rounded-md border border-slate-200 bg-white overflow-hidden", className)}>
        {!readOnly && (
          <Toolbar editor={editor} linkUrl={linkUrl} setLinkUrl={setLinkUrl} />
        )}
        <EditorContent editor={editor} />
      </div>
    </TooltipProvider>
  );
}

/* ─── Toolbar ─────────────────────────────────────────────────────────────── */

function Toolbar({
  editor, linkUrl, setLinkUrl,
}: { editor: Editor; linkUrl: string; setLinkUrl: (v: string) => void }) {
  const currentSize = editor.getAttributes("textStyle").fontSize ?? "11pt";
  const currentFamily = editor.getAttributes("textStyle").fontFamily ?? FONT_FAMILIES[0].value;

  const setFontSize = (size: string) => {
    // Estensione FontSize di @tiptap/extension-text-style v3+ espone .setFontSize()
    // come command sul chain. Fallback a setMark per compatibilità minor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain = editor.chain().focus() as any;
    if (typeof chain.setFontSize === "function") {
      chain.setFontSize(size).run();
    } else {
      editor.chain().focus().setMark("textStyle", { fontSize: size }).run();
    }
  };
  const setFontFamily = (fam: string) => {
    editor.chain().focus().setFontFamily(fam).run();
  };
  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const final = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: final }).run();
    setLinkUrl("");
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50/60">
      {/* Font size */}
      <Select value={currentSize} onValueChange={setFontSize}>
        <SelectTrigger className="h-7 w-[150px] text-[11px] gap-1">
          <Type className="h-3 w-3 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font family */}
      <Select value={currentFamily} onValueChange={setFontFamily}>
        <SelectTrigger className="h-7 w-[150px] text-[11px] gap-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value} className="text-xs">
              <span style={{ fontFamily: f.value }}>{f.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Divider />

      {/* Bold / Italic / Underline / Strike */}
      <ToolButton tip="Grassetto (Ctrl+B)" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Corsivo (Ctrl+I)" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Sottolineato (Ctrl+U)" active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Barrato" active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolButton>

      <Divider />

      {/* Allineamento */}
      <ToolButton tip="Allinea a sinistra" active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Allinea al centro" active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Allinea a destra" active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Giustifica" active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
        <AlignJustify className="h-3.5 w-3.5" />
      </ToolButton>

      <Divider />

      {/* Liste */}
      <ToolButton tip="Lista puntata" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton tip="Lista numerata" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolButton>

      <Divider />

      {/* Link */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={editor.isActive("link") ? "default" : "ghost"} size="icon" className="h-7 w-7">
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
              className="flex-1 h-8 text-xs px-2 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-300"
            />
            <Button size="sm" className="h-8 text-xs" onClick={applyLink}>
              {editor.isActive("link") ? "Aggiorna" : "Inserisci"}
            </Button>
          </div>
          {editor.isActive("link") && (
            <Button
              variant="ghost" size="sm" className="h-7 text-xs w-full mt-1"
              onClick={() => editor.chain().focus().unsetLink().run()}
            >
              Rimuovi link
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {/* Color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Colore testo">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1.5" align="start">
          <div className="grid grid-cols-7 gap-1">
            {[
              "#000000", "#475569", "#94a3b8", "#dc2626", "#ea580c",
              "#ca8a04", "#16a34a", "#0891b2", "#1d4ed8", "#7c3aed",
              "#db2777", "#10b981", "#f97316", "#173b67",
            ].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => editor.chain().focus().setColor(c).run()}
                className="h-5 w-5 rounded border border-slate-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                aria-label={`Colore ${c}`}
              />
            ))}
            <button
              type="button"
              onClick={() => editor.chain().focus().unsetColor().run()}
              className="h-5 w-5 rounded border border-slate-300 bg-white text-[9px] flex items-center justify-center hover:bg-slate-100"
              title="Rimuovi colore"
            >
              ✕
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Divider />

      {/* Reset formattazione */}
      <ToolButton
        tip="Pulisci formattazione"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <Eraser className="h-3.5 w-3.5" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  tip, active, onClick, children,
}: { tip: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "default" : "ghost"}
          size="icon"
          className={cn("h-7 w-7", active && "bg-orange-500 hover:bg-orange-600 text-white")}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{tip}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <span className="inline-block w-px h-5 bg-slate-200 mx-0.5" />;
}
