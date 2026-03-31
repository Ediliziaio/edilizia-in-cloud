import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Download,
  Upload,
  Search,
  Eye,
  FileText,
  CheckCircle2,
  Inbox,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────

interface FatturaRicevuta {
  id: string;
  company_id: string;
  sdi_id_trasmissione: string | null;
  cedente_piva: string;
  cedente_cf: string;
  cedente_ragione_sociale: string;
  cedente_paese: string;
  tipo_documento: string;
  numero_fattura: string;
  data_fattura: string;
  imponibile_totale: number;
  iva_totale: number;
  totale_documento: number;
  righe: Record<string, unknown>[];
  riepilogo_iva: Record<string, unknown>[];
  xml_raw: string | null;
  xml_url: string | null;
  stato: "non_letta" | "letta" | "contabilizzata" | "rifiutata";
  note: string | null;
  created_at: string;
}

// ─── Stato Badge ──────────────────────────────────────────────

const STATO_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  non_letta: { label: "Non letta", variant: "destructive" },
  letta: { label: "Letta", variant: "outline" },
  contabilizzata: { label: "Contabilizzata", variant: "secondary" },
  rifiutata: { label: "Rifiutata", variant: "destructive" },
};

function StatoBadge({ stato }: { stato: string }) {
  const config = STATO_CONFIG[stato] || { label: stato, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─── Component ────────────────────────────────────────────────

export default function FattureRicevutePage() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [xmlPreview, setXmlPreview] = useState<string | null>(null);
  const [contabilizzaFattura, setContabilizzaFattura] = useState<FatturaRicevuta | null>(null);

  // ─── Data Query ──────────────────────────────────────────

  const { data: fatture = [], isLoading } = useQuery({
    queryKey: ["fatture-ricevute", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatture_ricevute" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("data_fattura", { ascending: false });

      if (error) throw error;
      return (data as unknown as FatturaRicevuta[]) ?? [];
    },
  });

  // ─── KPI ────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const totale = fatture.length;
    const nonLette = fatture.filter((f) => f.stato === "non_letta").length;
    const contabilizzate = fatture.filter((f) => f.stato === "contabilizzata").length;
    const importoTotale = fatture.reduce((s, f) => s + (f.totale_documento ?? 0), 0);
    return { totale, nonLette, contabilizzate, importoTotale };
  }, [fatture]);

  // ─── Filters ────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = fatture;
    if (statoFilter !== "all") {
      result = result.filter((f) => f.stato === statoFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.cedente_ragione_sociale?.toLowerCase().includes(q) ||
          f.numero_fattura?.toLowerCase().includes(q) ||
          f.cedente_piva?.includes(q)
      );
    }
    return result;
  }, [fatture, statoFilter, searchQuery]);

  // ─── Mutations ──────────────────────────────────────────

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase
        .from("fatture_ricevute" as never)
        .update({ stato, updated_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      toast.success("Stato aggiornato");
    },
    onError: (e) => toast.error(`Errore: ${e.message}`),
  });

  const uploadMutation = useMutation({
    mutationFn: async (xmlContent: string) => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const resp = await supabase.functions.invoke("ricevi-sdi", {
        body: { xml_content: xmlContent, company_id: companyId },
      });

      if (resp.error) throw resp.error;
      return resp.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      if (data?.duplicate) {
        toast.info("Fattura già presente nel sistema");
      } else {
        toast.success("Fattura XML importata con successo");
      }
    },
    onError: (e) => toast.error(`Errore importazione: ${e.message}`),
  });

  // ─── File Upload Handler ────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xml") && !file.name.endsWith(".p7m")) {
      toast.error("Seleziona un file XML FatturaPA (.xml o .p7m)");
      return;
    }

    const text = await file.text();
    uploadMutation.mutate(text);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Mark as read on view ──────────────────────────────

  const handleViewXml = (f: FatturaRicevuta) => {
    if (f.xml_raw) {
      setXmlPreview(f.xml_raw);
    }
    if (f.stato === "non_letta") {
      updateStatoMutation.mutate({ id: f.id, stato: "letta" });
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fatture Ricevute</h1>
          <p className="text-sm text-muted-foreground">
            Fatture passive ricevute dal Sistema di Interscambio
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.p7m"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importa XML
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale ricevute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.totale}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Da leggere
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{kpi.nonLette}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contabilizzate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{kpi.contabilizzate}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Importo totale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpi.importoTotale)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per fornitore, numero fattura, P.IVA..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statoFilter} onValueChange={setStatoFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="non_letta">Non lette</SelectItem>
            <SelectItem value="letta">Lette</SelectItem>
            <SelectItem value="contabilizzata">Contabilizzate</SelectItem>
            <SelectItem value="rifiutata">Rifiutate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">Nessuna fattura ricevuta</p>
          <p className="text-sm">
            Le fatture arriveranno automaticamente dal SDI oppure puoi importare XML manualmente.
          </p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornitore</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Numero</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Imponibile</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Totale</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow
                  key={f.id}
                  className={f.stato === "non_letta" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}
                >
                  <TableCell>
                    <div>
                      <div className="font-medium">{f.cedente_ragione_sociale}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.cedente_piva ? `P.IVA ${f.cedente_piva}` : f.cedente_cf}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono">{f.tipo_documento}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{f.numero_fattura}</TableCell>
                  <TableCell>{formatDateShort(f.data_fattura)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(f.imponibile_totale)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(f.iva_totale)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(f.totale_documento)}
                  </TableCell>
                  <TableCell>
                    <StatoBadge stato={f.stato} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {f.xml_raw && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Anteprima XML"
                          onClick={() => handleViewXml(f)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {f.xml_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Scarica XML"
                          onClick={async () => {
                            const { data } = await supabase.storage
                              .from("fatture-xml")
                              .download(f.xml_url!);
                            if (data) {
                              const url = URL.createObjectURL(data);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = f.xml_url!.split("/").pop() ?? "fattura.xml";
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {f.stato === "letta" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                          title="Contabilizza"
                          onClick={() => setContabilizzaFattura(f)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Contabilizza
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Contabilizza Confirmation Dialog */}
      <AlertDialog open={!!contabilizzaFattura} onOpenChange={(open) => { if (!open) setContabilizzaFattura(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contabilizza fattura ricevuta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Confermi la contabilizzazione di questa fattura passiva?</p>
                {contabilizzaFattura && (
                  <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cedente</span>
                      <span className="font-medium">{contabilizzaFattura.cedente_ragione_sociale}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Numero</span>
                      <span className="font-mono">{contabilizzaFattura.numero_fattura}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Importo totale</span>
                      <span className="font-semibold">{formatCurrency(contabilizzaFattura.totale_documento)}</span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (contabilizzaFattura) {
                  updateStatoMutation.mutate(
                    { id: contabilizzaFattura.id, stato: "contabilizzata" },
                    {
                      onSuccess: () => {
                        toast.success("Fattura contabilizzata", {
                          description: `${contabilizzaFattura.cedente_ragione_sociale} — ${formatCurrency(contabilizzaFattura.totale_documento)}`,
                        });
                        setContabilizzaFattura(null);
                      },
                    }
                  );
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Contabilizza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* XML Preview Dialog */}
      <Dialog open={!!xmlPreview} onOpenChange={() => setXmlPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Anteprima XML FatturaPA
            </DialogTitle>
          </DialogHeader>
          <pre className="overflow-auto bg-muted p-4 rounded-md text-xs font-mono max-h-[60vh] whitespace-pre-wrap">
            {xmlPreview}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
