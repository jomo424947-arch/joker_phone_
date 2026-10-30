import React, { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { sounds } from '../../lib/sounds';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'success' | 'gold' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  kbdShortcut?: string;
  isLoading?: boolean;
  noSound?: boolean;
  preventDoubleClick?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  kbdShortcut,
  isLoading = false,
  noSound = false,
  preventDoubleClick = false,
  className = '',
  onClick,
  disabled,
  style,
  ...props
}: ButtonProps): React.ReactElement {
  const lastClickRef = useRef(0);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;

    if (preventDoubleClick) {
      const now = Date.now();
      if (now - lastClickRef.current < 600) {
        e.preventDefault();
        return;
      }
      lastClickRef.current = now;
    }

    if (!noSound) {
      sounds.playClick();
    }

    onClick?.(e);
  };

  const actualVariant = variant === 'outline' ? 'secondary' : variant;
  const variantClass = `btn-${actualVariant}`;
  const sizeStyle: React.CSSProperties =
    size === 'sm'
      ? { padding: '5px 10px', fontSize: 12, minHeight: 30 }
      : size === 'lg'
      ? { padding: '12px 20px', fontSize: 15, minHeight: 46 }
      : {};

  return (
    <button
      className={`btn ${variantClass} ${className}`}
      onClick={handleClick}
      disabled={disabled || isLoading}
      style={{ ...sizeStyle, ...style }}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        children
      )}
      {kbdShortcut && !isLoading && <span className="kbd-badge">{kbdShortcut}</span>}
    </button>
  );
}

export default Button;
