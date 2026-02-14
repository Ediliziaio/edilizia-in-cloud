import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, MessageSquare, Plus } from "lucide-react";

export function AdminQuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Azioni Rapide</CardTitle>
        <CardDescription>Accedi velocemente alle funzionalità principali</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link to="/admin/aziende">
            <Building className="h-4 w-4 mr-2" />
            Gestisci Aziende
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/admin/ticket">
            <MessageSquare className="h-4 w-4 mr-2" />
            Gestisci Ticket
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/admin/aziende/nuova">
            <Plus className="h-4 w-4 mr-2" />
            Crea Nuova Azienda
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
