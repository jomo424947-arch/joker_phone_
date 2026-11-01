import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  KeyRound,
  User,
  Lock,
  AlertCircle,
  Delete,
  Users,
  Crown,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { SafeUser } from '../../../shared/types/users.types';
import { UserRole, ROLE_LABELS } from '../../../shared/constants/roles';
import { sounds } from '../../lib/sounds';
import logoImg from '../../assets/logo.png';

export interface LoginUserSummary {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  has_pin: boolean;
}

interface LoginPageProps {
  onLoginSuccess: (user: SafeUser) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps): React.ReactElement {
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // قائمة الحسابات المسجلة على هذا الجهاز
  const [availableUsers, setAvailableUsers] = useState<LoginUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<LoginUserSummary | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // جلب المستخدمين المسجلين على هذا الجهاز عند بدء التشغيل
  useEffect(() => {
    let isMounted = true;
    const fetchUsers = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.getLoginUsers) {
          const users: LoginUserSummary[] = await electron.getLoginUsers();
          if (isMounted && Array.isArray(users)) {
            setAvailableUsers(users);
            if (users.length > 0) {
              // تحديد أول مستخدم يمتلك PIN تلقائياً أو أول مستخدم
              const defaultUser = users.find((u) => u.has_pin) || users[0];
              setSelectedUser(defaultUser);
              if (defaultUser) {
                setUsername(defaultUser.username);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load login users', err);
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    };

    fetchUsers();
    return () => {
      isMounted = false;
    };
  }, []);

  // اختيار مستخدم
  const handleSelectUser = (user: LoginUserSummary) => {
    sounds.playClick();
    setSelectedUser(user);
    setPin('');
    setError(null);
    setUsername(user.username);
    if (mode === 'pin' && !user.has_pin) {
      triggerError('هذا الحساب لم يتم تعيين رمز PIN له، يرجى الدخول بكلمة المرور');
    }
  };

  // دعم لوحة المفاتيح المباشرة للـ PIN (أرقام 0-9، Enter، Backspace، Escape)
  useEffect(() => {
    if (mode !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        sounds.playClick();
        if (pin.length < 4) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setError(null);
          if (nextPin.length === 4) {
            handlePinSubmit(undefined, nextPin);
          }
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        sounds.playClick();
        setPin((prev) => prev.slice(0, -1));
        setError(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePinSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPin('');
        setError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, pin, selectedUser]);

  const triggerError = (msg: string) => {
    sounds.playError();
    setError(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const handlePinDigit = (digit: string) => {
    sounds.playClick();
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 4) {
        handlePinSubmit(undefined, nextPin);
      }
    }
  };

  const handlePinBackspace = () => {
    sounds.playClick();
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handlePinClear = () => {
    sounds.playClick();
    setPin('');
    setError(null);
  };

  const handlePinSubmit = async (e?: React.FormEvent, pinOverride?: string) => {
    if (e) e.preventDefault();
    const effectivePin = pinOverride || pin;
    if (!effectivePin || effectivePin.length !== 4) {
      triggerError('يرجى إدخال رمز PIN المكون من 4 أرقام');
      return;
    }

    if (selectedUser && !selectedUser.has_pin) {
      triggerError('هذا الحساب لم يتم تعيين رمز PIN له، يرجى تسجيل الدخول بكلمة المرور');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const electron = (window as any).electron;
      if (!electron?.loginWithPin) {
        // Fallback في بيئة المعاينة
        sounds.playSaleSuccess();
        onLoginSuccess({
          id: selectedUser?.id || 1,
          uuid: 'dev',
          username: selectedUser?.username || 'admin',
          display_name: selectedUser?.display_name || 'مدير المحل (افتراضي)',
          role: selectedUser?.role || 'owner',
          is_active: 1,
          created_at: new Date().toISOString(),
        });
        return;
      }

      const res = await electron.loginWithPin(effectivePin, selectedUser?.id);
      if (res?.success && res.user) {
        sounds.playSaleSuccess();
        onLoginSuccess(res.user);
      } else {
        triggerError(res?.error || 'رمز PIN غير صحيح، يرجى المحاولة ثانية');
        setPin('');
      }
    } catch (err: any) {
      triggerError(err.message || 'حدث خطأ أثناء الاتصال بالنظام');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      triggerError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const electron = (window as any).electron;
      if (!electron?.login) {
        sounds.playSaleSuccess();
        onLoginSuccess({
          id: 1,
          uuid: 'dev',
          username: 'admin',
          display_name: 'مدير المحل (افتراضي)',
          role: 'owner',
          is_active: 1,
          created_at: new Date().toISOString(),
        });
        return;
      }

      const res = await electron.login({ username: username.trim(), password });
      if (res?.success && res.user) {
        sounds.playSaleSuccess();
        onLoginSuccess(res.user);
      } else {
        triggerError(res?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (err: any) {
      triggerError(err.message || 'حدث خطأ أثناء التحقق من الحساب');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#0B0E14',
        backgroundImage: `
          radial-gradient(circle at 85% 15%, rgba(255, 184, 0, 0.12) 0%, transparent 48%),
          radial-gradient(circle at 15% 85%, rgba(255, 184, 0, 0.05) 0%, transparent 50%),
          #0B0E14
        `,
        color: '#F8FAFC',
        direction: 'rtl',
        padding: '24px 16px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
      }}
    >
      {/* هالات الإضاءة الجمالية في الخلفية (Ambient Aesthetics) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -90,
          right: -90,
          width: 440,
          height: 440,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 184, 0, 0.18) 0%, rgba(255, 184, 0, 0) 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -110,
          left: -110,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 184, 0, 0.1) 0%, rgba(255, 184, 0, 0) 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* البطاقة الرئيسية الفاخرة (Elevated Dark Cyber Card) */}
      <div
        className={isShaking ? 'animate-shake' : 'animate-scale-in'}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 460,
          maxHeight: '96vh',
          overflowY: 'auto',
          backgroundColor: '#161B22',
          borderRadius: 28,
          border: '1.5px solid rgba(255, 184, 0, 0.25)',
          boxShadow: `
            0 25px 60px -15px rgba(0, 0, 0, 0.7),
            0 12px 28px -6px rgba(0, 0, 0, 0.4),
            0 0 20px rgba(255, 184, 0, 0.1)
          `,
          padding: '26px 26px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: 10,
        }}
      >
        {/* رأس البطاقة وشعار موبيكس */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '20px',
              padding: 3,
              background: 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)',
              boxShadow: '0 12px 30px -4px rgba(255, 184, 0, 0.45)',
              margin: '0 auto 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
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

          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-0.3px',
              lineHeight: 1.3,
            }}
          >
            موبيكس • Mobix
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12.5,
              color: '#FFB800',
              fontWeight: 700,
            }}
          >
            شريكك الذكي لإدارة محلات الموبايلات
          </p>
        </div>

        {/* محول النمط الفاخر (Segmented Control Tabs) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#12161F',
            borderRadius: 14,
            padding: 5,
            gap: 6,
            border: '1.5px solid #262E3D',
          }}
        >
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMode('pin');
              setError(null);
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              border: mode === 'pin' ? '1px solid rgba(255, 184, 0, 0.35)' : '1px solid transparent',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: mode === 'pin' ? '#1C222D' : 'transparent',
              color: mode === 'pin' ? '#FFB800' : '#94A3B8',
              boxShadow: mode === 'pin' ? '0 3px 10px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(255, 184, 0, 0.2)' : 'none',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <KeyRound size={16} color={mode === 'pin' ? '#FFB800' : '#64748B'} strokeWidth={2.2} />
            <span>رمز PIN السريع (كاشير)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMode('password');
              setError(null);
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              border: mode === 'password' ? '1px solid rgba(255, 184, 0, 0.35)' : '1px solid transparent',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: mode === 'password' ? '#1C222D' : 'transparent',
              color: mode === 'password' ? '#FFB800' : '#94A3B8',
              boxShadow: mode === 'password' ? '0 3px 10px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(255, 184, 0, 0.2)' : 'none',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <User size={16} color={mode === 'password' ? '#FFB800' : '#64748B'} strokeWidth={2.2} />
            <span>اسم المستخدم (إدارة)</span>
          </button>
        </div>

        {/* قائمة الحسابات المسجلة على هذا الجهاز (Device Registered Accounts Switcher) */}
        {availableUsers.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 2,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 2px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#F8FAFC',
                }}
              >
                <Users size={15} color="#FFB800" />
                <span>اختر الحساب المسجل:</span>
              </div>
              {selectedUser && (
                <span
                  style={{
                    fontSize: 11.5,
                    color: '#94A3B8',
                    fontWeight: 600,
                  }}
                >
                  المحدد: <strong style={{ color: '#FFB800' }}>{selectedUser.display_name}</strong>
                </span>
              )}
            </div>

            {/* شريط بطاقات الحسابات التفاعلي */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: availableUsers.length > 3 ? 'auto' : 'hidden',
                padding: '3px 2px 7px',
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {availableUsers.map((user) => {
                const isSelected = selectedUser?.id === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    style={{
                      flex: availableUsers.length <= 3 ? 1 : '0 0 115px',
                      minWidth: availableUsers.length <= 3 ? 0 : 115,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '10px 6px',
                      borderRadius: 14,
                      border: isSelected
                        ? '2px solid #FFB800'
                        : '1.5px solid #262E3D',
                      backgroundColor: isSelected ? '#1C222D' : '#12161F',
                      boxShadow: isSelected
                        ? '0 4px 12px rgba(255, 184, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.4)'
                        : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                      outline: 'none',
                      position: 'relative',
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#FFB800';
                        e.currentTarget.style.backgroundColor = '#1C222D';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#262E3D';
                        e.currentTarget.style.backgroundColor = '#12161F';
                      }
                    }}
                  >
                    {/* علامة الاختيار النشط */}
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 5,
                          left: 5,
                          width: 17,
                          height: 17,
                          borderRadius: '50%',
                          backgroundColor: '#FFB800',
                          color: '#000000',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(255, 184, 0, 0.4)',
                        }}
                      >
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}

                    {/* أيقونة الأفاتار بحسب دور المستخدم */}
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background:
                          user.role === 'owner'
                            ? 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)'
                            : user.role === 'manager'
                              ? 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)'
                              : 'linear-gradient(135deg, #FBBF24 0%, #D97706 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 5,
                        boxShadow: isSelected
                          ? '0 3px 8px rgba(255, 184, 0, 0.35)'
                          : '0 2px 4px rgba(0, 0, 0, 0.3)',
                        color: '#000000',
                      }}
                    >
                      {user.role === 'owner' && <Crown size={18} strokeWidth={2.2} />}
                      {user.role === 'manager' && <ShieldCheck size={18} strokeWidth={2.2} />}
                      {user.role === 'cashier' && <User size={18} strokeWidth={2.2} />}
                    </div>

                    {/* اسم الحساب */}
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: isSelected ? '#FFFFFF' : '#CBD5E1',
                        textAlign: 'center',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        padding: '0 4px',
                      }}
                      title={user.display_name}
                    >
                      {user.display_name}
                    </span>

                    {/* دور الحساب وحالة الـ PIN */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        marginTop: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 6,
                          backgroundColor: isSelected ? 'rgba(255, 184, 0, 0.2)' : '#1E2430',
                          color: isSelected ? '#FFB800' : '#94A3B8',
                        }}
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>

                      {!user.has_pin && (
                        <span
                          title="يتطلب كلمة مرور"
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 4px',
                            borderRadius: 4,
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            color: '#FBBF24',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          <Lock size={8} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* شريط رسالة الخطأ (Alert Banner) */}
        {error && (
          <div
            className="animate-slide-up"
            style={{
              backgroundColor: '#FFF1F2',
              border: '1.5px solid #FECDD3',
              borderRadius: 12,
              padding: '10px 14px',
              color: '#BE123C',
              fontSize: 13.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <AlertCircle size={18} color="#E11D48" />
            <span>{error}</span>
          </div>
        )}

        {/* نمط إدخال رمز الـ PIN (PIN Keypad Mode) */}
        {mode === 'pin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* شريط نقاط الـ PIN المضيئة (Luminous Gold Dots) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 20,
                height: 56,
                backgroundColor: '#12161F',
                borderRadius: 16,
                border: '1.5px solid #262E3D',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
              }}
            >
              {[0, 1, 2, 3].map((index) => {
                const isFilled = index < pin.length;
                return (
                  <div
                    key={index}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: isFilled
                        ? 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)'
                        : '#1C222D',
                      border: isFilled ? 'none' : '1.5px solid #475569',
                      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transform: isFilled ? 'scale(1.28)' : 'scale(1)',
                      boxShadow: isFilled
                        ? '0 0 14px rgba(255, 184, 0, 0.95), 0 2px 6px rgba(255, 149, 0, 0.45)'
                        : 'none',
                    }}
                  />
                );
              })}
            </div>

            {/* لوحة المفاتيح التفاعلية (Tactile High-Contrast Keypad) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinDigit(digit)}
                  style={{
                    height: 56,
                    fontSize: 24,
                    fontWeight: 700,
                    borderRadius: 14,
                    border: '1.5px solid #262E3D',
                    backgroundColor: '#1C222D',
                    color: '#F8FAFC',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#262E3D';
                    e.currentTarget.style.borderColor = '#FFB800';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(255, 184, 0, 0.28)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1C222D';
                    e.currentTarget.style.borderColor = '#262E3D';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'scale(0.95)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                >
                  {digit}
                </button>
              ))}

              {/* زر المسح الشامل (Clear) */}
              <button
                type="button"
                onClick={handlePinClear}
                style={{
                  height: 56,
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 14,
                  border: '1.5px solid rgba(239, 68, 68, 0.35)',
                  backgroundColor: '#1C222D',
                  color: '#F87171',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.borderColor = '#EF4444';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(239, 68, 68, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1C222D';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
              >
                مسح
              </button>

              {/* الصفر (0) */}
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                style={{
                  height: 56,
                  fontSize: 24,
                  fontWeight: 700,
                  borderRadius: 14,
                  border: '1.5px solid #262E3D',
                  backgroundColor: '#1C222D',
                  color: '#F8FAFC',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#262E3D';
                  e.currentTarget.style.borderColor = '#FFB800';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(255, 184, 0, 0.28)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1C222D';
                  e.currentTarget.style.borderColor = '#262E3D';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
              >
                0
              </button>

              {/* زر حذف رقم واحد (Backspace) */}
              <button
                type="button"
                onClick={handlePinBackspace}
                aria-label="مسح خانة واحدة"
                style={{
                  height: 56,
                  fontSize: 21,
                  fontWeight: 700,
                  borderRadius: 14,
                  border: '1.5px solid #262E3D',
                  backgroundColor: '#1C222D',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#262E3D';
                  e.currentTarget.style.borderColor = '#FFB800';
                  e.currentTarget.style.color = '#F8FAFC';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(255, 184, 0, 0.28)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1C222D';
                  e.currentTarget.style.borderColor = '#262E3D';
                  e.currentTarget.style.color = '#94A3B8';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
              >
                <Delete size={20} color="#94A3B8" />
              </button>
            </div>

            {/* الزر الرئيسي لدخول الوردية (Cyber Gold CTA) */}
            <button
              type="button"
              onClick={() => handlePinSubmit()}
              disabled={isLoading || pin.length !== 4}
              style={{
                height: 52,
                fontSize: 16,
                fontWeight: 700,
                marginTop: 4,
                borderRadius: 14,
                border: 'none',
                background:
                  pin.length === 4
                    ? 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)'
                    : '#1E2430',
                color: pin.length === 4 ? '#000000' : '#64748B',
                cursor: pin.length === 4 && !isLoading ? 'pointer' : 'not-allowed',
                boxShadow:
                  pin.length === 4
                    ? '0 8px 24px -4px rgba(255, 184, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2)'
                    : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (pin.length === 4 && !isLoading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 28px -4px rgba(255, 184, 0, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (pin.length === 4 && !isLoading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 8px 24px -4px rgba(255, 184, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              {isLoading
                ? 'جاري التحقق...'
                : selectedUser
                  ? `دخول الوردية (${selectedUser.display_name})`
                  : 'دخول الوردية'}
            </button>
          </div>
        )}

        {/* نمط اسم المستخدم وكلمة المرور (Username & Password Form Mode) */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13.5,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: '#F8FAFC',
                }}
              >
                اسم المستخدم
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  autoFocus
                  style={{
                    width: '100%',
                    height: 48,
                    padding: '0 42px 0 14px',
                    borderRadius: 12,
                    border: '1.5px solid #30394A',
                    backgroundColor: '#12161F',
                    color: '#F8FAFC',
                    fontSize: 15,
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'all 0.18s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#FFB800';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 184, 0, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#30394A';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <User
                  size={18}
                  color="#94A3B8"
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13.5,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: '#F8FAFC',
                }}
              >
                كلمة المرور
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    height: 48,
                    padding: '0 42px 0 14px',
                    borderRadius: 12,
                    border: '1.5px solid #30394A',
                    backgroundColor: '#12161F',
                    color: '#F8FAFC',
                    fontSize: 15,
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'all 0.18s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#FFB800';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 184, 0, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#30394A';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <Lock
                  size={18}
                  color="#94A3B8"
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password}
              style={{
                height: 52,
                fontSize: 16,
                fontWeight: 700,
                marginTop: 6,
                borderRadius: 14,
                border: 'none',
                background:
                  username.trim() && password
                    ? 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)'
                    : '#1E2430',
                color: username.trim() && password ? '#000000' : '#64748B',
                cursor: username.trim() && password && !isLoading ? 'pointer' : 'not-allowed',
                boxShadow:
                  username.trim() && password
                    ? '0 8px 24px -4px rgba(255, 184, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2)'
                    : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (username.trim() && password && !isLoading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 28px -4px rgba(255, 184, 0, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (username.trim() && password && !isLoading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 8px 24px -4px rgba(255, 184, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              {isLoading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginPage;

