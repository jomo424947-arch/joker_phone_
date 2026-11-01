import React, { useState } from 'react';
import {
  Store,
  Phone,
  MapPin,
  User,
  Lock,
  KeyRound,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import { SafeUser } from '../../../shared/types/users.types';
import { sounds } from '../../lib/sounds';
import logoImg from '../../assets/logo.png';

interface InitialSetupWizardProps {
  onSetupComplete: (user: SafeUser) => void;
}

export function InitialSetupWizard({ onSetupComplete }: InitialSetupWizardProps): React.ReactElement {
  // بيانات المتجر
  const [storeName, setStoreName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');

  // بيانات حساب المالك
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');

  // حساب جوجل المعتمد لتفعيل وترخيص النسخة
  const [googleAccount, setGoogleAccount] = useState('');


  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const triggerError = (msg: string) => {
    sounds.playError();
    setError(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // التحقق من الحقول
    if (!storeName.trim()) {
      triggerError('يرجى إدخال اسم المتجر أو المحل');
      return;
    }
    if (!storePhone.trim()) {
      triggerError('يرجى إدخال رقم الهاتف للتواصل والفواتير');
      return;
    }
    if (!displayName.trim()) {
      triggerError('يرجى إدخال اسم المالك أو المدير');
      return;
    }
    if (!username.trim()) {
      triggerError('يرجى إدخال اسم مستخدم للدخول الإداري');
      return;
    }
    if (username.trim().length < 3) {
      triggerError('اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      triggerError('اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط بدون مسافات');
      return;
    }
    if (!password) {
      triggerError('يرجى إدخال كلمة المرور');
      return;
    }
    if (password.length < 6) {
      triggerError('كلمة المرور يجب أن تتكون من 6 خانات على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      triggerError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }
    if (!pin.trim()) {
      triggerError('يرجى إدخال رمز PIN السريع (للكاشير)');
      return;
    }
    if (!/^\d{4}$/.test(pin.trim())) {
      triggerError('رمز PIN يجب أن يتكون من 4 أرقام بالضبط');
      return;
    }
    const cleanGoogleAccount = googleAccount.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanGoogleAccount) {
      triggerError('يرجى إدخال حساب جوجل المعتمد (Gmail) لتنشيط النظام');
      return;
    }
    if (!emailRegex.test(cleanGoogleAccount)) {
      triggerError('يرجى إدخال حساب جوجل صحيح بصيغة بريد إلكتروني (مثال: name@gmail.com)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const electron = (window as any).electron;
      if (!electron?.completeInitialSetup) {
        // Fallback في المعاينة
        sounds.playSaleSuccess();
        onSetupComplete({
          id: 1,
          uuid: 'dev-owner',
          username: username.trim(),
          display_name: displayName.trim(),
          role: 'owner',
          is_active: 1,
          created_at: new Date().toISOString(),
        });
        return;
      }

      const res = await electron.completeInitialSetup({
        storeName: storeName.trim(),
        storePhone: storePhone.trim(),
        storeAddress: storeAddress.trim(),
        displayName: displayName.trim(),
        username: username.trim(),
        password,
        pin: pin.trim(),
        activationCode: cleanGoogleAccount,
        googleAccount: cleanGoogleAccount,
      });

      if (res?.success && res.user) {
        sounds.playSaleSuccess();
        onSetupComplete(res.user);
      } else {
        triggerError(res?.error || 'حدث خطأ أثناء حفظ الإعدادات، يرجى المحاولة ثانية');
      }
    } catch (err: any) {
      triggerError(err.message || 'حدث خطأ غير متوقع أثناء إعداد النظام');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        padding: '20px 16px 30px 16px',
        background: 'radial-gradient(circle at 50% 10%, #161B22 0%, #0B0E14 70%)',
        userSelect: 'none',
        fontFamily: 'var(--font-family, "Alexandria", sans-serif)',
        direction: 'rtl',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div
        className={isShaking ? 'shake' : ''}
        style={{
          width: '100%',
          maxWidth: 680,
          margin: 'auto',
          backgroundColor: '#161B22',
          borderRadius: 20,
          padding: '24px 28px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 184, 0, 0.25)',
          border: '1px solid #262E3D',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          position: 'relative',
          color: '#F8FAFC',
        }}
      >
        {/* الترويسة الرئيسية وشعار موبيكس */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: '16px',
              padding: 3,
              background: 'linear-gradient(135deg, #FFB800 0%, #D97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(255, 184, 0, 0.35)',
              marginBottom: 10,
            }}
          >
            <img
              src={logoImg}
              alt="موبيكس - Mobix"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '13px',
                objectFit: 'cover',
                backgroundColor: '#0B0E14',
              }}
            />
          </div>

          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: '#F8FAFC',
              margin: '0 0 4px 0',
              lineHeight: 1.25,
            }}
          >
            مرحباً بك في نظام موبيكس (Mobix) • تهيئة النظام لأول مرة
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: '#CBD5E1',
              margin: 0,
              maxWidth: 520,
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            يرجى إدخال بيانات متجرك وحساب المسؤول الرئيسي لبدء استخدام نظام إدارة محلات الهواتف والاكسسوارات والصيانة بأمان تام.
          </p>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setStoreName('موبيكس - شريكك الذكي لإدارة محلات الموبايلات');
              setStorePhone('01000000000');
              setStoreAddress('الفرع الرئيسي');
              setDisplayName('مدير موبيكس');
              setUsername('mobix_admin');
              setPassword('Mobix@Admin2026');
              setConfirmPassword('Mobix@Admin2026');
              setPin('7777');
              setGoogleAccount('mobix.store@gmail.com');
              setError(null);
            }}
            style={{
              marginTop: 10,
              background: 'rgba(255, 184, 0, 0.12)',
              border: '1.5px dashed #FFB800',
              borderRadius: 8,
              color: '#FFB800',
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 14px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            ⚡ تعبئة سريعة لبيانات متجر موبيكس (Mobix)
          </button>
        </div>

        {/* تنبيه الخطأ عند وجود خطأ بالمدخلات */}
        {error && (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#991B1B',
              fontSize: 12.5,
              fontWeight: 600,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {/* القسم 1: بيانات المتجر */}
          <div
            style={{
              backgroundColor: '#1C222D',
              borderRadius: 14,
              padding: '14px 18px',
              border: '1px solid #262E3D',
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#FFB800', fontWeight: 800, fontSize: 14 }}>
              <Store size={18} color="#FFB800" />
              <span>1. بيانات المتجر والنشاط</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                  اسم المتجر / المحل <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="مثال: موبيكس - Mobix"
                    autoFocus
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      borderRadius: 9,
                      border: '1.5px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      color: '#F8FAFC',
                      fontSize: 13.5,
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Store size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                  رقم الهاتف للتواصل <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    placeholder="مثال: 01012345678"
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      borderRadius: 9,
                      border: '1.5px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      color: '#F8FAFC',
                      fontSize: 13.5,
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Phone size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                عنوان المتجر أو الفرع (اختياري)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="مثال: شارع الجمهورية - الفرع الرئيسي"
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 36px 0 12px',
                    borderRadius: 9,
                    border: '1.5px solid #262E3D',
                    backgroundColor: '#0B0E14',
                    color: '#F8FAFC',
                    fontSize: 13.5,
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <MapPin size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
              </div>
            </div>
          </div>

          {/* القسم 2: حساب المالك الرئيسي */}
          <div
            style={{
              backgroundColor: '#1C222D',
              borderRadius: 14,
              padding: '14px 18px',
              border: '1px solid #262E3D',
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#FFB800', fontWeight: 800, fontSize: 14 }}>
              <User size={18} color="#FFB800" />
              <span>2. بيانات حساب المالك والمدير الرئيسي</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                  اسم المالك الشخصي <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="مثال: محمد أحمد"
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      borderRadius: 9,
                      border: '1.5px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      color: '#F8FAFC',
                      fontSize: 13.5,
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <User size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                  اسم المستخدم لتسجيل الدخول <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: admin"
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      borderRadius: 9,
                      border: '1.5px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      color: '#F8FAFC',
                      fontSize: 13.5,
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box',
                      direction: 'ltr',
                      textAlign: 'right',
                    }}
                  />
                  <User size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                  كلمة المرور الإدارية (6 خانات فأكثر) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      borderRadius: 9,
                      border: '1.5px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      color: '#F8FAFC',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Lock size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                  تأكيد كلمة المرور <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 36px 0 12px',
                      borderRadius: 9,
                      border: '1.5px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      color: '#F8FAFC',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Lock size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                رمز PIN السريع (4 أرقام للدخول السريع في الكاشير) <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="مثال: 1234"
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 36px 0 12px',
                    borderRadius: 9,
                    border: '1.5px solid #262E3D',
                    backgroundColor: '#0B0E14',
                    color: '#FFB800',
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: '4px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <KeyRound size={16} color="#FFB800" style={{ position: 'absolute', right: 11, top: 12 }} />
              </div>
              <span style={{ fontSize: 11.5, color: '#CBD5E1', marginTop: 4, display: 'block', fontWeight: 500 }}>
                يُستخدم رمز الـ PIN هذا لتسجيل الدخول السريع في نقاط البيع وتفويض الخصومات والعمليات الحساسة.
              </span>
            </div>
          </div>

          {/* القسم 3: تفعيل وترخيص النسخة بحساب جوجل المعتمد */}
          <div
            style={{
              backgroundColor: '#1C222D',
              borderRadius: 14,
              padding: '14px 18px',
              border: '1.5px solid #FFB800',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'linear-gradient(180deg, rgba(255, 184, 0, 0.08) 0%, rgba(28, 34, 45, 0.9) 100%)',
              boxShadow: '0 4px 20px rgba(255, 184, 0, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#FFB800', fontWeight: 800, fontSize: 14 }}>
                <ShieldCheck size={19} color="#FFB800" />
                <span>3. تفعيل وترخيص النسخة بحساب جوجل المعتمد</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  backgroundColor: '#FFB800',
                  color: '#000000',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                تفعيل فوري بدون أكواد
              </span>
            </div>

            <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
              أدخل حساب جوجل (Gmail) الذي قمت بتسليمه لإدارة النظام لإضافته لك. يتطلب التفعيل اتصالاً بالإنترنت لأول مرة فقط للتحقق من الحساب، ثم يعمل البرنامج بعد ذلك 100% بدون إنترنت مدى الحياة.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
                حساب جوجل المعتمد للترخيص (Google Account / Email) <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  value={googleAccount}
                  onChange={(e) => setGoogleAccount(e.target.value.trim().toLowerCase())}
                  placeholder="مثال: store.owner@gmail.com"
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '0 40px 0 16px',
                    borderRadius: 9,
                    border: '1.5px solid #FFB800',
                    backgroundColor: '#0B0E14',
                    color: '#FFB800',
                    fontSize: 14.5,
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    direction: 'ltr',
                    textAlign: 'left',
                  }}
                />
                <ShieldCheck size={18} color="#FFB800" style={{ position: 'absolute', right: 12, top: 12 }} />
              </div>
              <span style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 4, display: 'block' }}>
                💡 لا تحتاج لأي كود تفعيل؛ بمجرد أن يضيف المسؤول حسابك في لوحة التحكم، سيعمل برنامجك فوراً.
              </span>
            </div>
          </div>

          {/* زر الإنهاء وبدء الاستخدام */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              height: 46,
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
              color: '#000000',
              fontSize: 15.5,
              fontWeight: 800,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 6px 20px rgba(255, 184, 0, 0.45)',
              transition: 'all 0.18s ease',
              marginTop: 6,
            }}
          >
            {isLoading ? (
              <span>جاري حفظ التهيئة وتجهيز النظام...</span>
            ) : (
              <>
                <CheckCircle2 size={20} color="#000000" />
                <span>حفظ الإعدادات وبدء استخدام النظام</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default InitialSetupWizard;
