/**
 * Componente per la lista dei rapportini campo di un ordine, con approvazione.
 * Usato nel tab "Campo" di OrderDetail.tsx.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { ClipboardList, Check, ChevronDown, ChevronUp, Image as ImageIcon, PenLine, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props { orderId: string; }

export function OrdineRapportiniCampo({ orderId }: Props) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const canApprove = role === "company_admin" || role === "company_staff" || role === "super_admin";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [firmaModal, setFirmaModal] = useState<string | null>(null);

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

  const approvaMutation = useMutation({
    mutationFn: async (rapportinoId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("campo_rapportini")
        .update({
          approvato: true,
          approvato_da: user!.id,
          approvato_at: new Date().toISOString(),
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
            {rapportini.map((r: any) => (
              <div key={r.id} className="border rounded-lg overflow-hidden">
                {/* Header rapportino — cliccabile per espandere */}
                <div
                  className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {r.autore?.first_name} {r.autore?.last_name}
                        <span className="ml-1 text-muted-foreground text-xs">
                          — {format(parseISO(r.data_lavoro), "d MMM yyyy", { locale: it })}
                        </span>
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {r.ore_lavorate != null && (
                          <Badge variant="outline" className="text-[10px] py-0">{r.ore_lavorate}h</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] py-0">{r.percentuale_avanzamento}%</Badge>
                        {r.approvato ? (
                          <Badge className="text-[10px] py-0 bg-green-600 text-white">Approvato</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0 border-amber-400 text-amber-600">Da approvare</Badge>
                        )}
                        {r.firma_cliente_url && <PenLine className="h-3 w-3 text-blue-500" />}
                        {r.foto_urls?.length > 0 && <ImageIcon className="h-3 w-3 text-slate-400" />}
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
                    {r.firma_cliente_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Firma cliente: {r.firma_cliente_nome}
                        </p>
                        <img
                          src={r.firma_cliente_url} alt="Firma"
                          className="h-16 border rounded cursor-pointer bg-white"
                          onClick={() => setFirmaModal(r.firma_cliente_url)}
                        />
                      </div>
                    )}
                    {canApprove && !r.approvato && (
                      <Button
                        size="sm"
                        onClick={() => approvaMutation.mutate(r.id)}
                        disabled={approvaMutation.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approva rapportino
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
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
          <DialogHeader><DialogTitle>Firma cliente</DialogTitle></DialogHeader>
          {firmaModal && <img src={firmaModal} alt="Firma" className="w-full bg-white rounded-lg" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
