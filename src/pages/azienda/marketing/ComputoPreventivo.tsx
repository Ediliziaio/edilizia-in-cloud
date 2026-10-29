import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";
import ComputoCloudEditor from "@/components/computo/ComputoCloudEditor";
import { computoCloudAttivo } from "@/lib/computo/cloudComputo";
import { chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import { consentiPreventivoConversazionale } from "@/lib/preventivi/quoteRollout";
import { useModelloComputo } from "@/lib/computo/modelloComputo";
import { usePermissions } from "@/hooks/usePermissions";

export default function ComputoPreventivo() {
  const { effectiveCompany, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [nuovoId] = useState(() => crypto.randomUUID());
  // Il modello del computo dell'azienda (Impostazioni → Modelli preventivi): se non risponde si parte senza.
  const modello = useModelloComputo(effectiveCompany?.id);
  const permessi = usePermissions();
  const richiesto = params.get("bozza");
  const fase = /^[1-5]$/.test(params.get("fase") ?? "") ? Number(params.get("fase")) - 1 : 0;
  const id = richiesto && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(richiesto) ? richiesto : nuovoId;
  useEffect(() => {
    if (richiesto === id) return;
    const next = new URLSearchParams(params); next.set("bozza", id); setParams(next, { replace: true });
  }, [id, richiesto, params, setParams]);
  if (!effectiveCompany || !user) return <p role="alert">Seleziona un’azienda per aprire il preventivo.</p>;
  if (!import.meta.env.DEV && !computoCloudAttivo(effectiveCompany.id)) return <div className="space-y-3 p-6"><p role="alert">Azienda non riconosciuta: ricarica la pagina.</p><button className="underline" onClick={() => { void navigate("/azienda/marketing/preventivi"); }}>Torna ai Preventivi</button></div>;
  if (modello.isLoading) return <p role="status" className="p-6 text-sm text-muted-foreground">Apro il preventivo…</p>;
  const key = chiaveBozzaComputo(effectiveCompany.id, user.id, `preventivo:${id}`);
  const dettagli = [effectiveCompany.legal_address, effectiveCompany.legal_city,
    effectiveCompany.vat_number && `P.IVA ${effectiveCompany.vat_number}`, effectiveCompany.email, effectiveCompany.phone].filter(Boolean).join(" | ");
  const editorProps = { storageKey: key, consentiListini: true,
    ai: consentiPreventivoConversazionale(effectiveCompany.id) ? { companyId: effectiveCompany.id, draftId: id } : undefined, azienda: effectiveCompany.business_name || effectiveCompany.name,
    dettagliAzienda: dettagli, colore: effectiveCompany.brand_primary_color ?? undefined, fase,
    modello: modello.data?.modello, logoUrl: effectiveCompany.logo_url,
    vediMargini: permessi.canViewCosts && permessi.canViewMargins,
    // La firma online passa per il gestionale: c'è dove il computo si salva lì.
    firmaOnline: computoCloudAttivo(effectiveCompany.id) ? { companyId: effectiveCompany.id, draftId: id, userId: user.id,
      onApriCommessa: (quoteId: string) => { void navigate(`/azienda/ordini/nuovo?quote_id=${quoteId}`); } } : undefined,
    onFaseChange: (n: number) => { const next = new URLSearchParams(params); next.set("fase", String(n + 1)); setParams(next); },
    onBack: () => { void navigate("/azienda/marketing/preventivi"); } };
  return <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:p-6">
    {computoCloudAttivo(effectiveCompany.id)
      ? <ComputoCloudEditor key={key} {...editorProps} companyId={effectiveCompany.id} draftId={id} />
      : <ComputoNativoEditor key={key} {...editorProps} />}
  </div>;
}
