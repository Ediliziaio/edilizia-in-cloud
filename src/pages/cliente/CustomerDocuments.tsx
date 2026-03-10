import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerDocuments() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Documenti</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            I tuoi documenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Qui troverai preventivi, fatture e contratti relativi ai tuoi ordini.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
