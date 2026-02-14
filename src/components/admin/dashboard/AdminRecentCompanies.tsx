import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building } from "lucide-react";
import { sectorLabels } from "@/lib/companyUtils";

interface RecentCompany {
  id: string;
  name: string;
  email: string;
  sector: string;
  logo_url: string | null;
  created_at: string;
}

interface Props {
  companies: RecentCompany[];
}

export function AdminRecentCompanies({ companies }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Aziende Recenti</CardTitle>
          <CardDescription>Ultime aziende registrate</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/aziende">Vedi tutte</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nessuna azienda registrata</p>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((company) => (
              <Link
                key={company.id}
                to={`/admin/aziende/${company.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt={company.name}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{company.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{company.email}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {sectorLabels[company.sector] || company.sector}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
