/**
 * Lettura AI del preventivo fornitore, con revisione umana.
 *
 * L'AI legge il PDF (o la foto) e propone: abbinamento voce per voce, prezzo,
 * sconto, disponibilita', con una confidenza dichiarata. Nessun prezzo tocca
 * il database finche' una persona non guarda la tabella e preme "Applica" —
 * e le righe sotto il 60% di confidenza partono deselezionate, perche' un
 * abbinamento incerto applicato in automatico e' un errore col timbro.
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Upload, Mail, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

export interface RigaEstratta {
  rfq_item_id: string | null;
  voce_richiesta: string | null;
  voce_documento: string;
  prezzo_unitario: number | null;
  sconto_percentuale: number;
  aliquota_iva: number;
  disponibile: boolean;
  confidenza: number;
  nota: string | null;
}

export interface PropostaEstratta {
  file: string;
  righe: RigaEstratta[];
  totale_documento: number | null;
  giorni_consegna: number | null;
  validita_offerta: string | null;
  condizioni_pagamento: string | null;
  note_generali: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqSupplierId: string;
  fornitoreNome: string;
  /** C'e' un'email agganciata da cui pescare l'allegato? */
  haEmailAgganciata: boolean;
  /** Applica le righe scelte: il chiamante scrive supplier_rfq_quotes. */
  onApplica: (righe: RigaEstratta[], meta: PropostaEstratta) => Promise<void>;
}

export function EstraiOffertaAIDialog({
  open, onOpenChange, rfqSupplierId, fornitoreNome, haEmailAgganciata, onApplica,
}: Props) {
  const [lettura, setLettura] = useState(false);
  const [applico, setApplico] = useState(false);
  const [proposta, setProposta] = useState<PropostaEstratta | null>(null);
  const [scelte, setScelte] = useState<Set<number>>(new Set());

  const chiudi = (o: boolean) => {
    if (!o) {
      setProposta(null);
      setScelte(new Set());
      setLettura(false);
      setApplico(false);
    }
    onOpenChange(o);
  };

  const leggi = async (payload: { document_base64?: string; use_email_attachment?: boolean }) => {
    setLettura(true);
    try {
      const { data, error } = await supabase.functions.invoke("rdo-ai-estrai-offerta", {
        body: { rfq_supplier_id: rfqSupplierId, ...payload },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Lettura non riuscita");
      const p = data as PropostaEstratta;
      setProposta(p);
      // Preselezione: solo abbinamenti con voce riconosciuta e confidenza >= 60.
      setScelte(new Set(
        p.righe
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => r.rfq_item_id && r.confidenza >= 60 && (r.prezzo_unitario != null || !r.disponibile))
          .map(({ i }) => i),
      ));
    } catch (e) {
      toast.error("Lettura non riuscita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLettura(false);
    }
  };

  const daFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File troppo grande (max 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => leggi({ document_base64: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const applica = async () => {
    if (!proposta) return;
    const righe = proposta.righe.filter((_, i) => scelte.has(i));
    if (righe.length === 0) {
      toast.error("Nessuna riga selezionata");
      return;
    }
    setApplico(true);
    try {
      await onApplica(righe, proposta);
      toast.success(`${righe.length} prezz${righe.length === 1 ? "o applicato" : "i applicati"}`, {
        description: "Controlla la griglia di confronto: i numeri restano modificabili.",
      });
      chiudi(false);
    } catch (e) {
      toast.error("Applicazione non riuscita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setApplico(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500" />
            Leggi l'offerta di {fornitoreNome}
          </DialogTitle>
          <DialogDescription>
            L'AI estrae i prezzi dal preventivo e li abbina alle voci della richiesta.
            Niente viene scritto finché non guardi la tabella e applichi.
          </DialogDescription>
        </DialogHeader>

        {!proposta ? (
          <div className="space-y-3 py-2">
            {lettura ? (
              <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                Sto leggendo il documento...
              </div>
            ) : (
              <>
                {haEmailAgganciata && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => leggi({ use_email_attachment: true })}
                  >
                    <Mail className="h-4 w-4 mr-2 text-slate-400" />
                    Usa l'allegato dell'email agganciata
                  </Button>
                )}
                <label className="flex items-center gap-2 w-full rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors">
                  <Upload className="h-4 w-4 text-slate-400" />
                  Carica il preventivo (PDF o foto)
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) daFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs">
                    <th className="p-2 w-8"></th>
                    <th className="p-2 font-medium">Voce richiesta</th>
                    <th className="p-2 font-medium">Nel documento</th>
                    <th className="p-2 font-medium text-right">Prezzo</th>
                    <th className="p-2 font-medium text-right">Fiducia</th>
                  </tr>
                </thead>
                <tbody>
                  {proposta.righe.map((r, i) => {
                    const abbinata = !!r.rfq_item_id;
                    return (
                      <tr key={i} className={`border-b ${!abbinata ? "opacity-50" : ""}`}>
                        <td className="p-2">
                          <Checkbox
                            checked={scelte.has(i)}
                            disabled={!abbinata}
                            onCheckedChange={(v) => {
                              const next = new Set(scelte);
                              if (v === true) next.add(i); else next.delete(i);
                              setScelte(next);
                            }}
                          />
                        </td>
                        <td className="p-2">
                          {r.voce_richiesta ?? (
                            <span className="italic text-slate-400">non nella richiesta</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-600">
                          {r.voce_documento}
                          {r.nota && <span className="block text-[11px] text-amber-700">{r.nota}</span>}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {!r.disponibile
                            ? <Badge className="bg-slate-200 text-slate-600 text-[10px]">non disponibile</Badge>
                            : r.prezzo_unitario != null
                              ? <>
                                  {formatCurrency(r.prezzo_unitario)}
                                  {r.sconto_percentuale > 0 && (
                                    <span className="block text-[11px] text-slate-500">−{r.sconto_percentuale}%</span>
                                  )}
                                </>
                              : <span className="text-slate-400">illeggibile</span>}
                        </td>
                        <td className="p-2 text-right">
                          <span
                            className={`text-xs font-semibold ${
                              r.confidenza >= 80 ? "text-emerald-600"
                              : r.confidenza >= 60 ? "text-amber-600"
                              : "text-red-600"
                            }`}
                          >
                            {r.confidenza}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(proposta.giorni_consegna != null || proposta.validita_offerta || proposta.condizioni_pagamento) && (
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {proposta.giorni_consegna != null && <Badge variant="outline">Consegna: {proposta.giorni_consegna} gg</Badge>}
                {proposta.validita_offerta && <Badge variant="outline">Valida fino al {proposta.validita_offerta.split("-").reverse().join("/")}</Badge>}
                {proposta.condizioni_pagamento && <Badge variant="outline">{proposta.condizioni_pagamento}</Badge>}
              </div>
            )}
            {proposta.note_generali && (
              <p className="flex gap-1.5 text-xs text-slate-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                {proposta.note_generali}
              </p>
            )}
            <p className="text-[11px] text-slate-400">
              Le righe sotto il 60% di fiducia partono deselezionate: controllale sul documento prima di applicarle.
            </p>
          </div>
        )}

        {proposta && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProposta(null); setScelte(new Set()); }}>
              Rileggi
            </Button>
            <Button onClick={applica} disabled={applico || scelte.size === 0}>
              {applico ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Applica {scelte.size} prezz{scelte.size === 1 ? "o" : "i"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
