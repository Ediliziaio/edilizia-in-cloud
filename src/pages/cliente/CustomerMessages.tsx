import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerMessages() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Messaggi</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            Chat con l'azienda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Qui potrai comunicare direttamente con l'azienda in tempo reale.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
