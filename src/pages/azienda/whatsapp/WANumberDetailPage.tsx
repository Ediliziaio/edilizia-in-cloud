// MP-FINAL — Pagina dettaglio singolo numero WhatsApp (edit settings).

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  PURPOSE_LABELS,
  useUpdateWANumberSettings,
  useWhatsAppNumber,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";

export default function WANumberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: number, isLoading } = useWhatsAppNumber(id);
  const update = useUpdateWANumberSettings();

  const [displayName, setDisplayName] = useState("");
  const [msgBenvenuto, setMsgBenvenuto] = useState("");
  const [msgFuoriOrario, setMsgFuoriOrario] = useState("");
  const [budget, setBudget] = useState<string>("10");

  useEffect(() => {
    if (number) {
      setDisplayName(number.display_name ?? "");
      setMsgBenvenuto(number.messaggio_benvenuto ?? "");
      setMsgFuoriOrario(number.messaggio_fuori_orario ?? "");
      setBudget(String(number.daily_budget_eur ?? 10));
    }
  }, [number]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!number) {
    return <div className="p-6 text-sm text-muted-foreground">Numero non trovato.</div>;
  }

  const save = () => {
    update.mutate({
      id: number.id,
      display_name: displayName || null,
      messaggio_benvenuto: msgBenvenuto || null,
      messaggio_fuori_orario: msgFuoriOrario || null,
      daily_budget_eur: Number(budget) || 10,
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/whatsapp?tab=numeri")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna ai numeri
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{number.display_name ?? number.numero}</h1>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
          <Badge variant="outline">{PURPOSE_LABELS[number.purpose as WAPurpose]}</Badge>
          <span className="font-mono">{number.numero}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Impostazioni generali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="display-name">Nome visualizzato</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Bot Cantieri Rossi Srl"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="budget">Budget giornaliero AI (€)</Label>
            <Input
              id="budget"
              type="number"
              step="0.5"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Speso oggi: € {Number(number.current_day_spend_eur ?? 0).toFixed(4)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messaggi automatici</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="msg-welcome">Messaggio di benvenuto</Label>
            <Textarea
              id="msg-welcome"
              value={msgBenvenuto}
              onChange={(e) => setMsgBenvenuto(e.target.value)}
              rows={3}
              placeholder="Benvenuto! Come posso aiutarti?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-offhours">Messaggio fuori orario</Label>
            <Textarea
              id="msg-offhours"
              value={msgFuoriOrario}
              onChange={(e) => setMsgFuoriOrario(e.target.value)}
              rows={3}
              placeholder="Siamo chiusi, ti risponderemo in orario lavorativo."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salva impostazioni
        </Button>
      </div>
    </div>
  );
}
