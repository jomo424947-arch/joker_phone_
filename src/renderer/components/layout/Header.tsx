import React, { useState, useEffect } from 'react';
import { AppIcon } from '../common/AppIcon';
import { sounds } from '../../lib/sounds';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps): React.ReactElement {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // تنسيق عربي أنيق للوقت والتاريخ
      const dateStr = now.toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setCurrentTime(`${dateStr} • ${timeStr}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualLock = async () => {
    sounds.playWarning();
    const electron = (window as any).electron;
    await electron?.lockScreen?.();
  };

  return (
    <header
      className="glass-header"
      style={{
        height: 60,
        backgroundColor: 'rgba(11, 14, 20, 0.94)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-light)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-main)',
            margin: 0,
            letterSpacing: '-0.2px',
            fontFamily: 'var(--font-family)',
          }}
        >
          {title}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* ساعة وتاريخ النظام الحية */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-muted)',
            backgroundColor: '#161B22',
            padding: '5px 12px',
            borderRadius: 20,
            border: '1px solid #262E3D',
          }}
        >
          <AppIcon name="schedule" size={15} color="#FFB800" />
          <span style={{ fontFamily: 'var(--font-family)', color: '#CBD5E1' }}>{currentTime}</span>
        </div>

        {/* زر قفل الشاشة السريع */}
        <button
          type="button"
          onClick={handleManualLock}
          className="btn btn-secondary"
          style={{
            height: 36,
            padding: '0 14px',
            fontSize: 13,
            gap: 8,
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          <AppIcon name="lock" size={15} />
          <span>قفل الشاشة</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
