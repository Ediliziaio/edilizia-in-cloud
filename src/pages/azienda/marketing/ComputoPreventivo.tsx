import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { idComputoValido } from "@/lib/computo/percorsiComputo";
import { CollegamentiComputoNativo } from "@/components/computo/CollegamentiComputoNativo";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";
import ComputoCloudEditor from "@/components/computo/ComputoCloudEditor";
import { computoCloudAttivo } from "@/lib/computo/cloudComputo";
import { chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import { consentiPreventivoConversazionale } from "@/lib/preventivi/quoteRollout";
import { conCondizioniDellArchivio, useModelloComputo } from "@/lib/computo/modelloComputo";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import { puoRiscrivereLeCondizioni } from "@/lib/preventivi/condizioniDelPreventivo";
import { usePermissions } from "@/hooks/usePermissions";

export default function ComputoPreventivo() {
  const { effectiveCompany, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [nuovoId] = useState(() => crypto.randomUUID());
  // Il modello del computo dell'azienda (Impostazioni → Modelli preventivi): se non risponde si parte senza.
  const modello = useModelloComputo(effectiveCompany?.id);
  // Le condizioni vengono da «Contratti e condizioni» (07/11/2026): un computo nuovo parte da quelle.
  const archivio = useCondizioniArchivio();
  const permessi = usePermissions();
  const richiesto = params.get("bozza");
  const soloEsistente = params.get("esistente") === "1";
  const esistente = useQuery({
    queryKey: ["computo-esistente", effectiveCompany?.id, richiesto],
    enabled: soloEsistente && !!effectiveCompany?.id && !!richiesto && idComputoValido(richiesto),
    queryFn: async () => {
      const { data, error } = await supabase.from("computo_preventivo_drafts" as never).select("id").eq("company_id", effectiveCompany!.id).eq("id", richiesto!).maybeSingle();
      if (error) throw new Error("Il computo non è disponibile.");
      return !!data;
    },
  });
  const fase = /^[1-5]$/.test(params.get("fase") ?? "") ? Number(params.get("fase")) - 1 : 0;
  const id = richiesto && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(richiesto) ? richiesto : nuovoId;
  useEffect(() => {
    if (soloEsistente) return;
    if (richiesto === id) return;
    const next = new URLSearchParams(params); next.set("bozza", id); setParams(next, { replace: true });
  }, [id, richiesto, params, setParams, soloEsistente]);
  if (!effectiveCompany || !user) return <p role="alert">Seleziona un’azienda per aprire il preventivo.</p>;
  if (soloEsistente && (!richiesto || !idComputoValido(richiesto) || esistente.error || esistente.data === false)) return <p role="alert" className="p-6">Il computo richiesto non è disponibile in questa azienda. Torna al preventivo per verificare il collegamento.</p>;
  if (soloEsistente && esistente.isPending) return <p role="status" className="p-6">Verifico il computo esistente…</p>;
  if (!import.meta.env.DEV && !computoCloudAttivo(effectiveCompany.id)) return <div className="space-y-3 p-6"><p role="alert">Azienda non riconosciuta: ricarica la pagina.</p><button className="underline" onClick={() => { void navigate("/azienda/marketing/preventivi"); }}>Torna ai Preventivi</button></div>;
  if (modello.isLoading || archivio.inCaricamento) return <p role="status" className="p-6 text-sm text-muted-foreground">Apro il preventivo…</p>;
  const key = chiaveBozzaComputo(effectiveCompany.id, user.id, `preventivo:${id}`);
  const dettagli = [effectiveCompany.legal_address, effectiveCompany.legal_city,
    effectiveCompany.vat_number && `P.IVA ${effectiveCompany.vat_number}`, effectiveCompany.email, effectiveCompany.phone].filter(Boolean).join(" | ");
  const editorProps = { storageKey: key, consentiListini: true,
    ai: consentiPreventivoConversazionale(effectiveCompany.id) ? { companyId: effectiveCompany.id, draftId: id } : undefined, azienda: effectiveCompany.business_name || effectiveCompany.name,
    dettagliAzienda: dettagli, colore: effectiveCompany.brand_primary_color ?? undefined, fase,
    modello: modello.data?.modello ? conCondizioniDellArchivio(modello.data.modello, archivio.modelli) : undefined,
    logoUrl: effectiveCompany.logo_url,
    vediMargini: permessi.canViewCosts && permessi.canViewMargins,
    puoRiscrivereCondizioni: puoRiscrivereLeCondizioni(permessi),
    // La firma online passa per il gestionale: c'è dove il computo si salva lì.
    firmaOnline: computoCloudAttivo(effectiveCompany.id) ? { companyId: effectiveCompany.id, draftId: id, userId: user.id,
      onApriCommessa: (quoteId: string) => { void navigate(`/azienda/ordini/nuovo?quote_id=${quoteId}`); } } : undefined,
    onFaseChange: (n: number) => { const next = new URLSearchParams(params); next.set("fase", String(n + 1)); setParams(next); },
    onBack: () => { void navigate("/azienda/marketing/preventivi"); } };
  return <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:p-6">
    <CollegamentiComputoNativo companyId={effectiveCompany.id} draftId={id} />
    {computoCloudAttivo(effectiveCompany.id)
      ? <ComputoCloudEditor key={key} {...editorProps} companyId={effectiveCompany.id} draftId={id} soloEsistente={soloEsistente} />
      : <ComputoNativoEditor key={key} {...editorProps} />}
  </div>;
}
