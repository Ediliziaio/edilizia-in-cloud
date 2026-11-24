import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { computoLetto, useComputiCommessa, useSalvaComputoImportato } from "@/hooks/useComputoCommessa";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import { percorsoComputoCommessa } from "@/lib/computo/percorsiComputo";
import { vociPerCommessaDallaVariante } from "@/lib/planimetrie/computoConPlanimetria";
import { caricaPlanimetria, caricaVersione } from "@/lib/planimetrie/archivio";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ComputoStudioInCommessa({ companyId, orderId, bozzaId, generale, puoSalvare = true }: {
  companyId:string; orderId:string; bozzaId:string; generale?:boolean; puoSalvare?:boolean;
}) {
  const t = useT();
  const { user } = useAuth();
  const salva = useSalvaComputoImportato(orderId, companyId, user?.id);
  const { data: computi, isLoading } = useComputiCommessa(orderId, companyId);
  const ordine = useQuery({
    queryKey: ["commessa-tipo", companyId, orderId],
    enabled: generale === undefined,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("workflow_kind").eq("company_id", companyId).eq("id", orderId).maybeSingle();
      if (error) throw error;
      return data?.workflow_kind === "generale";
    },
  });
  const inCorso = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const copia = computi?.find(c => c.stato !== "archiviato" && computoLetto(c) && c.fonte_variante?.bozzaId === bozzaId);
  const percorso = copia ? percorsoComputoCommessa(orderId, copia.id) : null;
  const destinazione = percorso && (generale ?? ordine.data) ? `${percorso}&scheda=cantiere&vista-cantiere=computi` : percorso;
  const porta = async () => {
    if (inCorso.current || !puoSalvare) return;
    inCorso.current = true;
    setSalvando(true);
    setErrore("");
    try {
      const cloud = await leggiComputoCloud(companyId,bozzaId);
      const f = cloud?.bozza.fontePlanimetria;
      if (!cloud || !f) throw new Error(t("Computo di variante non disponibile."));
      const pianta = await caricaPlanimetria(f.planimetriaId);
      if (pianta.riga.company_id !== companyId) throw new Error(t("Planimetria non disponibile per questa azienda."));
      const sorgente = pianta.versione.numero === f.versione ? pianta.versione : await caricaVersione(f.planimetriaId, f.versione);
      const voci = vociPerCommessaDallaVariante(cloud.bozza, sorgente.documento);
      const esito = await salva.mutateAsync({ voci, file:[], totaleDocumento:null, titolo:cloud.bozza.titolo,
        origine:"variante-planimetria", fonteVariante:{...f,bozzaId} });
      toast.success(esito.riusato ? t("Il computo è già aggiornato") : t("Computo trasferito in commessa"));
    } catch(e) { setErrore(e instanceof Error ? e.message : t("Computo non salvato nella commessa.")); }
    finally { inCorso.current = false; setSalvando(false); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    {destinazione && !ordine.isLoading && <Button asChild size="sm" variant="outline"><Link to={destinazione}>{t("Apri il computo in commessa")}</Link></Button>}
    {puoSalvare && <Button size="sm" variant={copia ? "ghost" : "outline"} disabled={salvando || isLoading} onClick={() => void porta()}>
      {salvando ? t("Trasferimento…") : copia ? t("Trasferisci aggiornamento") : t("Porta la bozza in commessa")}
    </Button>}
    {errore && <p role="alert" className="text-xs text-destructive">{errore}</p>}
  </div>;
}
