import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Building2, ReceiptText, MapPin, StickyNote, Loader2, Save } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { Company, CompanyStatus } from "@/types/auth";
import { sectorLabels, sectors, statusConfig } from "@/lib/companyUtils";
import type { UseFormReturn } from "react-hook-form";

interface CompanyDetailsTabProps {
  company: Company;
  form: UseFormReturn<any>;
  onSubmit: (data: any) => void;
  isSaving: boolean;
  sameAsLegal: boolean;
  onSameAsLegalChange: (v: boolean) => void;
  currentPlanName: string | null;
  stats: { ordersCount: number; customersCount: number } | null;
  totalTeam: number;
}

export function CompanyDetailsTab({
  company,
  form,
  onSubmit,
  isSaving,
  sameAsLegal,
  onSameAsLegalChange,
  currentPlanName,
  stats,
  totalTeam,
}: CompanyDetailsTabProps) {
  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Form - 2/3 */}
      <div className="lg:col-span-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Identificazione */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Identificazione
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="business_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ragione Sociale</FormLabel>
                      <FormControl><Input placeholder="Ragione sociale..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Commerciale *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl><Input placeholder="+39..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="sector" render={({ field }) => (
                  <FormItem className="sm:w-1/2">
                    <FormLabel>Settore</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sectors.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {company.logo_url && (
                  <div>
                    <p className="text-sm font-medium mb-2">Logo attuale</p>
                    <img src={company.logo_url} alt="Logo" className="h-16 w-16 rounded-lg object-cover border" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dati Fiscali */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  Dati Fiscali
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="vat_number" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partita IVA</FormLabel>
                      <FormControl><Input placeholder="IT12345678901" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fiscal_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice Fiscale</FormLabel>
                      <FormControl><Input placeholder="Codice fiscale..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="pec" render={({ field }) => (
                    <FormItem>
                      <FormLabel>PEC</FormLabel>
                      <FormControl><Input placeholder="azienda@pec.it" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sdi_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice SDI</FormLabel>
                      <FormControl><Input placeholder="ABCDEFG" maxLength={7} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="website" render={({ field }) => (
                  <FormItem className="sm:w-1/2">
                    <FormLabel>Sito Web</FormLabel>
                    <FormControl><Input placeholder="https://www.esempio.it" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Sede Legale */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Sede Legale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="legal_address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Indirizzo</FormLabel>
                    <FormControl><Input placeholder="Via Roma, 1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="legal_city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Città</FormLabel>
                      <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="legal_province" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provincia</FormLabel>
                      <FormControl><Input placeholder="MI" maxLength={2} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="legal_postal_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>CAP</FormLabel>
                      <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            {/* Sede Operativa */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Sede Operativa
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Checkbox id="same-as-legal" checked={sameAsLegal} onCheckedChange={(v) => onSameAsLegalChange(!!v)} />
                    <label htmlFor="same-as-legal" className="text-sm text-muted-foreground cursor-pointer">
                      Uguale alla sede legale
                    </label>
                  </div>
                </div>
              </CardHeader>
              {!sameAsLegal && (
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="operational_address" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indirizzo</FormLabel>
                      <FormControl><Input placeholder="Via Roma, 1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField control={form.control} name="operational_city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Città</FormLabel>
                        <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="operational_province" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provincia</FormLabel>
                        <FormControl><Input placeholder="MI" maxLength={2} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="operational_postal_code" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CAP</FormLabel>
                        <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Note */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" />
                  Note Interne
                </CardTitle>
                <CardDescription>Visibili solo al Super Admin</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea placeholder="Annotazioni interne sull'azienda..." rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Save button */}
            <div className="sticky bottom-4 z-10">
              <Button type="submit" disabled={isSaving} className="w-full sm:w-auto shadow-lg">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salva Modifiche
              </Button>
            </div>
          </form>
        </Form>
      </div>

      {/* Sidebar Panoramica */}
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="h-20 w-20 rounded-2xl object-cover shadow-sm" />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-10 w-10 text-primary" />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-lg">{company.name}</h3>
                {company.business_name && <p className="text-sm text-muted-foreground">{company.business_name}</p>}
                <p className="text-sm text-muted-foreground">{company.email}</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                <Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Piano</span>
                <span className="font-medium">{currentPlanName || "Nessuno"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creata</span>
                <span className="font-medium">{format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aggiornata</span>
                <span className="font-medium">{formatDistanceToNow(new Date(company.updated_at), { addSuffix: true, locale: it })}</span>
              </div>
              {companyStatus === "trial" && company.trial_ends_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scadenza trial</span>
                  <span className="font-medium">{format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it })}</span>
                </div>
              )}
              {company.vat_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">P.IVA</span>
                  <span className="font-medium font-mono text-xs">{company.vat_number}</span>
                </div>
              )}
            </div>

            <Separator className="my-5" />

            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{stats?.ordersCount || 0}</p>
                <p className="text-xs text-muted-foreground">Ordini</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.customersCount || 0}</p>
                <p className="text-xs text-muted-foreground">Clienti</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totalTeam}</p>
                <p className="text-xs text-muted-foreground">Team</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
