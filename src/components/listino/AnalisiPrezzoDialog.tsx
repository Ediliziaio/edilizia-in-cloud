/**
 * AnalisiPrezzoDialog — la scomposizione professionale del prezzo di una voce.
 *
 * Manodopera + materiali + noli fanno il costo diretto; sopra ci vanno spese
 * generali e utile. Il totale si può applicare alla voce di listino con un
 * clic, e con lui l'incidenza manodopera — la colonna che esisteva da sempre
 * su tariffe_aziendali e che nessuno calcolava.
 *
 * La matematica vive in src/lib/listino/analisiPrezzo.ts (pura, testata).
 * Struttura in due pezzi: il guscio carica dal database, l'editor interno
 * (montato con key per voce) si inizializza dai props — niente setState
 * dentro gli effect, come vuole il preset react-compiler.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { calcolaAnalisi, type TipoComponente } from "@/lib/listino/analisiPrezzo";

const TIPI: Array<{ value: TipoComponente; label: string }> = [
  { value: "manodopera", label: "Manodopera" },
  { value: "materiale", label: "Materiale" },
  { value: "nolo", label: "Nolo / mezzo" },
  { value: "altro", label: "Altro" },
];

interface RigaComp {
  id: string;
  tipo: TipoComponente;
  descrizione: string;
  unita: string;
  quantita: number;
  prezzo_unitario: number;
}

interface AnalisiEsistente {
  analisi: { id: string; spese_generali_pct: number; utile_pct: number } | null;
  componenti: RigaComp[];
}

/**
 * Shape minima della voce: strutturale, così il dialog non importa i tipi
 * interni della pagina impostazioni.
 */
interface TariffaMin {
  id: string;
  nome: string;
  unita?: string | null;
  unita_fatturazione?: string | null;
  prezzo_vendita?: number | null;
  prezzo_costo?: number | null;
}

interface Props {
  tariffa: TariffaMin | null;
  onClose: () => void;
}

