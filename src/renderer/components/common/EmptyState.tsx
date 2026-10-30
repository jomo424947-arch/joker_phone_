import React from 'react';
import { LucideIcon, PackageOpen } from 'lucide-react';
import { GlassIcon, GlassIconVariant } from './GlassIcon';

export interface EmptyStateProps {
  icon?: LucideIcon | string;
  variant?: GlassIconVariant;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyState({
  icon = PackageOpen,
  variant = 'neutral',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
  style = {},
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={`empty-state-container animate-fade-in ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '52px 24px',
        textAlign: 'center',
        background: 'rgba(255, 184, 0, 0.03)',
        borderRadius: 16,
        border: '1.5px dashed rgba(255, 184, 0, 0.25)',
        margin: '16px',
        ...style,
      }}
    >
      <GlassIcon icon={icon} size="2xl" variant={variant} glow style={{ marginBottom: 16 }} />
      <h3 style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', marginBottom: 8 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 14.5, color: '#CBD5E1', maxWidth: 480, lineHeight: 1.6, fontWeight: 500, marginBottom: actionLabel ? 22 : 0 }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            height: 42,
            padding: '0 24px',
            fontSize: 14.5,
            fontWeight: 800,
            borderRadius: 10,
            border: 'none',
            background: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
            color: '#000000',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(255, 184, 0, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.18s ease',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
