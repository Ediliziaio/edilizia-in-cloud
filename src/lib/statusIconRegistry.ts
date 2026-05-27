/**
 * Status Icon Registry
 *
 * 2026-05-27 (perf fix P0): prima i 3 componenti (OrderProgressTracker,
 * StatusItem, IconPicker) importavano `icons` map intera da lucide-react
 * (5000+ componenti, ~320 KB minified per chunk). Trascinato in OGNI
 * pagina che li importa: OrderDetail, CustomerDetail, CompanyDetail,
 * SettingsCustomization → 5 chunk × 320KB = 1.6MB di icone duplicate.
 *
 * Soluzione: import nominale di una whitelist di ~70 icone "approvate"
 * per gli stati operativi (cantiere, magazzino, fattura, supporto).
 * Il file viene tree-shaken pulito: solo le icone qui dentro finiscono
 * nel bundle.
 *
 * Per aggiungere nuove icone disponibili agli stati ordine:
 *   1. Cerca su https://lucide.dev/icons/ il nome
 *   2. Aggiungilo all'import sopra
 *   3. Aggiungilo a STATUS_ICON_REGISTRY sotto
 */
import {
  // Movimentazione / Spedizione
  Truck,
  Package,
  PackageCheck,
  PackageOpen,
  PackageX,
  Send,
  MapPin,
  Navigation,
  // Lavoro / Operativo
  Hammer,
  Wrench,
  Drill,
  HardHat,
  Construction,
  PaintBucket,
  PaintRoller,
  // Stato / Progresso
  Check,
  CheckCircle,
  CheckCircle2,
  CheckSquare,
  Circle,
  CircleDot,
  CircleDashed,
  CircleCheck,
  Clock,
  Clock3,
  Clock9,
  Hourglass,
  Timer,
  Loader,
  // Avvisi / Errori
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  Ban,
  X,
  XCircle,
  XOctagon,
  ShieldAlert,
  ShieldCheck,
  // Documenti / Fatture
  FileText,
  FileCheck,
  FileWarning,
  FileX,
  FileSignature,
  Receipt,
  ReceiptText,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  // Calendari / Date
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  // Persone / Team
  User,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Briefcase,
  // Comunicazione
  Mail,
  MailCheck,
  Phone,
  MessageSquare,
  MessageCircle,
  // Soldi
  Euro,
  CreditCard,
  Banknote,
  Wallet,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  // Magazzino
  Warehouse,
  Boxes,
  Container,
  Archive,
  // Tools / Settings
  Settings,
  Settings2,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Edit,
  Edit2,
  Pencil,
  Trash,
  Trash2,
  RefreshCw,
  RotateCw,
  // Stati specifici
  Play,
  Pause,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Star,
  Heart,
  Flag,
  Bookmark,
  Lock,
  Unlock,
  LifeBuoy,
  Sparkles,
  Zap,
  Bell,
  Eye,
  EyeOff,
  Search,
  Filter,
  Tag,
  Tags,
  // Layout / Misc
  Home,
  Building,
  Building2,
  Globe,
  Compass,
  Bookmark as BookmarkAlt,
  type LucideIcon,
} from "lucide-react";

/**
 * Whitelist di icone disponibili per stati ordine, status custom, badge.
 * Chiavi case-sensitive — usa sempre PascalCase come lucide-react.
 */
export const STATUS_ICON_REGISTRY: Record<string, LucideIcon> = {
  // Movimentazione
  Truck, Package, PackageCheck, PackageOpen, PackageX, Send, MapPin, Navigation,
  // Lavoro
  Hammer, Wrench, Drill, HardHat, Construction, PaintBucket, PaintRoller,
  // Progresso
  Check, CheckCircle, CheckCircle2, CheckSquare, Circle, CircleDot, CircleDashed, CircleCheck,
  Clock, Clock3, Clock9, Hourglass, Timer, Loader,
  // Avvisi
  AlertCircle, AlertTriangle, AlertOctagon, Ban, X, XCircle, XOctagon, ShieldAlert, ShieldCheck,
  // Documenti
  FileText, FileCheck, FileWarning, FileX, FileSignature,
  Receipt, ReceiptText, ClipboardCheck, ClipboardList, ClipboardSignature,
  // Calendari
  Calendar, CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, CalendarX,
  // Persone
  User, UserCheck, UserPlus, UserX, Users, Briefcase,
  // Comunicazione
  Mail, MailCheck, Phone, MessageSquare, MessageCircle,
  // Soldi
  Euro, CreditCard, Banknote, Wallet, PiggyBank, TrendingUp, TrendingDown,
  // Magazzino
  Warehouse, Boxes, Container, Archive,
  // Tools
  Settings, Settings2, Sliders, ToggleLeft, ToggleRight,
  Edit, Edit2, Pencil, Trash, Trash2, RefreshCw, RotateCw,
  // Stati specifici
  Play, Pause, PlayCircle, PauseCircle, StopCircle,
  Star, Heart, Flag, Bookmark, BookmarkAlt,
  Lock, Unlock, LifeBuoy, Sparkles, Zap, Bell,
  Eye, EyeOff, Search, Filter, Tag, Tags,
  // Layout
  Home, Building, Building2, Globe, Compass,
};

/**
 * Lookup tipato. Ritorna l'icona richiesta o Circle come fallback.
 * Sostituisce l'uso di `icons[name]` con type safety.
 */
export function getStatusIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Circle;
  return STATUS_ICON_REGISTRY[name] ?? Circle;
}

/** Nomi disponibili — per IconPicker grid. */
export const STATUS_ICON_NAMES = Object.keys(STATUS_ICON_REGISTRY).sort();