export function AnalisiPrezzoDialog({ tariffa, onClose }: Props) {
  // `as any`: tabelle nuove (migration 20280131000000), non ancora nei tipi
  // generati — stessa convenzione degli altri hook su tabelle appena nate.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analisi-prezzo", tariffa?.id],
    queryFn: async (): Promise<AnalisiEsistente> => {
      const { data: analisi, error } = await (supabase as any)
        .from("analisi_prezzo")
        .select("id, spese_generali_pct, utile_pct")
        .eq("tariffa_id", tariffa!.id)
        .maybeSingle();
      if (error) throw error;
      if (!analisi) return { analisi: null, componenti: [] };
      const { data: comp, error: e2 } = await (supabase as any)
        .from("analisi_prezzo_componenti")
        .select("id, tipo, descrizione, unita, quantita, prezzo_unitario")
        .eq("analisi_id", analisi.id)
        .order("sort_order");
      if (e2) throw e2;
      return { analisi, componenti: (comp ?? []) as RigaComp[] };
    },
    enabled: !!tariffa,
    staleTime: 30_000,
  });

  return (
    <Dialog open={!!tariffa} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Analisi prezzo — {tariffa?.nome}</DialogTitle>
          <DialogDescription>
            Componi il prezzo: manodopera, materiali e noli fanno il costo
            diretto; sopra ci vanno spese generali e utile.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carico l&apos;analisi…
          </div>
        )}

        {isError && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Le tabelle dell&apos;analisi prezzi non sono ancora attive su questo
              ambiente (migration da applicare). Puoi comporre e vedere il totale,
              ma il salvataggio non riuscirà.
            </span>
          </div>
        )}

        {tariffa && !isLoading && (
          // key per voce: cambiando tariffa l'editor rinasce con i dati giusti.
          <AnalisiEditor
            key={tariffa.id}
            tariffa={tariffa}
            esistente={data ?? { analisi: null, componenti: [] }}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AnalisiEditor({
  tariffa,
  esistente,
  onClose,
}: {
  tariffa: TariffaMin;
  esistente: AnalisiEsistente;
  onClose: () => void;
}) {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const [righe, setRighe] = useState<RigaComp[]>(() =>
    esistente.componenti.map((c) => ({
      ...c,
      unita: c.unita ?? "",
      quantita: Number(c.quantita ?? 0),
      prezzo_unitario: Number(c.prezzo_unitario ?? 0),
    })),
  );
  const [sgPct, setSgPct] = useState(() => Number(esistente.analisi?.spese_generali_pct ?? 15));
  const [utilePct, setUtilePct] = useState(() => Number(esistente.analisi?.utile_pct ?? 10));
  const [aggiornaCosto, setAggiornaCosto] = useState(true);
  // Doppio tocco per eliminare: il primo chiede conferma, il secondo esegue.
  const [confermaElimina, setConfermaElimina] = useState(false);

  const risultato = useMemo(
    () => calcolaAnalisi(righe, sgPct, utilePct),
    [righe, sgPct, utilePct],
  );

  const aggiungiRiga = (tipo: TipoComponente) =>
    setRighe((r) => [
      ...r,
      {
        id: crypto.randomUUID(),
        tipo,
        descrizione: "",
        unita: tipo === "manodopera" ? "h" : "",
        quantita: 1,
        prezzo_unitario: 0,
      },
    ]);

  const aggiorna = (id: string, patch: Partial<RigaComp>) =>
    setRighe((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const rimuovi = (id: string) => setRighe((r) => r.filter((x) => x.id !== id));

  const salvaMutation = useMutation({
    mutationFn: async (applica: boolean) => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      // Le righe senza descrizione sono bozze abbandonate: non si salvano.
      const valide = righe.filter((r) => r.descrizione.trim().length > 0);

      // 1. Testata: aggiorna se esiste, altrimenti crea.
      let analisiId: string = esistente.analisi?.id ?? "";
      if (analisiId) {
        const { error } = await (supabase as any)
          .from("analisi_prezzo")
          .update({
            spese_generali_pct: sgPct,
            utile_pct: utilePct,
            updated_at: new Date().toISOString(),
          })
          .eq("id", analisiId);
        if (error) throw error;
      } else {
        const { data: nuova, error } = await (supabase as any)
          .from("analisi_prezzo")
          .insert({
            company_id: companyId,
            tariffa_id: tariffa.id,
            spese_generali_pct: sgPct,
            utile_pct: utilePct,
          })
          .select("id")
          .single();
        if (error) throw error;
        analisiId = nuova.id;
      }

      // 2. Componenti: prima si inserisce il nuovo, POI si toglie il vecchio.
      //    Se l'inserimento fallisce i dati di prima restano intatti; al
      //    peggio un doppione visibile, mai una perdita.
      const nuoviIds: string[] = [];
      if (valide.length > 0) {
        const rows = valide.map((r, i) => {
          const id = crypto.randomUUID();
          nuoviIds.push(id);
          return {
            id,
            company_id: companyId,
            analisi_id: analisiId,
            tipo: r.tipo,
            descrizione: r.descrizione.trim(),
            unita: r.unita.trim() || null,
            quantita: r.quantita || 0,
            prezzo_unitario: r.prezzo_unitario || 0,
            sort_order: i,
          };
        });
        const { error } = await (supabase as any)
          .from("analisi_prezzo_componenti")
          .insert(rows);
        if (error) throw error;
      }
      let del = (supabase as any)
        .from("analisi_prezzo_componenti")
        .delete()
        .eq("analisi_id", analisiId);
      if (nuoviIds.length > 0) {
        del = del.not("id", "in", `(${nuoviIds.join(",")})`);
      }
      const { error: eDel } = await del;
      if (eDel) throw eDel;

      // 3. Applica alla voce: prezzo di vendita, incidenza e — se richiesto —
      //    il costo pieno (diretto + spese generali, senza utile).
      if (applica) {
        const patch: Record<string, unknown> = {
          prezzo_vendita: risultato.prezzoTotale,
          incidenza_manodopera_pct: risultato.incidenzaManodoperaPct,
          fonte: "analisi_prezzo",
        };
        if (aggiornaCosto) {
          patch.prezzo_costo = risultato.costoAziendale;
          patch.costo_interno = risultato.costoAziendale;
          patch.costo_default = risultato.costoAziendale;
        }
        const { error } = await (supabase as any)
          .from("tariffe_aziendali")
          .update(patch)
          .eq("id", tariffa.id).eq("company_id", companyId);
        if (error) throw error;
      }
      return { applica };
    },
    onSuccess: ({ applica }) => {
      queryClient.invalidateQueries({ queryKey: ["analisi-prezzo", tariffa.id] });
      if (applica) {
        // Prefix-match: copre la lista piena e ogni sua variante.
        queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full"] });
        toast.success("Analisi salvata e prezzo applicato", {
          description: `La voce ora vale ${formatCurrency(risultato.prezzoTotale)} (incidenza manodopera ${risultato.incidenzaManodoperaPct.toFixed(1)}%).`,
        });
        onClose();
      } else {
        toast.success("Analisi salvata");
      }
    },
    onError: (e: Error) => toast.error("Salvataggio non riuscito", { description: e.message }),
  });

  // Elimina l'analisi salvata SENZA toccare i prezzi della voce: un prezzo
  // gia' applicato resta valido, sparisce solo la composizione. Si ripulisce
  // pero' la `fonte`, che altrimenti direbbe "analisi_prezzo" senza analisi.
  const eliminaMutation = useMutation({
    mutationFn: async () => {
      const analisiId = esistente.analisi?.id;
      if (!analisiId) return;
      const { error: e1 } = await (supabase as any)
        .from("analisi_prezzo_componenti")
        .delete()
        .eq("analisi_id", analisiId);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any)
        .from("analisi_prezzo")
        .delete()
        .eq("id", analisiId);
      if (e2) throw e2;
      const { error: e3 } = await (supabase as any)
        .from("tariffe_aziendali")
        .update({ fonte: null })
        .eq("id", tariffa.id)
        .eq("fonte", "analisi_prezzo");
      if (e3) throw e3;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analisi-prezzo", tariffa.id] });
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full"] });
      toast.success("Analisi eliminata", {
        description: "Il prezzo della voce resta com'è: è sparita solo la composizione.",
      });
      onClose();
    },
    onError: (e: Error) => toast.error("Eliminazione non riuscita", { description: e.message }),
  });

  const um = tariffa.unita_fatturazione ?? tariffa.unita ?? null;

  return (
    <div className="space-y-4">
      {/* Componenti */}
      <div className="space-y-2">
        {righe.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Nessun componente. Parti dalla manodopera: è quella che decide
            l&apos;incidenza.
          </p>
        )}
        {righe.map((r) => (
          <div key={r.id} className="grid grid-cols-[130px_1fr_64px_84px_100px_36px] gap-2 items-center">
            <Select value={r.tipo} onValueChange={(v) => aggiorna(r.id, { tipo: v as TipoComponente })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPI.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Descrizione (es. Operaio specializzato)"
              value={r.descrizione}
              onChange={(e) => aggiorna(r.id, { descrizione: e.target.value })}
              className="h-9"
            />
            <Input
              placeholder="u.m."
              value={r.unita}
              onChange={(e) => aggiorna(r.id, { unita: e.target.value })}
              className="h-9"
            />
            <Input
              type="number" min={0} step="0.01"
              value={Number.isFinite(r.quantita) ? r.quantita : 0}
              onChange={(e) => aggiorna(r.id, { quantita: parseFloat(e.target.value) || 0 })}
              className="h-9 text-right"
              aria-label="Quantità"
            />
            <Input
              type="number" min={0} step="0.01"
              value={Number.isFinite(r.prezzo_unitario) ? r.prezzo_unitario : 0}
              onChange={(e) => aggiorna(r.id, { prezzo_unitario: parseFloat(e.target.value) || 0 })}
              className="h-9 text-right"
              aria-label="Prezzo unitario"
            />
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => rimuovi(r.id)} aria-label="Rimuovi componente">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          {TIPI.map((t) => (
            <Button key={t.value} variant="outline" size="sm" onClick={() => aggiungiRiga(t.value)}>
              <Plus className="h-3.5 w-3.5 mr-1" />{t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Riepilogo */}
      <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Costo diretto
            {risultato.costoManodopera > 0 && (
              <span className="ml-2 text-xs">
                (manodopera {formatCurrency(risultato.costoManodopera)}
                {risultato.costoMateriali > 0 && ` · materiali ${formatCurrency(risultato.costoMateriali)}`}
                {risultato.costoNoli > 0 && ` · noli ${formatCurrency(risultato.costoNoli)}`})
              </span>
            )}
          </span>
          <span className="font-medium tabular-nums">{formatCurrency(risultato.costoDiretto)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-2">
            Spese generali
            <Input
              type="number" min={0} max={100} step="0.5"
              value={sgPct}
              onChange={(e) => setSgPct(parseFloat(e.target.value) || 0)}
              className="h-7 w-16 text-right inline-block"
              aria-label="Spese generali %"
            />
            %
          </span>
          <span className="tabular-nums">{formatCurrency(risultato.speseGenerali)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-2">
            Utile d&apos;impresa
            <Input
              type="number" min={0} max={100} step="0.5"
              value={utilePct}
              onChange={(e) => setUtilePct(parseFloat(e.target.value) || 0)}
              className="h-7 w-16 text-right inline-block"
              aria-label="Utile %"
            />
            %
          </span>
          <span className="tabular-nums">{formatCurrency(risultato.utile)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base">
          <span className="font-semibold">Prezzo di applicazione{um ? ` / ${um}` : ""}</span>
          <span className="font-bold tabular-nums">{formatCurrency(risultato.prezzoTotale)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Incidenza manodopera (quella della congruità)</span>
          <span className="tabular-nums">{risultato.incidenzaManodoperaPct.toFixed(1)}%</span>
        </div>
        {tariffa.prezzo_vendita != null && Number(tariffa.prezzo_vendita) !== risultato.prezzoTotale && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Prezzo attuale della voce</span>
            <span className="tabular-nums">{formatCurrency(Number(tariffa.prezzo_vendita))}</span>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={aggiornaCosto}
          onCheckedChange={(v) => setAggiornaCosto(v === true)}
        />
        Aggiorna anche il costo della voce (costo diretto + spese generali:{" "}
        {formatCurrency(risultato.costoAziendale)}) — così il semaforo margine
        mostra l&apos;utile reale
      </label>

      <div className="flex items-center gap-2 pt-1">
        {esistente.analisi && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={eliminaMutation.isPending || salvaMutation.isPending}
            onClick={() => {
              if (!confermaElimina) { setConfermaElimina(true); return; }
              eliminaMutation.mutate();
            }}
          >
            {eliminaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confermaElimina ? "Confermi? Il prezzo della voce non cambia" : "Elimina analisi"}
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="outline" onClick={onClose}>Chiudi</Button>
        <Button
          variant="secondary"
          disabled={salvaMutation.isPending}
          onClick={() => salvaMutation.mutate(false)}
        >
          {salvaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salva analisi
        </Button>
        <Button
          disabled={salvaMutation.isPending || risultato.prezzoTotale <= 0}
          onClick={() => salvaMutation.mutate(true)}
        >
          {salvaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salva e applica {risultato.prezzoTotale > 0 ? formatCurrency(risultato.prezzoTotale) : ""}
        </Button>
      </div>
    </div>
  );
}
