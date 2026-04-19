import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, History, Eye, Save } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapshotItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  unit_of_measure?: string;
  unit_price: number;
  discount_percent?: number;
  vat_rate: number;
  line_total?: number;
  sort_order?: number;
}

interface SnapshotQuote {
  quote_number?: string;
  title?: string;
  status?: string;
  subtotal?: number;
  discount_percent?: number;
  discount_amount?: number;
  vat_amount?: number;
  total?: number;
  notes?: string;
}

interface VersionSnapshot {
  quote: SnapshotQuote;
  items: SnapshotItem[];
  saved_at: string;
}

interface QuoteVersion {
  id: string;
  version_num: number;
  note: string | null;
  created_at: string;
  created_by: string | null;
  snapshot: VersionSnapshot;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  format(new Date(d), "dd MMM yyyy HH:mm", { locale: it });

// ─── Snapshot detail dialog ───────────────────────────────────────────────────

interface SnapshotDialogProps {
  version: QuoteVersion | null;
  onClose: () => void;
}

function SnapshotDialog({ version, onClose }: SnapshotDialogProps) {
  if (!version) return null;

  const { quote, items, saved_at } = version.snapshot;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Versione {version.version_num}
            {version.note && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {version.note}
              </span>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Salvata il {fmtDate(saved_at)}
          </p>
        </DialogHeader>

        {/* Quote info */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          {quote.quote_number && (
            <div>
              <span className="text-muted-foreground">Numero: </span>
              <span className="font-medium">{quote.quote_number}</span>
            </div>
          )}
          {quote.title && (
            <div>
              <span className="text-muted-foreground">Titolo: </span>
              <span className="font-medium">{quote.title}</span>
            </div>
          )}
          {quote.status && (
            <div>
              <span className="text-muted-foreground">Stato: </span>
              <Badge variant="outline">{quote.status}</Badge>
            </div>
          )}
        </div>

        {/* Items table */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna voce in questa versione.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prodotto / Servizio</TableHead>
                <TableHead className="text-right">Qtà</TableHead>
                <TableHead className="text-right">Prezzo</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Totale riga</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.id ?? idx}>
                  <TableCell>
                    <p className="font-medium">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {item.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.quantity} {item.unit_of_measure ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unit_price)}
                  </TableCell>
                  <TableCell className="text-right">{item.vat_rate}%</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.line_total ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-full max-w-xs space-y-1 text-sm">
            {quote.subtotal !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotale</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>
            )}
            {(quote.discount_percent ?? 0) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Sconto {quote.discount_percent}%</span>
                <span>-{formatCurrency(quote.discount_amount ?? 0)}</span>
              </div>
            )}
            {quote.vat_amount !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span>{formatCurrency(quote.vat_amount)}</span>
              </div>
            )}
            {quote.total !== undefined && (
              <>
                <hr />
                <div className="flex justify-between font-bold text-base">
                  <span>Totale</span>
                  <span>{formatCurrency(quote.total)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface VersioniPreventivoProps {
  quoteId: string;
}

export function VersioniPreventivo({ quoteId }: VersioniPreventivoProps) {
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: versions = [], isLoading, error } = useQuery<QuoteVersion[]>({
    queryKey: ["quote_versions", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      // `quote_versions` non è nelle generated types di Supabase: usiamo il
      // pattern `never` già in uso altrove nel progetto (vedi useFamilyPricing)
      // invece di un `as any` cieco, così TypeScript verifica almeno il nome
      // del metodo .from/.select.
      const { data, error: qErr } = await (supabase as never as typeof supabase)
        .from("quote_versions" as never)
        .select("id,version_num,note,created_at,created_by,snapshot")
        .eq("quote_id" as never, quoteId)
        .order("version_num" as never, { ascending: false });

      if (qErr) throw qErr;
      return (data ?? []) as QuoteVersion[];
    },
  });

  const handleSaveVersion = async () => {
    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "salva-versione-preventivo",
        { body: { quote_id: quoteId } }
      );
      if (fnErr) throw fnErr;
      toast.success(`Versione ${data?.version_num} salvata con successo`);
      queryClient.invalidateQueries({ queryKey: ["quote_versions", quoteId] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Errore durante il salvataggio";
      toast.error("Errore: " + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Storico Versioni
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveVersion}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? "Salvataggio..." : "Salva versione ora"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && error && (
            <p className="text-sm text-destructive">
              Errore caricamento versioni.
            </p>
          )}

          {!isLoading && !error && versions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessuna versione salvata. Le versioni vengono create automaticamente
              all'invio.
            </p>
          )}

          {!isLoading && !error && versions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Versione</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead className="text-right">Voci</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => {
                  const itemCount = v.snapshot?.items?.length ?? 0;
                  const total = v.snapshot?.quote?.total;

                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Badge variant="outline">v{v.version_num}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmtDate(v.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {v.note ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {itemCount}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {total !== undefined ? formatCurrency(total) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedVersion(v)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Visualizza
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SnapshotDialog
        version={selectedVersion}
        onClose={() => setSelectedVersion(null)}
      />
    </>
  );
}
