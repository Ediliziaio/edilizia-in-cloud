import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPANY_AREAS, companyAreaFor } from "@/lib/companyDetailNavigation";

export function CompanyDetailNavigation({
  value,
  onChange,
}: {
  value: string;
  onChange: (section: string) => void;
}) {
  const area = companyAreaFor(value);
  const lastSection = useRef<Record<string, string>>({});
  lastSection.current[area.id] = value;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-4">
      <nav
        aria-label="Aree della scheda azienda"
        className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
      >
        {COMPANY_AREAS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={item.id === area.id ? "default" : "ghost"}
            className="h-auto min-h-11 whitespace-normal px-3 py-3 text-sm"
            aria-current={item.id === area.id ? "page" : undefined}
            onClick={() =>
              onChange(lastSection.current[item.id] ?? item.sections[0].id)
            }
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="border-t pt-3 space-y-3">
        <p className="text-sm text-muted-foreground">{area.description}</p>
        <TabsList
          aria-label={`Sezioni: ${area.label}`}
          className="flex h-auto w-fit max-w-full flex-wrap justify-start gap-1 bg-muted/50"
        >
          {area.sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="whitespace-normal"
            >
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  );
}
