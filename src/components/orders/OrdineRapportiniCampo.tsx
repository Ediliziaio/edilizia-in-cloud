/**
 * Componente per la lista dei rapportini campo di un ordine.
 * Gestisce approvazione, rifiuto con motivo, download PDF.
 * Usato nel tab "Campo" di OrderDetail.tsx.
 */
import { useState } from "react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { notifyRapportinoPdf, openRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
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
import { LaborApprovalDialog } from "@/components/orders/LaborApprovalDialog";
import { recheckLaborApproval } from "@/lib/campo/loadLaborReview";

import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { role, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts } = usePermissions();
  const canApprove = canEditOrders && (role === "company_admin" || role === "company_staff" || role === "super_admin");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [firmaModal, setFirmaModal] = useState<{ url: string; title: string } | null>(null);

  // Rifiuto dialog
  const [rifiutaId, setRifiutaId] = useState<string | null>(null);
  const [motivoRifiuto, setMotivoRifiuto] = useState("");

  const { data: rapportini = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["order-campo-rapportini", orderId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        // NB: FK esplicita — campo_rapportini ha DUE relazioni verso profiles
        // (user_id e approvato_da): senza disambiguare PostgREST rifiuta l'embed.
        .select("*, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)")
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && !!companyId,
  });

  // ── Approva ────────────────────────────────────────────────────────────────
  const approvaMutation = useMutation({
    mutationFn: async ({rapportinoId, fingerprint, acknowledged}: {rapportinoId: string; fingerprint: string; acknowledged: boolean}) => {
      if (!canApprove || !companyId) throw new Error("Non hai il permesso di approvare rapportini");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione scaduta, riaccedi");
      const reviewed = await recheckLaborApproval({companyId, orderId, reportId: rapportinoId, showCosts: canViewCosts}, fingerprint, acknowledged);
      const approvalQuery = supabase
        .from("campo_rapportini")
        .update({
          stato: "approvato",
          approvato: true,
          approvato_da: user.id,
          approvato_at: new Date().toISOString(),
          motivo_rifiuto: null,
          pdf_url: null,
        })
        .eq("id", rapportinoId)
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      const { data: updated, error } = await (reviewed.stato == null ? approvalQuery.is("stato", null) : approvalQuery.eq("stato", reviewed.stato))
        .eq("updated_at", reviewed.updated_at)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Rapportino non aggiornato: potrebbe essere già cambiato. Aggiorna il controllo e verifica i permessi.");

      // È QUI che l'avanzamento fasi si applica: le % dichiarate dall'operaio
      // valgono solo quando l'ufficio approva. GREATEST(attuale, dichiarata)
      // su lettura fresca; un fallimento qui non annulla l'approvazione ma
      // viene detto, non nascosto.
      let erroreFasi: string | null = null;
      try {
        const { data: rapp, error: reportError } = await supabase
          .from("campo_rapportini")
          .select("fasi_lavorate")
          .eq("id", rapportinoId)
          .eq("order_id", orderId)
          .eq("company_id", companyId)
          .single();
        if (reportError) throw reportError;
        const fasi = (rapp?.fasi_lavorate ?? []) as Array<{ phase_id: string; percentuale: number }>;
        if (fasi.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any;
          const { data: fresche, error: frescheErr } = await db
            .from("order_work_phases")
            .select("id, status, percentuale")
            .in("id", fasi.map((f) => f.phase_id))
            .eq("order_id", orderId);
          if (frescheErr) throw frescheErr;
          const byId = new Map(
            ((fresche ?? []) as { id: string; status: string; percentuale: number | null }[])
              .map((f) => [f.id, f]),
          );
          for (const dich of fasi) {
            const attuale = byId.get(dich.phase_id);
            if (!attuale) continue;
            const nuova = Math.max(Number(attuale.percentuale) || 0, Number(dich.percentuale) || 0);
            const patch: Record<string, unknown> = { percentuale: nuova, updated_at: new Date().toISOString() };
            if (nuova >= 100) patch.status = "completata";
            else if (nuova > 0 && attuale.status !== "completata") patch.status = "in_corso";
            const { error: faseErr } = await db.from("order_work_phases").update(patch).eq("id", dich.phase_id);
            if (faseErr) throw faseErr;
          }
        }
      } catch (e) {
        erroreFasi = e instanceof Error ? e.message : String(e);
      }
      return { erroreFasi, rapportinoId };
    },
    onSuccess: ({ erroreFasi, rapportinoId }) => {
      toast.success("Rapportino approvato");
      if (erroreFasi) {
        toast.error("Approvato, ma l'avanzamento fasi non è stato aggiornato", { description: erroreFasi });
      }
      refreshWorkQueries(qc, orderId);
      void notifyRapportinoPdf(rapportinoId, orderId, qc);
      setApprovalId(null);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Errore durante l'approvazione"),
  });

  // ── Rifiuta ────────────────────────────────────────────────────────────────
  const rifiutaMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      if (!canApprove || !companyId) throw new Error("Non hai il permesso di rifiutare rapportini");
      const original = rapportini.find(r => r.id === id);
      if (!original || (original.stato ?? (original.approvato ? "approvato" : "inviato")) !== "inviato") throw new Error("Rapportino cambiato: ricarica prima di rifiutare");
      const rejectionQuery = supabase
        .from("campo_rapportini")
        .update({
          stato: "rifiutato",
          approvato: false,
          motivo_rifiuto: motivo.trim() || null,
          pdf_url: null,
        })
        .eq("id", id)
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .eq("updated_at", original.updated_at);
      const { data: updated, error } = await (original.stato == null ? rejectionQuery.is("stato", null) : rejectionQuery.eq("stato", original.stato))
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Rapportino non aggiornato: verifica i permessi e ricarica");
    },
    onSuccess: (_result, { id }) => {
      toast.success("Rapportino rifiutato");
      refreshWorkQueries(qc, orderId);
      void notifyRapportinoPdf(id, orderId, qc);
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
    mutationFn: async (rapportino: (typeof rapportini)[number]) => {
      await openRapportinoPdf(rapportino, orderId, qc);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Errore generazione PDF"),
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
        ) : isError ? (
          <div role="alert" className="space-y-2 text-sm"><p>Rapportini non disponibili. Non è possibile verificare il consuntivo.</p><Button variant="outline" onClick={() => refetch()}>Riprova</Button></div>
        ) : rapportini.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun rapportino caricato dagli operai</p>
        ) : (
          <div className="space-y-3">
            {rapportini.map((r) => {
              const rawStato = r.stato ?? (r.approvato ? "approvato" : "inviato");
              const stato: RapportinoStato = rawStato === "inviato" || rawStato === "approvato" || rawStato === "rifiutato" ? rawStato : "bozza";
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
                          {r.percentuale_avanzamento != null && (
                            <Badge variant="outline" className="text-[10px] py-0">{r.percentuale_avanzamento}%</Badge>
                          )}
                          <StatoBadge stato={stato} />
                          {r.lavoro_completato && (
                            <Badge variant="outline" className="text-[10px] py-0 bg-emerald-600 text-white border-emerald-600">
                              Fine lavori
                            </Badge>
                          )}
                          {r.lavoro_completato && r.firma_cliente_url && (
                            <Badge variant="outline" className="text-[10px] py-0 bg-emerald-50 text-emerald-700 border-emerald-300">
                              <PenLine className="h-2.5 w-2.5 mr-0.5" />
                              Firmato dal cliente
                            </Badge>
                          )}
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
                            <ImgRiservata width={80} height={80} loading="lazy"
                              key={i} src={url} alt={`Foto ${i + 1}`}
                              className="w-20 h-20 object-cover rounded-lg cursor-pointer border hover:opacity-80 transition-opacity"
                              onClick={() => { void linkFileRiservato(url).then((u) => setFotoModal(u)); }}
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
                            <ImgRiservata loading="lazy"
                              src={r.firma_cliente_url} alt="Firma cliente"
                              className="h-16 border rounded cursor-pointer bg-white"
                              onClick={() => setFirmaModal({ url: r.firma_cliente_url, title: "Firma cliente" })}
                            />
                          </div>
                        )}
                        {r.firma_operaio_url && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Firma operaio</p>
                            <ImgRiservata loading="lazy"
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
                        {/* Niente export su telefono. */}
                        {!isMobile && (
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
                        )}

                        {canApprove && stato === "inviato" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setApprovalId(r.id)}
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
                            onClick={() => setApprovalId(r.id)}
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

                        {/* Squadra del giorno dichiarata dal capocantiere:
                            un rapportino solo per tutto il cantiere. */}
                        {Array.isArray(r.presenze) && r.presenze.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(r.presenze as Array<{ nome?: string; ore?: number; subappaltatore_id?: string }>).map((pz, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                              >
                                {pz.nome ?? "—"} · {Number(pz.ore) || 0}h
                                {pz.subappaltatore_id ? " · sub" : ""}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Costo scritto dal trigger all'approvazione: ore ×
                            costo orario del dipendente. 0 = subappaltatore
                            (costa a contratto/SAL) o dipendente senza tariffa. */}
                        {canViewCosts && stato === "approvato" && (
                          <div className="text-xs font-medium text-emerald-700">
                            Costo manodopera registrato:{" "}
                            {r.costo_manodopera == null ? "Non disponibile" : Number(r.costo_manodopera).toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true })}
                            {Number(r.costo_manodopera) === 0 && r.costo_manodopera != null && <span className="mt-1 block font-normal text-amber-700">Zero registrato: può dipendere da tariffa mancante o presenze esterne. Non indica automaticamente lavoro senza costo.</span>}
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
      {approvalId && companyId && canApprove && <LaborApprovalDialog
        key={companyId + ":" + approvalId + ":" + canViewCosts}
        companyId={companyId} orderId={orderId} reportId={approvalId} showCosts={canViewCosts}
        busy={approvaMutation.isPending} onClose={() => setApprovalId(null)}
        onInspect={id => { setApprovalId(null); setExpandedId(id); }}
        onApprove={(fingerprint, acknowledged) => approvaMutation.mutate({rapportinoId: approvalId, fingerprint, acknowledged})}
      />}

      {/* Modal foto fullscreen */}
      <Dialog open={!!fotoModal} onOpenChange={() => setFotoModal(null)}>
        <DialogContent className="max-w-2xl">
          {fotoModal && <ImgRiservata loading="lazy" src={fotoModal} alt="Foto" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* Modal firma */}
      <Dialog open={!!firmaModal} onOpenChange={() => setFirmaModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{firmaModal?.title ?? "Firma"}</DialogTitle>
          </DialogHeader>
          {firmaModal && (
            <ImgRiservata loading="lazy" src={firmaModal.url} alt={firmaModal.title} className="w-full bg-white rounded-lg" />
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
