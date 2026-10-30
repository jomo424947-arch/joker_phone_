import React from 'react';
import { AppIcon } from '../../../components/common/AppIcon';

interface HotkeyDef {
  key: string;
  label: string;
  iconName: string;
  color?: string;
}

const posHotkeys: HotkeyDef[] = [
  { key: 'F4', label: 'إتمام الدفع', iconName: 'credit_card', color: '#D63B5E' },
  { key: 'F6', label: 'تعليق الفاتورة', iconName: 'pause_circle', color: 'var(--color-primary)' },
  { key: 'F7', label: 'استرجاع معلق', iconName: 'pending_actions', color: 'var(--color-gold)' },
  { key: 'Esc', label: 'إلغاء الفاتورة', iconName: 'delete_sweep', color: 'var(--color-danger)' },
  { key: 'F12', label: 'قفل الشاشة', iconName: 'lock' },
];

export function HotkeysBar(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '7px 14px',
        backgroundColor: '#161B22',
        borderRadius: 12,
        border: '1px solid #262E3D',
        boxShadow: 'none',
        overflowX: 'auto',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#FFB800' }}>
        اختصارات سريعة:
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {posHotkeys.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              className="kbd-badge"
              style={{
                backgroundColor: '#0B0E14',
                color: h.color || '#FFB800',
                borderColor: '#262E3D',
                padding: '2px 8px',
                fontWeight: 700,
                fontFamily: 'Space Grotesk, monospace',
                fontSize: 11,
              }}
            >
              {h.key}
            </span>
            <AppIcon name={h.iconName} size={14} color={h.color || '#94A3B8'} />
            <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: 12 }}>{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HotkeysBar;
