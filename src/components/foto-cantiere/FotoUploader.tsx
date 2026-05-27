import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface Props {
  onUpload: (params: { files: FileList; descrizione?: string }) => Promise<unknown>;
  isUploading: boolean;
}

export function FotoUploader({ onUpload, isUploading }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [descrizione, setDescrizione] = useState('');

  const handleCarica = async () => {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;

    await onUpload({ files, descrizione: descrizione.trim() || undefined });

    // Clear inputs after upload
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDescrizione('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Carica Foto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="foto-input">Scatta o seleziona foto</Label>
          <input
            ref={fileInputRef}
            id="foto-input"
            type="file"
            accept="image/*"
            multiple
            // 2026-05-27 (mobile audit): `capture="environment"` apre
            // direttamente la fotocamera posteriore su Android/iOS invece
            // della galleria. -2 tap a foto, l'utente in cantiere
            // riprende il cantiere senza navigare nelle app.
            capture="environment"
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            💡 Tocca per scattare con la fotocamera o scegliere dalla galleria
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="foto-descrizione">Descrizione (opzionale)</Label>
          <Textarea
            id="foto-descrizione"
            placeholder="Aggiungi una descrizione..."
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleCarica} disabled={isUploading} className="w-full sm:w-auto">
            {isUploading ? 'Caricamento...' : 'Carica Foto'}
          </Button>
          <p className="text-xs text-gray-500">
            Le coordinate GPS verranno acquisite automaticamente se disponibili
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
