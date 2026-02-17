import { ShieldX, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <ShieldX className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Accesso Negato</h2>
          <p className="text-muted-foreground mt-2">
            Non hai i permessi per accedere a questa sezione.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna alla Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
