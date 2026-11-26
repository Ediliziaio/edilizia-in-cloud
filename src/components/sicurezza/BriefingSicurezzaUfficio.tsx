/**
 * «5 minuti di sicurezza» e ingressi in cantiere, lato ufficio (26/11/2026, piano campo completo 2.4 e 2.5).
 * Legge campo_briefing_sicurezza e campo_ingressi (amministratore o permesso «Sicurezza cantiere»): per ogni
 * formazione breve giorno, cantiere, argomento, chi c'era con la firma; sotto gli ingressi controllati col QR.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { HardHat, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Briefing { id: string; order_id: string; giorno: string; argomento: string; note: string | null; presenti: Array<{ nome: string; firma?: string; firmato_il?: string }> }
interface Ingresso { id: string; order_id: string; giorno: string; nome: string; esito: string; assegnato: boolean; registrato_il: string }
const ESITO: Record<string, string> = { valido: "In regola", da_verificare: "Da verificare", non_valido: "Tesserino non valido" };
const db = () => supabase as unknown as { from: (t: "campo_briefing_sicurezza" | "campo_ingressi") => any };

export function BriefingSicurezzaUfficio({ companyId }: { companyId: string }) {
  const t = useT();
  const [aperto, setAperto] = useState<string | null>(null);
  const dal = format(subDays(new Date(), 60), "yyyy-MM-dd");
  const q = useQuery({
    queryKey: ["ufficio-briefing-ingressi", companyId, dal],
    staleTime: 60_000,
    queryFn: async () => {
      const [b, i] = await Promise.all([
        db().from("campo_briefing_sicurezza").select("id, order_id, giorno, argomento, note, presenti").eq("company_id", companyId).gte("giorno", dal).order("giorno", { ascending: false }).limit(200),
        db().from("campo_ingressi").select("id, order_id, giorno, nome, esito, assegnato, registrato_il").eq("company_id", companyId).gte("giorno", format(subDays(new Date(), 7), "yyyy-MM-dd")).order("registrato_il", { ascending: false }).limit(300),
      ]);
      if (b.error) throw b.error;
      if (i.error) throw i.error;
      const briefing = (b.data ?? []) as Briefing[]; const ingressi = (i.data ?? []) as Ingresso[];
      const ids = [...new Set([...briefing.map(x => x.order_id), ...ingressi.map(x => x.order_id)])];
      const { data: ordini } = ids.length ? await supabase.from("orders").select("id, order_code, description").in("id", ids) : { data: [] as Array<{ id: string; order_code: string | null; description: string | null }> };
      const nomi = new Map((ordini ?? []).map(o => [o.id, [o.order_code, o.description?.slice(0, 40)].filter(Boolean).join(" · ")]));
      return { briefing, ingressi, nomi };
    },
  });
  if (q.isSuccess && !q.data.briefing.length && !q.data.ingressi.length) return null;
  const cantiere = (id: string) => q.data?.nomi.get(id) ?? t("Cantiere");

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><HardHat className="size-4 text-primary" aria-hidden="true" />{t("5 minuti di sicurezza (ultimi 60 giorni)")}</CardTitle></CardHeader>
        <CardContent>
          {q.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere i dati. Riprova tra poco.")}</p>
            : !(q.data?.briefing.length) ? <p className="text-sm text-muted-foreground">{t("Ancora nessuno.")}</p> : (
            <ul className="divide-y text-sm">
              {q.data.briefing.map(b => (
                <li key={b.id} className="py-2">
                  <button type="button" aria-expanded={aperto === b.id} onClick={() => setAperto(aperto === b.id ? null : b.id)} className="flex w-full flex-wrap items-center gap-x-2 text-start">
                    <span className="font-semibold">{format(parseISO(b.giorno), "d MMM yyyy", { locale: it })}</span>
                    <span className="text-muted-foreground">{cantiere(b.order_id)}</span>
                    <span className="ms-auto">{t(b.argomento)} · {t("{n} presenti", { n: b.presenti.length })}</span>
                  </button>
                  {aperto === b.id && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {b.presenti.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 rounded border p-1.5">
                          {p.firma ? <img src={p.firma} alt={t("Firma di {nome}", { nome: p.nome })} className="h-10 w-28 rounded bg-white object-contain" /> : <span className="h-10 w-28 text-xs text-muted-foreground">{t("senza firma")}</span>}
                          <span className="min-w-0 truncate">{p.nome}</span>
                        </div>
                      ))}
                      {b.note && <p className="text-xs text-muted-foreground sm:col-span-2">{b.note}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {!!q.data?.ingressi.length && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />{t("Ingressi controllati (ultimi 7 giorni)")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {q.data.ingressi.map(r => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2 py-1.5">
                  <span className="font-medium">{r.nome}</span>
                  <span className="text-muted-foreground">{cantiere(r.order_id)}</span>
                  <span className="ms-auto text-xs">{format(new Date(r.registrato_il), "d MMM HH:mm", { locale: it })} · {t(ESITO[r.esito] ?? r.esito)}{r.assegnato ? "" : ` · ${t("non assegnato")}`}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
