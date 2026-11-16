/**
 * Impostazioni → Automazioni → Soglie dei collegamenti (16/11/2026, docs/piano-punti-aperti-20261116.md §5).
 *
 * Valgono per l'azienda e le leggono i motori (banca: private.tes_classifica e la registrazione
 * dell'arrotondamento; acquisti: riconcilia-fattura-ai). Default = i valori di prima: 1 € per la banca,
 * quantità 0%, prezzo 0,5% con 2 centesimi d'arrotondamento. L'indirizzo del cantiere resta solo
 * proposta. Le cambia l'amministratore (regola cgs_write di company_governance_settings); il
 * database rifiuta i valori fuori dai limiti (cgs_soglie_collegamenti_valide).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface SoglieCollegamenti {
  banca_differenza_max: number;
  acquisti_quantita_toll_perc: number;
  acquisti_prezzo_toll_perc: number;
  acquisti_prezzo_toll_cent: number;
}

export const SOGLIE_DEFAULT: SoglieCollegamenti = {
  banca_differenza_max: 1,
  acquisti_quantita_toll_perc: 0,
  acquisti_prezzo_toll_perc: 0.5,
  acquisti_prezzo_toll_cent: 2,
};

/** Gli stessi limiti del vincolo del database. */
export const LIMITI: Record<keyof SoglieCollegamenti, { min: number; max: number; passo: number }> = {
  banca_differenza_max: { min: 0, max: 50, passo: 0.01 },
  acquisti_quantita_toll_perc: { min: 0, max: 20, passo: 0.1 },
  acquisti_prezzo_toll_perc: { min: 0, max: 20, passo: 0.1 },
  acquisti_prezzo_toll_cent: { min: 0, max: 10000, passo: 1 },
};

/** Testo (anche con la virgola) → numero dentro i limiti, o null se non va bene. */
export function leggiSoglia(chiave: keyof SoglieCollegamenti, testo: string): number | null {
  const n = Number(testo.replace(",", ".").trim());
  if (testo.trim() === "" || !Number.isFinite(n)) return null;
  const l = LIMITI[chiave];
  if (n < l.min || n > l.max) return null;
  return chiave === "acquisti_prezzo_toll_cent" ? (Number.isInteger(n) ? n : null) : Math.round(n * 1000) / 1000;
}

const CAMPI: Array<{ chiave: keyof SoglieCollegamenti; etichetta: string; unita: string; aiuto: string }> = [
  { chiave: "banca_differenza_max", etichetta: "Banca: differenza ammessa", unita: "€", aiuto: "Commissioni e arrotondamenti fra il bonifico e la fattura. Oltre, è un pagamento parziale." },
  { chiave: "acquisti_quantita_toll_perc", etichetta: "Acquisti: quantità", unita: "%", aiuto: "Scarto fra la quantità in fattura e quella della bolla o dell'ordine." },
  { chiave: "acquisti_prezzo_toll_perc", etichetta: "Acquisti: prezzo", unita: "%", aiuto: "Scarto del prezzo unitario rispetto all'ordine." },
  { chiave: "acquisti_prezzo_toll_cent", etichetta: "Acquisti: arrotondamento di riga", unita: "cent", aiuto: "Differenza d'importo di riga sempre ammessa." },
];

export function SoglieCollegamentiCard({ companyId, puoModificare }: { companyId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["soglie-collegamenti", companyId],
    queryFn: async (): Promise<SoglieCollegamenti> => {
      const { data, error } = await db.rpc("azienda_soglie_automazioni", { p_company: companyId });
      if (error) throw error;
      const d = (data ?? {}) as Partial<Record<keyof SoglieCollegamenti, number | string>>;
      return Object.fromEntries((Object.keys(SOGLIE_DEFAULT) as Array<keyof SoglieCollegamenti>)
        .map((k) => [k, d[k] == null ? SOGLIE_DEFAULT[k] : Number(d[k])])) as unknown as SoglieCollegamenti;
    },
  });
  const [bozza, setBozza] = useState<Record<keyof SoglieCollegamenti, string> | null>(null);
  useEffect(() => {
    if (q.data) setBozza(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, String(v).replace(".", ",")])) as Record<keyof SoglieCollegamenti, string>);
  }, [q.data]);

  const valori = bozza ? (Object.fromEntries((Object.keys(SOGLIE_DEFAULT) as Array<keyof SoglieCollegamenti>).map((k) => [k, leggiSoglia(k, bozza[k])])) as Record<keyof SoglieCollegamenti, number | null>) : null;
  const errori = valori ? (Object.keys(valori) as Array<keyof SoglieCollegamenti>).filter((k) => valori[k] == null) : [];
  const cambiate = !!(valori && q.data && (Object.keys(valori) as Array<keyof SoglieCollegamenti>).some((k) => valori[k] !== q.data![k]));

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("company_governance_settings")
        .upsert({ company_id: companyId, ...valori, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Soglie salvate"); void qc.invalidateQueries({ queryKey: ["soglie-collegamenti", companyId] }); },
    onError: (e: Error) => toast.error("Soglie non salvate", { description: e.message }),
  });

  if (q.isError) return null;
  return (
    <section className="rounded-lg border p-4" aria-labelledby="soglie-collegamenti">
      <h3 id="soglie-collegamenti" className="flex items-center gap-2 font-medium"><SlidersHorizontal className="h-4 w-4" />Soglie dei collegamenti</h3>
      <p className="mt-1 text-sm text-muted-foreground">Quanto può scostarsi un documento perché il gestionale lo colleghi o lo proponga. Valgono per questa azienda.</p>
      {!bozza ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">Caricamento…</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {CAMPI.map((c) => (
              <div key={c.chiave} className="space-y-1">
                <Label htmlFor={`soglia-${c.chiave}`}>{c.etichetta}</Label>
                <div className="flex items-center gap-2">
                  <Input id={`soglia-${c.chiave}`} inputMode="decimal" className="w-28" value={bozza[c.chiave]} disabled={!puoModificare}
                    aria-invalid={errori.includes(c.chiave)} onChange={(e) => setBozza({ ...bozza, [c.chiave]: e.target.value })} />
                  <span className="text-sm text-muted-foreground">{c.unita}</span>
                </div>
                <p className={`text-xs ${errori.includes(c.chiave) ? "text-destructive" : "text-muted-foreground"}`}>
                  {errori.includes(c.chiave) ? `Da ${LIMITI[c.chiave].min} a ${LIMITI[c.chiave].max}${c.chiave === "acquisti_prezzo_toll_cent" ? ", senza decimali" : ""}.` : c.aiuto}
                </p>
              </div>
            ))}
            <div className="space-y-1">
              <p className="text-sm font-medium">Acquisti: indirizzo del cantiere</p>
              <p className="text-sm">Solo proposta</p>
              <p className="text-xs text-muted-foreground">Un indirizzo simile non basta per collegare da solo: si propone e si conferma con un clic.</p>
            </div>
          </div>
          {puoModificare ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => salva.mutate()} disabled={!cambiate || errori.length > 0 || salva.isPending}>{salva.isPending ? "Salvo…" : "Salva le soglie"}</Button>
              <Button size="sm" variant="outline" disabled={salva.isPending}
                onClick={() => setBozza(Object.fromEntries(Object.entries(SOGLIE_DEFAULT).map(([k, v]) => [k, String(v).replace(".", ",")])) as Record<keyof SoglieCollegamenti, string>)}>
                Valori di partenza
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Le soglie le cambia l&apos;amministratore dell&apos;azienda.</p>
          )}
        </>
      )}
    </section>
  );
}
