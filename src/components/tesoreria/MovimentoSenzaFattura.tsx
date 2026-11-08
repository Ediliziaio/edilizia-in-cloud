import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AllegatiFattura } from "@/components/fatturazione/AllegatiFattura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { voceSenzaFatturaProposta, vociSenzaFattura, type VoceSenzaFattura } from "@/lib/finance/movimentoSenzaFattura";
import { prettyTxDesc } from "./txLabel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const NESSUNO = "__nessuno__";

interface MovimentoTx {
  id: string;
  amount: number;
  category?: string | null;
  description?: string | null;
  transaction_type?: string | null;
  creditor_name?: string | null;
  debtor_name?: string | null;
}

/**
 * Un movimento che una fattura non ce l'ha: multa, ricevuta, carburante, stipendi,
 * giroconto. Le spese vere diventano un costo «senza fattura» già pagato (con
 * commessa, mezzo e ricevuta allegata); il resto si chiude con la sua categoria.
 */
export function MovimentoSenzaFattura({ tx, companyId, onFatto }: {
  tx: MovimentoTx;
  companyId: string;
  onFatto: () => void;
}) {
  const uscita = Number(tx.amount) < 0;
  const voci = vociSenzaFattura(uscita);
  const [voce, setVoce] = useState<VoceSenzaFattura | null>(() => voceSenzaFatturaProposta(tx.category, uscita));
  const [descrizione, setDescrizione] = useState(prettyTxDesc(tx));
  const [riferimento, setRiferimento] = useState("");
  const [commessa, setCommessa] = useState(NESSUNO);
  const [mezzo, setMezzo] = useState(NESSUNO);
  const [salvando, setSalvando] = useState(false);
  const [costoCreato, setCostoCreato] = useState<string | null>(null);

  const spesa = voce?.tipo === "spesa";
  const { data: scelte } = useQuery({
    queryKey: ["movimento-senza-fattura-scelte", companyId],
    enabled: uscita,
    staleTime: 60_000,
    queryFn: async () => {
      const [o, m] = await Promise.all([
        db.from("orders").select("id, order_code, description").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        db.from("mezzi").select("id, nome, targa").eq("company_id", companyId).is("deleted_at", null).order("nome").limit(500),
      ]);
      return {
        commesse: (o.data ?? []) as Array<{ id: string; order_code: string | null; description: string | null }>,
        mezzi: (m.data ?? []) as Array<{ id: string; nome: string | null; targa: string | null }>,
      };
    },
  });

  const conferma = async () => {
    if (!voce || salvando) return;
    setSalvando(true);
    try {
      const { data, error } = await db.rpc("chiudi_movimento_senza_fattura", {
        p_transazione: tx.id,
        p_tipo: voce.tipo,
        p_categoria: voce.categoria,
        p_descrizione: descrizione.trim() || null,
        p_categoria_costo: voce.categoriaCosto,
        p_riferimento: riferimento.trim() || null,
        p_commessa: spesa && commessa !== NESSUNO ? commessa : null,
        p_mezzo: spesa && mezzo !== NESSUNO ? mezzo : null,
      });
      if (error) {
        toast.error("Movimento non chiuso", { description: error.message });
        return;
      }
      if (data?.costo_id) {
        toast.success("Spesa registrata e pagata: ora puoi allegare la ricevuta");
        setCostoCreato(data.costo_id as string);
      } else {
        toast.success(`Movimento chiuso: ${voce.etichetta}`);
        onFatto();
      }
    } finally {
      setSalvando(false);
    }
  };

  if (costoCreato) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Spesa registrata. Allega la ricevuta, il verbale o quello che serve.</p>
        <AllegatiFattura companyId={companyId} madre={{ costoId: costoCreato }} titolo="Ricevuta e documenti" />
        <div className="flex justify-end"><Button size="sm" onClick={onFatto}>Fine</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Di cosa si tratta</Label>
        <div className="flex flex-wrap gap-1.5">
          {voci.map((v) => (
            <button
              key={v.etichetta}
              type="button"
              aria-pressed={voce?.etichetta === v.etichetta}
              onClick={() => setVoce(v)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent/50",
                voce?.etichetta === v.etichetta && "border-primary bg-primary/10 font-medium text-primary",
              )}
            >
              {v.etichetta}
            </button>
          ))}
        </div>
      </div>

      {voce && (
        <p className="text-xs text-muted-foreground">
          {spesa
            ? "Diventa un costo senza fattura, già pagato con questo movimento. Non entra nel registro IVA."
            : "Il movimento si chiude con questa categoria. Non crea un costo: non lo conta due volte."}
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="sf-desc" className="text-xs">Descrizione</Label>
        <Input id="sf-desc" value={descrizione} maxLength={200} onChange={(e) => setDescrizione(e.target.value)} className="h-8 text-sm" />
      </div>

      {spesa && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="sf-rif" className="text-xs">N. ricevuta o verbale</Label>
            <Input id="sf-rif" value={riferimento} maxLength={120} onChange={(e) => setRiferimento(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Commessa</Label>
            <Select value={commessa} onValueChange={setCommessa}>
              <SelectTrigger className="h-8 text-xs" aria-label="Commessa"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>Nessuna</SelectItem>
                {(scelte?.commesse ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{[o.order_code, o.description].filter(Boolean).join(" · ") || "Commessa"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mezzo</Label>
            <Select value={mezzo} onValueChange={setMezzo}>
              <SelectTrigger className="h-8 text-xs" aria-label="Mezzo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                {(scelte?.mezzi ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{[m.nome, m.targa].filter(Boolean).join(" · ") || "Mezzo"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex justify-end border-t pt-3">
        <Button size="sm" onClick={conferma} disabled={!voce || salvando || (spesa && !descrizione.trim())}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {spesa ? "Registra la spesa" : "Chiudi il movimento"}
        </Button>
      </div>
    </div>
  );
}
