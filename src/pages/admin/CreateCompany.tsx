import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Building2, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getOrderStatusTemplate } from "@/lib/orderStatusTemplates";
import { sectors } from "@/lib/companyUtils";
import type { CompanySector } from "@/types/auth";

const formSchema = z.object({
  companyName: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  companyEmail: z.string().email("Email non valida"),
  adminEmail: z.string().email("Email non valida"),
  adminPassword: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  adminFirstName: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  adminLastName: z.string().min(2, "Il cognome deve avere almeno 2 caratteri"),
  sector: z.enum(["serramenti", "infissi", "bagni", "tetti", "fotovoltaico", "pittura", "ristrutturazioni", "altro"]),
  // Dati fiscali (opzionali)
  businessName: z.string().optional().or(z.literal("")),
  vatNumber: z.string().optional().or(z.literal("")),
  fiscalCode: z.string().optional().or(z.literal("")),
  pec: z.string().optional().or(z.literal("")),
  sdiCode: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),
  // Sede legale
  legalAddress: z.string().optional().or(z.literal("")),
  legalCity: z.string().optional().or(z.literal("")),
  legalProvince: z.string().optional().or(z.literal("")),
  legalPostalCode: z.string().optional().or(z.literal("")),
  // Sede operativa
  operationalAddress: z.string().optional().or(z.literal("")),
  operationalCity: z.string().optional().or(z.literal("")),
  operationalProvince: z.string().optional().or(z.literal("")),
  operationalPostalCode: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateCompany() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSector, setSelectedSector] = useState<CompanySector | null>(null);
  const [sameAsLegal, setSameAsLegal] = useState(false);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>("");

  const { data: referrers = [] } = useQuery({
    queryKey: ["referrers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("id, name, referral_code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "", companyEmail: "", adminEmail: "", adminPassword: "",
      adminFirstName: "", adminLastName: "", sector: "altro",
      businessName: "", vatNumber: "", fiscalCode: "", pec: "", sdiCode: "",
      phone: "", website: "",
      legalAddress: "", legalCity: "", legalProvince: "", legalPostalCode: "",
      operationalAddress: "", operationalCity: "", operationalProvince: "", operationalPostalCode: "",
    },
  });

  const statusTemplate = selectedSector ? getOrderStatusTemplate(selectedSector) : [];

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    try {
      const body: Record<string, any> = {
        companyName: data.companyName,
        companyEmail: data.companyEmail,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
        adminFirstName: data.adminFirstName,
        adminLastName: data.adminLastName,
        sector: data.sector,
        businessName: data.businessName || null,
        vatNumber: data.vatNumber || null,
        fiscalCode: data.fiscalCode || null,
        pec: data.pec || null,
        sdiCode: data.sdiCode || null,
        phone: data.phone || null,
        website: data.website || null,
        legalAddress: data.legalAddress || null,
        legalCity: data.legalCity || null,
        legalProvince: data.legalProvince || null,
        legalPostalCode: data.legalPostalCode || null,
      };

      if (sameAsLegal) {
        body.operationalAddress = data.legalAddress || null;
        body.operationalCity = data.legalCity || null;
        body.operationalProvince = data.legalProvince || null;
        body.operationalPostalCode = data.legalPostalCode || null;
      } else {
        body.operationalAddress = data.operationalAddress || null;
        body.operationalCity = data.operationalCity || null;
        body.operationalProvince = data.operationalProvince || null;
        body.operationalPostalCode = data.operationalPostalCode || null;
      }

      const { data: result, error } = await supabase.functions.invoke("create-company", { body });

      if (error) throw error;
      if (!result.success) throw new Error(result.error);

      // If a referrer was selected, create referral_companies record
      const companyId = result.company?.id;
      if (selectedReferrerId && selectedReferrerId !== "none" && companyId) {
        await supabase.from("referral_companies").insert({
          referrer_id: selectedReferrerId,
          company_id: companyId,
        });
        await supabase.from("companies").update({ referred_by: selectedReferrerId }).eq("id", companyId);
      }

      toast({
        title: "Azienda creata con successo!",
        description: `${data.companyName} è stata creata con ${statusTemplate.length} stati ordine.`,
      });

      navigate("/admin/aziende");
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Impossibile creare l'azienda",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/aziende")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuova Azienda</h1>
          <p className="text-muted-foreground">Crea una nuova azienda con il suo admin</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dati Azienda
              </CardTitle>
              <CardDescription>Inserisci i dati dell'azienda e dell'amministratore</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Informazioni base */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Informazioni Azienda
                    </h3>

                    <FormField control={form.control} name="companyName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Azienda</FormLabel>
                        <FormControl><Input placeholder="Es. Serramenti Rossi Srl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="companyEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Azienda</FormLabel>
                        <FormControl><Input type="email" placeholder="info@azienda.it" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="sector" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Settore</FormLabel>
                        <Select onValueChange={(value) => { field.onChange(value); setSelectedSector(value as CompanySector); }} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Seleziona il settore" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sectors.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Il settore determina il template degli stati ordine</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Dati fiscali */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Dati Fiscali (opzionali)
                    </h3>

                    <FormField control={form.control} name="businessName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ragione Sociale</FormLabel>
                        <FormControl><Input placeholder="Ragione sociale completa" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="vatNumber" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Partita IVA</FormLabel>
                          <FormControl><Input placeholder="IT01234567890" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="fiscalCode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Codice Fiscale</FormLabel>
                          <FormControl><Input placeholder="Codice fiscale" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="pec" render={({ field }) => (
                        <FormItem>
                          <FormLabel>PEC</FormLabel>
                          <FormControl><Input type="email" placeholder="azienda@pec.it" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="sdiCode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Codice SDI</FormLabel>
                          <FormControl><Input placeholder="ABCDEFG" maxLength={7} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefono</FormLabel>
                          <FormControl><Input placeholder="+39 0123 456789" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="website" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sito Web</FormLabel>
                          <FormControl><Input placeholder="https://www.azienda.it" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Sede legale */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Sede Legale (opzionale)
                    </h3>
                    <FormField control={form.control} name="legalAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Indirizzo</FormLabel>
                        <FormControl><Input placeholder="Via Roma 1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <FormField control={form.control} name="legalCity" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Città</FormLabel>
                          <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="legalProvince" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provincia</FormLabel>
                          <FormControl><Input placeholder="MI" maxLength={2} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="legalPostalCode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>CAP</FormLabel>
                          <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Sede operativa */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                        Sede Operativa (opzionale)
                      </h3>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="sameAsLegal"
                          checked={sameAsLegal}
                          onCheckedChange={(checked) => setSameAsLegal(checked === true)}
                        />
                        <label htmlFor="sameAsLegal" className="text-sm text-muted-foreground cursor-pointer">
                          Uguale alla sede legale
                        </label>
                      </div>
                    </div>
                    {!sameAsLegal && (
                      <>
                        <FormField control={form.control} name="operationalAddress" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Indirizzo</FormLabel>
                            <FormControl><Input placeholder="Via Roma 1" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="grid gap-4 sm:grid-cols-3">
                          <FormField control={form.control} name="operationalCity" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Città</FormLabel>
                              <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="operationalProvince" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Provincia</FormLabel>
                              <FormControl><Input placeholder="MI" maxLength={2} {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="operationalPostalCode" render={({ field }) => (
                            <FormItem>
                              <FormLabel>CAP</FormLabel>
                              <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Admin */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Amministratore Azienda
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="adminFirstName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome</FormLabel>
                          <FormControl><Input placeholder="Mario" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="adminLastName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cognome</FormLabel>
                          <FormControl><Input placeholder="Rossi" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="adminEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Admin</FormLabel>
                        <FormControl><Input type="email" placeholder="admin@azienda.it" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="adminPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input type="password" placeholder="Minimo 8 caratteri" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Referrer (opzionale) */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Referral (opzionale)
                    </h3>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Referrer</label>
                      <Select onValueChange={setSelectedReferrerId} value={selectedReferrerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Nessun referrer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuno</SelectItem>
                          {referrers.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} ({r.referral_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Se l'azienda è stata portata da un referrer</p>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crea Azienda
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Anteprima Stati Ordine</CardTitle>
            <CardDescription>Stati che verranno creati in base al settore selezionato</CardDescription>
          </CardHeader>
          <CardContent>
            {statusTemplate.length > 0 ? (
              <div className="space-y-2">
                {statusTemplate.map((status, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: status.color }}
                    >
                      {index + 1}
                    </div>
                    <span className="font-medium">{status.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Seleziona un settore per vedere gli stati ordine predefiniti
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
