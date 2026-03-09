import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Lock, FileText, Image, Video, Mail } from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
  logo: Image,
  banner: Image,
  email_template: Mail,
  social_post: FileText,
  pdf_brochure: FileText,
  video: Video,
};

const TYPE_LABELS: Record<string, string> = {
  logo: "Logo",
  banner: "Banner",
  email_template: "Email Template",
  social_post: "Post Social",
  pdf_brochure: "PDF Brochure",
  video: "Video",
};

export default function PartnerMaterials() {
  const { user } = useAuth();

  const { data: referrer } = useQuery({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id, tier_id, referral_tiers(name, icon, position)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["partner-materials"],
    enabled: !!referrer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_materials")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: allTiers = [] } = useQuery({
    queryKey: ["referral-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_tiers").select("*").order("position");
      return data || [];
    },
  });

  const myTierPosition = (referrer as any)?.referral_tiers?.position ?? 1;

  const canAccess = (minTier: string) => {
    const tierObj = allTiers.find((t: any) => t.slug === minTier);
    return tierObj ? myTierPosition >= tierObj.position : true;
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const tierName = (referrer as any)?.referral_tiers?.name ?? "Bronze";
  const tierIcon = (referrer as any)?.referral_tiers?.icon ?? "🥉";

  // Group by type
  const grouped = materials.reduce((acc: Record<string, any[]>, m: any) => {
    const type = m.type || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Kit Marketing</h1>
        <Badge variant="secondary" className="text-sm">
          {tierIcon} {tierName} — Hai accesso ai materiali del tuo tier e inferiori
        </Badge>
      </div>

      {materials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>Nessun materiale marketing disponibile al momento.</p>
            <p className="text-sm">I materiali verranno aggiunti dall'amministratore.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {materials.map((m: any) => {
            const accessible = canAccess(m.min_tier);
            const Icon = TYPE_ICONS[m.type] || FileText;

            return (
              <Card key={m.id} className={!accessible ? "opacity-60" : ""}>
                {m.thumbnail_url && (
                  <div className="aspect-video bg-muted rounded-t-lg overflow-hidden">
                    <img src={m.thumbnail_url} alt={m.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{m.name}</CardTitle>
                  </div>
                  {m.description && <CardDescription className="text-xs">{m.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{TYPE_LABELS[m.type] || m.type}</Badge>
                    {accessible ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5 mr-1" /> Scarica
                        </a>
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        Richiede {m.min_tier}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
