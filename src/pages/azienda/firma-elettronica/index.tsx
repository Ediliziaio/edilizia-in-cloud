import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileText, FileSignature, Loader2 } from 'lucide-react';
import { DocumentiList } from '@/components/documenti/DocumentiList';
import { useDocumentoSessioni } from '@/hooks/useDocumentoSessioni';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { FEABadge } from '@/components/fea/FEABadge';
import { FEABannerEsVsFea } from "@/components/fea/FEABannerEsVsFea";
import type { DocumentoTemplate } from '@/types/fea';

export default function FirmaElettronicaHub() {
  const navigate = useNavigate();
  const { sessioni, isLoading } = useDocumentoSessioni();

  const handleSelectTemplate = (template: DocumentoTemplate) => {
    navigate(`/azienda/firma-elettronica/nuovo-template?templateId=${template.id}`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <FEABannerEsVsFea />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileSignature className="h-6 w-6 text-orange-500" />
            Documenti & FEA
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestisci template, documenti personalizzati e firme elettroniche avanzate
          </p>
        </div>
        <Button
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => navigate('/azienda/firma-elettronica/nuovo-template')}
        >
          <Plus className="h-4 w-4" />
          Nuovo Template
        </Button>
      </div>

      <Tabs defaultValue="template">
        <TabsList>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="documenti">Documenti</TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="mt-4">
          <DocumentiList onSelect={handleSelectTemplate} />
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Caricamento documenti...
            </div>
          ) : sessioni.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <FileText className="h-12 w-12 text-slate-300 mx-auto" />
              <p className="text-slate-500 font-medium">Nessun documento ancora</p>
              <p className="text-slate-400 text-sm">
                Crea un documento da un template per iniziare
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessioni.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 p-4 bg-white border rounded-xl hover:shadow-sm transition-shadow"
                >
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{s.nome}</p>
                    {s.template && (
                      <p className="text-xs text-slate-500">{s.template.nome}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <FEABadge stato={s.stato === 'firmato' ? 'signed' : s.stato === 'in_firma' ? 'pending' : null} />
                    <span className="text-xs text-slate-400">
                      {format(new Date(s.created_at), 'dd MMM yyyy', { locale: it })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
