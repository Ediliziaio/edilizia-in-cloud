import { ShieldX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <div className="flex items-center justify-center py-12">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <ShieldX className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Accesso Negato</h2>
          <p className="text-muted-foreground mt-2">
            Non hai i permessi per accedere a questa sezione.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
