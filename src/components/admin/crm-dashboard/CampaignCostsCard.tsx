/**
 * CampaignCostsCard — input delle spese marketing per canale.
 *
 * campaign_costs alimenta CPL/CAC/ROAS (CrmUnitEconomics, CrmChannelRoi) ma
 * non esisteva NESSUNA UI di inserimento: le card chiedevano onestamente i
 * costi e nessuno poteva inserirli. Form minimo (fonte, importo, data, nota)
 * + storico recente con elimina. La fonte è testo libero con suggerimenti
 * dalle fonti reali dei contatti, così spesa e lead si agganciano per nome.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Euro, Loader2, Plus, Trash2 } from "lucide-react";

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2, useGrouping: "always" }).format(n);

// Data locale (Europe/Rome), NON toISOString (UTC scala di un giorno la sera).
const todayLocal = () => new Date().toLocaleDateString("en-CA");

interface CostRow {
  id: string;
  source: string;
  date: string;
  spend_amount: number;
  notes: string | null;
}

const SOURCE_SUGGESTIONS = ["aziende.it", "mailerfind", "google_ads", "meta_ads", "lead_scraper", "fiere_eventi"];

export function CampaignCostsCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [notes, setNotes] = useState("");

  const costs = useQuery({
    queryKey: ["crm-dash", "campaign-costs", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<CostRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("campaign_costs")
        .select("id, source, date, spend_amount, notes")
        .eq("company_id", companyId)
        .order("date", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as CostRow[];
    },
  });

  const invalidate = () => {
    // La spesa alimenta unit economics e ROI per canale: refresh coordinato.
    qc.invalidateQueries({ queryKey: ["crm-dash", "campaign-costs", companyId] });
    qc.invalidateQueries({ queryKey: ["crm-dash", "unit-economics"] });
    qc.invalidateQueries({ queryKey: ["crm-dash", "channel-roi"] });
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const spend = Number(amount.replace(",", "."));
      if (!source.trim()) throw new Error("Indica la fonte (es. google_ads)");
      if (!Number.isFinite(spend) || spend <= 0) throw new Error("Importo non valido");
      if (!date) throw new Error("Indica la data");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("campaign_costs").insert({
        company_id: companyId,
        source: source.trim(),
        date,
        spend_amount: spend,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Spesa registrata");
      setAmount("");
      setNotes("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("campaign_costs")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Spesa eliminata");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totale30gg = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    return (costs.data ?? [])
      .filter((c) => new Date(c.date).getTime() >= cutoff)
      .reduce((s, c) => s + (c.spend_amount ?? 0), 0);
  }, [costs.data]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Euro className="h-4 w-4" aria-hidden="true" /> Spese per canale
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            ultimi 30gg: {eur(totale30gg)}
          </span>
        </div>

        {/* Form inserimento */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_140px_auto]">
          <div>
            <Input
              list="campaign-cost-sources"
              placeholder="Fonte (es. google_ads)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="Fonte della spesa"
            />
            <datalist id="campaign-cost-sources">
              {SOURCE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="€"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Importo in euro"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Data della spesa"
          />
          <Button
            size="sm"
            className="h-10"
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending}
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Aggiungi</span>
          </Button>
          <Input
            className="col-span-2 sm:col-span-4"
            placeholder="Nota (facoltativa — es. campagna 'Ristrutturatori Nord')"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Nota"
          />
        </div>

        {/* Storico recente */}
        {costs.isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (costs.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nessuna spesa registrata: inserisci i costi per far vivere CPL, CAC e ROAS qui sopra.
          </p>
        ) : (
          <ul className="divide-y text-[13px]">
            {(costs.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {new Date(c.date).toLocaleDateString("it-IT")}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.source}
                  {c.notes ? <span className="ml-2 font-normal text-muted-foreground">· {c.notes}</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{eur(c.spend_amount)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => delMut.mutate(c.id)}
                  disabled={delMut.isPending}
                  aria-label={`Elimina spesa ${c.source} del ${c.date}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
