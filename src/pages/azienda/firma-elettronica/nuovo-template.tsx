import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight, ChevronLeft, FileText } from 'lucide-react';
import { TemplateUploader } from '@/components/documenti/TemplateUploader';
import { TemplateFieldEditor } from '@/components/documenti/TemplateFieldEditor';
import { useDocumentoTemplates } from '@/hooks/useDocumentoTemplates';
import { useAuth } from '@/contexts/AuthContext';
import type { DocumentoTipo } from '@/types/fea';

type WizardStep = 1 | 2 | 3;

const STEPS = [
  { id: 1, label: 'Carica template' },
  { id: 2, label: 'Configura campi' },
  { id: 3, label: 'Riepilogo' },
];

const TEMPLATE_TYPES: Record<'marketing' | 'cantieri', { title: string; description: string; defaultType: DocumentoTipo; options: { value: DocumentoTipo; label: string }[] }> = {
  marketing: {
    title: 'Nuovo Template Commerciale',
    description: 'Carica preventivi, accettazioni o contratti commerciali usati da Marketing & Vendite.',
    defaultType: 'preventivo',
    options: [
      { value: 'preventivo', label: 'Preventivo' },
      { value: 'accettazione', label: 'Accettazione preventivo' },
      { value: 'contratto', label: 'Contratto commerciale' },
    ],
  },
  cantieri: {
    title: 'Nuovo Template Operativo',
    description: 'Carica collaudi, DDT, SAL, varianti, verbali e contratti legati a clienti e commesse.',
    defaultType: 'modulo',
    options: [
      { value: 'modulo', label: 'Modulo / Collaudo' },
      { value: 'ddt', label: 'DDT' },
      { value: 'sal', label: 'SAL' },
      { value: 'verbale', label: 'Verbale' },
      { value: 'variante', label: 'Variante' },
      { value: 'contratto', label: 'Contratto operativo' },
      { value: 'generico', label: 'Generico operativo' },
    ],
  },
};

function getSafeReturnTo(value: string | null, scope: 'marketing' | 'cantieri') {
  if (value?.startsWith('/azienda/')) return value;
  return scope === 'cantieri' ? '/azienda/firma-elettronica-cantieri' : '/azienda/firma-elettronica';
}

export default function NuovoTemplate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { effectiveCompany } = useAuth();
  const { uploadTemplate } = useDocumentoTemplates();
  const templateIdFromQuery = searchParams.get('templateId');
  const [step, setStep] = useState<WizardStep>(templateIdFromQuery ? 2 : 1);
  const [templateId, setTemplateId] = useState<string | null>(templateIdFromQuery);
  const [templateNome, setTemplateNome] = useState(templateIdFromQuery ? 'selezionato' : '');
  const scope = searchParams.get('scope') === 'cantieri' ? 'cantieri' : 'marketing';
  const copy = TEMPLATE_TYPES[scope];
  const returnTo = getSafeReturnTo(searchParams.get('returnTo'), scope);

  const handleUpload = async (
    file: File,
    nome: string,
    descrizione: string,
    tipo_doc: string
  ) => {
    const id = await uploadTemplate.mutateAsync({ file, nome, descrizione, tipo_doc });
    setTemplateId(id);
    setTemplateNome(nome);
    setStep(2);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(returnTo)}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Indietro
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{copy.title}</h1>
          <p className="text-sm text-slate-500">{copy.description}</p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step > s.id
                    ? 'bg-green-500 text-white'
                    : step === s.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
              </div>
              <span className="text-xs text-slate-500 mt-1 whitespace-nowrap">{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-2 ${step > s.id ? 'bg-green-300' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Carica il documento template</h2>
            <TemplateUploader
              onUpload={handleUpload}
              isLoading={uploadTemplate.isPending}
              allowedTypes={copy.options}
              defaultTipoDoc={copy.defaultType}
              descriptionPlaceholder={scope === 'cantieri'
                ? 'Es. Modulo collaudo cliente, DDT consegna materiali, SAL o verbale sopralluogo...'
                : 'Es. Preventivo standard, condizioni accettazione o contratto commerciale...'
              }
            />
          </div>
        )}

        {step === 2 && templateId && effectiveCompany && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Configura i campi personalizzati</h2>
            <p className="text-sm text-slate-500">
              Aggiungi i campi che verranno compilati prima di inviare il documento per la firma.
              Usa i segnaposto (es. <code className="bg-slate-100 px-1 rounded">{'{{nome_cliente}}'}</code>) nel documento originale.
            </p>
            <TemplateFieldEditor
              templateId={templateId}
              companyId={effectiveCompany.id}
            />
            <div className="pt-4 flex justify-end">
              <Button
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => setStep(3)}
              >
                Continua
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Template creato!</h2>
              <p className="text-slate-500 text-sm mt-2">
                Il template <strong>{templateNome}</strong> è pronto per essere utilizzato.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => navigate(returnTo)}
              >
                <FileText className="h-4 w-4" />
                Vai ai documenti
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setTemplateId(null);
                  setTemplateNome('');
                }}
              >
                Crea un altro template
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
