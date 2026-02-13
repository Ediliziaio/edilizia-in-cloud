import { useState, useEffect } from "react";
import { Loader2, Save, Building2, FileText, Phone, MapPin, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export function CompanyProfileForm() {
  const { effectiveCompany, refreshAuth } = useAuth();
  const { toast } = useToast();
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
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (company) {
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
      setNotes(company.notes || "");

      // Check if addresses are the same
      const legal = [company.legal_address, company.legal_city, company.legal_province, company.legal_postal_code].join("|");
      const operational = [company.operational_address, company.operational_city, company.operational_province, company.operational_postal_code].join("|");
      if (legal === operational && legal !== "|||") {
        setSameAddress(true);
      }
    }
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
    if (!company) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          business_name: businessName.trim() || null,
          vat_number: vatNumber.trim() || null,
          fiscal_code: fiscalCode.trim() || null,
          pec: pec.trim() || null,
          sdi_code: sdiCode.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          legal_address: legalAddress.trim() || null,
          legal_city: legalCity.trim() || null,
          legal_province: legalProvince.trim() || null,
          legal_postal_code: legalPostalCode.trim() || null,
          operational_address: operationalAddress.trim() || null,
          operational_city: operationalCity.trim() || null,
          operational_province: operationalProvince.trim() || null,
          operational_postal_code: operationalPostalCode.trim() || null,
          notes: notes.trim() || null,
        })
        .eq("id", company.id);

      if (error) throw error;

      await refreshAuth();
      toast({ title: "Profilo aggiornato", description: "I dati aziendali sono stati salvati." });
    } catch (error) {
      console.error("Error updating company:", error);
      toast({ title: "Errore", description: "Impossibile aggiornare i dati aziendali.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!company) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Dati Generali */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Dati Generali
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome Azienda</Label>
            <Input value={company.name} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={company.email} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessName">Ragione Sociale</Label>
            <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Rossi S.r.l." maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label>Settore</Label>
            <Input value={sectorLabels[company.sector] || company.sector} disabled className="bg-muted" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Dati Fiscali */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-4 w-4" /> Dati Fiscali
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="vatNumber">P.IVA</Label>
            <Input id="vatNumber" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="01234567890" maxLength={11} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fiscalCode">Codice Fiscale</Label>
            <Input id="fiscalCode" value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value)} placeholder="01234567890" maxLength={16} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pec">PEC</Label>
            <Input id="pec" type="email" value={pec} onChange={(e) => setPec(e.target.value)} placeholder="azienda@pec.it" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sdiCode">Codice SDI</Label>
            <Input id="sdiCode" value={sdiCode} onChange={(e) => setSdiCode(e.target.value)} placeholder="A1B2C3D" maxLength={7} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Contatti */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Phone className="h-4 w-4" /> Contatti
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyPhone">Telefono</Label>
            <Input id="companyPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 02 1234567" maxLength={20} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyWebsite">Sito Web</Label>
            <Input id="companyWebsite" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.azienda.it" maxLength={100} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Sede Legale */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Sede Legale
        </h3>
        <div className="space-y-2">
          <Label htmlFor="legalAddress">Indirizzo</Label>
          <Input id="legalAddress" value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} placeholder="Via Roma 1" maxLength={200} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
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

      <Separator />

      {/* Sede Operativa */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Sede Operativa
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
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
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

      <Separator />

      {/* Note */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <StickyNote className="h-4 w-4" /> Note
        </h3>
        <div className="space-y-2">
          <Label htmlFor="companyNotes">Note Interne</Label>
          <Textarea id="companyNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note interne sull'azienda..." maxLength={500} rows={3} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" />Salva Dati Aziendali</>
          )}
        </Button>
      </div>
    </form>
  );
}
