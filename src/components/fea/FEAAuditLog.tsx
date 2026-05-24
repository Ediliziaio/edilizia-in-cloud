import {
  CheckCircle2,
  Send,
  Eye,
  KeyRound,
  AlertCircle,
  FileText,
  RefreshCw,
  Link,
  Shield,
  Mail,
  Clock,
  XCircle,
  Award,
} from 'lucide-react';
import { useFEAAuditLog } from '@/hooks/useFEASessioni';
import type { FEAAuditLog as FEAAuditLogType } from '@/types/fea';
import { formatFirmaDate } from '@/lib/fea/firmaElettronicaHub';

type EventoKey = FEAAuditLogType['evento'];

const eventoConfig: Record<EventoKey, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  sessione_creata: { label: 'Sessione creata', icon: FileText, color: 'text-slate-500' },
  link_inviato: { label: 'Link inviato', icon: Send, color: 'text-blue-500' },
  link_aperto: { label: 'Link aperto', icon: Link, color: 'text-indigo-500' },
  otp_inviato: { label: 'OTP inviato via email', icon: Mail, color: 'text-blue-500' },
  otp_verificato: { label: 'OTP verificato', icon: KeyRound, color: 'text-green-500' },
  otp_fallito: { label: 'Tentativo OTP fallito', icon: AlertCircle, color: 'text-red-500' },
  documento_visualizzato: { label: 'Documento visualizzato', icon: Eye, color: 'text-indigo-500' },
  recesso_accettato: { label: 'Diritto di recesso accettato', icon: Shield, color: 'text-blue-500' },
  clausola_approvata: { label: 'Clausola approvata', icon: CheckCircle2, color: 'text-blue-500' },
  firma_completata: { label: 'Firma completata', icon: CheckCircle2, color: 'text-green-600' },
  firma_rifiutata: { label: 'Firma rifiutata', icon: XCircle, color: 'text-red-600' },
  certificato_generato: { label: 'Certificato generato', icon: Award, color: 'text-purple-500' },
  email_copia_inviata: { label: 'Email copia inviata', icon: Mail, color: 'text-green-500' },
  sessione_scaduta: { label: 'Sessione scaduta', icon: Clock, color: 'text-gray-500' },
};

interface FEAAuditLogProps {
  requestId: string | null;
}

export function FEAAuditLog({ requestId }: FEAAuditLogProps) {
  const { log, isLoading } = useFEAAuditLog(requestId);

  if (!requestId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Caricamento audit log...
      </div>
    );
  }

  if (log.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4">Nessun evento registrato.</p>
    );
  }

  return (
    <div className="relative">
      {/* Linea verticale */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

      <div className="space-y-4">
        {(log as FEAAuditLogType[]).map((entry, idx) => {
          const cfg = eventoConfig[entry.evento] ?? {
            label: entry.evento,
            icon: FileText,
            color: 'text-slate-400',
          };
          const Icon = cfg.icon;

          return (
            <div key={entry.id ?? idx} className="flex gap-4 relative">
              {/* Icona cerchio */}
              <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center">
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
              </div>

              {/* Contenuto */}
              <div className="flex-1 pb-2">
                <p className="text-sm font-medium text-slate-800">{cfg.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatFirmaDate(entry.created_at, "dd MMM yyyy 'alle' HH:mm:ss")}
                </p>
                {entry.ip && (
                  <p className="text-xs text-slate-400 mt-0.5">IP: {entry.ip}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
