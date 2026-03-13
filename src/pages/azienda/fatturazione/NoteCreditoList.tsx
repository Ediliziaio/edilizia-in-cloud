import { useNavigate } from "react-router-dom";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileX2, Plus, Loader2 } from "lucide-react";
import type { DocumentoFiscale } from "@/types/fatturazione";

const STATO_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  emessa: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  accettata: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  annullata: "bg-destructive/10 text-destructive",
};

export default function NoteCreditoList() {
  const navigate = useNavigate();
  const { data, isLoading } = useDocumentiFiscali({ tipo: "nota_credito", perPage: 100 });
  const docs = data?.documenti ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Note di Credito</h1>
          <p className="text-muted-foreground">Gestisci le note di credito emesse.</p>
        </div>
        <Button onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_credito")}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Nota di Credito
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileX2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Nessuna nota di credito</p>
          <p className="text-sm text-muted-foreground/70">Le note di credito emesse appariranno qui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc: DocumentoFiscale) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/azienda/documenti/${doc.id}/dettaglio`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <FileX2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{doc.numero}</p>
                    <p className="text-sm text-muted-foreground">
                      {doc.cliente_snapshot?.ragione_sociale || "—"} · {doc.data_emissione}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={STATO_COLORS[doc.stato] ?? "bg-muted"}>
                    {doc.stato}
                  </Badge>
                  <span className="font-semibold">€ {doc.totale_documento.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
