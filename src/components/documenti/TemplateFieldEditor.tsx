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
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useTemplateFields } from '@/hooks/useDocumentoTemplates';
import type { FieldTipo } from '@/types/fea';

interface TemplateFieldEditorProps {
  templateId: string;
  companyId: string;
}

const TIPI_CAMPO: { value: FieldTipo; label: string }[] = [
  { value: 'testo', label: 'Testo' },
  { value: 'numero', label: 'Numero' },
  { value: 'data', label: 'Data' },
  { value: 'valuta', label: 'Valuta (€)' },
  { value: 'scelta', label: 'Scelta multipla' },
  { value: 'email', label: 'Email' },
  { value: 'telefono', label: 'Telefono' },
];

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function TemplateFieldEditor({ templateId, companyId }: TemplateFieldEditorProps) {
  const { fields, isLoading, addField, removeField } = useTemplateFields(templateId);

  const [nome, setNome] = useState('');
  const [etichetta, setEtichetta] = useState('');
  const [tipo, setTipo] = useState<FieldTipo>('testo');
  const [obbligatorio, setObbligatorio] = useState(true);
  const [opzioniRaw, setOpzioniRaw] = useState('');

  const handleEtichettaChange = (v: string) => {
    setEtichetta(v);
    if (!nome) setNome(toSlug(v));
  };

  const handleNomeChange = (v: string) => {
    setNome(toSlug(v));
  };

  const segnaposto = nome ? `{{${nome}}}` : '';

  const handleAdd = () => {
    if (!nome || !etichetta) return;
    const opzioniScelta = tipo === 'scelta'
      ? opzioniRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    addField.mutate({
      template_id: templateId,
      company_id: companyId,
      nome,
      etichetta,
      tipo,
      segnaposto: segnaposto || `{{${nome}}}`,
      opzioni_scelta: opzioniScelta,
      obbligatorio,
      valore_default: null,
      ordinamento: fields.length,
    }, {
      onSuccess: () => {
        setNome('');
        setEtichetta('');
        setTipo('testo');
        setObbligatorio(true);
        setOpzioniRaw('');
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Lista campi esistenti */}
      {!isLoading && fields.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-700">Campi configurati</h4>
          <div className="space-y-1.5">
            {fields.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border"
              >
                <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{f.etichetta}</p>
                  <p className="text-xs text-slate-500">
                    {f.segnaposto} · {f.tipo}
                    {f.obbligatorio && ' · obbligatorio'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:bg-red-50 hover:text-red-700"
                  onClick={() => removeField.mutate(f.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form aggiungi campo */}
      <div className="space-y-4 border rounded-xl p-4 bg-slate-50">
        <h4 className="text-sm font-semibold text-slate-700">Aggiungi campo</h4>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="field-etichetta">Etichetta visibile *</Label>
            <Input
              id="field-etichetta"
              value={etichetta}
              onChange={(e) => handleEtichettaChange(e.target.value)}
              placeholder="Es. Nome cliente"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-nome">Nome tecnico</Label>
            <Input
              id="field-nome"
              value={nome}
              onChange={(e) => handleNomeChange(e.target.value)}
              placeholder="nome_cliente"
            />
            {segnaposto && (
              <p className="text-xs text-slate-500">Segnaposto: <code>{segnaposto}</code></p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo campo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as FieldTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_CAMPO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obbligatorio">Obbligatorio</Label>
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="obbligatorio"
                checked={obbligatorio}
                onCheckedChange={setObbligatorio}
              />
              <span className="text-sm text-slate-600">{obbligatorio ? 'Sì' : 'No'}</span>
            </div>
          </div>
        </div>

        {tipo === 'scelta' && (
          <div className="space-y-1.5">
            <Label htmlFor="opzioni">Opzioni (separate da virgola)</Label>
            <Input
              id="opzioni"
              value={opzioniRaw}
              onChange={(e) => setOpzioniRaw(e.target.value)}
              placeholder="Opzione 1, Opzione 2, Opzione 3"
            />
          </div>
        )}

        <Button
          type="button"
          onClick={handleAdd}
          disabled={!nome || !etichetta || addField.isPending}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          Aggiungi campo
        </Button>
      </div>
    </div>
  );
}
