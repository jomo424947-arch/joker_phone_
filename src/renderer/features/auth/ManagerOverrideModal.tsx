import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertCircle, CheckCircle2, Delete } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { GlassIcon } from '../../components/common/GlassIcon';
import { Permission } from '../../../shared/constants/permissions';
import { sounds } from '../../lib/sounds';

interface ManagerOverrideModalProps {
  isOpen: boolean;
  title?: string;
  actionDescription?: string;
  permission: Permission;
  onApproved: (authorizerName: string) => void;
  onCancel: () => void;
}

export function ManagerOverrideModal({
  isOpen,
  title = 'موافقة وتفويض المدير (Manager Override)',
  actionDescription = 'يتطلب هذا الإجراء إدخال رمز PIN للمدير أو المالك للمتابعة.',
  permission,
  onApproved,
  onCancel,
}: ManagerOverrideModalProps): React.ReactElement | null {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    sounds.playWarning();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        sounds.playClick();
        if (pin.length < 4) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setError(null);
          if (nextPin.length === 4) {
            handleSubmit(nextPin);
          }
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        sounds.playClick();
        setPin((prev) => prev.slice(0, -1));
        setError(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin]);

  if (!isOpen) return null;

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
        handleSubmit(nextPin);
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

  const handleSubmit = async (pinOverride?: string) => {
    const effectivePin = pinOverride || pin;
    if (!effectivePin || effectivePin.length !== 4) {
      triggerError('يرجى إدخال رمز PIN المكون من 4 أرقام للمدير');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const electron = (window as any).electron;
      if (!electron?.requestOverride) {
        sounds.playSaleSuccess();
        onApproved('المدير (تجريبي)');
        return;
      }

      const res = await electron.requestOverride(permission, effectivePin);
      if (res?.success) {
        sounds.playSaleSuccess();
        onApproved(res.authorizedBy || 'المدير');
        setPin('');
      } else {
        triggerError(res?.error || 'رمز PIN غير صحيح أو لا يملك صلاحية التخطي');
      }
    } catch (err: any) {
      triggerError(err.message || 'حدث خطأ أثناء التحقق');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={<GlassIcon icon={ShieldAlert} size="sm" variant="gold" />}
      width={440}
    >
      <div
        className={isShaking ? 'animate-shake' : ''}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, direction: 'rtl' }}
      >
        <div
          style={{
            backgroundColor: '#FFF9EB',
            border: '1px solid #F5E2B5',
            borderRadius: 12,
            padding: '12px 14px',
            color: '#7A5A12',
            fontSize: 13,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ShieldAlert size={20} color="#C59B27" />
          <span>{actionDescription}</span>
        </div>

        {error && (
          <div
            className="animate-slide-up"
            style={{
              backgroundColor: 'var(--color-danger-bg)',
              border: '1px solid #F5C6CB',
              borderRadius: 10,
              padding: '10px 14px',
              color: 'var(--color-danger)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* PIN Display */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            height: 50,
            backgroundColor: '#0B0E14',
            borderRadius: 12,
            border: '1px solid #262E3D',
          }}
        >
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: idx < pin.length ? '#FFB800' : '#262E3D',
                transform: idx < pin.length ? 'scale(1.25)' : 'scale(1)',
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </div>

        {/* Keypad */}
        <div
          style={{
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
                height: 48,
                fontSize: 20,
                fontWeight: 700,
                borderRadius: 10,
                border: '1px solid #262E3D',
                backgroundColor: '#0B0E14',
                color: '#F8FAFC',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B0E14')}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            style={{
              height: 48,
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 10,
              border: '1px solid #EF4444',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              cursor: 'pointer',
            }}
          >
            مسح
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            style={{
              height: 48,
              fontSize: 20,
              fontWeight: 700,
              borderRadius: 10,
              border: '1px solid #262E3D',
              backgroundColor: '#0B0E14',
              color: '#F8FAFC',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B0E14')}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            style={{
              height: 48,
              fontSize: 18,
              fontWeight: 700,
              borderRadius: 10,
              border: '1px solid #262E3D',
              backgroundColor: '#0B0E14',
              color: '#CBD5E1',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B0E14')}
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={isVerifying || pin.length !== 4}
            isLoading={isVerifying}
            style={{ flex: 1, height: 44, fontSize: 14 }}
          >
            اعتماد وتفويض
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              sounds.playClick();
              onCancel();
            }}
            style={{ width: 100, height: 44 }}
          >
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ManagerOverrideModal;
