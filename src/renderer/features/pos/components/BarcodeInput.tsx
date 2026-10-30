import React, { useRef, useEffect, useCallback } from 'react';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { AppIcon } from '../../../components/common/AppIcon';

interface BarcodeInputProps {
  onScan: (barcode: string) => void;
  isLoading?: boolean;
}

export function BarcodeInputComponent({ onScan, isLoading = false }: BarcodeInputProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT') &&
      activeEl !== inputRef.current
    ) {
      return;
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  // استعادة التركيز التلقائي عند النقر خارج الحقول المخصصة لضمان جاهزية السكانر دائماً
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.closest('.modal-container') ||
        target?.closest('.modal-backdrop') ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'BUTTON' ||
        target?.closest('button')
      ) {
        return;
      }
      focusInput();
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [focusInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = e.currentTarget.value.trim();
      if (val) {
        onScan(val);
        e.currentTarget.value = '';
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        backgroundColor: '#161B22',
        borderRadius: 14,
        padding: '6px 14px',
        border: '1.5px solid #262E3D',
        boxShadow: 'none',
        transition: 'all 0.2s ease',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <GlassIcon icon="qr_code_scanner" size="md" variant="gold" glow />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="امسح الباركود بالسكانر أو اكتب الكود واضغط Enter..."
          onKeyDown={handleKeyDown}
          // لا نقوم بتعطيل الحقل لمنع فقدان الأحرف أثناء المسح السريع المتتابع
          style={{
            width: '100%',
            height: 38,
            border: 'none',
            outline: 'none',
            fontSize: 15,
            fontWeight: 500,
            color: '#F8FAFC',
            fontFamily: 'var(--font-family)',
            background: 'transparent',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isLoading && (
          <div
            title="جاري المعالجة..."
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 184, 0, 0.2)',
              borderTopColor: '#FFB800',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
        <span
          className="kbd-badge"
          style={{
            backgroundColor: '#0B0E14',
            color: '#FFB800',
            borderColor: '#262E3D',
            height: 26,
            padding: '0 8px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'Space Grotesk, monospace',
            fontWeight: 700,
          }}
        >
          <AppIcon name="keyboard_return" size={13} color="#FFB800" />
          <span>Enter</span>
        </span>
      </div>
    </div>
  );
}

export const BarcodeInput = React.memo(BarcodeInputComponent);
export default BarcodeInput;
