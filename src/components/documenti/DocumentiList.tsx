import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Eye, FilePlus, Trash2, Loader2 } from 'lucide-react';
import { useDocumentoTemplates } from '@/hooks/useDocumentoTemplates';
import type { DocumentoTemplate, DocumentoTipo } from '@/types/fea';

interface DocumentiListProps {
  onSelect?: (template: DocumentoTemplate) => void;
  scope?: 'marketing' | 'cantieri';
  emptyTitle?: string;
  emptyDescription?: string;
}

const tipoBadgeColor: Record<DocumentoTipo, string> = {
  generico: 'bg-gray-100 text-gray-700',
  contratto: 'bg-blue-100 text-blue-700',
  verbale: 'bg-purple-100 text-purple-700',
  accettazione: 'bg-green-100 text-green-700',
  modulo: 'bg-yellow-100 text-yellow-700',
  preventivo: 'bg-orange-100 text-orange-700',
  sal: 'bg-cyan-100 text-cyan-700',
  ddt: 'bg-indigo-100 text-indigo-700',
  variante: 'bg-pink-100 text-pink-700',
};

const MARKETING_TYPES: DocumentoTipo[] = ['preventivo', 'accettazione', 'contratto'];
const CANTIERI_TYPES: DocumentoTipo[] = ['contratto', 'verbale', 'modulo', 'sal', 'ddt', 'variante', 'generico'];

function filterByScope(templates: DocumentoTemplate[], scope?: DocumentiListProps['scope']) {
  if (!scope) return templates;
  const allowed = scope === 'marketing' ? MARKETING_TYPES : CANTIERI_TYPES;
  return templates.filter((template) => allowed.includes(template.tipo_doc));
}

export function DocumentiList({
  onSelect,
  scope,
  emptyTitle = 'Nessun template ancora',
  emptyDescription = 'Carica il tuo primo template PDF o DOCX',
}: DocumentiListProps) {
  const { templates, isLoading, deleteTemplate } = useDocumentoTemplates();
  const visibleTemplates = filterByScope(templates, scope);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
        Caricamento template...
      </div>
    );
  }

  if (visibleTemplates.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <FileText className="h-12 w-12 text-slate-300 mx-auto" />
        <p className="text-slate-500 font-medium">{emptyTitle}</p>
        <p className="text-slate-400 text-sm">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {visibleTemplates.map((template) => (
        <Card key={template.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-orange-50">
                <FileText className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{template.nome}</p>
                {template.descrizione && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{template.descrizione}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Badge className={`text-xs ${tipoBadgeColor[template.tipo_doc]}`}>
                {template.tipo_doc}
              </Badge>
              <span className="text-xs text-slate-400 uppercase">{template.file_type}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {template.campi?.length ?? 0} campo{(template.campi?.length ?? 0) !== 1 ? 'i' : ''}
              </span>
              <span>
                {format(new Date(template.created_at), 'dd MMM yyyy', { locale: it })}
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => onSelect?.(template)}
              >
                <Eye className="h-3.5 w-3.5" />
                Visualizza
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => onSelect?.(template)}
              >
                <FilePlus className="h-3.5 w-3.5" />
                Usa
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => deleteTemplate.mutate(template.id)}
                disabled={deleteTemplate.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
