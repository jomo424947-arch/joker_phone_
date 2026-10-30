import React from 'react';

export type IconVariant =
  | 'none'
  | 'brand'
  | 'primary'
  | 'cyan'
  | 'green'
  | 'red'
  | 'yellow'
  | 'purple'
  | 'rose'
  | 'neutral';

export interface AppIconProps {
  /** اسم رمز Material Symbols Outlined (مثال: 'point_of_sale', 'receipt_long', 'lock') */
  name: string;
  /** حجم الأيقونة بالبكسل (الافتراضي 20) */
  size?: number | string;
  /** لون الأيقونة المباشر (اختياري) */
  color?: string;
  /** وضع التعبئة (Fill 1 vs 0) */
  filled?: boolean;
  /** تنسيق حاوية ناعمة شبيهة ببطاقات CCMS */
  variant?: IconVariant;
  /** حاوية دائرية أو مستطيلة الحواف */
  shape?: 'rounded' | 'circle' | 'square';
  /** شارة إشعار رقمية اختيارية */
  badge?: string | number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

const variantStyles: Record<
  IconVariant,
  { bg: string; border: string; color: string; hoverBg?: string }
> = {
  none: {
    bg: 'transparent',
    border: 'transparent',
    color: 'inherit',
  },
  brand: {
    bg: 'rgba(255, 184, 0, 0.14)',
    border: 'rgba(255, 184, 0, 0.3)',
    color: '#FFB800',
  },
  primary: {
    bg: 'rgba(255, 184, 0, 0.12)',
    border: 'rgba(255, 184, 0, 0.25)',
    color: '#FFB800',
  },
  cyan: {
    bg: 'rgba(2, 132, 199, 0.1)',
    border: 'rgba(2, 132, 199, 0.25)',
    color: '#0284C7',
  },
  green: {
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.25)',
    color: '#16A34A',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.25)',
    color: '#DC2626',
  },
  yellow: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.25)',
    color: '#D97706',
  },
  purple: {
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.25)',
    color: '#7C3AED',
  },
  rose: {
    bg: 'rgba(255, 149, 165, 0.16)',
    border: 'rgba(255, 149, 165, 0.35)',
    color: '#FF6584',
  },
  neutral: {
    bg: 'rgba(0, 0, 0, 0.04)',
    border: 'rgba(0, 0, 0, 0.08)',
    color: '#475569',
  },
};

export function AppIcon({
  name,
  size = 20,
  color,
  filled = false,
  variant = 'none',
  shape = 'rounded',
  badge,
  className = '',
  style = {},
  onClick,
}: AppIconProps): React.ReactElement {
  const numSize = typeof size === 'number' ? size : parseInt(size, 10) || 20;
  const isBoxed = variant !== 'none';
  const vStyle = variantStyles[variant];

  // أبعاد الحاوية التناسبية عند اختيار نمط البطاقات الملونة
  const boxDim = Math.round(numSize * 1.85);
  const borderRadius =
    shape === 'circle' ? '50%' : shape === 'rounded' ? Math.round(boxDim * 0.26) : '6px';

  const iconElement = (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: `${numSize}px`,
        width: `${numSize}px`,
        height: `${numSize}px`,
        color: color || (isBoxed ? vStyle.color : 'inherit'),
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        ...(!isBoxed ? style : {}),
      }}
      onClick={!isBoxed ? onClick : undefined}
    >
      {name}
    </span>
  );

  if (!isBoxed && badge === undefined) {
    return iconElement;
  }

  return (
    <div
      className="app-icon-container"
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: isBoxed ? `${boxDim}px` : 'auto',
        height: isBoxed ? `${boxDim}px` : 'auto',
        minWidth: isBoxed ? `${boxDim}px` : 'auto',
        minHeight: isBoxed ? `${boxDim}px` : 'auto',
        borderRadius,
        backgroundColor: vStyle.bg,
        border: `1px solid ${vStyle.border}`,
        transition: 'all 0.18s ease',
        cursor: onClick ? 'pointer' : 'inherit',
        ...style,
      }}
    >
      {iconElement}

      {badge !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(220, 38, 38, 0.4)',
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

export default AppIcon;
