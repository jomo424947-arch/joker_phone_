import React from 'react';
import { AppIcon } from '../common/AppIcon';

export function StatusBar(): React.ReactElement {
  return (
    <footer
      style={{
        height: 32,
        backgroundColor: '#161B22',
        borderTop: '1px solid #262E3D',
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: '#94A3B8',
        userSelect: 'none',
        zIndex: 10,
        fontFamily: 'var(--font-family)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* حالة الطابعة */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AppIcon name="print" size={14} color="#FFB800" />
          <span>طابعة الإيصالات:</span>
          <span style={{ color: '#10B981', fontWeight: 700 }}>جاهزة (80mm)</span>
        </div>

        {/* حالة قارئ الباركود */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AppIcon name="qr_code_scanner" size={14} color="#FFB800" />
          <span>قارئ الباركود:</span>
          <span style={{ color: '#10B981', fontWeight: 700 }}>نشط (USB/Laser)</span>
        </div>

        {/* حالة النسخ الاحتياطي */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AppIcon name="cloud_sync" size={14} color="#FFB800" />
          <span>النسخ التلقائي:</span>
          <span style={{ color: '#CBD5E1', fontWeight: 600 }}>مجدول يومياً</span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
