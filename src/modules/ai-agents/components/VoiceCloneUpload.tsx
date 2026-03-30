import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Mic, Upload, Loader2 } from "lucide-react";
import { callElevenLabsProxy } from "../hooks/useElevenLabsProxy";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function VoiceCloneUpload() {
  const [open, setOpen] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [description, setDescription] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error("File troppo grande (massimo 10MB)");
      return;
    }
    setAudioFile(file);
  };

  const handleUpload = async () => {
    if (!voiceName.trim() || !audioFile) return;
    setIsUploading(true);
    try {
      const buffer = await audioFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const base64 = btoa(binary);

      await callElevenLabsProxy({
        action: "add_voice",
        payload: {
          name: voiceName.trim(),
          description: description.trim() || undefined,
          audio_base64: base64,
        },
      });

      toast.success(`Voce "${voiceName}" clonata con successo`);
      qc.invalidateQueries({ queryKey: ["elevenlabs-voices"] });
      setOpen(false);
      setVoiceName("");
      setDescription("");
      setAudioFile(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore nel clonare la voce";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Mic className="h-4 w-4" /> Clona voce
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carica voce personalizzata</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome voce *</Label>
            <Input
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="Es. Marco - Commerciale"
            />
          </div>
          <div className="space-y-2">
            <Label>Descrizione (opzionale)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Voce maschile italiana..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>File audio *</Label>
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {audioFile ? audioFile.name : "Clicca per caricare MP3 o WAV (max 10MB)"}
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Per migliori risultati usa almeno 30 secondi di audio pulito, senza rumori di fondo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          <Button
            onClick={handleUpload}
            disabled={!voiceName.trim() || !audioFile || isUploading}
            className="gap-2"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {isUploading ? "Clonazione..." : "Clona voce"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
