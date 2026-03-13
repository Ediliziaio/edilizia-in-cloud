import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const VenditoriPerformanceReport = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Construction className="h-5 w-5" />
          Performance Venditori
        </CardTitle>
        <CardDescription>
          Dashboard KPI, trend mensili e funnel per venditore.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-muted-foreground">In costruzione</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Le funzioni backend sono pronte. La UI completa con grafici e tabelle arriverà nel prossimo step (VENDOR-REP-02).
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default VenditoriPerformanceReport;
