import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight, ChevronLeft, FileText } from 'lucide-react';
import { TemplateUploader } from '@/components/documenti/TemplateUploader';
import { TemplateFieldEditor } from '@/components/documenti/TemplateFieldEditor';
import { useDocumentoTemplates } from '@/hooks/useDocumentoTemplates';
import { useAuth } from '@/contexts/AuthContext';

type WizardStep = 1 | 2 | 3;

const STEPS = [
  { id: 1, label: 'Carica template' },
  { id: 2, label: 'Configura campi' },
  { id: 3, label: 'Riepilogo' },
];

export default function NuovoTemplate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { effectiveCompany } = useAuth();
  const { templates, uploadTemplate } = useDocumentoTemplates();
  const [step, setStep] = useState<WizardStep>(1);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateNome, setTemplateNome] = useState('');

  // ── Template già esistente (?templateId) ──────────────────────────────────
  // "Usa" su un template dell'elenco portava qui passando l'identificativo, e
  // questa pagina lo ignorava: si finiva al passo 1 con la richiesta di
  // caricare un nuovo file, cioè esattamente il contrario di "usa questo".
  // Derivato, non messo in stato: così non serve un effect che rincorra
  // l'elenco quando arriva, e "Crea un altro template" torna qui senza il
  // parametro invece di dover disfare uno stato.
  const templateIdDaUrl = searchParams.get('templateId');
  const templateDaUrl = templateIdDaUrl
    ? templates.find((t) => t.id === templateIdDaUrl)
    : undefined;

  // Quando si arriva da "Usa", il template è quello e il passo utile è il 2.
  const templateCorrente = templateId ?? templateDaUrl?.id ?? null;
  const nomeCorrente = templateNome || templateDaUrl?.nome || '';
  const passoCorrente: WizardStep = templateDaUrl && step === 1 ? 2 : step;

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
    // Da tablet in su il margine lo dà già il layout, e il modulo parte da
    // sinistra come il titolo delle altre pagine invece di restare al centro.
    <div className="p-6 max-w-2xl mx-auto space-y-6 sm:mx-0 sm:max-w-3xl sm:p-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/azienda/firma-elettronica')}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Indietro
        </Button>
        <h1 className="text-xl font-bold text-slate-800">
          {templateDaUrl ? 'Campi del template' : 'Nuovo Template'}
        </h1>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  passoCorrente > s.id
                    ? 'bg-green-500 text-white'
                    : passoCorrente === s.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {passoCorrente > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
              </div>
              <span className="text-xs text-slate-500 mt-1 whitespace-nowrap">{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-2 ${passoCorrente > s.id ? 'bg-green-300' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border p-6 shadow-sm">
        {passoCorrente === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Carica il documento template</h2>
            <TemplateUploader
              onUpload={handleUpload}
              isLoading={uploadTemplate.isPending}
            />
          </div>
        )}

        {passoCorrente === 2 && templateCorrente && effectiveCompany && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Configura i campi personalizzati</h2>
            <p className="text-sm text-slate-500">
              Aggiungi i campi che verranno compilati prima di inviare il documento per la firma.
              Usa i segnaposto (es. <code className="bg-slate-100 px-1 rounded">{'{{nome_cliente}}'}</code>) nel documento originale.
            </p>
            <TemplateFieldEditor
              templateId={templateCorrente}
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

        {passoCorrente === 3 && (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {templateDaUrl ? 'Template pronto' : 'Template creato!'}
              </h2>
              <p className="text-slate-500 text-sm mt-2">
                Il template <strong>{nomeCorrente}</strong> è pronto per essere utilizzato.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => navigate('/azienda/firma-elettronica')}
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
                  // Senza questo, `templateDaUrl` riporterebbe subito al passo 2.
                  if (templateIdDaUrl) navigate('/azienda/firma-elettronica/nuovo-template', { replace: true });
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
