// MP04 — Pagina elenco template Meta (sync + anteprima).

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Loader2, RefreshCcw, Eye, Search } from "lucide-react";
import {
  useSyncMetaTemplates,
  useWAMetaTemplates,
} from "@/hooks/whatsapp/useWAMetaTemplates";
import type { WAMetaTemplate } from "@/hooks/whatsapp/useWAMetaTemplates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function statusColor(status: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function TemplatesPage() {
  const { data: templates, isLoading, isError, error, refetch, isFetching } = useWAMetaTemplates(undefined, false);
  const sync = useSyncMetaTemplates();
  const [preview, setPreview] = useState<WAMetaTemplate | null>(null);
  const [search, setSearch] = useState("");

  const filteredTemplates = (templates ?? []).filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      t.template_name,
      t.template_language,
      t.category,
      t.status,
    ].some((value) => (value ?? "").toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Template WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Template Meta Business Manager sincronizzati. Solo quelli APPROVED possono essere usati per broadcast.
          </p>
        </div>
        <Button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          aria-label="Sincronizza template"
        >
          {sync.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          Sincronizza da Meta
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Elenco template</CardTitle>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Cerca nome, lingua, stato..."
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && isError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium">Template non caricati</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(error as Error)?.message || "Errore nel caricamento dei template Meta."}
              </p>
              <Button className="mt-4" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Riprova
              </Button>
            </div>
          )}
          {!isLoading && !isError && (templates?.length ?? 0) === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Nessun template sincronizzato. Clicca "Sincronizza da Meta" per importarli.
            </div>
          )}
          {!isLoading && !isError && templates && templates.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Lingua</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Variabili</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.template_name}</TableCell>
                      <TableCell className="uppercase">{t.template_language}</TableCell>
                      <TableCell>{t.category ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(t.status)}>
                          {t.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.variables_count ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreview(t)}
                          aria-label={`Anteprima ${t.template_name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredTemplates.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessun template corrisponde ai filtri.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Anteprima template: {preview?.template_name}</DialogTitle>
            <DialogDescription>
              Lingua {preview?.template_language?.toUpperCase()} — Categoria {preview?.category ?? "N/A"} — Variabili {preview?.variables_count ?? 0}
            </DialogDescription>
          </DialogHeader>
          <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto">
            {preview?.components_json ? JSON.stringify(preview.components_json, null, 2) : "—"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
