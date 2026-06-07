import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FileBarChart2, Loader2, Download, Trash2, Sparkles, Wand2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";

interface SalVoce {
  id: string;
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
  note: string | null;
}

interface SalRecord {
  id: string;
  numero_sal: number;
  data_emissione: string;
  stato: "bozza" | "emesso" | "approvato";
  importo_totale: number;
  note: string | null;
  sal_voci: SalVoce[];
}

const STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  emesso: "Emesso",
  approvato: "Approvato",
};

const STATO_COLORS: Record<string, string> = {
  bozza: "secondary",
  emesso: "default",
  approvato: "outline",
};

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

interface SalTabProps {
  orderId: string;
  companyId: string;
  orderTotalAmount?: number;
}

interface VoceForm {
  descrizione: string;
  importo_contrattuale: string;
  percentuale_avanzamento: string;
  note: string;
}

const emptyVoce = (): VoceForm => ({
  descrizione: "",
  importo_contrattuale: "",
  percentuale_avanzamento: "",
  note: "",
});

export function SalTab({ orderId, companyId, orderTotalAmount }: SalTabProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [stato, setStato] = useState<"bozza" | "emesso" | "approvato">("bozza");
  const [voci, setVoci] = useState<VoceForm[]>([emptyVoce()]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingSalId, setExportingSalId] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState("");

  const { data: salList = [], isLoading } = useQuery<SalRecord[]>({
    queryKey: ["sal-records", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sal_records")
        .select("*, sal_voci(id, descrizione, importo_contrattuale, percentuale_avanzamento, importo_sal, note)")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .order("numero_sal", { ascending: false });
      if (error) throw error;
      return (data || []) as SalRecord[];
    },
    enabled: !!orderId && !!companyId,
  });

  // AI: suggerisce % avanzamento dalle voci ordine + storico SAL + rapportini
  const aiSuggestMutation = useMutation({
    mutationFn: async () => {
      const nextNumero = (salList.length > 0 ? salList[0].numero_sal : 0) + 1;
      const { data, error } = await supabase.functions.invoke("suggerisci-sal-ai", {
        body: { order_id: orderId, company_id: companyId, numero_sal: nextNumero },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Suggerimento fallito");
      return data;
    },
    onSuccess: (data) => {
      const voci_suggerite: Array<{
        descrizione: string;
        importo_contrattuale: number;
        perc_suggerita: number;
      }> = data?.suggerimenti?.voci_suggerite ?? [];
      if (voci_suggerite.length === 0) {
        toast.info("L'AI non ha trovato voci da suggerire");
        return;
      }
      setVoci(voci_suggerite.map((v) => ({
        descrizione: v.descrizione ?? "",
        importo_contrattuale: String(v.importo_contrattuale ?? 0),
        percentuale_avanzamento: String(v.perc_suggerita ?? 0),
        note: "",
      })));
      const noteDraft = data?.suggerimenti?.note_sal_draft;
      if (noteDraft && !note) setNote(noteDraft);
      toast.success(
        `Compilate ${voci_suggerite.length} voci · % globale ${data?.suggerimenti?.percentuale_globale_suggerita ?? "—"}`,
      );
      const warnings: string[] = data?.suggerimenti?.warnings ?? [];
      warnings.forEach((w) => toast.warning(w, { duration: 6000 }));
    },
    onError: (err) => toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`),
  });

  const createSalMutation = useMutation({
    mutationFn: async () => {
      const validVoci = voci.filter((v) => v.descrizione.trim());
      if (validVoci.length === 0) throw new Error("Aggiungi almeno una voce");

      const importoTotale = validVoci.reduce((sum, v) => {
        const contrattuale = parseFloat(v.importo_contrattuale) || 0;
        const perc = parseFloat(v.percentuale_avanzamento) || 0;
        return sum + (contrattuale * perc) / 100;
      }, 0);

      const nextNumero = (salList.length > 0 ? salList[0].numero_sal : 0) + 1;

      const { data: sal, error: salError } = await supabase
        .from("sal_records")
        .insert({
          company_id: companyId,
          order_id: orderId,
          numero_sal: nextNumero,
          data_emissione: new Date().toLocaleDateString("en-CA"),
          stato,
          importo_totale: Math.round(importoTotale * 100) / 100,
          note: note.trim() || null,
        })
        .select()
        .single();

      if (salError) throw new Error(salError.message);

      const vociInsert = validVoci.map((v) => ({
        sal_id: sal.id,
        descrizione: v.descrizione.trim(),
        importo_contrattuale: parseFloat(v.importo_contrattuale) || 0,
        percentuale_avanzamento: parseFloat(v.percentuale_avanzamento) || 0,
        note: v.note.trim() || null,
      }));

      const { error: vociError } = await supabase.from("sal_voci").insert(vociInsert);
      if (vociError) throw new Error(vociError.message);

      return sal;
    },
    onSuccess: () => {
      toast.success("SAL creato con successo!");
      queryClient.invalidateQueries({ queryKey: ["sal-records", orderId] });
      setDialogOpen(false);
      setNote("");
      setStato("bozza");
      setVoci([emptyVoce()]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSalMutation = useMutation({
    mutationFn: async (salId: string) => {
      const { error } = await supabase.from("sal_records").delete().eq("id", salId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("SAL eliminato");
      queryClient.invalidateQueries({ queryKey: ["sal-records", orderId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExportPdf = async (sal: SalRecord) => {
    setIsExporting(true);
    setExportingSalId(sal.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sal-pdf", {
        body: { sal_id: sal.id, company_id: companyId },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto generato");
      setPrintTitle(`SAL n. ${sal.numero_sal}`);
      setPrintHtml(data.html);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
    } finally {
      setIsExporting(false);
      setExportingSalId(null);
    }
  };

  const updateVoce = (index: number, field: keyof VoceForm, value: string) => {
    setVoci((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const addVoce = () => setVoci((prev) => [...prev, emptyVoce()]);

  const removeVoce = (index: number) => {
    if (voci.length === 1) return;
    setVoci((prev) => prev.filter((_, i) => i !== index));
  };

  const computedImporto = (v: VoceForm) => {
    const contrattuale = parseFloat(v.importo_contrattuale) || 0;
    const perc = parseFloat(v.percentuale_avanzamento) || 0;
    return (contrattuale * perc) / 100;
  };

  const totalDialogImporto = voci.reduce((sum, v) => sum + computedImporto(v), 0);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileBarChart2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">SAL — Stato Avanzamento Lavori</h3>
          {salList.length > 0 && (
            <Badge variant="secondary">{salList.length}</Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Nuovo SAL
        </Button>
      </div>

      {salList.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <FileBarChart2 className="h-12 w-12 text-muted-foreground/40 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">Nessun SAL registrato</p>
            <p className="text-xs text-muted-foreground">
              Crea il primo Stato Avanzamento Lavori per tenere traccia dei progressi di cantiere e generare documenti periodici.
            </p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Crea primo SAL
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {salList.map((sal) => (
            <Card key={sal.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      SAL #{sal.numero_sal}
                      <Badge variant={STATO_COLORS[sal.stato] as "secondary" | "default" | "outline" | "destructive"}>
                        {STATO_LABELS[sal.stato]}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Emesso il {fmtDate(sal.data_emissione)} · Totale: {formatCurrency(sal.importo_totale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleExportPdf(sal)}
                      disabled={isExporting && exportingSalId === sal.id}
                      aria-label="Esporta SAL PDF"
                    >
                      {isExporting && exportingSalId === sal.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Eliminare il SAL #${sal.numero_sal}?`,
                            description:
                              "Lo stato avanzamento lavori verrà rimosso definitivamente. L'operazione non può essere annullata.",
                            confirmLabel: "Elimina",
                            variant: "destructive",
                          })
                        ) {
                          deleteSalMutation.mutate(sal.id);
                        }
                      }}
                      disabled={deleteSalMutation.isPending}
                      aria-label="Elimina SAL"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {sal.sal_voci?.length > 0 && (
                <CardContent className="pt-0">
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left p-2 font-medium">Voce</th>
                          <th className="text-right p-2 font-medium">Contrattuale</th>
                          <th className="text-right p-2 font-medium">Avanz.</th>
                          <th className="text-right p-2 font-medium">SAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sal.sal_voci.map((v) => (
                          <tr key={v.id} className="border-b last:border-0">
                            <td className="p-2">{v.descrizione}</td>
                            <td className="p-2 text-right">{formatCurrency(v.importo_contrattuale)}</td>
                            <td className="p-2 text-right">{v.percentuale_avanzamento}%</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(v.importo_sal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/30 font-semibold">
                          <td className="p-2" colSpan={3}>Totale SAL</td>
                          <td className="p-2 text-right">{formatCurrency(sal.importo_totale)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {sal.note && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{sal.note}</p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create SAL Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileBarChart2 className="h-5 w-5" aria-hidden="true" />
              Nuovo Stato Avanzamento Lavori
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Stato */}
            <div className="space-y-2">
              <Label>Stato</Label>
              <div className="flex gap-2">
                {(["bozza", "emesso", "approvato"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStato(s)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      stato === s
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {STATO_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Voci */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>Voci di avanzamento</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => aiSuggestMutation.mutate()}
                    disabled={aiSuggestMutation.isPending}
                    className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                    title="Suggerisci voci e % avanzamento dall'AI"
                  >
                    {aiSuggestMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    <Sparkles className="h-3 w-3" />
                    Suggerisci AI
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={addVoce}>
                    <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Aggiungi voce
                  </Button>
                </div>
              </div>

              {voci.map((v, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 relative">
                  {voci.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeVoce(i)}
                      aria-label="Rimuovi voce"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Descrizione *</Label>
                    <Input
                      value={v.descrizione}
                      onChange={(e) => updateVoce(i, "descrizione", e.target.value)}
                      placeholder="es. Fondazioni, Muratura, Impianti..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Importo contrattuale (€)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={v.importo_contrattuale}
                        onChange={(e) => updateVoce(i, "importo_contrattuale", e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Avanzamento (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={v.percentuale_avanzamento}
                        onChange={(e) => updateVoce(i, "percentuale_avanzamento", e.target.value)}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Importo SAL</Label>
                      <div className="h-8 flex items-center px-3 bg-muted/50 rounded-md text-sm font-medium text-primary">
                        {formatCurrency(computedImporto(v))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note voce</Label>
                    <Input
                      value={v.note}
                      onChange={(e) => updateVoce(i, "note", e.target.value)}
                      placeholder="Opzionale"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}

              <div className="flex justify-end text-sm font-semibold text-primary bg-muted/30 rounded-lg p-2">
                Totale SAL: {formatCurrency(totalDialogImporto)}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Note SAL</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Annotazioni per il cliente o uso interno..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => createSalMutation.mutate()}
              disabled={createSalMutation.isPending}
            >
              {createSalMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> Salvataggio...</>
              ) : (
                "Crea SAL"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName={printTitle}
          title={printTitle}
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}
    </div>
  );
}
