import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Eye,
  Send,
  Pencil,
  Check,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Code,
  Undo,
  Redo,
  Loader2,
  Variable,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FONT_FAMILIES = [
  "Arial", "Georgia", "Helvetica", "Times New Roman", "Verdana", "Courier New", "Trebuchet MS",
];

const FONT_SIZES = ["10", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48"];

const VARIABLES = [
  { label: "Nome contatto", value: "{{contact.first_name}}" },
  { label: "Cognome contatto", value: "{{contact.last_name}}" },
  { label: "Email contatto", value: "{{contact.email}}" },
  { label: "Nome azienda", value: "{{company.name}}" },
  { label: "Link disiscrizione", value: "{{unsubscribe_url}}" },
];

export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState("14");

  // Dialog states for link and image insertion
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign-editor", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      if (editorRef.current && campaign.html_content) {
        editorRef.current.innerHTML = campaign.html_content;
      }
    }
  }, [campaign]);

  const saveMut = useMutation({
    mutationFn: async (payload: { name?: string; html_content?: string }) => {
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      setAutoSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (e: any) => {
      setAutoSaveStatus("unsaved");
      toast.error("Errore salvataggio: " + e.message);
    },
  });

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("unsaved");
    autoSaveTimer.current = setTimeout(() => {
      if (!editorRef.current) return;
      setAutoSaveStatus("saving");
      saveMut.mutate({ html_content: editorRef.current.innerHTML, name });
    }, 3000);
  }, [name, saveMut]);

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (!editorRef.current) return;
    setAutoSaveStatus("saving");
    saveMut.mutate({ html_content: editorRef.current.innerHTML, name });
  };

  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    triggerAutoSave();
  };

  const handleInsertLink = () => {
    const selection = window.getSelection();
    setLinkText(selection?.toString() || "");
    setLinkUrl("");
    setLinkDialogOpen(true);
  };

  const confirmInsertLink = () => {
    if (!linkUrl) return;
    if (linkText) {
      execCmd("insertHTML", `<a href="${linkUrl}" target="_blank">${linkText}</a>`);
    } else {
      execCmd("createLink", linkUrl);
    }
    setLinkDialogOpen(false);
  };

  const handleInsertImage = () => {
    setImageUrl("");
    setImageAlt("");
    setImageDialogOpen(true);
  };

  const confirmInsertImage = () => {
    if (!imageUrl) return;
    execCmd("insertHTML", `<img src="${imageUrl}" alt="${imageAlt}" style="max-width:100%" />`);
    setImageDialogOpen(false);
  };

  const insertVariable = (variable: string) => {
    execCmd("insertHTML", variable);
  };

  const handleFontFamily = (f: string) => {
    setFontFamily(f);
    execCmd("fontName", f);
  };

  const handleFontSize = (s: string) => {
    setFontSize(s);
    const sizeMap: Record<string, string> = { "10": "1", "12": "2", "14": "3", "16": "4", "18": "5", "20": "5", "24": "6", "28": "6", "32": "7", "36": "7", "48": "7" };
    execCmd("fontSize", sizeMap[s] || "3");
  };

  const ToolbarBtn = ({ icon: Icon, cmd, value, title }: { icon: any; cmd: string; value?: string; title: string }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCmd(cmd, value)}>
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Campagna non trovata</p>
        <Button onClick={() => navigate("/azienda/marketing/email")}>Torna alla lista</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/marketing/email")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-xs text-muted-foreground">
            {autoSaveStatus === "saved" && "✓ Salvato"}
            {autoSaveStatus === "saving" && "Salvataggio..."}
            {autoSaveStatus === "unsaved" && "● Modifiche non salvate"}
          </span>
        </div>

        {/* Editable campaign name */}
        <div className="flex items-center gap-2">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                className="h-8 w-64 text-center font-medium"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setEditingName(false); handleManualSave(); }
                }}
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingName(false); handleManualSave(); }}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors"
              onClick={() => setEditingName(true)}
            >
              {name}
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4 mr-1" /> Anteprima
          </Button>
          <Button variant="outline" size="sm" onClick={handleManualSave} disabled={saveMut.isPending}>
            <Save className="h-4 w-4 mr-1" /> Salva
          </Button>
          <Button size="sm" onClick={() => {
            handleManualSave();
            navigate(`/azienda/marketing/email/campagna/${id}/impostazioni`);
          }}>
            <Send className="h-4 w-4 mr-1" /> Invia o programma
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-background border-b flex-wrap shrink-0">
        <Select value="paragraph" onValueChange={(v) => {
          if (v === "paragraph") {
            execCmd("formatBlock", "p");
          } else {
            execCmd("formatBlock", v);
          }
        }}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">Paragrafo</SelectItem>
            <SelectItem value="h1">Titolo 1</SelectItem>
            <SelectItem value="h2">Titolo 2</SelectItem>
            <SelectItem value="h3">Titolo 3</SelectItem>
          </SelectContent>
        </Select>

        <Select value={fontFamily} onValueChange={handleFontFamily}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fontSize} onValueChange={handleFontSize}>
          <SelectTrigger className="w-[70px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={s}>{s}px</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarBtn icon={Bold} cmd="bold" title="Grassetto" />
        <ToolbarBtn icon={Italic} cmd="italic" title="Corsivo" />
        <ToolbarBtn icon={Underline} cmd="underline" title="Sottolineato" />
        <ToolbarBtn icon={Strikethrough} cmd="strikeThrough" title="Barrato" />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertLink}>
              <Link className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Link</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertImage}>
              <Image className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Immagine</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarBtn icon={AlignLeft} cmd="justifyLeft" title="Allinea a sinistra" />
        <ToolbarBtn icon={AlignCenter} cmd="justifyCenter" title="Centra" />
        <ToolbarBtn icon={AlignRight} cmd="justifyRight" title="Allinea a destra" />
        <ToolbarBtn icon={AlignJustify} cmd="justifyFull" title="Giustifica" />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarBtn icon={List} cmd="insertUnorderedList" title="Elenco puntato" />
        <ToolbarBtn icon={ListOrdered} cmd="insertOrderedList" title="Elenco numerato" />
        <ToolbarBtn icon={Code} cmd="formatBlock" value="pre" title="Codice" />

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Variables dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
              <Variable className="h-4 w-4" /> Variabili
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {VARIABLES.map((v) => (
              <DropdownMenuItem key={v.value} onClick={() => insertVariable(v.value)}>
                {v.label} <span className="ml-auto text-xs text-muted-foreground pl-3">{v.value}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarBtn icon={Undo} cmd="undo" title="Annulla" />
        <ToolbarBtn icon={Redo} cmd="redo" title="Ripristina" />
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto flex justify-center py-8 px-4">
        <div
          ref={editorRef}
          className="bg-background w-full max-w-[700px] min-h-[600px] p-8 border rounded-md shadow-sm focus:outline-none"
          contentEditable
          suppressContentEditableWarning
          onInput={triggerAutoSave}
          style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight: 1.6 }}
        />
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Anteprima email</DialogTitle>
          </DialogHeader>
          <div
            className="border rounded-md p-6 bg-background"
            dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || "" }}
          />
        </DialogContent>
      </Dialog>

      {/* Insert Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Inserisci link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>URL *</Label>
              <Input
                placeholder="https://esempio.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmInsertLink()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Testo del link</Label>
              <Input
                placeholder="Clicca qui"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Lascia vuoto per usare il testo selezionato</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Annulla</Button>
            <Button onClick={confirmInsertLink} disabled={!linkUrl.trim()}>Inserisci</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insert Image Dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Inserisci immagine</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>URL immagine *</Label>
              <Input
                placeholder="https://esempio.com/immagine.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmInsertImage()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Testo alternativo</Label>
              <Input
                placeholder="Descrizione immagine"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
              />
            </div>
            {imageUrl && (
              <div className="border rounded-md p-2">
                <img src={imageUrl} alt={imageAlt} className="max-h-32 mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialogOpen(false)}>Annulla</Button>
            <Button onClick={confirmInsertImage} disabled={!imageUrl.trim()}>Inserisci</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
