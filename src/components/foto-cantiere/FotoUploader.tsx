import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  onUpload: (params: { files: ArrayLike<File>; descrizione?: string }) => Promise<{ mancanti: File[] }>;
  isUploading: boolean;
}

export function FotoUploader({ onUpload, isUploading }: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [descrizione, setDescrizione] = useState('');
  const [mancanti, setMancanti] = useState<File[]>([]);
  const [errore, setErrore] = useState(false);

  const handleCarica = async () => {
    const files = mancanti.length > 0 ? mancanti : Array.from(fileInputRef.current?.files ?? []);
    if (files.length === 0) return;
    try {
      const esito = await onUpload({ files, descrizione: descrizione.trim() || undefined });
      setMancanti(esito.mancanti);
      setErrore(false);
      if (esito.mancanti.length === 0) setDescrizione('');
    } catch {
      setMancanti(files);
      setErrore(true);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          {t("Carica Foto")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="foto-input">{t("Scatta o seleziona foto")}</Label>
          <input
            ref={fileInputRef}
            id="foto-input"
            type="file"
            accept="image/*"
            multiple
            disabled={isUploading}
            onChange={() => { setMancanti([]); setErrore(false); }}
            // Niente `capture`: forzerebbe la fotocamera, rendendo irraggiungibili le foto già scattate
            // (e ignorando `multiple`). Il telefono propone da solo «Scatta foto» o «Libreria».
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            {t("💡 Tocca per scattare con la fotocamera o scegliere dalla galleria")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="foto-descrizione">{t("Descrizione (opzionale)")}</Label>
          <Textarea
            id="foto-descrizione"
            placeholder={t("Aggiungi una descrizione...")}
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            rows={2}
          />
        </div>

        {mancanti.length > 0 && (
          <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{errore ? t("Caricamento interrotto") : t("Foto da completare")}</p>
            <ul>{mancanti.map((file, i) => <li key={i} className="break-all">{file.name}</li>)}</ul>
            <p className="mt-1">{t("Le foto già caricate o in attesa di rete sono conservate. Se chiudi, dovrai riselezionare quelle mancanti.")}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button onClick={handleCarica} disabled={isUploading} className="w-full sm:w-auto">
            {isUploading ? t("Caricamento...") : mancanti.length ? t("Riprova mancanti") : t("Carica foto")}
          </Button>
          <p className="text-xs text-gray-500">
            {t("Le coordinate GPS verranno acquisite automaticamente se disponibili")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
