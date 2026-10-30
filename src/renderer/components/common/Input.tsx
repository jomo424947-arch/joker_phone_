import React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  prefix?: React.ReactNode;
  actionButton?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, prefix, actionButton, className = '', ...props }, ref) => {
    const displayIcon = icon || prefix;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        {label && (
          <label
            style={{
              fontSize: 'var(--font-caption)',
              fontWeight: 500,
              color: error ? 'var(--color-danger)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </label>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
          {displayIcon && (
            <div
              style={{
                position: 'absolute',
                right: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B726E',
                pointerEvents: 'none',
              }}
            >
              {displayIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`in ${error ? 'animate-shake' : ''} ${className}`}
            {...props}
            style={{
              paddingRight: displayIcon ? 40 : 14,
              paddingLeft: actionButton ? 44 : 14,
              borderColor: error ? 'var(--color-danger)' : undefined,
              ...props.style,
            }}
          />
          {actionButton && (
            <div
              style={{
                position: 'absolute',
                left: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {actionButton}
            </div>
          )}
        </div>
        {error && (
          <span
            style={{
              fontSize: 'var(--font-badge)',
              color: 'var(--color-danger)',
              fontWeight: 500,
            }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
