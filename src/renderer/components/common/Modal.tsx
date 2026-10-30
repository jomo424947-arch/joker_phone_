import React, { useEffect } from 'react';
import { AppIcon } from './AppIcon';
import { sounds } from '../../lib/sounds';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number | string;
  icon?: React.ReactNode;
  closeOnBackdrop?: boolean;
  zIndex?: number;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  width = 540,
  icon,
  closeOnBackdrop = true,
  zIndex = 1000,
}: ModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sounds.playClick();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        padding: 20,
      }}
      onClick={() => {
        if (closeOnBackdrop) {
          sounds.playClick();
          onClose();
        }
      }}
    >
      <div
        className="glass-card animate-scale-in"
        style={{
          width,
          maxWidth: '92vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          borderRadius: 16,
          padding: 0,
          overflow: 'hidden',
          fontFamily: 'var(--font-family)',
          color: '#F8FAFC',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #262E3D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#1C222D',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {icon}
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#F8FAFC', margin: 0 }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0B0E14')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <AppIcon name="close" size={18} />
          </button>
        </div>

        <div className="modal-beige-content" style={{ padding: 22, overflowY: 'auto', color: '#F8FAFC' }}>{children}</div>
      </div>
    </div>
  );
}

export default Modal;
