import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { idComputoValido, percorsoComputoNativo } from "@/lib/computo/percorsiComputo";
import { CollegamentiComputoNativo } from "@/components/computo/CollegamentiComputoNativo";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";
import ComputoCloudEditor from "@/components/computo/ComputoCloudEditor";
import { ComputoDaVarianteDialog } from "@/components/computo/ComputoDaVarianteDialog";
import { computoCloudAttivo, ultimoComputoCollegato } from "@/lib/computo/cloudComputo";
import { chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import { consentiPreventivoConversazionale } from "@/lib/preventivi/quoteRollout";
import { conCondizioniDellArchivio, useModelloComputo } from "@/lib/computo/modelloComputo";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import { puoRiscrivereLeCondizioni } from "@/lib/preventivi/condizioniDelPreventivo";
import { usePermissions } from "@/hooks/usePermissions";
import { leggiContestoNuovoComputo } from "@/lib/computo/contestoNuovoComputo";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import type { OrigineComputoPianta } from "@/lib/computo/computoDallaPianta";

export default function ComputoPreventivo() {
  const { effectiveCompany, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [nuovoId] = useState(() => crypto.randomUUID());
  const [daPlanimetria, setDaPlanimetria] = useState(false);
  // Il modello del computo dell'azienda (Impostazioni → Modelli preventivi): se non risponde si parte senza.
  const modello = useModelloComputo(effectiveCompany?.id);
  // Le condizioni vengono da «Contratti e condizioni» (07/11/2026): un computo nuovo parte da quelle.
  const archivio = useCondizioniArchivio();
  const permessi = usePermissions();
  const analisiCosti = useFeatureAccess("preventivi_analisi_costi");
  const contestoCrm = [params.get("customer_id"), params.get("contact_id"), params.get("opportunity_id")].join("|");
  const conContesto = contestoCrm !== "||";
  const prefill = useQuery({
    queryKey: ["computo-contesto-crm", effectiveCompany?.id, user?.id, contestoCrm, permessi.isAdmin, permessi.canViewMarketingContacts, permessi.canViewCustomers, permessi.canViewOrders, permessi.canViewMarketingOpportunities, permessi.onlyAssigned],
    enabled: conContesto && !!effectiveCompany?.id && !permessi.isLoading,
    queryFn: () => leggiContestoNuovoComputo(effectiveCompany!.id, params, permessi),
    retry: false,
  });
  const piantaId = params.get("pianta");
  const livelloId = params.get("livello");
  const propostaId = params.get("proposta");
  const daPianta = Boolean(piantaId && !params.has("esistente"));
  const puoCollegarePianta = permessi.canViewRenderAi && permessi.canEditPreventivi && !permessi.solaLettura;
  const prefillPianta = useQuery({
    queryKey: ["computo-nuovo-da-pianta", effectiveCompany?.id, piantaId, livelloId, propostaId],
    enabled: daPianta && !!effectiveCompany?.id && !permessi.isLoading && puoCollegarePianta,
    retry: false,
    queryFn: async () => {
      if (!piantaId || !idComputoValido(piantaId) || !livelloId || livelloId.length > 250 || (propostaId !== null && (!propostaId || propostaId.length > 250))) {
        throw new Error("Scegli il piano dalla scheda della planimetria.");
      }
      const [{ caricaPlanimetria }, { idComputoDallaPianta, misureDalProgetto, tipiDaQuotare, vociDallaPianta }, { esigiVerificaDocumento }, { caricaFontiPrezzi }] = await Promise.all([
        import("@/lib/planimetrie/archivio"), import("@/lib/computo/computoDallaPianta"), import("../../../../shared/planimetrie/verificaDocumento"),
        import("@/lib/planimetrie/fontiPrezzi"),
      ]);
      const collegamento = { id: piantaId, livelloId, propostaId };
      const idComputo = await ultimoComputoCollegato(effectiveCompany!.id, collegamento) ?? await idComputoDallaPianta(collegamento);
      try {
        const { riga, versione } = await caricaPlanimetria(piantaId);
        if (riga.company_id !== effectiveCompany?.id) throw new Error("Planimetria non disponibile per l’azienda selezionata.");
        esigiVerificaDocumento(versione.documento, "computo");
        const piantaOrigine: OrigineComputoPianta = {
          ...collegamento, titolo: riga.titolo.slice(0, 160), versione: versione.numero,
        };
        // Le voci nascono quotate come nello studio della variante, per chi vede gli importi.
        const fonti = propostaId && permessi.canViewPreventivi
          ? await caricaFontiPrezzi(effectiveCompany!.id, tipiDaQuotare(versione.documento, piantaOrigine)) : null;
        const proposte = propostaId ? vociDallaPianta(misureDalProgetto(versione.documento, piantaOrigine, fonti).filter(m => m.chiavePrecedente), versione.numero) : [];
        if (proposte.length > 5000) throw new Error("Apri un piano con un massimo di 5.000 lavorazioni per computo.");
        return { idComputo, bozza: { piantaOrigine, titolo: `Lavori — ${riga.titolo}`.slice(0, 160),
          voci: proposte } };
      } catch (e) {
        return { idComputo, errorePianta: e instanceof Error ? e.message : "Non riesco a leggere le misure della planimetria." };
      }
    },
  });
  const richiesto = params.get("bozza");
  const soloEsistente = params.get("esistente") === "1";
  const cloudAttivo = computoCloudAttivo(effectiveCompany?.id);
  const fase = /^[1-5]$/.test(params.get("fase") ?? "") ? Number(params.get("fase")) - 1 : 0;
  const idValido = richiesto && idComputoValido(richiesto) ? richiesto : null;
  const id = prefillPianta.data?.idComputo ?? idValido ?? nuovoId;
  const attesaPianta = daPianta && (permessi.isLoading || (puoCollegarePianta && prefillPianta.isPending));
  useEffect(() => {
    if (soloEsistente || attesaPianta) return;
    if (richiesto === id) return;
    const next = new URLSearchParams(params); next.set("bozza", id); setParams(next, { replace: true });
  }, [id, richiesto, params, setParams, soloEsistente, attesaPianta]);
  if (!effectiveCompany || !user) return <p role="alert">Seleziona un’azienda per aprire il preventivo.</p>;
  if (soloEsistente && (!idValido || !cloudAttivo)) return <p role="alert" className="p-6">Il computo richiesto non è disponibile in questa azienda. Torna al preventivo per verificare il collegamento.</p>;
  if (!import.meta.env.DEV && !cloudAttivo) return <div className="space-y-3 p-6"><p role="alert">Azienda non riconosciuta: ricarica la pagina.</p><button className="underline" onClick={() => { void navigate("/azienda/marketing/preventivi"); }}>Torna ai Preventivi</button></div>;
  if (attesaPianta && !idValido) return <p role="status" className="p-6 text-sm text-muted-foreground">Leggo le misure della planimetria…</p>;
  const configurazioneInCaricamento = modello.isLoading || archivio.inCaricamento || attesaPianta || (conContesto && (!!permessi.isLoading || prefill.isPending));
  if (!cloudAttivo && configurazioneInCaricamento) return <p role="status" className="p-6 text-sm text-muted-foreground">Apro il preventivo…</p>;
  const key = chiaveBozzaComputo(effectiveCompany.id, user.id, `preventivo:${id}`);
  const puoUsarePlanimetria = !permessi.isLoading && !permessi.solaLettura && permessi.canViewRenderAi &&
    permessi.canEditPreventivi && computoCloudAttivo(effectiveCompany.id);
  const dettagli = [effectiveCompany.legal_address, effectiveCompany.legal_city,
    effectiveCompany.vat_number && `P.IVA ${effectiveCompany.vat_number}`, effectiveCompany.email, effectiveCompany.phone].filter(Boolean).join(" | ");
  const editorProps = { storageKey: key, consentiListini: true,
    consentiRiuso: permessi.canViewPreventivi && permessi.canEditPreventivi && !permessi.solaLettura,
    ai: consentiPreventivoConversazionale(effectiveCompany.id) ? { companyId: effectiveCompany.id, draftId: id } : undefined, azienda: effectiveCompany.business_name || effectiveCompany.name,
    dettagliAzienda: dettagli, colore: effectiveCompany.brand_primary_color ?? undefined, fase,
    datiAzienda: { partitaIva: effectiveCompany.vat_number, indirizzo: [effectiveCompany.legal_address, effectiveCompany.legal_city].filter(Boolean).join(", "), email: effectiveCompany.email, telefono: effectiveCompany.phone },
    modello: modello.data?.modello ? conCondizioniDellArchivio(modello.data.modello, archivio.modelli) : undefined,
    datiIniziali: prefillPianta.data ? { ...prefill.data, ...prefillPianta.data.bozza } : prefill.data,
    puoAggiornarePianta: puoCollegarePianta,
    logoUrl: effectiveCompany.logo_url,
    vediMargini: permessi.canViewCosts && permessi.canViewMargins,
    analisiCosti: analisiCosti.accessLevel === "enabled" && permessi.canViewCosts && permessi.canViewMargins
      ? { draftId: id, modifica: permessi.canEditPreventivi && !permessi.solaLettura } : undefined,
    puoRiscrivereCondizioni: puoRiscrivereLeCondizioni(permessi),
    onComputoDaPlanimetria: puoUsarePlanimetria ? () => setDaPlanimetria(true) : undefined,
    // La firma online passa per il gestionale: c'è dove il computo si salva lì.
    firmaOnline: cloudAttivo ? { companyId: effectiveCompany.id, draftId: id, userId: user.id,
      onApriCommessa: (quoteId: string) => { void navigate(`/azienda/ordini/nuovo?quote_id=${quoteId}`); } } : undefined,
    onFaseChange: (n: number) => { const next = new URLSearchParams(params); next.set("fase", String(n + 1)); setParams(next); },
    onBack: () => { void navigate("/azienda/marketing/preventivi"); } };
  const collegamenti = <CollegamentiComputoNativo companyId={effectiveCompany.id} draftId={id} />;
  return <div className={`mx-auto w-full min-w-0 ${fase === 2 ? "max-w-none" : "max-w-[1440px]"} space-y-4 md:p-6`}>
    {prefill.error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{prefill.error.message} Puoi selezionare il destinatario nel passo Dati.</p>}
    {daPianta && !attesaPianta && (!puoCollegarePianta || prefillPianta.error || prefillPianta.data?.errorePianta) &&
      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{prefillPianta.error?.message ?? prefillPianta.data?.errorePianta ?? "Il collegamento richiede l’accesso alle planimetrie e la modifica dei preventivi."}</p>}
    {cloudAttivo ? (
      <ComputoCloudEditor key={key} {...editorProps} companyId={effectiveCompany.id} draftId={id}
        soloEsistente={soloEsistente} configurazioneInCaricamento={configurazioneInCaricamento}>
        {collegamenti}
      </ComputoCloudEditor>
    ) : <>{collegamenti}<ComputoNativoEditor key={key} {...editorProps} companyId={effectiveCompany.id} /></>}
    {daPlanimetria && puoUsarePlanimetria && <ComputoDaVarianteDialog companyId={effectiveCompany.id} userId={user.id}
      onChiudi={()=>setDaPlanimetria(false)} onApri={bozzaId=>{
        setDaPlanimetria(false);
        void navigate(`${percorsoComputoNativo(bozzaId)}&fase=3`);
      }} />}
  </div>;
}
