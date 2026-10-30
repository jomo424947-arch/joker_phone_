import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingOverlayProps {
  message?: string;
  transparent?: boolean;
}

export function LoadingOverlay({
  message = 'جاري التحميل...',
  transparent = false,
}: LoadingOverlayProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: transparent ? 'rgba(11, 14, 20, 0.65)' : 'rgba(11, 14, 20, 0.85)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        borderRadius: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '20px 32px',
          backgroundColor: '#161B22',
          borderRadius: 14,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          border: '1px solid #262E3D',
        }}
      >
        <Loader2
          size={32}
          color="#FFB800"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>{message}</span>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default LoadingOverlay;
