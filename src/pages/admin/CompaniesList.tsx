import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, Search, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Company } from "@/types/auth";

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

export default function CompaniesList() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { impersonateCompany } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchCompanies() {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setCompanies(data as Company[]);
      }
      setIsLoading(false);
    }

    fetchCompanies();
  }, []);

  const filteredCompanies = companies.filter(
    (company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImpersonate = async (companyId: string) => {
    await impersonateCompany(companyId);
    navigate("/azienda");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Aziende</h1>
          <p className="text-muted-foreground">Gestisci le aziende registrate</p>
        </div>
        <Button asChild>
          <Link to="/admin/aziende/nuova">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Azienda
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca per nome o email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-1/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessuna azienda trovata</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery
                ? "Prova a modificare i termini di ricerca"
                : "Inizia creando la prima azienda"}
            </p>
            {!searchQuery && (
              <Button asChild className="mt-4">
                <Link to="/admin/aziende/nuova">
                  <Plus className="mr-2 h-4 w-4" />
                  Crea Azienda
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <Card key={company.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-base">{company.name}</CardTitle>
                      <CardDescription className="text-sm">{company.email}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleImpersonate(company.id)}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Accedi come Admin
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
