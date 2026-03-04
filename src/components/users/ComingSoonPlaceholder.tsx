import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, LucideIcon } from "lucide-react";

interface ComingSoonPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoonText: string;
}

export function ComingSoonPlaceholder({ icon: Icon, title, description, comingSoonText }: ComingSoonPlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground">Prossimamente</h3>
          <p className="text-sm text-muted-foreground mt-1">{comingSoonText}</p>
        </div>
      </CardContent>
    </Card>
  );
}
