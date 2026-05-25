import { useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NavLink } from "@/components/NavLink";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import { formatCurrency } from "@/lib/formatters";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  FolderDown,
  Home,
  LayoutDashboard,
  Link2,
  MousePointerClick,
  QrCode,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import PartnerPayout, { type PartnerPayoutPreviewData } from "./PartnerPayout";

type PreviewSection =
  | "dashboard"
  | "referenze"
  | "link"
  | "performance"
  | "commissioni"
  | "payout"
  | "materiali"
  | "profilo";

const menuItems: Array<{ section: PreviewSection; label: string; icon: typeof LayoutDashboard }> = [
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "referenze", label: "Referenze", icon: Users },
  { section: "link", label: "Il Mio Link", icon: Link2 },
  { section: "performance", label: "Performance", icon: BarChart3 },
  { section: "commissioni", label: "Commissioni", icon: DollarSign },
  { section: "payout", label: "Payout", icon: Wallet },
  { section: "materiali", label: "Materiali", icon: FolderDown },
  { section: "profilo", label: "Profilo", icon: User },
];

const previewData: PartnerPayoutPreviewData = {
  referrer: {
    id: "preview-referrer",
    total_earned: 4820,
    total_paid: 2150,
    payout_method: "bank_transfer",
    payout_details: {
      iban: "IT60X0542811101000000123456",
      account_holder: "Marco Referrer",
      bank: "Intesa Sanpaolo",
      fiscal_code: "MRCRFR80A01H501X",
      bank_verification: {
        status: "verified",
        submitted_at: "2026-05-20T09:00:00Z",
        verified_at: "2026-05-21T11:30:00Z",
      },
      contract: {
        status: "approved",
        version: "1.0",
        signed_name: "Marco Referrer",
        signed_at: "2026-05-20T09:10:00Z",
        approved_at: "2026-05-21T12:00:00Z",
      },
    },
    has_accepted_terms: true,
  },
  payouts: [
    {
      id: "preview-payout-3",
      amount: 980,
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      paid_at: "2026-05-12T09:30:00Z",
      payment_method: "bank_transfer",
      status: "paid",
      transaction_reference: "REF-2026-0512",
    },
    {
      id: "preview-payout-2",
      amount: 720,
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      paid_at: "2026-04-12T10:00:00Z",
      payment_method: "bank_transfer",
      status: "paid",
      transaction_reference: "REF-2026-0412",
    },
    {
      id: "preview-payout-1",
      amount: 450,
      period_start: "2026-02-01",
      period_end: "2026-02-28",
      paid_at: "2026-03-12T10:00:00Z",
      payment_method: "bank_transfer",
      status: "paid",
      transaction_reference: "REF-2026-0312",
    },
  ],
};

const referralRows = [
  { name: "Impresa Bianchi S.r.l.", status: "Trial attivo", value: 1480, commission: 222, date: "23 mag 2026" },
  { name: "Rossi Restauri", status: "Cliente pagante", value: 2400, commission: 360, date: "16 mag 2026" },
  { name: "Edil Nova", status: "In onboarding", value: 0, commission: 0, date: "09 mag 2026" },
  { name: "Studio Tecnico Verdi", status: "Demo prenotata", value: 0, commission: 0, date: "04 mag 2026" },
];

const commissionRows = [
  { month: "Maggio 2026", source: "Rossi Restauri", type: "Ricorrente", amount: 360, status: "Maturata" },
  { month: "Maggio 2026", source: "Impresa Bianchi S.r.l.", type: "Nuovo cliente", amount: 222, status: "In maturazione" },
  { month: "Aprile 2026", source: "Rossi Restauri", type: "Ricorrente", amount: 360, status: "Pagata" },
  { month: "Marzo 2026", source: "Costruzioni Alba", type: "Setup", amount: 450, status: "Pagata" },
];

const materialRows = [
  { title: "Brochure partner PDF", type: "PDF", use: "Invio a clienti caldi" },
  { title: "Mini video demo cantieri", type: "Video", use: "WhatsApp e LinkedIn" },
  { title: "Template email introduzione", type: "Email", use: "Primo contatto" },
  { title: "Landing page personalizzata", type: "Link", use: "Campagne e bio social" },
];

const bottomNavItems: Array<{ section: PreviewSection; label: string; icon: typeof LayoutDashboard }> = [
  { section: "dashboard", label: "Home", icon: Home },
  { section: "referenze", label: "Referenze", icon: Users },
  { section: "performance", label: "Performance", icon: BarChart3 },
  { section: "payout", label: "Payout", icon: Wallet },
];

function KpiCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-11 sm:w-11">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-xl font-bold sm:text-2xl">{value}</p>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewHeader({ section }: { section: PreviewSection }) {
  const item = menuItems.find((entry) => entry.section === section) ?? menuItems[0];
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
      <div>
        <p className="text-sm text-muted-foreground">Preview locale portale partner</p>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{item.label}</h1>
      </div>
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
        Dati demo · nessun salvataggio
      </Badge>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Click 30 giorni" value="1.284" note="+18% rispetto al mese scorso" icon={MousePointerClick} />
        <KpiCard title="Conversioni" value="18" note="4 clienti paganti" icon={CheckCircle2} />
        <KpiCard title="Commissioni totali" value="4.820,00 €" note="2.670,00 € disponibili" icon={DollarSign} />
        <KpiCard title="Tasso conversione" value="6,8%" note="Sopra media partner" icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avanzamento tier Gold</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Prossimo tier Platinum</span>
            <span className="font-medium">18 / 25 conversioni</span>
          </div>
          <Progress value={72} />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Premio sbloccato</p>
              <p className="font-semibold">+3% commissione ricorrente</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Lead caldi</p>
              <p className="font-semibold">6 da ricontattare</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Prossima azione</p>
              <p className="font-semibold">Invia follow-up a Edil Nova</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReferralsPreview() {
  const totalPipeline = referralRows.reduce((sum, row) => sum + row.value, 0);
  const totalCommission = referralRows.reduce((sum, row) => sum + row.commission, 0);
  const activeCount = referralRows.filter((row) => row.value > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">Attive</p>
          <p className="text-sm font-bold leading-tight sm:text-lg">{activeCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">Pipeline</p>
          <p className="text-sm font-bold leading-tight sm:text-lg">{formatCurrency(totalPipeline)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">Comm.</p>
          <p className="text-sm font-bold leading-tight sm:text-lg">{formatCurrency(totalCommission)}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="px-4 py-4 sm:px-6">
          <CardTitle className="text-base">Referenze generate</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-3 p-4 md:hidden">
            {referralRows.map((row) => (
              <div key={row.name} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{row.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{row.date}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{row.status}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">Valore</p>
                    <p className="font-semibold">{row.value > 0 ? formatCurrency(row.value) : "-"}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">Commissione</p>
                    <p className="font-semibold">{row.commission > 0 ? formatCurrency(row.commission) : "In attesa"}</p>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(`${row.name}: dettaglio demo non salvato`)}
                >
                  Apri scheda
                </Button>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Valore</TableHead>
                  <TableHead>Commissione</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referralRows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
                    <TableCell>{row.value > 0 ? formatCurrency(row.value) : "-"}</TableCell>
                    <TableCell>{row.commission > 0 ? formatCurrency(row.commission) : "In attesa"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkPreview() {
  const baseLink = "https://ediliziaincloud.com/ref/MARCO-GOLD";
  const campaignLink = `${baseLink}?utm_source=whatsapp&utm_campaign=cantieri-maggio&utm_content=brochure-gold`;
  const [copiedBase, setCopiedBase] = useState(false);
  const [copiedCampaign, setCopiedCampaign] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copyPreviewLink = async (text: string, setCopied: (value: boolean) => void) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      toast.success("Link copiato nella preview locale");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copia non disponibile nel browser locale");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link referral personale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="break-all rounded-lg border bg-muted/40 p-4 font-mono text-sm">
            {baseLink}
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button className="w-full sm:w-auto" onClick={() => copyPreviewLink(baseLink, setCopiedBase)}>
              <Copy className="mr-2 h-4 w-4" /> {copiedBase ? "Copiato" : "Copia link"}
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => toast.info("Apertura landing simulata nella preview locale")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Apri landing
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setShowQr((value) => !value)}>
              <QrCode className="mr-2 h-4 w-4" /> QR code
            </Button>
          </div>
          {showQr && (
            <div className="inline-flex h-36 w-36 items-center justify-center rounded-lg border bg-white p-4">
              <QrCode className="h-20 w-20 text-slate-900" />
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Genera link campagna</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Fonte</Label>
            <Input value="whatsapp" readOnly />
          </div>
          <div className="space-y-2">
            <Label>Campagna</Label>
            <Input value="cantieri-maggio" readOnly />
          </div>
          <div className="space-y-2">
            <Label>Creatività</Label>
            <Input value="brochure-gold" readOnly />
          </div>
          <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 md:col-span-3 sm:flex sm:items-center">
            <code className="min-w-0 break-all text-xs sm:flex-1 sm:truncate">{campaignLink}</code>
            <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => copyPreviewLink(campaignLink, setCopiedCampaign)}>
              <Copy className="mr-2 h-4 w-4" /> {copiedCampaign ? "Copiato" : "Copia"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PerformancePreview() {
  const channelRows = [
    { source: "WhatsApp", campaign: "cantieri-maggio", clicks: 512, conversions: 14, rate: 2.7, revenue: 5200, commission: 780, status: "Converte" },
    { source: "LinkedIn", campaign: "post-casi-studio", clicks: 318, conversions: 6, rate: 1.9, revenue: 2400, commission: 360, status: "Converte" },
    { source: "Email personale", campaign: "follow-up-demo", clicks: 176, conversions: 3, rate: 1.7, revenue: 1350, commission: 202, status: "Converte" },
    { source: "QR brochure", campaign: "fiera-edilizia", clicks: 91, conversions: 0, rate: 0, revenue: 0, commission: 0, status: "Da ottimizzare" },
  ];
  const funnel = [
    { label: "Click", value: "1.284", percent: 100 },
    { label: "Conversioni", value: "23", percent: 72 },
    { label: "Clienti attivi", value: "11", percent: 48 },
    { label: "Commissioni", value: "1.342,00 €", percent: 34 },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs defaultValue="30">
          <TabsList>
            <TabsTrigger value="7">7g</TabsTrigger>
            <TabsTrigger value="30">30g</TabsTrigger>
            <TabsTrigger value="90">90g</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => toast.success("Export performance demo generato")}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Click 30g" value="1.284" note="+18% vs periodo precedente" icon={MousePointerClick} />
        <KpiCard title="Conversioni" value="23" note="11 clienti attivi/paganti" icon={Users} />
        <KpiCard title="Conversion rate" value="1,8%" note="+0,4 punti" icon={Target} />
        <KpiCard title="Commissioni" value="1.342,00 €" note="+22% vs periodo precedente" icon={Wallet} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sorgenti e campagne</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-3 p-4 md:hidden">
              {channelRows.map((row) => (
                <div key={`${row.source}-${row.campaign}-mobile`} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{row.source}</h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{row.campaign}</p>
                    </div>
                    <Badge variant={row.status === "Converte" ? "default" : "secondary"}>{row.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-[11px] font-medium uppercase text-muted-foreground">Click</p>
                      <p className="font-semibold">{row.clicks}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-[11px] font-medium uppercase text-muted-foreground">Conv.</p>
                      <p className="font-semibold">{row.conversions}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-[11px] font-medium uppercase text-muted-foreground">Tasso</p>
                      <p className="font-semibold">{row.rate.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-md bg-primary/5 p-3">
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">Commissione</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(row.commission)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sorgente</TableHead>
                    <TableHead>Campagna</TableHead>
                    <TableHead className="text-right">Click</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">Tasso</TableHead>
                    <TableHead className="text-right">Comm.</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelRows.map((row) => (
                    <TableRow key={`${row.source}-${row.campaign}`}>
                      <TableCell className="font-medium">{row.source}</TableCell>
                      <TableCell>{row.campaign}</TableCell>
                      <TableCell className="text-right">{row.clicks}</TableCell>
                      <TableCell className="text-right">{row.conversions}</TableCell>
                      <TableCell className="text-right">{row.rate.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.commission)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "Converte" ? "default" : "secondary"}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {funnel.map((step) => (
              <div key={step.label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{step.label}</span>
                  <span className="font-medium">{step.value}</span>
                </div>
                <Progress value={step.percent} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Canali migliori</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {channelRows.map((row) => (
              <div key={row.source} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{row.source}</span>
                  <span className="text-muted-foreground">{row.conversions} conversioni · {formatCurrency(row.revenue)}</span>
                </div>
                <Progress value={Math.min(row.clicks / 6, 100)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Insight operativi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-800">
              <TrendingUp className="mt-0.5 h-4 w-4" />
              WhatsApp e LinkedIn generano il 74% delle commissioni: spingili nel prossimo ciclo.
            </div>
            <div className="flex gap-3 rounded-lg border bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              QR brochure porta traffico ma zero conversioni: cambia CTA o landing.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CommissionsPreview() {
  return (
    <Card>
      <CardHeader className="px-4 py-4 sm:px-6">
        <CardTitle className="text-base">Registro commissioni</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-3 p-4 md:hidden">
          {commissionRows.map((row) => (
            <div key={`${row.month}-${row.source}-${row.amount}-mobile`} className="rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{row.source}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{row.month} · {row.type}</p>
                </div>
                <Badge variant={row.status === "Pagata" ? "default" : "secondary"}>{row.status}</Badge>
              </div>
              <p className="mt-4 text-xl font-bold">{formatCurrency(row.amount)}</p>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mese</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Importo</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {commissionRows.map((row) => (
              <TableRow key={`${row.month}-${row.source}-${row.amount}`}>
                <TableCell>{row.month}</TableCell>
                <TableCell className="font-medium">{row.source}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(row.amount)}</TableCell>
                <TableCell><Badge variant={row.status === "Pagata" ? "default" : "secondary"}>{row.status}</Badge></TableCell>
              </TableRow>
            ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialsPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {materialRows.map((row) => (
        <Card key={row.title}>
          <CardContent className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div>
              <Badge variant="outline" className="mb-3">{row.type}</Badge>
              <h3 className="font-semibold">{row.title}</h3>
              <p className="text-sm text-muted-foreground">{row.use}</p>
            </div>
            <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={() => toast.success(`${row.title}: download simulato`)}>
              <Download className="mr-2 h-4 w-4" /> Scarica
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProfilePreview() {
  const [name, setName] = useState("Marco Referrer");
  const [email, setEmail] = useState("partner@demo.it");
  const [iban, setIban] = useState("IT60X0542811101000000123456");
  const [bankStatus, setBankStatus] = useState<"verified" | "pending">("verified");
  const [contractStatus, setContractStatus] = useState<"approved" | "signed_pending_approval">("approved");
  const [contractAccepted, setContractAccepted] = useState(false);
  const [contractSigner, setContractSigner] = useState("Marco Referrer");
  const ibanIsValid = iban.trim().replace(/\s/g, "").length >= 15;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dati partner</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Metodo payout</Label>
              <Input value="Bonifico bancario" readOnly />
            </div>
            <div className="space-y-2">
              <Label>IBAN</Label>
              <Input
                value={iban}
                onChange={(event) => {
                  setIban(event.target.value.toUpperCase());
                  setBankStatus("pending");
                }}
              />
            </div>
            <div className="md:col-span-2 rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {bankStatus === "verified" ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                  <span className="text-sm font-medium">Verifica conto corrente</span>
                </div>
                <Badge variant={bankStatus === "verified" ? "default" : "secondary"}>
                  {bankStatus === "verified" ? "Verificato" : "In verifica"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ogni modifica dei dati bancari invia il conto in verifica prima del prossimo payout.
              </p>
            </div>
            <div className="md:col-span-2">
              <Button
                disabled={!name.trim() || !email.trim() || !ibanIsValid}
                onClick={() => {
                  setBankStatus("pending");
                  toast.success("Dati conto demo inviati in verifica");
                }}
              >
                <Save className="mr-2 h-4 w-4" /> Salva e invia verifica
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Contratto partner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stato legale</span>
              <Badge variant={contractStatus === "approved" ? "default" : "secondary"}>
                {contractStatus === "approved" ? "Approvato" : "Firmato, in approvazione"}
              </Badge>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              Contratto v1.0: commissioni, privacy, uso marchio, responsabilità e condizioni di pagamento.
            </div>
            {contractStatus !== "approved" && (
              <p className="text-sm text-amber-700">In attesa che il team approvi il contratto firmato.</p>
            )}
            <div className="space-y-2">
              <Label>Nome firmatario</Label>
              <Input value={contractSigner} onChange={(event) => setContractSigner(event.target.value)} />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="preview-contract"
                checked={contractAccepted}
                onCheckedChange={(checked) => setContractAccepted(checked === true)}
              />
              <Label htmlFor="preview-contract" className="cursor-pointer text-sm leading-relaxed">
                Confermo lettura e accettazione del contratto partner.
              </Label>
            </div>
            <Button
              variant="outline"
              disabled={!contractAccepted || !contractSigner.trim()}
              onClick={() => {
                setContractStatus("signed_pending_approval");
                setContractAccepted(false);
                toast.success("Contratto demo firmato e inviato per approvazione");
              }}
            >
              <FileText className="mr-2 h-4 w-4" /> Firma e invia
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stato account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Contratto</span>
            <Badge variant={contractStatus === "approved" ? "default" : "secondary"}>
              {contractStatus === "approved" ? "Approvato" : "In approvazione"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tier</span>
            <Badge className="bg-amber-500 text-white">Gold</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Conto</span>
            <Badge variant={ibanIsValid && bankStatus === "verified" ? "secondary" : "destructive"}>
              {ibanIsValid && bankStatus === "verified" ? "Verificato" : "Da verificare"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewContent({ section }: { section: PreviewSection }) {
  if (section === "referenze") return <ReferralsPreview />;
  if (section === "link") return <LinkPreview />;
  if (section === "performance") return <PerformancePreview />;
  if (section === "commissioni") return <CommissionsPreview />;
  if (section === "payout") return <PartnerPayout previewData={previewData} />;
  if (section === "materiali") return <MaterialsPreview />;
  if (section === "profilo") return <ProfilePreview />;
  return <DashboardPreview />;
}

function PartnerMobileMenuSheet({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: PreviewSection;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm lg:hidden">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="Chiudi menu" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border bg-background p-4 shadow-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Portale partner</p>
            <h2 className="text-lg font-bold">Menu app</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Chiudi menu">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {menuItems.map((item) => {
            const active = item.section === section;
            return (
              <NavLink
                key={item.section}
                to={`/dev/partner/${item.section}`}
                onClick={onClose}
                className={`flex min-h-[4.75rem] flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-[11px] font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="leading-tight">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PartnerMobileBottomNav({
  section,
  onMenuClick,
  menuOpen,
}: {
  section: PreviewSection;
  onMenuClick: () => void;
  menuOpen: boolean;
}) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[60] border-t border-border/60 bg-background/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigazione partner"
    >
      <div className="flex h-16 items-stretch px-1">
        {bottomNavItems.map((item) => {
          const active = item.section === section;
          return (
            <NavLink
              key={item.section}
              to={`/dev/partner/${item.section}`}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
              aria-current={active ? "page" : undefined}
            >
              <div
                className={`flex items-center justify-center rounded-2xl transition-all duration-200 ${
                  active ? "h-8 w-12 bg-primary/10" : "h-8 w-10"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 transition-all duration-200 ${
                    active ? "text-primary stroke-[2.5]" : "text-muted-foreground stroke-[1.5]"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] leading-none transition-all duration-200 ${
                  active ? "font-semibold text-primary" : "font-medium text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
        <button
          type="button"
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
          onClick={onMenuClick}
          aria-label="Apri menu partner"
          aria-expanded={menuOpen}
        >
          <div className={`flex h-8 items-center justify-center rounded-2xl transition-all duration-200 ${menuOpen ? "w-12 bg-primary/10" : "w-10"}`}>
            <LayoutDashboard className={`h-5 w-5 transition-all duration-200 ${menuOpen ? "text-primary stroke-[2.5]" : "text-muted-foreground stroke-[1.5]"}`} />
          </div>
          <span className={`text-[10px] leading-none transition-all duration-200 ${menuOpen ? "font-semibold text-primary" : "font-medium text-muted-foreground"}`}>
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
}

export default function PartnerPayoutPreview() {
  const { section: rawSection } = useParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const section = menuItems.some((item) => item.section === rawSection)
    ? (rawSection as PreviewSection)
    : "dashboard";

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r bg-card lg:flex lg:flex-col">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
            <Badge className="bg-amber-500 text-white">Gold</Badge>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {menuItems.map((item) => (
              <NavLink
                key={item.label}
                to={`/dev/partner/${item.section}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                activeClassName="bg-muted text-foreground font-medium"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">MR</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Marco Referrer</p>
                <p className="truncate text-xs text-muted-foreground">partner@demo.it</p>
              </div>
            </div>
          </div>
        </aside>
        <main className="min-w-0 bg-muted/20">
          <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-500 text-white">Gold</Badge>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">MR</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-5xl px-3 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-6">
            {section !== "payout" && <PreviewHeader section={section} />}
            <PreviewContent section={section} />
          </div>
        </main>
      </div>
      <PartnerMobileBottomNav
        section={section}
        menuOpen={mobileMenuOpen}
        onMenuClick={() => setMobileMenuOpen(true)}
      />
      <PartnerMobileMenuSheet
        open={mobileMenuOpen}
        section={section}
        onClose={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}
