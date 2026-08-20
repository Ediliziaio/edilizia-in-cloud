/**
 * ListinoFornitoreTab — i prezzi che questo fornitore fa a te.
 *
 * Griglia modificabile con sconto per voce e netto calcolato, piu'
 * l'incolla-da-Excel per portare dentro un listino intero in un gesto.
 * Le voci alimentano il suggerimento prezzo sulle righe degli ordini
 * d'acquisto: per questo codice e descrizione contano — l'abbinamento
 * e' solo esatto.
 *
 * Stessa struttura in due pezzi dell'analisi prezzi: il guscio carica,
 * l'editor interno (con key) si inizializza dai props. Niente setState
 * negli effect.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, AlertTriangle, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import {
  parseVociIncollate, prezzoNetto,
} from "@/lib/listino/listinoFornitore";

interface RigaVoce {
  id: string;
  codice: string;
  descrizione: string;
  unita: string;
  prezzo: number;
  sconto_pct: number;
}

interface ListinoEsistente {
  listino: { id: string; sconto_default_pct: number } | null;
  voci: RigaVoce[];
}

export function ListinoFornitoreTab({ supplierId }: { supplierId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["listino-fornitore-editor", supplierId],
    queryFn: async (): Promise<ListinoEsistente> => {
      // `as any`: tabelle nuove (migration 20280201000000), fuori dai tipi
      // generati — convenzione di progetto.
      const { data: listino, error } = await (supabase as any)
        .from("listini_fornitore")
        .select("id, sconto_default_pct")
        .eq("supplier_id", supplierId)
        .eq("attivo", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!listino) return { listino: null, voci: [] };
      const { data: voci, error: e2 } = await (supabase as any)
        .from("listino_fornitore_voci")
        .select("id, codice, descrizione, unita, prezzo, sconto_pct")
        .eq("listino_id", listino.id)
        .order("sort_order");
      if (e2) throw e2;
      return {
        listino,
        voci: (voci ?? []).map((v: Record<string, unknown>) => ({
          id: String(v.id),
          codice: String(v.codice ?? ""),
          descrizione: String(v.descrizione ?? ""),
          unita: String(v.unita ?? ""),
          prezzo: Number(v.prezzo ?? 0),
          sconto_pct: Number(v.sconto_pct ?? 0),
        })),
      };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carico il listino…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Le tabelle del listino fornitore non sono ancora attive su questo
          ambiente (migration da applicare).
        </span>
      </div>
    );
  }

  return (
    <ListinoEditor
      key={`${supplierId}:${data?.listino?.id ?? "nuovo"}`}
      supplierId={supplierId}
      esistente={data ?? { listino: null, voci: [] }}
    />
  );
}

function ListinoEditor({
  supplierId,
  esistente,
}: {
  supplierId: string;
  esistente: ListinoEsistente;
}) {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const [voci, setVoci] = useState<RigaVoce[]>(() => esistente.voci);
  const [incollaAperto, setIncollaAperto] = useState(false);
  const [testoIncolla, setTestoIncolla] = useState("");
  const [filtro, setFiltro] = useState("");

  const visibili = useMemo(() => {
    const q = filtro.toLowerCase().trim();
    if (!q) return voci;
    return voci.filter(
      (v) =>
        v.descrizione.toLowerCase().includes(q) ||
        v.codice.toLowerCase().includes(q),
    );
  }, [voci, filtro]);

  const aggiorna = (id: string, patch: Partial<RigaVoce>) =>
    setVoci((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const importaIncollato = () => {
    const { voci: nuove, scartate } = parseVociIncollate(testoIncolla);
    if (nuove.length > 0) {
      setVoci((r) => [
        ...r,
        ...nuove.map((v) => ({
          id: crypto.randomUUID(),
          codice: v.codice ?? "",
          descrizione: v.descrizione,
          unita: v.unita ?? "",
          prezzo: v.prezzo,
          sconto_pct: v.sconto_pct,
        })),
      ]);
    }
    setIncollaAperto(false);
    setTestoIncolla("");
    if (scartate.length > 0) {
      toast.warning(`${nuove.length === 1 ? "1 voce letta" : `${nuove.length} voci lette`}, ${scartate.length === 1 ? "1 scartata" : `${scartate.length} scartate`}`, {
        description: scartate
          .slice(0, 3)
          .map((s) => `«${s.riga.slice(0, 40)}»: ${s.motivo}`)
          .join(" · "),
      });
    } else if (nuove.length > 0) {
      toast.success(`${nuove.length === 1 ? "1 voce letta" : `${nuove.length} voci lette`}. Ricorda di salvare.`);
    } else {
      toast.error("Nessuna voce leggibile nel testo incollato.");
    }
  };

  const salvaMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      const valide = voci.filter((v) => v.descrizione.trim().length > 0);

      // Testata: la si crea alla prima occasione, poi si riusa.
      let listinoId = esistente.listino?.id ?? "";
      if (!listinoId) {
        const { data: nuovo, error } = await (supabase as any)
          .from("listini_fornitore")
          .insert({ company_id: companyId, supplier_id: supplierId })
          .select("id")
          .single();
        if (error) throw error;
        listinoId = nuovo.id;
      }

      // Voci: prima il nuovo, poi via il vecchio — mai una perdita.
      const nuoviIds: string[] = [];
      if (valide.length > 0) {
        const rows = valide.map((v, i) => {
          const id = crypto.randomUUID();
          nuoviIds.push(id);
          return {
            id,
            company_id: companyId,
            listino_id: listinoId,
            codice: v.codice.trim() || null,
            descrizione: v.descrizione.trim(),
            unita: v.unita.trim() || null,
            prezzo: v.prezzo || 0,
            sconto_pct: v.sconto_pct || 0,
            sort_order: i,
          };
        });
        const { error } = await (supabase as any)
          .from("listino_fornitore_voci")
          .insert(rows);
        if (error) throw error;
      }
      let del = (supabase as any)
        .from("listino_fornitore_voci")
        .delete()
        .eq("listino_id", listinoId);
      if (nuoviIds.length > 0) del = del.not("id", "in", `(${nuoviIds.join(",")})`);
      const { error: eDel } = await del;
      if (eDel) throw eDel;
      return valide.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["listino-fornitore-editor", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["listino-fornitore-voci", supplierId] });
      toast.success(`Listino salvato: ${n} ${n === 1 ? "voce" : "voci"}`, {
        description: "Da adesso i prezzi vengono suggeriti sulle righe degli ordini a questo fornitore.",
      });
    },
    onError: (e: Error) => toast.error("Salvataggio non riuscito", { description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cerca per codice o descrizione…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-9 max-w-xs"
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setIncollaAperto(true)}>
          <ClipboardPaste className="h-4 w-4 mr-1" />Incolla da Excel
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setVoci((r) => [
              ...r,
              { id: crypto.randomUUID(), codice: "", descrizione: "", unita: "", prezzo: 0, sconto_pct: 0 },
            ])
          }
        >
          <Plus className="h-4 w-4 mr-1" />Voce
        </Button>
        <Button size="sm" disabled={salvaMutation.isPending} onClick={() => salvaMutation.mutate()}>
          {salvaMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Salva listino
        </Button>
      </div>

      {voci.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nessuna voce. Incolla il listino dal foglio Excel del fornitore, o
          aggiungi le voci una per una. Codice e descrizione contano: sono la
          chiave con cui il prezzo viene suggerito sugli ordini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="text-left p-2 font-medium w-28">Codice</th>
                <th className="text-left p-2 font-medium">Descrizione</th>
                <th className="text-left p-2 font-medium w-16">U.m.</th>
                <th className="text-right p-2 font-medium w-24">Prezzo</th>
                <th className="text-right p-2 font-medium w-20">Sconto %</th>
                <th className="text-right p-2 font-medium w-24">Netto</th>
                <th className="w-10 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="p-1">
                    <Input value={v.codice} onChange={(e) => aggiorna(v.id, { codice: e.target.value })} className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <Input value={v.descrizione} onChange={(e) => aggiorna(v.id, { descrizione: e.target.value })} className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <Input value={v.unita} onChange={(e) => aggiorna(v.id, { unita: e.target.value })} className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number" min={0} step="0.01"
                      value={Number.isFinite(v.prezzo) ? v.prezzo : 0}
                      onChange={(e) => aggiorna(v.id, { prezzo: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm text-right"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number" min={0} max={100} step="0.5"
                      value={Number.isFinite(v.sconto_pct) ? v.sconto_pct : 0}
                      onChange={(e) => aggiorna(v.id, { sconto_pct: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-medium tabular-nums">
                    {formatCurrency(prezzoNetto(v.prezzo, v.sconto_pct))}
                  </td>
                  <td className="p-1 text-center">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => setVoci((r) => r.filter((x) => x.id !== v.id))}
                      aria-label="Rimuovi voce"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtro && visibili.length !== voci.length && (
        <p className="text-xs text-muted-foreground">
          {visibili.length} di {voci.length} voci mostrate. Il salvataggio riguarda sempre tutte.
        </p>
      )}

      <Dialog open={incollaAperto} onOpenChange={setIncollaAperto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Incolla da Excel</DialogTitle>
            <DialogDescription>
              Copia le righe dal foglio del fornitore e incollale qui. Colonne
              accettate, in ordine: codice · descrizione · unità · prezzo ·
              sconto% (bastano descrizione e prezzo). La virgola è il decimale.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={testoIncolla}
            onChange={(e) => setTestoIncolla(e.target.value)}
            rows={10}
            placeholder={"TU-100\tTubo rame 22mm\tm\t8,40\t10"}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIncollaAperto(false)}>Annulla</Button>
            <Button onClick={importaIncollato} disabled={!testoIncolla.trim()}>
              Leggi le righe
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
