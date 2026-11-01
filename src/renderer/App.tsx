import React, { useState, useEffect, useRef } from 'react';
import { ToastProvider } from './components/common/ToastContext';
import { UserProvider } from './lib/UserContext';
import { MainLayout } from './components/layout/MainLayout';
import { PosScreen } from './features/pos';
import { ProductsScreen } from './features/products';
import { InventoryScreen } from './features/inventory';
import { PurchasesScreen } from './features/purchases';
import { ReturnsScreen } from './features/returns';
import { CashScreen } from './features/cash';
import { ReportsScreen } from './features/reports';
import { SettingsScreen } from './features/settings';
import { InvoicesScreen } from './features/invoices';
import { DatabaseInspectorScreen } from './features/db-inspector';
import { RepairsScreen } from './features/repairs';
import { CustomersScreen } from './features/customers';
import { LoginPage, LockScreen, InitialSetupWizard } from './features/auth';
import { SafeUser } from '../shared/types/users.types';
import { Loader2 } from 'lucide-react';
import logoImg from './assets/logo.png';
import { api } from './lib/api';

export type NavTab =
  | 'pos'
  | 'invoices'
  | 'repairs'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'purchases'
  | 'returns'
  | 'cash'
  | 'reports'
  | 'settings'
  | 'db-inspector';

export function AppContent(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSetupCompleted, setIsSetupCompleted] = useState(true);

  const lastActivityReport = useRef(0);

  // إعادة التوجيه لشاشة البيع في حال كان التبويب المحدد هو المحافظ أو فاحص الداتا بيز
  useEffect(() => {
    if ((activeTab as string) === 'db-inspector' || (activeTab as string) === 'wallets') {
      setActiveTab('pos');
    }
  }, [activeTab]);

  // فحص الجلسة الحالية وحالة تهيئة النظام عند الإقلاع
  useEffect(() => {
    const checkInitialSession = async () => {
      try {
        if (api?.checkSetupStatus) {
          const setupRes = await api.checkSetupStatus();
          if (setupRes && (setupRes as any).success !== false) {
            setIsSetupCompleted((setupRes as any).isSetupCompleted);
          }
        }
        if (api?.getCurrentUser) {
          const res = await api.getCurrentUser();
          if (res?.success && (res as any).data) {
            setCurrentUser((res as any).data);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsInitializing(false);
      }
    };

    checkInitialSession();
  }, []);

  // الاستماع لأحداث القفل التلقائي من المعالج الرئيسي
  useEffect(() => {
    if (api?.onLockStateChanged) {
      const cleanup = api.onLockStateChanged((state: { isLocked: boolean }) => {
        setIsLocked(state.isLocked);
      });
      return cleanup;
    }
  }, []);

  // رصد نشاط المستخدم لإعادة ضبط مؤقت القفل التلقائي للخمول (Throttled كل 10 ثوانٍ)
  const reportActivity = () => {
    const now = Date.now();
    if (now - lastActivityReport.current > 10000) {
      lastActivityReport.current = now;
      api?.reportActivity?.();
    }
  };

  const handleLogout = async () => {
    try {
      await api?.logout?.();
    } finally {
      setCurrentUser(null);
      setIsLocked(false);
    }
  };

  if (isInitializing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          height: '100vh',
          backgroundColor: '#0B0E14',
          color: '#FFFFFF',
          fontSize: 16,
          fontWeight: 600,
          fontFamily: 'inherit',
          direction: 'rtl',
        }}
      >
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: '20px',
            padding: 3,
            background: 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)',
            boxShadow: '0 12px 32px -4px rgba(255, 184, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 6,
          }}
        >
          <img
            src={logoImg}
            alt="شعار موبيكس"
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '18px',
              objectFit: 'cover',
              backgroundColor: '#0B0E14',
            }}
          />
        </div>
        <Loader2 size={32} color="#FFB800" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontWeight: 700, color: '#F8FAFC', letterSpacing: '0.3px' }}>
          جاري تهيئة وتشغيل نظام موبيكس (Mobix)...
        </span>
      </div>
    );
  }

  // إذا لم يتم إعداد النظام لأول مرة، نعرض معالج الإعداد الأولي
  if (!isSetupCompleted) {
    return (
      <InitialSetupWizard
        onSetupComplete={(user) => {
          setCurrentUser(user);
          setIsSetupCompleted(true);
          setIsLocked(false);
        }}
      />
    );
  }

  // إذا لم يكن هناك مستخدم مسجل الدخول، نعرض شاشة تسجيل الدخول
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsLocked(false);
        }}
      />
    );
  }

  return (
    <UserProvider
      value={{
        currentUser,
        setCurrentUser,
        logout: handleLogout,
        lockScreen: () => {
          api?.lockScreen?.();
        },
      }}
    >
      <div
        onKeyDown={reportActivity}
        onClick={reportActivity}
        onMouseMove={reportActivity}
        style={{ height: '100%', width: '100%' }}
      >
        {/* شاشة القفل عند الخمول */}
        {isLocked && (
          <LockScreen
            currentUser={currentUser}
            onUnlock={() => setIsLocked(false)}
            onSwitchUser={handleLogout}
          />
        )}

        <MainLayout
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentUser={currentUser}
          onLogout={handleLogout}
        >
          {activeTab === 'pos' && <PosScreen />}
          {activeTab === 'invoices' && <InvoicesScreen />}
          {activeTab === 'repairs' && <RepairsScreen />}
          {activeTab === 'customers' && <CustomersScreen />}
          {activeTab === 'products' && <ProductsScreen />}
          {activeTab === 'inventory' && <InventoryScreen />}
          {activeTab === 'purchases' && <PurchasesScreen />}
          {activeTab === 'returns' && <ReturnsScreen />}
          {activeTab === 'cash' && <CashScreen />}
          {activeTab === 'reports' && <ReportsScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
          {activeTab === 'db-inspector' && <DatabaseInspectorScreen />}
        </MainLayout>
      </div>
    </UserProvider>
  );
}

export function App(): React.ReactElement {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
