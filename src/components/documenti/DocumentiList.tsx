import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from 'date-fns';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { FileText, Eye, FilePlus, Trash2, Loader2 } from 'lucide-react';
import { useDocumentoTemplates } from '@/hooks/useDocumentoTemplates';
import type { DocumentoTemplate, DocumentoTipo } from '@/types/fea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TemplateDocumentUse } from './TemplateDocumentUse';
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface DocumentiListProps {
  layout?: "cards" | "table";
  onSelect?: (template: DocumentoTemplate) => void;
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

export function DocumentiList({ onSelect, layout = "cards" }: DocumentiListProps) {
  const t = useT();
  const { templates, isLoading, error, refetch, deleteTemplate } = useDocumentoTemplates();
  const [selected, setSelected] = useState<DocumentoTemplate | null>(null);
  const confirm = useConfirm();
  if (error) return <div role="alert" className="rounded-xl border border-red-200 p-4 text-red-700">{t("Impossibile caricare i modelli. Verifica azienda e permessi.")} <Button variant="outline" onClick={() => void refetch()}>{t("Riprova")}</Button></div>;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("Caricamento template...")}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <FileText className="h-12 w-12 text-slate-300 mx-auto" />
        <p className="text-slate-500 font-medium">{t("Nessun template ancora")}</p>
        <p className="text-slate-400 text-sm">{t("Carica il tuo primo template PDF o DOCX")}</p>
      </div>
    );
  }

  return (
    <>{layout === "table" ? <Card className="overflow-hidden rounded-xl border-slate-200"><Table aria-label={t("Template moduli")} className="min-w-[1000px] text-xs [&_td]:px-3 [&_td]:py-2 [&_td]:border-r [&_td]:border-slate-100 [&_th]:px-3"><TableHeader className="bg-slate-50"><TableRow><TableHead>{t("Template")}</TableHead><TableHead>{t("Descrizione")}</TableHead><TableHead>{t("Tipo")}</TableHead><TableHead>{t("Formato")}</TableHead><TableHead>{t("Campi")}</TableHead><TableHead>{t("Creato il")}</TableHead><TableHead className="text-right">{t("Azioni")}</TableHead></TableRow></TableHeader><TableBody>{templates.map(template => <TableRow key={template.id}><TableCell className="max-w-[240px] truncate font-medium" title={template.nome}>{template.nome}</TableCell><TableCell className="max-w-[260px] truncate text-muted-foreground" title={template.descrizione || undefined}>{template.descrizione || "—"}</TableCell><TableCell><Badge className={`text-xs ${tipoBadgeColor[template.tipo_doc]}`}>{template.tipo_doc}</Badge></TableCell><TableCell className="uppercase">{template.file_type}</TableCell><TableCell>{template.campi?.length ?? 0}</TableCell><TableCell className="whitespace-nowrap">{format(new Date(template.created_at), 'dd MMM yyyy', {locale:dateFnsCampo()})}</TableCell><TableCell>            <div className="flex justify-end gap-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onSelect?.(template)}
              >
                <Eye className="h-3.5 w-3.5" />
                {t("Configura campi")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => setSelected(template)}
              >
                <FilePlus className="h-3.5 w-3.5" />
                {t("Compila")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                aria-label={t("Elimina template {nome}", { nome: String(template.nome ?? "") })}
                onClick={async () => {
                  if (
                    await confirm({
                      title: t("Eliminare il template documento?"),
                      description: t("Il template \"{nome}\" verrà disattivato. I documenti già generati non saranno modificati.", { nome: String(template.nome ?? "") }),
                      confirmLabel: 'Elimina',
                      variant: 'destructive',
                    })
                  ) {
                    deleteTemplate.mutate(template.id);
                  }
                }}
                disabled={deleteTemplate.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
</TableCell></TableRow>)}</TableBody></Table></Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <Card key={template.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-orange-50">
                <FileText className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 break-words">{template.nome}</p>
                {template.descrizione && (
                  <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{template.descrizione}</p>
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
                {(template.campi?.length ?? 0) === 1 ? t("{n} campo", { n: 1 }) : t("{n} campi", { n: template.campi?.length ?? 0 })}
              </span>
              <span>
                {format(new Date(template.created_at), 'dd MMM yyyy', { locale: dateFnsCampo() })}
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
                {t("Configura campi")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => setSelected(template)}
              >
                <FilePlus className="h-3.5 w-3.5" />
                {t("Compila")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                aria-label={t("Elimina template {nome}", { nome: String(template.nome ?? "") })}
                onClick={async () => {
                  if (
                    await confirm({
                      title: t("Eliminare il template documento?"),
                      description: t("Il template \"{nome}\" verrà disattivato. I documenti già generati non saranno modificati.", { nome: String(template.nome ?? "") }),
                      confirmLabel: 'Elimina',
                      variant: 'destructive',
                    })
                  ) {
                    deleteTemplate.mutate(template.id);
                  }
                }}
                disabled={deleteTemplate.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>{selected?.nome}</DialogTitle><DialogDescription>{t("Compila i campi e controlla il documento prima di utilizzarlo.")}</DialogDescription></DialogHeader>
        {selected && <TemplateDocumentUse key={selected.id} template={selected} />}
      </DialogContent>
    </Dialog></>
  );
}
