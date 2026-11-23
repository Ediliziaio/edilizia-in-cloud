/**
 * La riga «Bolletta» di una fattura ricevuta (15/11/2026): per ogni utenza del documento il codice
 * (POD/PDR), il periodo, l'importo; lo stato (riconosciuta, doppione sospetto) e dove è andato il
 * costo. Compare solo se il giro del server ha letto la fattura come bolletta. Le decisioni si
 * prendono in Costi → Utenze.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COSTO: Record<string, string> = {
  applicato: "costo sulla commessa", proposta: "commessa proposta, da confermare", generale: "costo generale (sede)",
  da_collegare: "utenza da collegare a sede, immobile o commessa", senza_costo: "da contabilizzare", gia_assegnato: "costo già assegnato",
  misto: "parte generale e parte commesse: da ripartire a mano", sospesa: "costo sospeso",
};

interface Dati {
  stato: string; tipo: string; costo_esito: string | null; avvisi: Array<{ testo: string }>;
  righe: Array<{ codice: string; periodo_dal: string | null; periodo_al: string | null; importo: number }>;
}

export function BollettaFattura({ fatturaId, companyId }: { fatturaId: string; companyId: string }) {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["fattura-bolletta", companyId, fatturaId],
    queryFn: async (): Promise<Dati | null> => {
      const { data: b, error } = await db.from("bollette").select("id, stato, tipo, costo_esito, avvisi")
        .eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).maybeSingle();
      if (error || !b) return null;
      const { data: righe } = await db.from("bollette_righe").select("codice, periodo_dal, periodo_al, importo").eq("bolletta_id", b.id).order("codice");
      return { ...b, righe: righe ?? [] } as Dati;
    },
  });
  if (!data || data.stato === "senza_utenze") return null;
  return (
    <>
      <dt className="text-muted-foreground">{t("Bolletta")}</dt>
      <dd className="space-y-0.5" data-testid="bolletta-fattura">
        {data.righe.map((r) => (
          <span key={r.codice} className="block">
            {r.codice}{r.periodo_dal ? ` · ${formatDateShort(r.periodo_dal)} – ${formatDateShort(r.periodo_al ?? r.periodo_dal)}` : ""} · {formatCurrency(Number(r.importo))}
          </span>
        ))}
        <span className="block text-xs text-muted-foreground">
          {data.tipo === "conguaglio" ? `${t("Conguaglio")} · ` : data.tipo === "nota_credito" ? `${t("Nota di credito")} · ` : ""}
          {data.stato === "doppione_sospetto" ? <span className="text-amber-700 dark:text-amber-400">{t("Possibile doppione:")} {data.avvisi[0]?.testo ?? ""} </span> : null}
          {data.costo_esito ? (COSTO[data.costo_esito] ? t(COSTO[data.costo_esito]) : data.costo_esito) : ""}
          {" · "}<Link className="underline underline-offset-2" to="/azienda/costi?tab=utenze">{t("Utenze")}</Link>
        </span>
      </dd>
    </>
  );
}
