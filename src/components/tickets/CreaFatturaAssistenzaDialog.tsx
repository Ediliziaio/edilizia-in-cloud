/**
 * Crea una fattura da un intervento di assistenza o da una manutenzione.
 *
 * È la versione essenziale della fattura da commessa: nessun articolo, una sola
 * riga (la prestazione) che si può ritoccare, il cliente cercato in anagrafica
 * dal suo id. Creata la fattura si apre l'editor per rifinirla; chi chiama
 * riceve l'id del documento in `onCreated` per collegarlo (es. al ticket).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, User, Check, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateDocumento } from "@/hooks/useDocumentiFiscali";
import type { ClienteSnapshot, RigaDocumento } from "@/types/fatturazione";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  /** Descrizione proposta per la riga (es. oggetto dell'intervento). */
  defaultDescrizione: string;
  /** Importo imponibile proposto (netto). L'IVA si aggiunge sotto. */
  defaultImporto: number;
  /** Commessa collegata, se l'intervento ne ha una. */
  orderId?: string | null;
  /** Nota/causale proposta in fattura. */
  defaultNota?: string;
  /** Chiamata a fattura creata, prima di navigare all'editor. */
  onCreated?: (documentoId: string) => Promise<void> | void;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fmt(v: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

export function CreaFatturaAssistenzaDialog({
  open, onOpenChange, customerId, customerName, defaultDescrizione, defaultImporto, orderId, defaultNota, onCreated,
}: Props) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const createMutation = useCreateDocumento();

  const [descrizione, setDescrizione] = useState(defaultDescrizione);
  const [importo, setImporto] = useState(defaultImporto > 0 ? String(defaultImporto) : "");
  const [aliquota, setAliquota] = useState("22");
  const [nota, setNota] = useState(defaultNota ?? "");

  // Riallinea i valori proposti a ogni apertura (il dialog resta montato).
  useEffect(() => {
    if (open) {
      setDescrizione(defaultDescrizione);
      setImporto(defaultImporto > 0 ? String(defaultImporto) : "");
      setAliquota("22");
      setNota(defaultNota ?? "");
    }
  }, [open, defaultDescrizione, defaultImporto, defaultNota]);

  const { data: matchedAnagrafica } = useQuery({
    queryKey: ["anagrafica-match-assistenza", customerId, companyId],
    enabled: open && !!customerId && !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: byClienteId } = await (supabase as any)
        .from("anagrafiche_native")
        .select("*")
        .eq("company_id", companyId!)
        .eq("cliente_id", customerId!)
        .maybeSingle();
      return (byClienteId as Record<string, string | null> | null) ?? null;
    },
  });

  const imponibileNum = Math.max(0, Number((importo || "0").replace(",", ".")) || 0);
  const aliquotaNum = Math.max(0, Number(aliquota) || 0);
  const imposta = round2(imponibileNum * aliquotaNum / 100);
  const totale = round2(imponibileNum + imposta);

  const riga = useMemo<RigaDocumento>(() => ({
    id: crypto.randomUUID(),
    numero_linea: 1,
    descrizione: descrizione.trim() || "Prestazione",
    quantita: 1,
    unita_misura: "pz",
    prezzo_unitario: imponibileNum,
    imponibile: imponibileNum,
    aliquota_iva: String(aliquotaNum),
    imposta,
    totale_riga: totale,
  }), [descrizione, imponibileNum, aliquotaNum, imposta, totale]);

  const anag = matchedAnagrafica as Record<string, string | null> | null;

  const crea = () => {
    if (imponibileNum <= 0) {
      toast.error("Indica l'importo della fattura");
      return;
    }
    const clienteSnapshot: ClienteSnapshot | undefined = anag
      ? {
          ragione_sociale: (anag.ragione_sociale as string) || customerName,
          nome: anag.nome || undefined,
          cognome: anag.cognome || undefined,
          partita_iva: anag.partita_iva || undefined,
          codice_fiscale: anag.codice_fiscale || undefined,
          codice_sdi: anag.codice_sdi || undefined,
          pec: anag.pec || undefined,
          indirizzo_via: anag.indirizzo_via || undefined,
          indirizzo_cap: anag.indirizzo_cap || undefined,
          indirizzo_comune: anag.indirizzo_comune || undefined,
          indirizzo_provincia: anag.indirizzo_provincia || undefined,
          indirizzo_nazione: anag.indirizzo_nazione || "IT",
          tipo_cliente: (anag.tipo_cliente as ClienteSnapshot["tipo_cliente"]) || "B2B",
        }
      : undefined;

    createMutation.mutate(
      {
        tipo: "fattura" as const,
        ...(clienteSnapshot && { cliente_snapshot: clienteSnapshot }),
        ...(anag?.id && { anagrafica_id: anag.id }),
        righe: [riga],
        ...(orderId && { ordine_id: orderId }),
        note_documento: nota.trim() || undefined,
      },
      {
        onSuccess: async (doc) => {
          try {
            await onCreated?.(doc.id);
          } catch {
            // Il collegamento è best-effort: la fattura resta comunque creata.
          }
          onOpenChange(false);
          navigate(`/azienda/documenti/${doc.id}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Crea fattura
          </DialogTitle>
          <DialogDescription>
            Una riga con la prestazione. La rifinisci nell'editor che si apre dopo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{customerName || "Cliente"}</p>
            {anag ? (
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-green-700">
                <Check className="h-3 w-3" /> Anagrafica trovata
                {anag.partita_iva ? ` · P.IVA ${anag.partita_iva}` : ""}
              </span>
            ) : (
              <span className="text-xs text-amber-600">Anagrafica da scegliere nell'editor</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Descrizione</Label>
            <Textarea rows={2} value={descrizione} onChange={(e) => setDescrizione(e.target.value)}
                      placeholder="Es. Sostituzione scheda caldaia" className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Imponibile (€)</Label>
              <Input inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)}
                     className="h-9" placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IVA (%)</Label>
              <Input inputMode="decimal" value={aliquota} onChange={(e) => setAliquota(e.target.value)}
                     className="h-9" placeholder="22" />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-0.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Imponibile</span><span className="tabular-nums">{fmt(imponibileNum)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>IVA</span><span className="tabular-nums">{fmt(imposta)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed pt-1 text-sm font-bold">
              <span>Totale</span><span className="tabular-nums text-primary">{fmt(totale)}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Causale / note</Label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} className="h-9"
                   placeholder="Rif. intervento…" maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={crea} disabled={createMutation.isPending || imponibileNum <= 0}>
            {createMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Receipt className="mr-1.5 h-4 w-4" />}
            {createMutation.isPending ? "Creazione…" : `Crea fattura · ${fmt(totale)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
