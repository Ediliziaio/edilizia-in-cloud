import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon } from "lucide-react";

function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `ai-img-${Math.abs(hash).toString(36)}`;
}

interface AIImageProps {
  prompt: string;
  alt: string;
  className?: string;
}

export default function AIImage({ prompt, alt, className = "" }: AIImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const cacheKey = hashPrompt(prompt);
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      setImageUrl(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const generate = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("generate-landing-image", {
          body: { prompt },
        });

        if (cancelled) return;

        if (fnError || !data?.imageUrl) {
          logger.error("AI image error:", fnError);
          setError(true);
          setLoading(false);
          return;
        }

        localStorage.setItem(cacheKey, data.imageUrl);
        setImageUrl(data.imageUrl);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          logger.error("AI image fetch error:", e);
          setError(true);
          setLoading(false);
        }
      }
    };

    generate();
    return () => { cancelled = true; };
  }, [prompt]);

  if (loading) {
    return <Skeleton className={`${className} min-h-[200px]`} />;
  }

  if (error || !imageUrl) {
    return (
      <div className={`${className} min-h-[200px] bg-muted/50 rounded-2xl flex items-center justify-center`}>
        <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={`${className} rounded-2xl shadow-lg object-cover`}
      loading="lazy"
    />
  );
}
