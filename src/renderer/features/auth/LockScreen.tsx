import React, { useState, useEffect } from 'react';
import { Lock, User, AlertCircle, ArrowLeftRight, Delete } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { GlassIcon } from '../../components/common/GlassIcon';
import { SafeUser } from '../../../shared/types/users.types';
import { ROLE_LABELS } from '../../../shared/constants/roles';
import { sounds } from '../../lib/sounds';
import logoImg from '../../assets/logo.png';

interface LockScreenProps {
  currentUser: SafeUser;
  onUnlock: () => void;
  onSwitchUser: () => void;
}

export function LockScreen({ currentUser, onUnlock, onSwitchUser }: LockScreenProps): React.ReactElement {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // ساعة حية في شاشة القفل
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateStr = now.toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      setCurrentTime(`${timeStr} • ${dateStr}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // دعم لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        sounds.playClick();
        if (pin.length < 4) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setError(null);
          if (nextPin.length === 4) {
            handleUnlock(nextPin);
          }
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        sounds.playClick();
        setPin((prev) => prev.slice(0, -1));
        setError(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  const triggerError = (msg: string) => {
    sounds.playError();
    setError(msg);
    setIsShaking(true);
    setPin('');
    setTimeout(() => setIsShaking(false), 400);
  };

  const handleDigit = (digit: string) => {
    sounds.playClick();
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 4) {
        handleUnlock(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    sounds.playClick();
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    sounds.playClick();
    setPin('');
    setError(null);
  };

  const handleUnlock = async (pinOverride?: string) => {
    const effectivePin = pinOverride || pin;
    if (!effectivePin || effectivePin.length !== 4) {
      triggerError('يرجى إدخال رمز PIN المكون من 4 أرقام');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const electron = (window as any).electron;
      if (!electron?.loginWithPin) {
        sounds.playSaleSuccess();
        onUnlock();
        return;
      }

      const res = await electron.loginWithPin(effectivePin);
      if (res?.success && (res.user?.id === currentUser.id || res.user)) {
        sounds.playSaleSuccess();
        await electron.unlockScreen?.();
        onUnlock();
      } else {
        triggerError('رمز PIN غير صحيح');
      }
    } catch (err: any) {
      triggerError(err.message || 'خطأ أثناء فتح القفل');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#0B0E14',
        backgroundImage: `
          radial-gradient(circle at 85% 15%, rgba(255, 184, 0, 0.12) 0%, transparent 48%),
          radial-gradient(circle at 15% 85%, rgba(255, 184, 0, 0.05) 0%, transparent 50%),
          #0B0E14
        `,
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl',
        color: '#F8FAFC',
        userSelect: 'none',
        padding: 20,
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
      }}
    >
      <div
        className={isShaking ? 'animate-shake' : 'animate-scale-in'}
        style={{
          width: '100%',
          maxWidth: 410,
          backgroundColor: '#161B22',
          borderRadius: 28,
          border: '1.5px solid rgba(255, 184, 0, 0.25)',
          boxShadow: `
            0 25px 60px -15px rgba(0, 0, 0, 0.7),
            0 12px 28px -6px rgba(0, 0, 0, 0.4),
            0 0 20px rgba(255, 184, 0, 0.1)
          `,
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* ساعة القفل */}
        <div
          style={{
            fontSize: 13,
            color: '#CBD5E1',
            fontWeight: 600,
            letterSpacing: '0.2px',
            backgroundColor: '#12161F',
            padding: '4px 14px',
            borderRadius: 20,
            border: '1.5px solid #262E3D',
          }}
        >
          {currentTime}
        </div>

        {/* Mobix Logo Badge with Lock Badge */}
        <div style={{ position: 'relative', marginTop: 2 }}>
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: '20px',
              padding: 2.5,
              background: 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)',
              boxShadow: '0 10px 24px -4px rgba(255, 184, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={logoImg}
              alt="شعار موبيكس"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '17px',
                objectFit: 'cover',
                backgroundColor: '#0B0E14',
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 26,
              height: 26,
              borderRadius: '50%',
              backgroundColor: '#FFB800',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              border: '2px solid #0B0E14',
            }}
          >
            <Lock size={13} color="#000000" strokeWidth={2.6} />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#FFFFFF' }}>
            موبيكس (Mobix) • الشاشة مقفلة
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#FFB800', fontWeight: 600 }}>
            أدخل رمز PIN لاستئناف العمل بالوردية
          </p>
        </div>

        {/* User Card */}
        <div
          style={{
            width: '100%',
            backgroundColor: '#12161F',
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            border: '1.5px solid #262E3D',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: '#1C222D',
                border: '1px solid #30394A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={16} color="#FFB800" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#FFFFFF' }}>{currentUser.display_name}</div>
              <div style={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 600 }}>
                {ROLE_LABELS[currentUser.role] || currentUser.role}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onSwitchUser();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: '#1C222D',
              border: '1.5px solid #30394A',
              borderRadius: 8,
              padding: '6px 10px',
              color: '#FFB800',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            <ArrowLeftRight size={13} />
            <span>تبديل</span>
          </button>
        </div>

        {error && (
          <div
            className="animate-slide-up"
            style={{
              width: '100%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1.5px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 10,
              padding: '8px 12px',
              color: '#F87171',
              fontSize: 12.5,
              fontWeight: 700,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <AlertCircle size={15} color="#EF4444" />
            <span>{error}</span>
          </div>
        )}

        {/* PIN Dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 18,
            height: 48,
            width: '100%',
            backgroundColor: '#12161F',
            borderRadius: 14,
            border: '1.5px solid #262E3D',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
          }}
        >
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = idx < pin.length;
            return (
              <div
                key={idx}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: isFilled
                    ? 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)'
                    : '#1C222D',
                  border: isFilled ? 'none' : '1.5px solid #475569',
                  boxShadow: isFilled
                    ? '0 0 12px rgba(255, 184, 0, 0.95), 0 2px 4px rgba(255, 149, 0, 0.4)'
                    : 'none',
                  transform: isFilled ? 'scale(1.25)' : 'scale(1)',
                  transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
            );
          })}
        </div>

        {/* Keypad */}
        <div
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              style={{
                height: 50,
                fontSize: 22,
                fontWeight: 700,
                borderRadius: 12,
                border: '1.5px solid #262E3D',
                backgroundColor: '#1C222D',
                color: '#F8FAFC',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#262E3D';
                e.currentTarget.style.borderColor = '#FFB800';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1C222D';
                e.currentTarget.style.borderColor = '#262E3D';
              }}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            style={{
              height: 50,
              fontSize: 13.5,
              fontWeight: 700,
              borderRadius: 12,
              border: '1.5px solid rgba(239, 68, 68, 0.35)',
              backgroundColor: '#1C222D',
              color: '#F87171',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.borderColor = '#EF4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1C222D';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
            }}
          >
            مسح
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            style={{
              height: 50,
              fontSize: 22,
              fontWeight: 700,
              borderRadius: 12,
              border: '1.5px solid #262E3D',
              backgroundColor: '#1C222D',
              color: '#F8FAFC',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#262E3D';
              e.currentTarget.style.borderColor = '#FFB800';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1C222D';
              e.currentTarget.style.borderColor = '#262E3D';
            }}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            style={{
              height: 50,
              fontSize: 19,
              fontWeight: 700,
              borderRadius: 12,
              border: '1.5px solid #262E3D',
              backgroundColor: '#1C222D',
              color: '#94A3B8',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#262E3D';
              e.currentTarget.style.borderColor = '#FFB800';
              e.currentTarget.style.color = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1C222D';
              e.currentTarget.style.borderColor = '#262E3D';
              e.currentTarget.style.color = '#94A3B8';
            }}
          >
            <Delete size={20} color="#94A3B8" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleUnlock()}
          disabled={isVerifying || pin.length !== 4}
          style={{
            width: '100%',
            height: 50,
            borderRadius: 14,
            border: 'none',
            background:
              pin.length === 4
                ? 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)'
                : '#1E2430',
            color: pin.length === 4 ? '#000000' : '#64748B',
            cursor: pin.length === 4 && !isVerifying ? 'pointer' : 'not-allowed',
            boxShadow:
              pin.length === 4
                ? '0 8px 24px -4px rgba(255, 184, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2)'
                : 'none',
            fontSize: 15.5,
            fontWeight: 700,
            marginTop: 4,
            transition: 'all 0.2s ease',
          }}
        >
          {isVerifying ? 'جاري التحقق...' : 'فتح الشاشة'}
        </button>
      </div>
    </div>
  );
}

export default LockScreen;
