import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useRevenueForecast } from "@/hooks/useRevenueForecast";
import { ForecastChart } from "./ForecastChart";
import type { ForecastResult } from "@/types/dashboard";

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0, useGrouping: "always" });

function ForecastTab({ result }: { result: ForecastResult | undefined }) {
  if (!result) return null;

  const isPositive = result.deltaMrr > 0;
  const isNegative = result.deltaMrr < 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* MRR proiettato */}
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground mb-1">MRR Proiettato</p>
          <p className="text-lg font-bold">
            {currencyFormatter.format(result.projectedMrr)}
          </p>
        </div>
        {/* Delta */}
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground mb-1">Variazione</p>
          <div className="flex items-center justify-center gap-1">
            {isPositive && (
              <TrendingUp className="h-4 w-4 text-[#16A34A]" />
            )}
            {isNegative && (
              <TrendingDown className="h-4 w-4 text-[#DC2626]" />
            )}
            {!isPositive && !isNegative && (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
            <p
              className={`text-lg font-bold ${
                isPositive
                  ? "text-[#16A34A]"
                  : isNegative
                    ? "text-[#DC2626]"
                    : "text-muted-foreground"
              }`}
            >
              {isPositive ? "+" : ""}
              {result.deltaPercent.toFixed(1)}%
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isPositive ? "+" : ""}
            {currencyFormatter.format(result.deltaMrr)}
          </p>
        </div>
        {/* Range confidence */}
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground mb-1">Range Atteso</p>
          <p className="text-xs font-medium">
            {currencyFormatter.format(result.confidenceLow)}
          </p>
          <p className="text-xs text-muted-foreground">—</p>
          <p className="text-xs font-medium">
            {currencyFormatter.format(result.confidenceHigh)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function RevenueForecastWidget() {
  const { forecasts, chartData, hasEnoughData, isLoading, error } =
    useRevenueForecast();
  const [activeTab, setActiveTab] = useState<"30" | "60" | "90">("30");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Previsione Ricavi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Errore nel caricamento dei dati. Riprova più tardi.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const forecastByDays: Record<string, ForecastResult | undefined> = {
    "30": forecasts.find((f) => f.days === 30),
    "60": forecasts.find((f) => f.days === 60),
    "90": forecasts.find((f) => f.days === 90),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Previsione Ricavi</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Basato su regressione lineare del trend MRR
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Basato su 6 mesi di dati
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasEnoughData && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Dati insufficienti per forecast affidabile (minimo 3 mesi)
            </span>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "30" | "60" | "90")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="30" className="flex-1 text-xs">
              30 giorni
            </TabsTrigger>
            <TabsTrigger value="60" className="flex-1 text-xs">
              60 giorni
            </TabsTrigger>
            <TabsTrigger value="90" className="flex-1 text-xs">
              90 giorni
            </TabsTrigger>
          </TabsList>

          {(["30", "60", "90"] as const).map((days) => (
            <TabsContent key={days} value={days} className="mt-4">
              <ForecastTab result={forecastByDays[days]} />
            </TabsContent>
          ))}
        </Tabs>

        {/* Grafico trend */}
        <ForecastChart data={chartData} />

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center">
          Previsione basata su trend lineare. Non costituisce garanzia di
          risultato.
        </p>
      </CardContent>
    </Card>
  );
}
