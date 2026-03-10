import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerInstallments() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Piano Rate</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" />
            Le tue rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Qui troverai il piano rate dei tuoi ordini con stato e scadenze.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
