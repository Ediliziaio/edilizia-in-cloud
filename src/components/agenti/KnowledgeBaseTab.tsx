import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useDropzone } from "react-dropzone";
import {
  BookOpen, Plus, Search, Upload, Link, FileText, RefreshCw,
  Trash2, CheckCircle2, AlertTriangle, Clock, Loader2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type SyncStatus = "pending" | "syncing" | "synced" | "error";
type DocType = "url" | "file" | "text";

interface KBDoc {
  id: string;
  titolo: string;
  tipo: string;
  url: string | null;
  contenuto: string | null;
  elevenlabs_doc_id: string | null;
  sync_status: string;
  sync_error: string | null;
  file_size: number | null;
  file_type: string | null;
  creato_il: string;
  updated_at: string;
}

const SYNC_BADGE: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "In attesa", icon: Clock, variant: "secondary" },
  syncing: { label: "Sincronizzazione...", icon: RefreshCw, variant: "outline" },
  synced: { label: "Sincronizzato", icon: CheckCircle2, variant: "default" },
  error: { label: "Errore", icon: AlertTriangle, variant: "destructive" },
};

export function KnowledgeBaseTab() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cerca, setCerca] = useState("");
  const [filtroSync, setFiltroSync] = useState("tutti");
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<DocType>("url");
  const [addTitle, setAddTitle] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addText, setAddText] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);

  // Ultimo sync
  const { data: lastSync } = useQuery({
    queryKey: ["kb-last-sync", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_knowledge_base_v2")
        .select("updated_at")
        .eq("company_id", companyId!)
        .eq("sync_status", "synced")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.updated_at ?? null;
    },
    staleTime: 60_000,
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["kb-docs-v2", companyId, filtroSync, cerca],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("ai_knowledge_base_v2")
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });

      if (filtroSync !== "tutti") q = q.eq("sync_status", filtroSync);
      if (cerca) q = q.ilike("titolo", `%${cerca}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as KBDoc[];
    },
  });

  const addDoc = useMutation({
    mutationFn: async () => {
      if (!companyId || !user) throw new Error("Missing context");

      // Insert doc record
      const insertData: Record<string, unknown> = {
        company_id: companyId,
        titolo: addTitle,
        tipo: addType,
        sync_status: "pending",
      };

      if (addType === "url") insertData.url = addUrl;
      if (addType === "text") insertData.contenuto = addText;
      if (addType === "file" && addFile) {
        insertData.file_size = addFile.size;
        insertData.file_type = addFile.type;
      }

      const { data: doc, error } = await supabase
        .from("ai_knowledge_base_v2")
        .insert(insertData as never)
        .select("id")
        .single();

      if (error) throw error;

      // Upload file to storage if file type
      if (addType === "file" && addFile && doc) {
        const { error: uploadErr } = await supabase.storage
          .from("ai-knowledge")
          .upload(`${companyId}/${doc.id}`, addFile);
        if (uploadErr) throw uploadErr;
      }

      return doc;
    },
    onSuccess: () => {
      toast.success("Documento aggiunto");
      queryClient.invalidateQueries({ queryKey: ["kb-docs-v2"] });
      resetForm();
    },
    onError: (err) => toast.error(`Errore: ${err.message}`),
  });

  const syncDoc = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.functions.invoke("kb-sync", {
        body: { action: "sync_document", doc_id: docId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sincronizzazione avviata");
      queryClient.invalidateQueries({ queryKey: ["kb-docs-v2"] });
    },
    onError: (err) => toast.error(`Errore sync: ${err.message}`),
  });

  const deleteDoc = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.functions.invoke("kb-sync", {
        body: { action: "delete_document", doc_id: docId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento eliminato");
      queryClient.invalidateQueries({ queryKey: ["kb-docs-v2"] });
    },
    onError: (err) => toast.error(`Errore: ${err.message}`),
  });

  const resetForm = () => {
    setShowAdd(false);
    setAddTitle("");
    setAddUrl("");
    setAddText("");
    setAddFile(null);
    setAddType("url");
  };

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setAddFile(files[0]);
      if (!addTitle) setAddTitle(files[0].name);
    }
  }, [addTitle]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  });

  const TYPE_ICON: Record<string, typeof FileText> = {
    url: Link,
    file: Upload,
    text: FileText,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca documento..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={filtroSync} onValueChange={setFiltroSync}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            <SelectItem value="pending">In attesa</SelectItem>
            <SelectItem value="synced">Sincronizzati</SelectItem>
            <SelectItem value="error">Errore</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {lastSync && (
          <p className="text-xs text-muted-foreground">
            Ultimo sync: {format(new Date(lastSync), "dd/MM/yyyy HH:mm", { locale: it })}
          </p>
        )}
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Aggiungi documento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Totali", value: docs.length, icon: BookOpen },
          { label: "Sincronizzati", value: docs.filter(d => d.sync_status === "synced").length, icon: CheckCircle2 },
          { label: "In attesa", value: docs.filter(d => d.sync_status === "pending").length, icon: Clock },
          { label: "Errori", value: docs.filter(d => d.sync_status === "error").length, icon: AlertTriangle },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-semibold text-foreground">Nessun documento</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aggiungi URL, file o testo per la Knowledge Base dei tuoi agenti.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Stato sync</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => {
                const TypeIcon = TYPE_ICON[doc.tipo] || FileText;
                const syncCfg = SYNC_BADGE[doc.sync_status] || SYNC_BADGE.pending;
                const SyncIcon = syncCfg.icon;
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.titolo}</p>
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
                            >
                              <ExternalLink className="h-2.5 w-2.5" /> {doc.url.slice(0, 50)}
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {doc.tipo.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={syncCfg.variant} className="text-[10px] gap-1">
                        <SyncIcon className="h-2.5 w-2.5" />
                        {syncCfg.label}
                      </Badge>
                      {doc.sync_error && (
                        <p className="text-[9px] text-destructive mt-0.5 truncate max-w-[200px]">
                          {doc.sync_error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(doc.creato_il), "d MMM yyyy", { locale: it })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => syncDoc.mutate(doc.id)}
                          disabled={syncDoc.isPending}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncDoc.isPending ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteDoc.mutate(doc.id)}
                          disabled={deleteDoc.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Document Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => !v && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              {(["url", "file", "text"] as DocType[]).map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    onClick={() => setAddType(t)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                      addType === t
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium capitalize">{t === "url" ? "URL" : t === "file" ? "File" : "Testo"}</span>
                  </button>
                );
              })}
            </div>

            <Input
              placeholder="Titolo documento"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
            />

            {addType === "url" && (
              <Input
                placeholder="https://esempio.com/pagina"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
              />
            )}

            {addType === "text" && (
              <Textarea
                placeholder="Incolla qui il contenuto testuale..."
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                rows={6}
              />
            )}

            {addType === "file" && (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <input {...getInputProps()} />
                {addFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{addFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(addFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Trascina un file o clicca per selezionare
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      PDF, TXT, MD, DOC, DOCX
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Annulla</Button>
            <Button
              onClick={() => addDoc.mutate()}
              disabled={!addTitle || addDoc.isPending || (addType === "url" && !addUrl) || (addType === "text" && !addText) || (addType === "file" && !addFile)}
            >
              {addDoc.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
