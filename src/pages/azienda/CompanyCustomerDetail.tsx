import { useState, useEffect } from "react";
import { logger } from "@/utils/logger";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, User, Save, Loader2, Mail, ClipboardList, Trash2, ExternalLink, Phone, Calendar, CreditCard, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getInitials, getAvatarColor } from "@/lib/contactUtils";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";

interface CustomerProfile {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  fiscal_code: string | null;
  site_address: string | null;
  notes: string | null;
  company_id: string | null;
  created_at: string;
  salesperson_id: string | null;
}

export default function CompanyCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [address, setAddress] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["company-customer-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, address, fiscal_code, site_address, notes, company_id, created_at, salesperson_id")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as CustomerProfile;
    },
    enabled: !!id,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders-history", id, effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, total_amount, created_at, current_status_id, order_statuses:current_status_id(name, color)")
        .eq("customer_id", id!)
        .eq("company_id", effectiveCompany!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  const orderCount = orders.length;

  useEffect(() => {
    if (customer) {
      setFirstName(customer.first_name || "");
      setLastName(customer.last_name || "");
      setPhone(customer.phone || "");
      setFiscalCode(customer.fiscal_code || "");
      setAddress(customer.address || "");
      setSiteAddress(customer.site_address || "");
      setNotes(customer.notes || "");
      setSalespersonId(customer.salesperson_id || "");
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Errore", description: "Nome e cognome sono obbligatori", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          fiscal_code: fiscalCode.trim() || null,
          address: address.trim() || null,
          site_address: siteAddress.trim() || null,
          notes: notes.trim() || null,
          salesperson_id: salespersonId || null,
        })
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["company-customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });

      toast({ title: "Cliente aggiornato", description: "I dati del cliente sono stati salvati con successo" });
    } catch (error) {
      logger.error("Error updating customer:", error);
      toast({ title: "Errore", description: "Impossibile aggiornare i dati del cliente.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (orderCount > 0) {
      toast({
        title: "Impossibile eliminare",
        description: `Il cliente ha ${orderCount} ${orderCount === 1 ? "ordine associato" : "ordini associati"}. Elimina prima gli ordini.`,
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast({ title: "Cliente eliminato", description: "Il cliente è stato eliminato con successo." });
      navigate("/azienda/clienti");
    } catch (error) {
     logger.error("Error deleting customer:", error);
      toast({ title: "Errore", description: "Impossibile eliminare il cliente.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-muted-foreground">Cliente non trovato.</p>
      </div>
    );
  }

  const initials = getInitials(customer.first_name || "", customer.last_name);
  const avatarColor = getAvatarColor(`${customer.first_name}${customer.last_name}`);
  const displayedOrders = orders.slice(0, 5);
  const hasMoreOrders = orders.length > 5;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/clienti")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.first_name} {customer.last_name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <div className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {customer.email}
            </div>
            <Badge variant="secondary" className="gap-1">
              <ClipboardList className="h-3 w-3" />
              {orderCount} {orderCount === 1 ? "ordine" : "ordini"}
            </Badge>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isDeleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare questo cliente?</AlertDialogTitle>
              <AlertDialogDescription>
                {orderCount > 0
                  ? `Impossibile eliminare: il cliente ha ${orderCount} ${orderCount === 1 ? "ordine associato" : "ordini associati"}. Elimina prima gli ordini.`
                  : "Questa azione è irreversibile. Il cliente e il suo account verranno eliminati permanentemente."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              {orderCount === 0 && (
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Elimina
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Edit Form (2/3) */}
        <form onSubmit={handleSubmit} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5" />
                Modifica Dati Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={customer.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">L'email non può essere modificata</p>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dati Anagrafici</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nome <span className="text-destructive">*</span></Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" maxLength={50} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Cognome <span className="text-destructive">*</span></Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" maxLength={50} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscalCode">CF / P.IVA</Label>
                  <Input id="fiscalCode" value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value)} placeholder="RSSMRA80A01H501U o 01234567890" maxLength={16} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefono</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" maxLength={20} />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Indirizzi</h3>
                <div className="space-y-2">
                  <Label htmlFor="address">Indirizzo Residenza / Sede Legale</Label>
                  <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via Roma 1, 00100 Roma" maxLength={200} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteAddress">Indirizzo Cantiere</Label>
                  <Textarea id="siteAddress" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Via del Cantiere 5, 00100 Roma" maxLength={200} rows={2} />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Note</h3>
                <div className="space-y-2">
                  <Label htmlFor="notes">Note Aggiuntive</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note interne sul cliente..." maxLength={500} rows={3} />
                </div>
              </div>

              <Separator />

              <SalespersonSelect
                value={salespersonId}
                onChange={(val, _sp) => setSalespersonId(val)}
                disabled={isSaving}
              />

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate("/azienda/clienti")}>
                  Annulla
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio...</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" />Salva Modifiche</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Right column — Sidebar (1/3) */}
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center gap-3 mb-5">
                <Avatar className={`h-16 w-16 ${avatarColor}`}>
                  <AvatarFallback className="text-xl font-bold text-white bg-transparent">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">{customer.first_name} {customer.last_name}</p>
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                </div>
              </div>

              <Separator className="mb-4" />

              <div className="space-y-3 text-sm">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.fiscal_code && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="h-4 w-4 shrink-0" />
                    <span className="font-mono text-xs">{customer.fiscal_code}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Cliente dal {format(new Date(customer.created_at), "dd MMM yyyy", { locale: it })}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Ordini ({orderCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun ordine associato.</p>
              ) : (
                <div className="space-y-2">
                  {displayedOrders.map((order) => {
                    const status = order.order_statuses as { name: string; color: string } | null;
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{order.order_code || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(order.created_at), "dd MMM yyyy", { locale: it })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {status && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                              {status.name}
                            </Badge>
                          )}
                          <span className="text-sm font-medium whitespace-nowrap">
                            € {Number(order.total_amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                  {hasMoreOrders && (
                    <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => {/* scroll or expand */}}>
                      Vedi tutti gli ordini ({orderCount})
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
