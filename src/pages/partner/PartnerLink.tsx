import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, QrCode, Share2, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import { subDays, format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function PartnerLink() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [copiedUtm, setCopiedUtm] = useState(false);
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [showQR, setShowQR] = useState(false);

  const { data: referrer, isLoading } = useQuery({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id, referral_code, total_clicks")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: clicks = [] } = useQuery({
    queryKey: ["my-clicks-7d", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data } = await supabase
        .from("referral_clicks")
        .select("created_at, utm_source")
        .eq("referrer_id", referrer!.id)
        .gte("created_at", sevenDaysAgo);
      return data || [];
    },
  });

  const baseLink = referrer ? `${window.location.origin}/login?ref=${referrer.referral_code}` : "";

  const utmLink = useMemo(() => {
    if (!baseLink) return "";
    const params = new URLSearchParams();
    if (utmSource) params.set("utm_source", utmSource);
    if (utmCampaign) params.set("utm_campaign", utmCampaign);
    const extra = params.toString();
    return extra ? `${baseLink}&${extra}` : baseLink;
  }, [baseLink, utmSource, utmCampaign]);

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, "yyyy-MM-dd");
    return {
      date: format(date, "dd/MM"),
      click: clicks.filter((c: any) => c.created_at?.startsWith(dateStr)).length,
    };
  });

  // Top sources
  const sources = useMemo(() => {
    const map: Record<string, number> = {};
    clicks.forEach((c: any) => {
      const src = c.utm_source || "direct";
      map[src] = (map[src] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [clicks]);

  const copyToClipboard = (text: string, setCopiedFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedFn(true);
    toast.success("Link copiato!");
    setTimeout(() => setCopiedFn(false), 2000);
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Prova il gestionale con il mio link: ${utmLink || baseLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!referrer) return null;

  // Simple QR SVG generation (basic)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(baseLink)}`;

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Il Tuo Link Referral</h1>

      {/* Main link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link Diretto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">{baseLink}</code>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(baseLink, setCopied)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
              <QrCode className="h-4 w-4 mr-1.5" /> QR Code
            </Button>
            <Button variant="outline" size="sm" onClick={shareWhatsApp}>
              <Share2 className="h-4 w-4 mr-1.5" /> WhatsApp
            </Button>
          </div>
          {showQR && (
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* UTM Builder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link con UTM Personalizzati</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Fonte (utm_source)</Label>
              <Input placeholder="es. facebook" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Campagna (utm_campaign)</Label>
              <Input placeholder="es. estate-2026" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} />
            </div>
          </div>
          {utmLink !== baseLink && (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono truncate">{utmLink}</code>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(utmLink, setCopiedUtm)}>
                {copiedUtm ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Click ultimi 7 giorni</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="click" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Click" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Sorgenti</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun click ancora</p>
            ) : (
              <div className="space-y-3">
                {sources.map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{src}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{count} click</span>
                      <span className="text-xs text-muted-foreground">
                        ({clicks.length > 0 ? Math.round((count / clicks.length) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
