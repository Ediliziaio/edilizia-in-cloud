/**
 * ContrattoAIDialog — Genera contratto d'appalto via AI
 *
 * Bottone + Dialog che:
 *   1. Chiama edge function `genera-contratto-ai` con order_id
 *   2. Mostra preview Markdown (con react-markdown)
 *   3. Permette edit inline
 *   4. Salva versione finale + scarica come .md
 *
 * Permessi: super_admin / company_admin
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, Sparkles, Download, Save, RefreshCw, AlertTriangle,
  CheckCircle2, Loader2, Wand2, ShieldCheck,
} from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  triggerLabel?: string;
}

interface ContrattoOpzioni {
  penale_giorno_eur: number;
  garanzia_anni: number;
  arbitrato: boolean;
  foro_competente: string;
  subappalto_consentito: boolean;
}

interface ContrattoDoc {
  id: string;
  numero_contratto: string;
  versione: number;
  status: string;
  oggetto_lavori: string;
  importo_totale_eur: number;
  contenuto_md: string;
  created_at: string;
  ai_model_used: string | null;
}

interface AiMeta {
  model_used: string;
  tokens: number;
  cost_eur: number;
  cost_billed_eur: number;
  warnings: string[];
  suggerimenti: string[];
}

const DEFAULT_OPZIONI: ContrattoOpzioni = {
  penale_giorno_eur: 100,
  garanzia_anni: 2,
  arbitrato: false,
  foro_competente: "",
  subappalto_consentito: true,
};

export function ContrattoAIDialog({ orderId, companyId, triggerLabel = "Genera Contratto AI" }: Props) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [opzioni, setOpzioni] = useState<ContrattoOpzioni>(DEFAULT_OPZIONI);
  const [previewMd, setPreviewMd] = useState<string>("");
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [contrattoId, setContrattoId] = useState<string | null>(null);

  // Lista contratti già esistenti per quest'ordine
  const { data: existing } = useQuery({
    queryKey: ["contratti_for_order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratti_documents" as never)
        .select("id, numero_contratto, versione, status, oggetto_lavori, importo_totale_eur, contenuto_md, created_at, ai_model_used")
        .eq("order_id", orderId)
        .order("versione", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContrattoDoc[];
    },
    enabled: !!orderId && open,
  });

  // Genera contratto via AI
  const generaMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("genera-contratto-ai", {
        body: { order_id: orderId, company_id: companyId, opzioni },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Generazione fallita");
      return data;
    },
    onSuccess: (data) => {
      setPreviewMd(data.contratto.contenuto_md ?? "");
      setAiMeta(data.ai_meta ?? null);
      setContrattoId(data.contratto.id ?? null);
      qc.invalidateQueries({ queryKey: ["contratti_for_order", orderId] });
      toast.success(
        `Contratto ${data.contratto.numero_contratto} generato (${data.ai_meta?.tokens ?? 0} token)`,
      );
    },
    onError: (err) => {
      toast.error(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  // AI compliance review
  const [reviewResult, setReviewResult] = useState<{
    compliance_score?: number;
    livello_rischio?: string;
    issues_critici?: Array<{ area: string; issue: string; raccomandazione: string }>;
    issues_warning?: Array<{ area: string; issue: string; raccomandazione: string }>;
    punti_forza?: string[];
    incongruenze_dati?: Array<{ campo: string; in_contratto: string; in_ordine_o_computo: string; delta: string }>;
    valutazione_finale?: string;
  } | null>(null);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!contrattoId) throw new Error("Genera prima il contratto");
      const { data, error } = await supabase.functions.invoke("ai-contratto-review", {
        body: { contratto_id: contrattoId, company_id: companyId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Review fallita");
      return data;
    },
    onSuccess: (data) => {
      setReviewResult(data.review ?? null);
      const score = data.review?.compliance_score ?? 0;
      const rischio = data.review?.livello_rischio ?? "—";
      toast.success(`Review completata: score ${score}/100 — rischio ${rischio}`);
    },
    onError: (err) => toast.error(`Review: ${err instanceof Error ? err.message : String(err)}`),
  });

  // Salva edit manuale
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!contrattoId) throw new Error("Nessun contratto attivo");
      const { error } = await supabase
        .from("contratti_documents" as never)
        .update({ contenuto_md: previewMd } as never)
        .eq("id", contrattoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modifiche salvate");
      qc.invalidateQueries({ queryKey: ["contratti_for_order", orderId] });
    },
    onError: (err) => {
      toast.error(`Errore salvataggio: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const handleDownload = () => {
    if (!previewMd) return;
    const blob = new Blob([previewMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contratto-${orderId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadExisting = (c: ContrattoDoc) => {
    setPreviewMd(c.contenuto_md ?? "");
    setContrattoId(c.id);
    setAiMeta(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Contratto d'Appalto AI
            <Badge variant="outline" className="ml-2 text-xs bg-violet-50 text-violet-700 border-violet-300">
              <Sparkles className="h-3 w-3 mr-1" /> Silvio AI
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Genera contratto d'appalto conforme art. 1655 c.c. dai dati dell'ordine.
            L'AI compila automaticamente parti, oggetto, importi, penali, garanzie e clausole.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT: Options + existing list */}
          <div className="space-y-3 overflow-y-auto pr-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Opzioni</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <Label className="text-xs">Penale ritardo €/giorno</Label>
                  <Input
                    type="number"
                    value={opzioni.penale_giorno_eur}
                    onChange={(e) =>
                      setOpzioni({ ...opzioni, penale_giorno_eur: Number(e.target.value) })
                    }
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Garanzia (anni)</Label>
                  <Input
                    type="number"
                    min={1} max={10}
                    value={opzioni.garanzia_anni}
                    onChange={(e) =>
                      setOpzioni({ ...opzioni, garanzia_anni: Number(e.target.value) })
                    }
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Foro competente</Label>
                  <Input
                    placeholder="es. Roma"
                    value={opzioni.foro_competente}
                    onChange={(e) => setOpzioni({ ...opzioni, foro_competente: e.target.value })}
                    className="h-8"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Subappalto consentito</Label>
                  <Switch
                    checked={opzioni.subappalto_consentito}
                    onCheckedChange={(v) =>
                      setOpzioni({ ...opzioni, subappalto_consentito: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Clausola arbitrale</Label>
                  <Switch
                    checked={opzioni.arbitrato}
                    onCheckedChange={(v) => setOpzioni({ ...opzioni, arbitrato: v })}
                  />
                </div>

                <Button
                  size="sm"
                  className="w-full gap-2 mt-3"
                  onClick={() => generaMutation.mutate()}
                  disabled={generaMutation.isPending}
                >
                  {generaMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Genera contratto
                </Button>
              </CardContent>
            </Card>

            {existing && existing.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Versioni precedenti</CardTitle>
                  <CardDescription className="text-xs">
                    {existing.length} contratto/i già generati
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {existing.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left text-xs p-2 rounded border hover:bg-muted/50 space-y-1"
                      onClick={() => loadExisting(c)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium">{c.numero_contratto}</span>
                        <Badge variant="outline" className="text-[10px]">v{c.versione}</Badge>
                      </div>
                      <div className="text-muted-foreground truncate">{c.oggetto_lavori}</div>
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={
                            c.status === "firmato"
                              ? "text-[10px] bg-emerald-50 text-emerald-700"
                              : c.status === "annullato"
                                ? "text-[10px] bg-rose-50 text-rose-700"
                                : "text-[10px] bg-amber-50 text-amber-700"
                          }
                        >
                          {c.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("it-IT")}
                        </span>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: Preview / editor */}
          <div className="lg:col-span-2 flex flex-col overflow-hidden">
            {!previewMd && !generaMutation.isPending && (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-2 p-8 border rounded">
                <Sparkles className="h-12 w-12 text-violet-400" />
                <p className="text-sm text-center">
                  Configura le opzioni a sinistra e clicca <strong>Genera contratto</strong>.
                </p>
                <p className="text-xs text-center max-w-md">
                  L'AI userà i dati dell'ordine (cliente, importo, date, descrizione) e
                  l'anagrafica della tua azienda per produrre un contratto d'appalto completo
                  in markdown editabile.
                </p>
              </div>
            )}

            {generaMutation.isPending && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-violet-600" />
                <p className="text-sm text-muted-foreground">
                  L'AI sta redigendo il contratto... (~30s)
                </p>
              </div>
            )}

            {previewMd && (
              <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                {aiMeta && aiMeta.warnings.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-sm">Avvisi AI</AlertTitle>
                    <AlertDescription className="text-xs">
                      <ul className="list-disc pl-4 space-y-0.5">
                        {aiMeta.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {aiMeta && (
                  <div className="text-xs text-muted-foreground flex items-center gap-3 px-1">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      {aiMeta.model_used}
                    </span>
                    <span>{aiMeta.tokens} token</span>
                    <span>€ {aiMeta.cost_billed_eur.toFixed(4)} (billed)</span>
                  </div>
                )}

                <Textarea
                  value={previewMd}
                  onChange={(e) => setPreviewMd(e.target.value)}
                  className="flex-1 font-mono text-xs leading-relaxed resize-none min-h-[400px]"
                  placeholder="Contenuto contratto markdown..."
                />

                {aiMeta && aiMeta.suggerimenti.length > 0 && (
                  <Alert>
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    <AlertTitle className="text-sm">Prossimi passi suggeriti</AlertTitle>
                    <AlertDescription className="text-xs">
                      <ul className="list-disc pl-4 space-y-0.5">
                        {aiMeta.suggerimenti.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* AI Compliance Review */}
                {reviewResult && (
                  <div className="space-y-2 rounded border-2 border-violet-200 bg-violet-50/30 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold flex items-center gap-1">
                        <ShieldCheck className="h-4 w-4 text-violet-600" /> Compliance Review AI
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          (reviewResult.compliance_score ?? 0) >= 80
                            ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                            : (reviewResult.compliance_score ?? 0) >= 60
                              ? "bg-amber-100 text-amber-700 border-amber-300"
                              : "bg-rose-100 text-rose-700 border-rose-300"
                        }>
                          {reviewResult.compliance_score ?? "?"}/100
                        </Badge>
                        <Badge variant="outline">{reviewResult.livello_rischio}</Badge>
                      </div>
                    </div>
                    {reviewResult.valutazione_finale && (
                      <p className="text-xs italic">"{reviewResult.valutazione_finale}"</p>
                    )}
                    {(reviewResult.issues_critici?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] uppercase font-semibold text-rose-700">Critici</span>
                        {reviewResult.issues_critici!.map((iss, i) => (
                          <div key={i} className="text-[11px] p-1.5 rounded bg-rose-50 border border-rose-200">
                            <strong>{iss.area}:</strong> {iss.issue}
                            {iss.raccomandazione && (
                              <div className="text-rose-700 mt-0.5">→ {iss.raccomandazione}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(reviewResult.issues_warning?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] uppercase font-semibold text-amber-700">Avvisi</span>
                        {reviewResult.issues_warning!.map((iss, i) => (
                          <div key={i} className="text-[11px] p-1.5 rounded bg-amber-50 border border-amber-200">
                            <strong>{iss.area}:</strong> {iss.issue}
                          </div>
                        ))}
                      </div>
                    )}
                    {(reviewResult.incongruenze_dati?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] uppercase font-semibold text-rose-700">Incongruenze dati</span>
                        {reviewResult.incongruenze_dati!.map((inc, i) => (
                          <div key={i} className="text-[11px] p-1.5 rounded bg-rose-50 border border-rose-200">
                            <strong>{inc.campo}:</strong> contratto = "{inc.in_contratto}" vs ordine/computo = "{inc.in_ordine_o_computo}" ({inc.delta})
                          </div>
                        ))}
                      </div>
                    )}
                    {(reviewResult.punti_forza?.length ?? 0) > 0 && (
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-emerald-700 font-semibold uppercase">
                          ✓ Punti forza ({reviewResult.punti_forza!.length})
                        </summary>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {reviewResult.punti_forza!.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-3 gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Chiudi
          </Button>
          {previewMd && (
            <>
              {contrattoId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reviewMutation.mutate()}
                  disabled={reviewMutation.isPending}
                  className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                >
                  {reviewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Verifica AI
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="gap-1"
              >
                <Download className="h-4 w-4" /> Scarica .md
              </Button>
              {contrattoId && (
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  className="gap-1"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salva modifiche
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
