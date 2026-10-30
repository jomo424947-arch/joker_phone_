import React from 'react';
import { LucideIcon } from 'lucide-react';

export type GlassIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type GlassIconVariant =
  | 'brand'
  | 'primary'
  | 'gold'
  | 'rose'
  | 'danger'
  | 'success'
  | 'neutral'
  | 'info'
  | 'cyan'
  | 'purple';

export interface GlassIconProps {
  icon: LucideIcon | string;
  size?: GlassIconSize;
  variant?: GlassIconVariant;
  glow?: boolean;
  active?: boolean;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  badge?: string | number;
}

const sizeConfig: Record<
  GlassIconSize,
  { box: number; icon: number; radius: number; badgeSize: number }
> = {
  xs: { box: 28, icon: 16, radius: 8, badgeSize: 14 },
  sm: { box: 34, icon: 19, radius: 9, badgeSize: 16 },
  md: { box: 40, icon: 22, radius: 11, badgeSize: 18 },
  lg: { box: 48, icon: 26, radius: 13, badgeSize: 20 },
  xl: { box: 58, icon: 30, radius: 15, badgeSize: 22 },
  '2xl': { box: 72, icon: 38, radius: 18, badgeSize: 24 },
};

const variantConfig: Record<
  GlassIconVariant,
  {
    bg: string;
    border: string;
    iconColor: string;
    glowColor: string;
    activeBg: string;
    activeBorder: string;
  }
> = {
  brand: {
    bg: 'rgba(255, 184, 0, 0.12)',
    border: 'rgba(255, 184, 0, 0.3)',
    iconColor: '#FFB800',
    glowColor: 'rgba(255, 184, 0, 0.35)',
    activeBg: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
    activeBorder: '#FFB800',
  },
  primary: {
    bg: 'rgba(255, 184, 0, 0.12)',
    border: 'rgba(255, 184, 0, 0.28)',
    iconColor: '#FFB800',
    glowColor: 'rgba(255, 184, 0, 0.3)',
    activeBg: '#FFB800',
    activeBorder: '#FFB800',
  },
  gold: {
    bg: 'rgba(255, 184, 0, 0.14)',
    border: 'rgba(255, 184, 0, 0.3)',
    iconColor: '#FFB800',
    glowColor: 'rgba(255, 184, 0, 0.35)',
    activeBg: '#FFB800',
    activeBorder: '#FFB800',
  },
  rose: {
    bg: 'rgba(255, 184, 0, 0.15)',
    border: 'rgba(255, 184, 0, 0.35)',
    iconColor: '#FFB800',
    glowColor: 'rgba(255, 184, 0, 0.4)',
    activeBg: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
    activeBorder: '#FFB800',
  },
  danger: {
    bg: 'rgba(220, 38, 38, 0.1)',
    border: 'rgba(220, 38, 38, 0.25)',
    iconColor: '#DC2626',
    glowColor: 'rgba(220, 38, 38, 0.3)',
    activeBg: '#DC2626',
    activeBorder: '#DC2626',
  },
  success: {
    bg: 'rgba(22, 163, 74, 0.1)',
    border: 'rgba(22, 163, 74, 0.25)',
    iconColor: '#16A34A',
    glowColor: 'rgba(22, 163, 74, 0.3)',
    activeBg: '#16A34A',
    activeBorder: '#16A34A',
  },
  cyan: {
    bg: 'rgba(2, 132, 199, 0.1)',
    border: 'rgba(2, 132, 199, 0.25)',
    iconColor: '#0284C7',
    glowColor: 'rgba(2, 132, 199, 0.3)',
    activeBg: '#0284C7',
    activeBorder: '#0284C7',
  },
  purple: {
    bg: 'rgba(124, 58, 237, 0.1)',
    border: 'rgba(124, 58, 237, 0.25)',
    iconColor: '#7C3AED',
    glowColor: 'rgba(124, 58, 237, 0.3)',
    activeBg: '#7C3AED',
    activeBorder: '#7C3AED',
  },
  neutral: {
    bg: 'rgba(0, 0, 0, 0.04)',
    border: 'rgba(0, 0, 0, 0.08)',
    iconColor: '#475569',
    glowColor: 'rgba(0, 0, 0, 0.06)',
    activeBg: '#475569',
    activeBorder: '#475569',
  },
  info: {
    bg: 'rgba(2, 132, 199, 0.1)',
    border: 'rgba(2, 132, 199, 0.25)',
    iconColor: '#0284C7',
    glowColor: 'rgba(2, 132, 199, 0.3)',
    activeBg: '#0284C7',
    activeBorder: '#0284C7',
  },
};

