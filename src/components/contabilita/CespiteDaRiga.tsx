/**
 * Un cespite da una riga di fattura ricevuta (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 3).
 *
 * La riga diventa un bene del registro: costo = imponibile più l'IVA che non si detrae, data = data
 * della fattura, la riga passa sul conto del bene (contabilita_cespite_da_fattura). Se la fattura era
 * già registrata, la sua scrittura si storna e si rifà.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { leggiImportoItaliano } from "@/lib/orders/salCertificato";
import { useContiMovimentabili } from "./ContiPerRuolo";

/** Le righe della fattura che sono già un cespite: numero riga → descrizione del cespite. */
export function useCespitiDellaFattura(companyId: string, fatturaId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cespiti-della-fattura", companyId, fatturaId],
    enabled: enabled && !!companyId && !!fatturaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cespiti").select("fattura_linea, descrizione")
        .eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId);
      if (error) throw error;
      return new Map((data ?? []).map((c) => [String(c.fattura_linea), c.descrizione]));
    },
  });
}

/** Aliquote abituali (tabelle ministeriali, edilizia): solo una proposta, si cambia. */
const PROPOSTE: Array<{ sotto: string; aliquota: number; categoria: "materiale" | "immateriale" }> = [
  { sotto: "Attrezzature", aliquota: 15, categoria: "materiale" },
  { sotto: "Impianti e macchinari", aliquota: 15, categoria: "materiale" },
  { sotto: "Automezzi", aliquota: 20, categoria: "materiale" },
  { sotto: "Mobili e macchine d'ufficio", aliquota: 12, categoria: "materiale" },
  { sotto: "Fabbricati", aliquota: 3, categoria: "materiale" },
  { sotto: "Software", aliquota: 33.33, categoria: "immateriale" },
];

export function CespiteDaRiga({ companyId, fatturaId, chiave, descrizione, gia }: {
  companyId: string; fatturaId: string; chiave: string; descrizione: string; gia: string | undefined;
}) {
  const [aperto, setAperto] = useState(false);
  if (gia) return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800" title={gia}>Cespite</span>;
  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setAperto(true)}
        title="Se la riga è un bene comprato che dura più anni (macchina, attrezzatura, automezzo): va nel registro dei cespiti e si ammortizza">Fai cespite</Button>
      {aperto && <Dialogo companyId={companyId} fatturaId={fatturaId} chiave={chiave} descrizione={descrizione} onClose={() => setAperto(false)} />}
    </>
  );
}

const DAL_RUOLO = "__ruolo__";

function Dialogo({ companyId, fatturaId, chiave, descrizione, onClose }: {
  companyId: string; fatturaId: string; chiave: string; descrizione: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const piano = useContiMovimentabili(companyId);
  const [nome, setNome] = useState(descrizione.slice(0, 200));
  const [sotto, setSotto] = useState(PROPOSTE[0].sotto);
  const [aliquota, setAliquota] = useState(String(PROPOSTE[0].aliquota));
  const [conto, setConto] = useState<string | null>(null);
  const proposta = PROPOSTE.find((x) => x.sotto === sotto) ?? PROPOSTE[0];
  const aliq = leggiImportoItaliano(aliquota);
  const valido = nome.trim() !== "" && Number.isFinite(aliq) && aliq > 0 && aliq <= 100;

  const crea = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("contabilita_cespite_da_fattura", {
        p_fattura: fatturaId, p_linea: chiave, p_descrizione: nome.trim(), p_categoria: proposta.categoria,
        p_sottocategoria: sotto, p_aliquota: aliq, p_conto_bene: conto as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cespite creato: la riga è sul conto del bene");
      for (const k of [["cespiti-della-fattura"], ["fatture-ricevute"], ["fattura-ricevuta-riepilogo"], ["contabilita-generale", companyId]]) {
        void qc.invalidateQueries({ queryKey: k });
      }
      onClose();
    },
    onError: (e) => toast.error("Cespite non creato", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuovo cespite dalla riga</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ces-nome" className="text-xs">Descrizione del bene</Label>
            <Input id="ces-nome" className="h-8" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Tipo di bene</Label>
              <Select value={sotto} onValueChange={(x) => { setSotto(x); setAliquota(String(PROPOSTE.find((p) => p.sotto === x)?.aliquota ?? aliquota)); }}>
                <SelectTrigger aria-label="Tipo di bene" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PROPOSTE.map((p) => <SelectItem key={p.sotto} value={p.sotto} className="text-xs">{p.sotto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ces-aliq" className="text-xs">Aliquota %</Label>
              <Input id="ces-aliq" inputMode="decimal" className="h-8 text-right tabular-nums" value={aliquota} onChange={(e) => setAliquota(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conto del bene</Label>
            <Select value={conto ?? DAL_RUOLO} onValueChange={(x) => setConto(x === DAL_RUOLO ? null : x)}>
              <SelectTrigger aria-label="Conto del bene" className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DAL_RUOLO} className="text-xs">Proposto dal tipo di bene</SelectItem>
                {(piano.data ?? []).filter((c) => c.natura === "attivo").map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.codice} {c.descrizione}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Il costo è l'imponibile della riga più l'IVA che non si detrae; la data è quella della fattura. Il primo anno si
            ammortizza a metà aliquota. Se la fattura è già nel giornale, la sua scrittura si rifà con la riga sul conto del bene.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!valido || crea.isPending} onClick={() => crea.mutate()}>{crea.isPending ? "Creo…" : "Crea il cespite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
