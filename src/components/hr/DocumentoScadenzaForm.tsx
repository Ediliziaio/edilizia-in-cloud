/**
 * Form per il caricamento di un documento operaio con data scadenza.
 */
import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTipiDocumento, useUploadDocumento } from "@/hooks/useDocumentiOperaio";
import type { TipoDocumentoOperaio } from "@/types/documenti";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface DocumentoScadenzaFormProps {
  operaioId: string;
  open: boolean;
  onClose: () => void;
}

export function DocumentoScadenzaForm({ operaioId, open, onClose }: DocumentoScadenzaFormProps) {
  const { data: tipi = [] } = useTipiDocumento();
  const upload = useUploadDocumento();

  const [tipoId, setTipoId] = useState<string>("");
  const [dataEmissione, setDataEmissione] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const tipoSelezionato: TipoDocumentoOperaio | undefined = tipi.find(t => t.id === tipoId);
  const richiedeScadenza = tipoSelezionato?.richiede_scadenza ?? true;

  const handleFile = (f: File) => {
    setFileError("");
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError("Formato non supportato. Usa PDF, immagine o Word.");
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setFileError("File troppo grande (max 20 MB).");
      return;
    }
    setFile(f);
  };

  const handleReset = () => {
    setTipoId("");
    setDataEmissione("");
    setDataScadenza("");
    setNote("");
    setFile(null);
    setFileError("");
  };

  const handleSubmit = async () => {
    if (!file) { setFileError("Seleziona un file"); return; }
    if (!tipoId) return;

    await upload.mutateAsync({
      file,
      operaioId,
      tipoId: tipoId || null,
      dataEmissione: dataEmissione || null,
      dataScadenza: dataScadenza || null,
      note,
    });

    handleReset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { handleReset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Carica documento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo documento */}
          <div className="space-y-1.5">
            <Label>Tipo documento *</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo…" />
              </SelectTrigger>
              <SelectContent>
                {tipi.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                    {t.obbligatorio && <span className="ml-1 text-red-500 text-xs">*</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <Label>File *</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <button
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-primary transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">PDF, Immagine, Word — max 20 MB</span>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
              </label>
            )}
            {fileError && <p className="text-xs text-red-600">{fileError}</p>}
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data emissione</Label>
              <Input
                type="date"
                value={dataEmissione}
                onChange={e => setDataEmissione(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Data scadenza
                {richiedeScadenza && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                type="date"
                value={dataScadenza}
                onChange={e => setDataScadenza(e.target.value)}
                className={richiedeScadenza && !dataScadenza ? "border-amber-400" : ""}
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note (opzionale)</Label>
            <Textarea
              placeholder="Agenzie, numeri di pratica, note aggiuntive…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onClose(); }}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !tipoId || upload.isPending}
          >
            {upload.isPending ? (
              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Caricamento…</>
            ) : (
              <><Upload className="h-3 w-3 mr-1.5" /> Carica</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
