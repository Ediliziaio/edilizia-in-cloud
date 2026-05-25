import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Lock, FileText, Image, Video, Mail, type LucideIcon } from "lucide-react";

type ReferralTierSummary = {
  slug: string | null;
  name?: string | null;
  icon?: string | null;
  position: number | null;
};

type ReferrerMaterialProfile = {
  id: string;
  tier_id: string | null;
  referral_tiers: {
    name: string | null;
    icon: string | null;
    position: number | null;
  } | null;
};

type PartnerMaterialRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  min_tier: string | null;
  thumbnail_url: string | null;
  file_url: string;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
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

  const { data: referrer, isLoading: isReferrerLoading } = useQuery<ReferrerMaterialProfile | null>({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id, tier_id, referral_tiers(name, icon, position)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as ReferrerMaterialProfile | null;
    },
  });

  const { data: materials = [], isLoading } = useQuery<PartnerMaterialRow[]>({
    queryKey: ["partner-materials"],
    enabled: !!referrer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_materials")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as PartnerMaterialRow[];
    },
  });

  const { data: allTiers = [] } = useQuery<ReferralTierSummary[]>({
    queryKey: ["referral-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_tiers").select("*").order("position");
      return (data || []) as ReferralTierSummary[];
    },
  });

  const myTierPosition = referrer?.referral_tiers?.position ?? 1;

  const canAccess = (minTier: string | null) => {
    if (!minTier) return true;
    const tierObj = allTiers.find((t) => t.slug === minTier);
    return tierObj?.position ? myTierPosition >= tierObj.position : true;
  };

  if (isReferrerLoading || isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!referrer) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <h1 className="text-xl font-semibold text-foreground">Kit partner non disponibile</h1>
            <p className="mt-2 text-sm">Il tuo account non è ancora associato a un profilo partner attivo.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tierName = referrer.referral_tiers?.name ?? "Bronze";
  const tierIcon = referrer.referral_tiers?.icon ?? "Bronze";

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
          {materials.map((m) => {
            const accessible = canAccess(m.min_tier);
            const materialType = m.type || "other";
            const Icon = TYPE_ICONS[materialType] || FileText;

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
                    <Badge variant="outline" className="text-xs">{TYPE_LABELS[materialType] || materialType}</Badge>
                    {accessible ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5 mr-1" /> Scarica
                        </a>
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        Richiede {m.min_tier || "tier superiore"}
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
