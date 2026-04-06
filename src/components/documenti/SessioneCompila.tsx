import { useState } from 'react';
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
import { Loader2, FileText } from 'lucide-react';
import type { DocumentoTemplate, DocumentoTemplateField } from '@/types/fea';

interface SessioneCompilaProps {
  template: DocumentoTemplate;
  onSubmit: (valori: Record<string, string>, nome: string) => void;
  isLoading?: boolean;
}

function FieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: DocumentoTemplateField;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  switch (field.tipo) {
    case 'numero':
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.etichetta}
          className={error ? 'border-red-400' : ''}
        />
      );
    case 'data':
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={error ? 'border-red-400' : ''}
        />
      );
    case 'valuta':
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">€</span>
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0,00"
            className={`pl-8 ${error ? 'border-red-400' : ''}`}
          />
        </div>
      );
    case 'scelta':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={error ? 'border-red-400' : ''}>
            <SelectValue placeholder="Seleziona..." />
          </SelectTrigger>
          <SelectContent>
            {(field.opzioni_scelta ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'email':
      return (
        <Input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.etichetta}
          className={error ? 'border-red-400' : ''}
        />
      );
    case 'telefono':
      return (
        <Input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.etichetta}
          className={error ? 'border-red-400' : ''}
        />
      );
    default:
      return (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.etichetta}
          className={error ? 'border-red-400' : ''}
        />
      );
  }
}

export function SessioneCompila({ template, onSubmit, isLoading }: SessioneCompilaProps) {
  const campi = template.campi ?? [];
  const [valori, setValori] = useState<Record<string, string>>({});
  const [nomeSessione, setNomeSessione] = useState(`${template.nome} — ${new Date().toLocaleDateString('it-IT')}`);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const updateValore = (nome: string, valore: string) => {
    setValori((prev) => ({ ...prev, [nome]: valore }));
    if (errors[nome]) setErrors((prev) => ({ ...prev, [nome]: false }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validazione obbligatorietà
    const newErrors: Record<string, boolean> = {};
    campi.forEach((f) => {
      if (f.obbligatorio && !valori[f.nome]?.trim()) {
        newErrors[f.nome] = true;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(valori, nomeSessione);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Nome sessione */}
      <div className="space-y-1.5">
        <Label htmlFor="nome-sessione">Nome documento</Label>
        <Input
          id="nome-sessione"
          value={nomeSessione}
          onChange={(e) => setNomeSessione(e.target.value)}
          required
        />
      </div>

      {/* Header template */}
      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border">
        <FileText className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium text-slate-700">{template.nome}</span>
        <span className="text-xs text-slate-400 ml-auto">{template.tipo_doc}</span>
      </div>

      {campi.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">
          Questo template non ha campi personalizzati.
        </p>
      )}

      {/* Campi dinamici */}
      {campi
        .sort((a, b) => a.ordinamento - b.ordinamento)
        .map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={`field-${f.nome}`}>
              {f.etichetta}
              {f.obbligatorio && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <FieldInput
              field={f}
              value={valori[f.nome] ?? ''}
              onChange={(v) => updateValore(f.nome, v)}
              error={errors[f.nome]}
            />
            {errors[f.nome] && (
              <p className="text-xs text-red-600">Campo obbligatorio</p>
            )}
          </div>
        ))}

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
      >
        {isLoading ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creazione in corso...</>
        ) : (
          'Crea documento'
        )}
      </Button>
    </form>
  );
}