/** قاموس التحويل الذكي من مكونات Lucide إلى أسماء Material Symbols Outlined */
const lucideToMaterialMap: Record<string, string> = {
  ShoppingCart: 'point_of_sale',
  Receipt: 'receipt_long',
  Tag: 'sell',
  Package: 'inventory_2',
  Truck: 'local_shipping',
  RotateCcw: 'assignment_return',
  Coins: 'payments',
  BarChart3: 'query_stats',
  Settings: 'settings',
  Sparkles: 'auto_awesome',
  Lock: 'lock',
  LogOut: 'logout',
  Volume2: 'volume_up',
  VolumeX: 'volume_off',
  Clock: 'schedule',
  ShieldCheck: 'verified_user',
  Printer: 'print',
  Scan: 'qr_code_scanner',
  Database: 'database',
  HardDriveDownload: 'cloud_sync',
  User: 'person',
  CreditCard: 'credit_card',
  Banknote: 'payments',
  Layers: 'splitscreen',
  PauseCircle: 'pause_circle',
  PlayCircle: 'play_circle',
  Trash2: 'delete',
  Percent: 'percent',
  ShoppingBag: 'shopping_bag',
  CheckCircle2: 'check_circle',
  AlertCircle: 'error',
  Plus: 'add',
  Minus: 'remove',
  CornerDownLeft: 'keyboard_return',
  Search: 'search',
  RefreshCw: 'sync',
  Eye: 'visibility',
  EyeOff: 'visibility_off',
  X: 'close',
  XCircle: 'cancel',
  Check: 'check',
  FileText: 'description',
  PackageOpen: 'inventory',
  HelpCircle: 'help',
  AlertTriangle: 'warning',
  Info: 'info',
  FileBarChart: 'analytics',
  Users: 'group',
  Boxes: 'inventory_2',
  Shield: 'shield',
  Unlock: 'lock_open',
  KeyRound: 'vpn_key',
  Key: 'vpn_key',
  Save: 'save',
  UploadCloud: 'cloud_upload',
  DownloadCloud: 'cloud_download',
  History: 'history',
  TrendingUp: 'trending_up',
  TrendingDown: 'trending_down',
  ArrowUpRight: 'arrow_outward',
  ArrowDownLeft: 'call_received',
  Folder: 'folder',
  Copy: 'content_copy',
  BarChart: 'bar_chart',
  PieChart: 'pie_chart',
  FileSpreadsheet: 'table_chart',
  Edit: 'edit',
  Trash: 'delete',
  Store: 'storefront',
  Award: 'military_tech',
  DollarSign: 'attach_money',
  ShieldAlert: 'shield',
};

export function GlassIcon({
  icon,
  size = 'md',
  variant = 'brand',
  glow = false,
  active = false,
  interactive = false,
  className = '',
  style = {},
  badge,
}: GlassIconProps): React.ReactElement {
  const cfg = sizeConfig[size];
  const vcfg = variantConfig[variant] || variantConfig.brand;

  const currentBg = active ? vcfg.activeBg : vcfg.bg;
  const currentBorder = active ? vcfg.activeBorder : vcfg.border;
  const currentIconColor = active ? '#FFFFFF' : vcfg.iconColor;

  // فحص ما إذا كان اسم الرمز نصياً أو مكون Lucide
  let materialSymbolName: string | null = null;
  const IconComponent: any =
    typeof icon === 'function' || (icon && typeof icon === 'object' && ((icon as any).$$typeof || (icon as any).render))
      ? icon
      : null;

  if (typeof icon === 'string') {
    materialSymbolName = icon;
  } else if (IconComponent) {
    const compName = (IconComponent as any).displayName || IconComponent.name || '';
    if (compName && lucideToMaterialMap[compName]) {
      materialSymbolName = lucideToMaterialMap[compName];
    }
  }

  return (
    <div
      className={`glass-icon-wrapper ${interactive ? 'glass-icon-interactive' : ''} ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: cfg.box,
        height: cfg.box,
        minWidth: cfg.box,
        minHeight: cfg.box,
        borderRadius: cfg.radius,
        background: currentBg,
        border: `1px solid ${currentBorder}`,
        boxShadow: glow || active
          ? `0 3px 12px ${vcfg.glowColor}`
          : '0 1px 3px rgba(0, 0, 0, 0.04)',
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: interactive ? 'pointer' : 'inherit',
        ...style,
      }}
    >
      {/* عرض رمز Material Symbols Outlined ليتطابق مع نظام CCMS المرفق */}
      {materialSymbolName ? (
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: `${cfg.icon}px`,
            color: currentIconColor,
            lineHeight: 1,
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.18s ease, transform 0.18s ease',
          }}
        >
          {materialSymbolName}
        </span>
      ) : IconComponent ? (
        <IconComponent
          size={cfg.icon}
          color={currentIconColor}
          strokeWidth={2}
          style={{
            position: 'relative',
            zIndex: 1,
            transition: 'color 0.18s ease, transform 0.18s ease',
          }}
        />
      ) : null}

      {/* شارة إشعار صغيرة */}
      {badge !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            minWidth: cfg.badgeSize,
            height: cfg.badgeSize,
            padding: '0 4px',
            borderRadius: cfg.badgeSize / 2,
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(220, 38, 38, 0.35)',
            border: '1.5px solid #FFFFFF',
            zIndex: 2,
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

export default GlassIcon;
