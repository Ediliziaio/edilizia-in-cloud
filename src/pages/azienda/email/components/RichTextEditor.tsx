/**
 * RichTextEditor — editor minimal per email compose
 *
 * No-dependency: usa contentEditable + document.execCommand per
 * formattazione base (bold/italic/underline/list/link/heading).
 * Sufficiente per email; per uso più ricco si può migrare a TipTap.
 *
 * Output: chiama onChange(html, text) ad ogni modifica (debounced 100ms).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon,
  Quote, Heading1, Heading2, Undo, Redo, AlignLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;             // HTML iniziale
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

export function RichTextEditor({
  value, onChange, placeholder = "Scrivi…", className, rows = 12,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Inizializza/aggiorna content solo se diverso (evita perdita cursore)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    handleInput();
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText;
    onChange(html, text);
  };

  const handleLink = () => {
    const url = window.prompt("URL link:", "https://");
    if (url) exec("createLink", url);
  };

  const isEmpty = !value || value === "<br>" || value.replace(/<[^>]+>/g, "").trim() === "";

  return (
    <div className={cn("rounded-md border bg-white dark:bg-background overflow-hidden", className)}>
      <div className="flex items-center gap-0.5 px-1 py-1 border-b bg-muted/30 flex-wrap">
        <ToolbarBtn icon={Bold} title="Grassetto (Ctrl+B)" onClick={() => exec("bold")} />
        <ToolbarBtn icon={Italic} title="Corsivo (Ctrl+I)" onClick={() => exec("italic")} />
        <ToolbarBtn icon={Underline} title="Sottolineato (Ctrl+U)" onClick={() => exec("underline")} />
        <Divider />
        <ToolbarBtn icon={Heading1} title="Titolo H1" onClick={() => exec("formatBlock", "<h1>")} />
        <ToolbarBtn icon={Heading2} title="Titolo H2" onClick={() => exec("formatBlock", "<h2>")} />
        <ToolbarBtn icon={AlignLeft} title="Paragrafo" onClick={() => exec("formatBlock", "<p>")} />
        <Divider />
        <ToolbarBtn icon={List} title="Elenco puntato" onClick={() => exec("insertUnorderedList")} />
        <ToolbarBtn icon={ListOrdered} title="Elenco numerato" onClick={() => exec("insertOrderedList")} />
        <ToolbarBtn icon={Quote} title="Citazione" onClick={() => exec("formatBlock", "<blockquote>")} />
        <Divider />
        <ToolbarBtn icon={LinkIcon} title="Inserisci link" onClick={handleLink} />
        <Divider />
        <ToolbarBtn icon={Undo} title="Annulla (Ctrl+Z)" onClick={() => exec("undo")} />
        <ToolbarBtn icon={Redo} title="Ripeti (Ctrl+Shift+Z)" onClick={() => exec("redo")} />
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-violet-500/30 prose prose-sm max-w-none",
            "prose-a:text-violet-600 prose-blockquote:border-l-4 prose-blockquote:border-violet-300 prose-blockquote:bg-violet-50/50 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic",
          )}
          style={{ minHeight: `${rows * 1.5}rem` }}
          suppressContentEditableWarning
        />
        {isEmpty && !isFocused && (
          <div className="absolute top-2.5 left-3 text-sm text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon, title, onClick,
}: { icon: React.ComponentType<{ className?: string }>; title: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onMouseDown={(e) => e.preventDefault()} // non perde focus editor
      onClick={onClick}
      className="h-7 w-7"
      title={title}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-border mx-0.5" />;
}
