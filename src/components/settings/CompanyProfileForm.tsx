import { useId, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, Save, Building2, FileText, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { forwardGeocode } from "@/lib/geocoding";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { campiMarginiModificati } from "@/lib/impostazioni/salvataggioMargini";
import { MessaggioPerUtente, motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { cn } from "@/lib/utils";

const sectorLabels: Record<string, string> = {
  serramenti: "Serramenti",
  infissi: "Infissi",
  bagni: "Bagni",
  tetti: "Tetti",
  fotovoltaico: "Fotovoltaico",
  pittura: "Pittura",
  ristrutturazioni: "Ristrutturazioni",
  altro: "Altro",
};

const TITOLO_BLOCCO = "flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide";
const BLOCCO = "space-y-4 px-4 py-4 max-sm:space-y-3 max-sm:px-3";

/**
 * I dati dell'azienda che compaiono su preventivi, fatture e documenti.
 *
 * `azioniSlot`: dove portare lo stato e «Salva dati aziendali». La pagina li mette nella barra che resta in vista
 * mentre si scorre (come in «Prezzo e margini»); senza (`undefined`, per esempio quando il modulo si usa da solo) stanno in
 * fondo al modulo. `null` = la barra c'è ma non è ancora nella pagina: per un attimo non si disegna niente.
 *
 * 09/10/2026: il campo «Note interne» non c'è più nel modulo: la colonna `companies.notes` è delle note della piattaforma
 * (riquadro «Note interne» della console di EdiliziaInCloud). I dati restano dove sono; il modulo non li legge e non li scrive.
 */
export function CompanyProfileForm({
  canEdit = true,
  azioniSlot,
  evidenziata = null,
}: { canEdit?: boolean; azioniSlot?: HTMLElement | null; evidenziata?: string | null } = {}) {
  const { effectiveCompany, refreshAuth } = useAuth();
  const idModulo = useId();

  const company = effectiveCompany;

  const [isSaving, setIsSaving] = useState(false);
  const [sameAddress, setSameAddress] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [pec, setPec] = useState("");
  const [sdiCode, setSdiCode] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [legalCity, setLegalCity] = useState("");
  const [legalProvince, setLegalProvince] = useState("");
  const [legalPostalCode, setLegalPostalCode] = useState("");
  const [operationalAddress, setOperationalAddress] = useState("");
  const [operationalCity, setOperationalCity] = useState("");
  const [operationalProvince, setOperationalProvince] = useState("");
  const [operationalPostalCode, setOperationalPostalCode] = useState("");
  const [orderCodePrefix, setOrderCodePrefix] = useState("O");
  const [prefixResult, setPrefixResult] = useState<{ companyId?: string; error?: boolean }>({});
  const prefixLoading = prefixResult.companyId !== company?.id;
  const prefixError = !!prefixResult.error;
  const [baseline, setBaseline] = useState<Record<string, string | null> | null>(null);
  const hydratedCompany = useRef<string | undefined>(undefined);
  const values = {
    business_name: businessName.trim() || null, vat_number: vatNumber.trim() || null,
    fiscal_code: fiscalCode.trim() || null, pec: pec.trim() || null, sdi_code: sdiCode.trim() || null,
    phone: phone.trim() || null, website: website.trim() || null,
    legal_address: legalAddress.trim() || null, legal_city: legalCity.trim() || null,
    legal_province: legalProvince.trim() || null, legal_postal_code: legalPostalCode.trim() || null,
    operational_address: operationalAddress.trim() || null, operational_city: operationalCity.trim() || null,
    operational_province: operationalProvince.trim() || null, operational_postal_code: operationalPostalCode.trim() || null,
    order_code_prefix: orderCodePrefix.trim() || "O",
  };
  const isDirty = baseline !== null && Object.keys(campiMarginiModificati(values, baseline)).length > 0;
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);
  useSettingsDraftGuard((canEdit && isDirty) || isSaving);

  // Prefisso codice commessa: letto direttamente dal DB (può non essere nel
  // context auth se la sessione è precedente alla colonna).
  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("order_code_prefix")
        .eq("id", company.id)
        .maybeSingle();
      if (!cancelled) {
        setPrefixResult({ companyId: company.id, error: !!error || !data });
        if (error || !data) return;
        const prefix = ((data as { order_code_prefix?: string } | null)?.order_code_prefix) || "O";
        setBaseline(prev => prev ? { ...prev, order_code_prefix: prefix } : prev);
        setOrderCodePrefix(prefix);
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  useEffect(() => {
    if (company) {
      if (hydratedCompany.current === company.id && dirtyRef.current) return;
      hydratedCompany.current = company.id;
      setBaseline(Object.fromEntries(Object.keys(values).map(key => [key,
        key === "order_code_prefix" ? orderCodePrefix.trim() || "O" : ((company as unknown as Record<string, string | null>)[key] ?? "").trim() || null,
      ])));
      setBusinessName(company.business_name || "");
      setVatNumber(company.vat_number || "");
      setFiscalCode(company.fiscal_code || "");
      setPec(company.pec || "");
      setSdiCode(company.sdi_code || "");
      setPhone(company.phone || "");
      setWebsite(company.website || "");
      setLegalAddress(company.legal_address || "");
      setLegalCity(company.legal_city || "");
      setLegalProvince(company.legal_province || "");
      setLegalPostalCode(company.legal_postal_code || "");
      setOperationalAddress(company.operational_address || "");
      setOperationalCity(company.operational_city || "");
      setOperationalProvince(company.operational_province || "");
      setOperationalPostalCode(company.operational_postal_code || "");

      // Check if addresses are the same
      const legal = [company.legal_address, company.legal_city, company.legal_province, company.legal_postal_code].join("|");
      const operational = [company.operational_address, company.operational_city, company.operational_province, company.operational_postal_code].join("|");
      setSameAddress(legal === operational && legal !== "|||");
    }
    // La reidratazione segue i dati remoti, non ogni singolo edit del form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  useEffect(() => {
    if (sameAddress) {
      setOperationalAddress(legalAddress);
      setOperationalCity(legalCity);
      setOperationalProvince(legalProvince);
      setOperationalPostalCode(legalPostalCode);
    }
  }, [sameAddress, legalAddress, legalCity, legalProvince, legalPostalCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !canEdit || isSaving || !isDirty || prefixLoading) return;

    setIsSaving(true);
    try {
      // Geocodifica la sede operativa: alimenta operational_lat/lng usate dai
      // travel legs dei calendari e dal badge distanza in scheda cliente.
      // Best-effort: se il geocoding fallisce si salva comunque senza coordinate.
      const changes = campiMarginiModificati(values, baseline ?? {});
      if (prefixError) delete changes.order_code_prefix;
      const addressChanged = Object.keys(changes).some(key => key.startsWith("operational_"));
      let operationalCoords: { lat: number; lng: number } | null = null;
      const opAddressFull = [
        operationalAddress.trim(),
        operationalPostalCode.trim(),
        operationalCity.trim(),
        operationalProvince.trim(),
      ].filter(Boolean).join(", ");
      if (addressChanged && opAddressFull) {
        try {
          operationalCoords = await forwardGeocode(opAddressFull);
        } catch { /* best-effort */ }
      }

      const { error } = await supabase
        .from("companies")
        .update({
          ...changes,
          ...(addressChanged ? { operational_lat: operationalCoords?.lat ?? null, operational_lng: operationalCoords?.lng ?? null } : {}),
        } as never)
        .eq("id", company.id)
        .select("id")
        .single();

      // Nessuna riga toccata (PGRST116): la regola di accesso non lascia modificare l'azienda a chi ha solo il permesso
      // «Profilo aziendale» senza quello generale delle impostazioni. Prima il messaggio era «impossibile aggiornare».
      if (error) {
        throw error.code === "PGRST116"
          ? new MessaggioPerUtente("Il tuo utente non può modificare i dati dell'azienda: chiedi a un amministratore.")
          : error;
      }

      setBaseline({ ...values });
      dirtyRef.current = false;
      await refreshAuth();
      toast.success("Dati aziendali salvati");
    } catch (error) {
      logger.error("Error updating company:", error);
      // Una partita IVA o un codice fiscale sbagliato li rifiuta il database, e dice già in italiano cosa non va.
      toast.error("Dati non salvati", { description: motivoDelRifiuto(error, "Impossibile aggiornare i dati aziendali.") });
    } finally {
      setIsSaving(false);
    }
  };

  if (!company) return null;

  const azioni = (
    <>
      <p
        role="status"
        className={cn("text-xs", isSaving || isDirty ? "text-muted-foreground" : "text-muted-foreground max-sm:sr-only", isDirty && !isSaving && "font-medium text-amber-700 dark:text-amber-400")}
      >
        {isSaving ? "Salvataggio…" : isDirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
      </p>
      <Button size="sm" type="submit" form={idModulo} disabled={isSaving || !isDirty || prefixLoading || !canEdit}>
        {isSaving ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio...</>
        ) : (
          <><Save className="mr-2 h-4 w-4" />Salva dati aziendali</>
        )}
      </Button>
    </>
  );

  return (
    <form id={idModulo} onSubmit={handleSubmit} className="divide-y">
      {/* canEdit=false → fieldset disabilita nativamente tutti i campi e il submit (permesso "Modifica" non attivo) */}
      <fieldset disabled={!canEdit || isSaving || prefixLoading} className="m-0 min-w-0 divide-y border-0 p-0">
      {/* Chi è l'account: nome, email e settore non si cambiano da qui. Su telefono non serve. */}
      <p className="px-4 py-3 text-xs text-muted-foreground max-sm:hidden">
        Account: <strong className="font-medium text-foreground">{company.name}</strong> · {company.email} · {sectorLabels[company.sector] || company.sector}.
        Per cambiarli scrivi all'assistenza.
      </p>

      {/* Dati generali */}
      <div className={BLOCCO}>
        <h3 className={TITOLO_BLOCCO}>
          <Building2 className="h-4 w-4" /> Dati generali
        </h3>
        {/* Mobile: campi brevi affiancati. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-3">
          <div className="space-y-2 max-sm:col-span-2">
            <Label htmlFor="businessName">Ragione sociale</Label>
            <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Rossi S.r.l." maxLength={100} />
          </div>
          {/* Il numero delle commesse (O-0001, O-0002…): l'àncora #prefisso-commessa porta qui dalla ricerca. */}
          <div
            id="prefisso-commessa"
            className={cn("scroll-mt-28 space-y-2 rounded-md transition-shadow duration-500", evidenziata === "prefisso-commessa" && "ring-2 ring-primary/50 ring-offset-4 ring-offset-card")}
          >
            <Label htmlFor="orderCodePrefix"><span className="max-sm:hidden">Prefisso del codice commessa</span><span className="sm:hidden">Prefisso commesse</span></Label>
            <Input id="orderCodePrefix" value={orderCodePrefix} onChange={(e) => setOrderCodePrefix(e.target.value)} placeholder="O" maxLength={16} disabled={prefixError} aria-describedby="orderCodePrefix-aiuto" />
            <p id="orderCodePrefix-aiuto" className="text-[11px] text-muted-foreground max-sm:hidden">
              Il numero delle commesse parte da qui: <strong>{(orderCodePrefix.trim() || "O")}-0001</strong>, {(orderCodePrefix.trim() || "O")}-0002…
            </p>
          </div>
        </div>
      </div>

      {/* Dati fiscali */}
      <div className={BLOCCO}>
        <h3 className={TITOLO_BLOCCO}>
          <FileText className="h-4 w-4" /> Dati fiscali
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-3">
          <div className="space-y-2">
            <Label htmlFor="vatNumber">P.IVA</Label>
            <Input id="vatNumber" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="01234567890" maxLength={11} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fiscalCode">Codice fiscale</Label>
            <Input id="fiscalCode" value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value)} placeholder="01234567890" maxLength={16} />
          </div>
          <div className="space-y-2 max-sm:col-span-2">
            <Label htmlFor="pec">PEC</Label>
            <Input id="pec" type="email" value={pec} onChange={(e) => setPec(e.target.value)} placeholder="azienda@pec.it" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sdiCode">Codice SDI</Label>
            <Input id="sdiCode" value={sdiCode} onChange={(e) => setSdiCode(e.target.value)} placeholder="A1B2C3D" maxLength={7} />
          </div>
        </div>
      </div>

      {/* Contatti */}
      <div className={BLOCCO}>
        <h3 className={TITOLO_BLOCCO}>
          <Phone className="h-4 w-4" /> Contatti
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-3">
          <div className="space-y-2">
            <Label htmlFor="companyPhone">Telefono</Label>
            <Input id="companyPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 02 1234567" maxLength={20} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyWebsite">Sito web</Label>
            <Input id="companyWebsite" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.azienda.it" maxLength={100} />
          </div>
        </div>
      </div>

      {/* Sede legale */}
      <div className={BLOCCO}>
        <h3 className={TITOLO_BLOCCO}>
          <MapPin className="h-4 w-4" /> Sede legale
        </h3>
        <div className="space-y-2">
          <Label htmlFor="legalAddress">Indirizzo</Label>
          <Input id="legalAddress" value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} placeholder="Via Roma 1" maxLength={200} />
        </div>
        {/* Telefono: la città a tutta riga, provincia e CAP affiancati (tre colonne da 95 px non bastavano). */}
        <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-2 max-sm:gap-3">
          <div className="space-y-2 max-sm:col-span-2">
            <Label htmlFor="legalCity">Città</Label>
            <Input id="legalCity" value={legalCity} onChange={(e) => setLegalCity(e.target.value)} placeholder="Milano" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legalProvince">Provincia</Label>
            <Input id="legalProvince" value={legalProvince} onChange={(e) => setLegalProvince(e.target.value)} placeholder="MI" maxLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legalPostalCode">CAP</Label>
            <Input id="legalPostalCode" value={legalPostalCode} onChange={(e) => setLegalPostalCode(e.target.value)} placeholder="20100" maxLength={5} />
          </div>
        </div>
      </div>

      {/* Sede operativa */}
      <div className={BLOCCO}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 className={TITOLO_BLOCCO}>
            <MapPin className="h-4 w-4" /> Sede operativa
          </h3>
          <div className="flex items-center gap-2">
            <Checkbox id="sameAddress" checked={sameAddress} onCheckedChange={(v) => setSameAddress(!!v)} />
            <Label htmlFor="sameAddress" className="text-sm font-normal cursor-pointer">Uguale alla sede legale</Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="operationalAddress">Indirizzo</Label>
          <Input id="operationalAddress" value={operationalAddress} onChange={(e) => setOperationalAddress(e.target.value)} placeholder="Via Roma 1" maxLength={200} disabled={sameAddress} className={sameAddress ? "bg-muted" : ""} />
        </div>
        <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-2 max-sm:gap-3">
          <div className="space-y-2 max-sm:col-span-2">
            <Label htmlFor="operationalCity">Città</Label>
            <Input id="operationalCity" value={operationalCity} onChange={(e) => setOperationalCity(e.target.value)} placeholder="Milano" maxLength={100} disabled={sameAddress} className={sameAddress ? "bg-muted" : ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operationalProvince">Provincia</Label>
            <Input id="operationalProvince" value={operationalProvince} onChange={(e) => setOperationalProvince(e.target.value)} placeholder="MI" maxLength={2} disabled={sameAddress} className={sameAddress ? "bg-muted" : ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operationalPostalCode">CAP</Label>
            <Input id="operationalPostalCode" value={operationalPostalCode} onChange={(e) => setOperationalPostalCode(e.target.value)} placeholder="20100" maxLength={5} disabled={sameAddress} className={sameAddress ? "bg-muted" : ""} />
          </div>
        </div>
      </div>
      </fieldset>

      {prefixError && <p className="px-4 py-2 text-xs text-amber-700">Prefisso commessa non caricato: il valore esistente non verrà modificato.</p>}

      {/* Stato e «Salva»: nella barra della pagina se c'è, altrimenti in fondo al modulo. */}
      {azioniSlot === undefined ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">{azioni}</div>
      ) : azioniSlot ? createPortal(azioni, azioniSlot) : null}
    </form>
  );
}
