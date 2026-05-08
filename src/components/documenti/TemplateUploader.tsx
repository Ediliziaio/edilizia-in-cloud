import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, FileText, X } from 'lucide-react';
import type { DocumentoTipo } from '@/types/fea';

interface TemplateUploaderProps {
  onUpload: (file: File, nome: string, descrizione: string, tipo_doc: string) => void;
  isLoading?: boolean;
}

const TIPI_DOC: { value: DocumentoTipo; label: string }[] = [
  { value: 'generico', label: 'Generico' },
  { value: 'contratto', label: 'Contratto' },
  { value: 'verbale', label: 'Verbale' },
  { value: 'accettazione', label: 'Accettazione' },
  { value: 'modulo', label: 'Modulo' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'sal', label: 'SAL' },
  { value: 'ddt', label: 'DDT' },
  { value: 'variante', label: 'Variante' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function TemplateUploader({ onUpload, isLoading }: TemplateUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [tipoDoc, setTipoDoc] = useState<DocumentoTipo>('generico');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (f: File): boolean => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(ext ?? '')) {
      setFileError('Solo file PDF e DOCX sono accettati');
      return false;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError('Il file non deve superare 10 MB');
      return false;
    }
    setFileError('');
    return true;
  };

  const handleFile = (f: File) => {
    if (validateFile(f)) {
      setFile(f);
      if (!nome) setNome(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !nome) return;
    onUpload(file, nome, descrizione, tipoDoc);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-orange-400 bg-orange-50'
            : file
            ? 'border-green-400 bg-green-50'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={handleInputChange}
        />

        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-green-600" />
            <div className="text-left">
              <p className="font-medium text-slate-800">{file.name}</p>
              <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="ml-2 text-slate-400 hover:text-red-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-10 w-10 text-slate-400 mx-auto" />
            <p className="font-medium text-slate-700">Trascina qui il documento o clicca per selezionare</p>
            <p className="text-sm text-slate-400">PDF o DOCX, max 10 MB</p>
          </div>
        )}
      </div>

      {fileError && <p className="text-sm text-red-600">{fileError}</p>}

      {/* Nome template */}
      <div className="space-y-1.5">
        <Label htmlFor="template-nome">Nome template *</Label>
        <Input
          id="template-nome"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Es. Contratto di appalto standard"
        />
      </div>

      {/* Descrizione */}
      <div className="space-y-1.5">
        <Label htmlFor="template-desc">Descrizione</Label>
        <textarea
          id="template-desc"
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="Descrizione opzionale del template..."
          className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>

      {/* Tipo documento */}
      <div className="space-y-1.5">
        <Label htmlFor="tipo-doc">Tipo documento</Label>
        <Select value={tipoDoc} onValueChange={(v) => setTipoDoc(v as DocumentoTipo)}>
          <SelectTrigger id="tipo-doc">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPI_DOC.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={!file || !nome || isLoading}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
      >
        {isLoading ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Caricamento in corso...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" />Carica template</>
        )}
      </Button>
    </form>
  );
}
