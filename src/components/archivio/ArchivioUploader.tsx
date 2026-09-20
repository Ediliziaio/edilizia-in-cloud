import { useState, useRef } from 'react';
import { ArchivioDocument } from '@/hooks/useArchivioSostitutivo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Info, Upload } from 'lucide-react';

interface Props {
  onUpload: (params: {
    file: File;
    tipo_documento: ArchivioDocument['tipo_documento'];
    anno_fiscale: number;
    note?: string;
  }) => Promise<void>;
  isUploading: boolean;
}

const TIPO_DOCUMENTO_LABELS: Record<ArchivioDocument['tipo_documento'], string> = {
  fattura_attiva: 'Fattura attiva',
  fattura_passiva: 'Fattura passiva',
  nota_credito: 'Nota di credito',
  altro: 'Altro',
};

interface FormState {
  tipo_documento: ArchivioDocument['tipo_documento'] | '';
  anno_fiscale: string;
  note: string;
  file: File | null;
}

export function ArchivioUploader({ onUpload, isUploading }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>({
    tipo_documento: '',
    anno_fiscale: String(new Date().getFullYear()),
    note: '',
    file: null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file || !form.tipo_documento || !form.anno_fiscale) return;

    await onUpload({
      file: form.file,
      tipo_documento: form.tipo_documento as ArchivioDocument['tipo_documento'],
      anno_fiscale: parseInt(form.anno_fiscale),
      note: form.note || undefined,
    });

    // Reset form
    setForm({
      tipo_documento: '',
      anno_fiscale: String(new Date().getFullYear()),
      note: '',
      file: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isValid = !!form.file && !!form.tipo_documento && !!form.anno_fiscale;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Archivia Documento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo documento</Label>
            <Select
              value={form.tipo_documento}
              onValueChange={v =>
                setForm(f => ({ ...f, tipo_documento: v as ArchivioDocument['tipo_documento'] }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo..." />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TIPO_DOCUMENTO_LABELS) as [ArchivioDocument['tipo_documento'], string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Anno fiscale</Label>
            <Input
              type="number"
              min="2000"
              max="2099"
              value={form.anno_fiscale}
              onChange={e => setForm(f => ({ ...f, anno_fiscale: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>File</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xml,.p7m"
              onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))}
            />
            <p className="text-xs text-muted-foreground">Formati accettati: PDF, XML, P7M</p>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              placeholder="Note opzionali sul documento..."
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
            <span>
              Del documento si calcola l'impronta SHA-256, che serve a riconoscere se il file
              cambia. Non è una firma digitale.
            </span>
          </div>

          <Button type="submit" disabled={isUploading || !isValid}>
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? 'Archiviazione in corso...' : 'Archivia Documento'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
