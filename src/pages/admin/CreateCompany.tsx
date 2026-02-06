import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Building2, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { CompanySector } from "@/types/auth";

const sectors: { value: CompanySector; label: string }[] = [
  { value: "serramenti", label: "Serramenti" },
  { value: "infissi", label: "Infissi" },
  { value: "bagni", label: "Bagni" },
  { value: "tetti", label: "Tetti" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "pittura", label: "Pittura" },
  { value: "ristrutturazioni", label: "Ristrutturazioni" },
  { value: "altro", label: "Altro" },
];

const formSchema = z.object({
  companyName: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  companyEmail: z.string().email("Email non valida"),
  adminEmail: z.string().email("Email non valida"),
  adminPassword: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  adminFirstName: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  adminLastName: z.string().min(2, "Il cognome deve avere almeno 2 caratteri"),
  sector: z.enum([
    "serramenti",
    "infissi",
    "bagni",
    "tetti",
    "fotovoltaico",
    "pittura",
    "ristrutturazioni",
    "altro",
  ]),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateCompany() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSector, setSelectedSector] = useState<CompanySector | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      companyEmail: "",
      adminEmail: "",
      adminPassword: "",
      adminFirstName: "",
      adminLastName: "",
      sector: "altro",
    },
  });

  const statusTemplate = selectedSector ? getOrderStatusTemplate(selectedSector) : [];

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("create-company", {
        body: {
          companyName: data.companyName,
          companyEmail: data.companyEmail,
          adminEmail: data.adminEmail,
          adminPassword: data.adminPassword,
          adminFirstName: data.adminFirstName,
          adminLastName: data.adminLastName,
          sector: data.sector,
        },
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error);

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Dati Azienda
            </CardTitle>
            <CardDescription>
              Inserisci i dati dell'azienda e dell'amministratore
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Informazioni Azienda
                  </h3>
                  
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Azienda</FormLabel>
                        <FormControl>
                          <Input placeholder="Es. Serramenti Rossi Srl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Azienda</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="info@azienda.it" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Settore</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedSector(value as CompanySector);
                          }}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona il settore" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sectors.map((sector) => (
                              <SelectItem key={sector.value} value={sector.value}>
                                {sector.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Il settore determina il template degli stati ordine
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Amministratore Azienda
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="adminFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome</FormLabel>
                          <FormControl>
                            <Input placeholder="Mario" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cognome</FormLabel>
                          <FormControl>
                            <Input placeholder="Rossi" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="adminEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Admin</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="admin@azienda.it" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adminPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Minimo 8 caratteri" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crea Azienda
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anteprima Stati Ordine</CardTitle>
            <CardDescription>
              Stati che verranno creati per questa azienda in base al settore selezionato
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusTemplate.length > 0 ? (
              <div className="space-y-2">
                {statusTemplate.map((status, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
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
