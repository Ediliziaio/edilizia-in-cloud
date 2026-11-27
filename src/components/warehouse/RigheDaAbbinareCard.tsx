/**
 * Righe di bolla che non sono entrate in magazzino quando il carico è stato confermato:
 * articolo non trovato, quantità oltre quanto l'ordine aspettava, quantità con decimali.
 * Restano qui finché chi gestisce il magazzino non le sistema (carico a mano, abbinamento
 * dell'articolo) e le segna fatte. Dati: magazzino_righe_da_abbinare / magazzino_righe_abbinate.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RigaDaAbbinare { descrizione: string | null; codice: string | null; quantita: number; motivo: string }
interface CaricoDaAbbinare {
  id: string; ddt_numero: string | null; ddt_data: string | null; confermato_il: string | null;
  ordine: string | null; righe: RigaDaAbbinare[];
}

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function RigheDaAbbinareCard() {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id;
  const carichi = useQuery({
    queryKey: ["magazzino-righe-da-abbinare", companyId],
    enabled: !!companyId && !!permissions.canViewWarehouse,
    staleTime: 60_000,
    queryFn: async (): Promise<CaricoDaAbbinare[]> => {
      const { data, error } = await db.rpc("magazzino_righe_da_abbinare");
      if (error) throw error;
      return (data ?? []) as CaricoDaAbbinare[];
    },
  });
  const chiudi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("magazzino_righe_abbinate", { p_carico: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Righe segnate come sistemate"));
      void qc.invalidateQueries({ queryKey: ["magazzino-righe-da-abbinare"] });
    },
    onError: (e) => toast.error(t("Non sono riuscito a salvare"), { description: messaggioErrore(e) }),
  });

  const lista = carichi.data ?? [];
  if (lista.length === 0) return null;
  const totRighe = lista.reduce((s, c) => s + c.righe.length, 0);

  return (
    <section aria-labelledby="righe-da-abbinare" className="rounded-xl border border-amber-200 bg-card">
      <h2 id="righe-da-abbinare" title={t("Merce arrivata ma non caricata in giacenza. Caricala a mano (o abbina l’articolo), poi segna «Fatto».")} className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        <PackageSearch className="h-4 w-4 text-amber-600" aria-hidden="true" />{t("Righe di bolla da sistemare")}
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{totRighe}</span>
      </h2>
      {/* La spiegazione sta nel titolo come suggerimento: era una riga in più (25/11/2026). */}
      <p className="sr-only">
        {t("Merce arrivata ma non caricata in giacenza. Caricala a mano (o abbina l’articolo), poi segna «Fatto».")}
      </p>
      <ul className="divide-y">
        {lista.map((c) => (
          <li key={c.id} className="space-y-0.5 px-3 py-1.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {c.ddt_data ? t("Bolla {numero} del {ddt_data}", { numero: c.ddt_numero ?? "s.n.", ddt_data: String(dataIt(c.ddt_data) ?? "") }) : t("Bolla {numero}", { numero: c.ddt_numero ?? "s.n." })}{c.ordine ? " · " + t("ordine {ordine}", { ordine: String(c.ordine ?? "") }) : ""}
              </p>
              {permissions.canEditWarehouse && (
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={chiudi.isPending} onClick={() => chiudi.mutate(c.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" />{t("Fatto")}
                </Button>
              )}
            </div>
            <ul className="space-y-0.5 text-muted-foreground">
              {c.righe.map((r, i) => (
                <li key={i}>
                  {r.descrizione || t("Articolo senza descrizione")}{r.codice ? ` (${t("cod. {codice}", { codice: String(r.codice ?? "") })})` : ""} · {r.quantita} · <span className="text-amber-800">{r.motivo}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
