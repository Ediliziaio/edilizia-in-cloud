/**
 * Componente per la lista dei rapportini campo di un ordine.
 * Gestisce approvazione, rifiuto con motivo, download PDF.
 * Usato nel tab "Campo" di OrderDetail.tsx.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ClipboardList, Check, ChevronDown, ChevronUp, Image as ImageIcon, PenLine,
  Loader2, X, FileDown, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { RapportinoStato } from "@/types/rapportino";
import { SourceBadge } from "@/components/whatsapp/SourceBadge";

interface Props { orderId: string; }

const fmtSafeDate = (value: string | null | undefined, pattern: string) => {
  if (!value) return "—";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, pattern, { locale: it });
};

// ── Badge stato ────────────────────────────────────────────────────────────────
function StatoBadge({ stato }: { stato: RapportinoStato }) {
  const map: Record<RapportinoStato, { label: string; cls: string }> = {
    bozza:     { label: "Bozza",     cls: "bg-slate-100 text-slate-600 border-slate-300" },
    inviato:   { label: "Da approvare", cls: "border-amber-400 text-amber-600 bg-amber-50" },
    approvato: { label: "Approvato", cls: "bg-green-600 text-white border-green-600" },
    rifiutato: { label: "Rifiutato", cls: "bg-red-100 text-red-600 border-red-300" },
  };
  const s = map[stato] ?? map.bozza;
  return (
    <Badge variant="outline" className={`text-[10px] py-0 ${s.cls}`}>
      {s.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function OrdineRapportiniCampo({ orderId }: Props) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const canApprove = role === "company_admin" || role === "company_staff" || role === "super_admin";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [firmaModal, setFirmaModal] = useState<{ url: string; title: string } | null>(null);

  // Rifiuto dialog
  const [rifiutaId, setRifiutaId] = useState<string | null>(null);
  const [motivoRifiuto, setMotivoRifiuto] = useState("");

  const { data: rapportini = [], isLoading } = useQuery({
    queryKey: ["order-campo-rapportini", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_rapportini")
        .select("*, autore:profiles(first_name, last_name)")
        .eq("order_id", orderId)
        .order("data_lavoro", { ascending: false });
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // ── Approva ────────────────────────────────────────────────────────────────
  const approvaMutation = useMutation({
    mutationFn: async (rapportinoId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("campo_rapportini")
        .update({
          stato: "approvato",
          approvato: true,
          approvato_da: user!.id,
          approvato_at: new Date().toISOString(),
          motivo_rifiuto: null,
        })
        .eq("id", rapportinoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapportino approvato");
      qc.invalidateQueries({ queryKey: ["order-campo-rapportini", orderId] });
    },
    onError: () => toast.error("Errore durante l'approvazione"),
  });

  // ── Rifiuta ────────────────────────────────────────────────────────────────
  const rifiutaMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase
        .from("campo_rapportini")
        .update({
          stato: "rifiutato",
          approvato: false,
          motivo_rifiuto: motivo.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapportino rifiutato");
      qc.invalidateQueries({ queryKey: ["order-campo-rapportini", orderId] });
      setRifiutaId(null);
      setMotivoRifiuto("");
    },
    onError: () => toast.error("Errore durante il rifiuto"),
  });

  const handleRifiuta = () => {
    if (!rifiutaId) return;
    rifiutaMutation.mutate({ id: rifiutaId, motivo: motivoRifiuto });
  };

  // ── Genera/scarica PDF ─────────────────────────────────────────────────────
  const pdfMutation = useMutation({
    mutationFn: async (rapportino: any) => {
      // Se il PDF esiste già, apri direttamente
      if (rapportino.pdf_url) {
        window.open(rapportino.pdf_url, "_blank");
        return;
      }
      // Altrimenti genera
      const { data, error } = await supabase.functions.invoke("genera-pdf-rapportino", {
        body: { rapportino_id: rapportino.id },
      });
      if (error) throw error;
      if (data?.pdf_url) window.open(data.pdf_url, "_blank");
      qc.invalidateQueries({ queryKey: ["order-campo-rapportini", orderId] });
    },
    onError: () => toast.error("Errore generazione PDF"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Rapportini Campo ({rapportini.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
        ) : rapportini.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun rapportino caricato dagli operai</p>
        ) : (
          <div className="space-y-3">
            {rapportini.map((r: any) => {
              const stato: RapportinoStato = r.stato ?? (r.approvato ? "approvato" : "inviato");
              return (
                <div key={r.id} className="border rounded-lg overflow-hidden">
                  {/* Header rapportino */}
                  <div
                    className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {r.autore?.first_name} {r.autore?.last_name}
                          <span className="ml-1 text-muted-foreground text-xs">
                            — {fmtSafeDate(r.data_lavoro, "d MMM yyyy")}
                          </span>
                        </p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {r.ore_lavorate != null && (
                            <Badge variant="outline" className="text-[10px] py-0">{r.ore_lavorate}h</Badge>
                          )}
                          {r.ore_straordinario > 0 && (
                            <Badge variant="outline" className="text-[10px] py-0 border-amber-300 text-amber-600">
                              +{r.ore_straordinario}h str.
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] py-0">{r.percentuale_avanzamento}%</Badge>
                          <StatoBadge stato={stato} />
                          <SourceBadge source={r.source} />
                          {r.firma_cliente_url && <PenLine className="h-3 w-3 text-blue-500" />}
                          {r.firma_operaio_url && <PenLine className="h-3 w-3 text-amber-500" />}
                          {r.foto_urls?.length > 0 && <ImageIcon className="h-3 w-3 text-slate-400" />}
                          {r.pdf_url && <FileDown className="h-3 w-3 text-green-600" />}
                        </div>
                      </div>
                    </div>
                    {expandedId === r.id
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Dettaglio espandibile */}
                  {expandedId === r.id && (
                    <div className="p-3 space-y-3 border-t">
                      {r.descrizione_lavori && (
                        <p className="text-sm">{r.descrizione_lavori}</p>
                      )}

                      {/* Motivo rifiuto */}
                      {stato === "rifiutato" && r.motivo_rifiuto && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <p className="text-xs font-medium text-red-700">Motivo rifiuto</p>
                          <p className="text-xs text-red-600 mt-0.5">{r.motivo_rifiuto}</p>
                        </div>
                      )}

                      {r.foto_urls?.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {r.foto_urls.map((url: string, i: number) => (
                            <img
                              key={i} src={url} alt={`Foto ${i + 1}`}
                              className="w-20 h-20 object-cover rounded-lg cursor-pointer border hover:opacity-80 transition-opacity"
                              onClick={() => setFotoModal(url)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Firme */}
                      <div className="flex gap-4 flex-wrap">
                        {r.firma_cliente_url && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Firma cliente{r.firma_cliente_nome ? `: ${r.firma_cliente_nome}` : ""}
                            </p>
                            <img
                              src={r.firma_cliente_url} alt="Firma cliente"
                              className="h-16 border rounded cursor-pointer bg-white"
                              onClick={() => setFirmaModal({ url: r.firma_cliente_url, title: "Firma cliente" })}
                            />
                          </div>
                        )}
                        {r.firma_operaio_url && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Firma operaio</p>
                            <img
                              src={r.firma_operaio_url} alt="Firma operaio"
                              className="h-16 border rounded cursor-pointer bg-white"
                              onClick={() => setFirmaModal({ url: r.firma_operaio_url, title: "Firma operaio" })}
                            />
                          </div>
                        )}
                      </div>

                      {/* Azioni admin */}
                      <div className="flex flex-wrap gap-2">
                        {/* PDF download */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pdfMutation.mutate(r)}
                          disabled={pdfMutation.isPending}
                        >
                          {pdfMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FileDown className="h-3 w-3 mr-1" />
                          )}
                          {r.pdf_url ? "Scarica PDF" : "Genera PDF"}
                        </Button>

                        {canApprove && stato === "inviato" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approvaMutation.mutate(r.id)}
                              disabled={approvaMutation.isPending}
                            >
                              <Check className="h-3 w-3 mr-1" /> Approva
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => { setRifiutaId(r.id); setMotivoRifiuto(""); }}
                            >
                              <X className="h-3 w-3 mr-1" /> Rifiuta
                            </Button>
                          </>
                        )}

                        {canApprove && stato === "rifiutato" && (
                          <Button
                            size="sm"
                            onClick={() => approvaMutation.mutate(r.id)}
                            disabled={approvaMutation.isPending}
                          >
                            <Check className="h-3 w-3 mr-1" /> Approva ora
                          </Button>
                        )}

                        {stato === "approvato" && r.approvato_at && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {fmtSafeDate(r.approvato_at, "d MMM yyyy HH:mm")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Modal foto fullscreen */}
      <Dialog open={!!fotoModal} onOpenChange={() => setFotoModal(null)}>
        <DialogContent className="max-w-2xl">
          {fotoModal && <img src={fotoModal} alt="Foto" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* Modal firma */}
      <Dialog open={!!firmaModal} onOpenChange={() => setFirmaModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{firmaModal?.title ?? "Firma"}</DialogTitle>
          </DialogHeader>
          {firmaModal && (
            <img src={firmaModal.url} alt={firmaModal.title} className="w-full bg-white rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog rifiuto */}
      <Dialog open={!!rifiutaId} onOpenChange={(open) => { if (!open) { setRifiutaId(null); setMotivoRifiuto(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rifiuta rapportino</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Specifica il motivo del rifiuto (opzionale). Il tecnico verrà notificato.
            </p>
            <Textarea
              placeholder="Es: Descrizione insufficiente, mancano le foto del cantiere..."
              value={motivoRifiuto}
              onChange={e => setMotivoRifiuto(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRifiutaId(null); setMotivoRifiuto(""); }}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleRifiuta}
              disabled={rifiutaMutation.isPending}
            >
              {rifiutaMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
              Conferma rifiuto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
