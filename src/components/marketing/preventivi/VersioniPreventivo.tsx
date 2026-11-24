import { useState } from "react";
import { parseQuoteVersionSnapshot, type VersionSnapshot } from "@/lib/quotes/versionSnapshot";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
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
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  format(new Date(d), "dd MMM yyyy HH:mm", { locale: dateFnsCampo() });

// ─── Snapshot detail dialog ───────────────────────────────────────────────────

interface SnapshotDialogProps {
  version: QuoteVersion | null;
  onClose: () => void;
}

function SnapshotDialog({ version, onClose }: SnapshotDialogProps) {
  const t = useT();
  if (!version) return null;

  const { quote, items, saved_at } = version.snapshot;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("Versione {n}", { n: version.version_num })}
            {version.note && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {version.note}
              </span>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t("Salvata il {data}", { data: fmtDate(saved_at) })}</p>
        </DialogHeader>

        {/* Quote info */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          {quote.quote_number && (
            <div>
              <span className="text-muted-foreground">{t("Numero:")} </span>
              <span className="font-medium">{quote.quote_number}</span>
            </div>
          )}
          {quote.title && (
            <div>
              <span className="text-muted-foreground">{t("Titolo:")} </span>
              <span className="font-medium">{quote.title}</span>
            </div>
          )}
          {quote.status && (
            <div>
              <span className="text-muted-foreground">{t("Stato:")} </span>
              <Badge variant="outline">{quote.status}</Badge>
            </div>
          )}
        </div>

        {/* Items table */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nessuna voce in questa versione.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Prodotto / Servizio")}</TableHead>
                <TableHead className="text-right">{t("Qtà")}</TableHead>
                <TableHead className="text-right">{t("Prezzo")}</TableHead>
                <TableHead className="text-right">{t("Sconto")}</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">{t("Totale riga")}</TableHead>
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
                  <TableCell className="text-right">{(item.discount_percent ?? 0).toLocaleString(intlCampo())}%</TableCell>
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
                <span className="text-muted-foreground">{t("Subtotale")}</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>
            )}
            {(quote.discount_percent ?? 0) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>{t("Sconto {discount_percent}%", { discount_percent: String(quote.discount_percent ?? "") })}</span>
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
                  <span>{t("Totale")}</span>
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
  const t = useT();
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: versions = [], isLoading, error } = useQuery<QuoteVersion[]>({
    queryKey: ["quote_versions", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("quote_versions")
        .select("id,version_num,note,created_at,created_by,snapshot")
        .eq("quote_id", quoteId)
        .order("version_num", { ascending: false });

      if (qErr) throw qErr;
      return (data ?? []).map(version => ({
        ...version,
        snapshot: parseQuoteVersionSnapshot(version.snapshot),
      }));
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
      toast.success(t("Versione {version_num} salvata con successo", { version_num: String(data?.version_num ?? "") }));
      queryClient.invalidateQueries({ queryKey: ["quote_versions", quoteId] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("Errore durante il salvataggio");
      toast.error(t("Errore: {errore}", { errore: message }));
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
              {t("Storico Versioni")}
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
              {saving ? t("Salvataggio...") : t("Salva versione ora")}
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
              {t("Errore caricamento versioni.")}
            </p>
          )}

          {!isLoading && !error && versions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("Nessuna versione salvata. Le versioni vengono create automaticamente all'invio.")}
            </p>
          )}

          {!isLoading && !error && versions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t("Versione")}</TableHead>
                  <TableHead>{t("Data")}</TableHead>
                  <TableHead>{t("Nota")}</TableHead>
                  <TableHead className="text-right">{t("Voci")}</TableHead>
                  <TableHead className="text-right">{t("Totale")}</TableHead>
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
                          {t("Visualizza")}
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
