import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import type { NavTab } from '../../App';
import { SafeUser } from '../../../shared/types/users.types';
import { sounds } from '../../lib/sounds';

interface MainLayoutProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentUser?: SafeUser | null;
  onLogout?: () => void;
  children: React.ReactNode;
}

const tabTitles: Record<NavTab, string> = {
  pos: 'شاشة البيع ونقطة الكاشير',
  invoices: 'سجل فواتير المبيعات والعمليات',
  repairs: 'قسم الصيانة وورشة الهواتف الذكية',
  customers: 'إدارة العملاء وحسابات الآجل وسندات القبض',
  products: 'إدارة المنتجات والأصناف والباركود',
  inventory: 'إدارة المخزون وتواريخ الصلاحية والضمان',
  purchases: 'المشتريات وفواتير الموردين',
  returns: 'المرتجعات واستبدال المنتجات',
  cash: 'الخزنة وإدارة الورديات والمصروفات',
  reports: 'التقارير والإحصائيات ولوحة التحكم',
  settings: 'إعدادات النظام والمستخدمين والنسخ الاحتياطي',
  'db-inspector': 'مستكشف وفاحص قواعد البيانات SQLite',
};

const hotkeyMap: Record<string, NavTab> = {
  F1: 'pos',
  F2: 'invoices',
  F3: 'products',
  F4: 'inventory',
  F5: 'purchases',
  F6: 'returns',
  F7: 'cash',
  F8: 'reports',
  F9: 'settings',
};

export function MainLayout({
  activeTab,
  onSelectTab,
  currentUser,
  onLogout,
  children,
}: MainLayoutProps): React.ReactElement {
  // تفعيل اختصارات لوحة المفاتيح العامة (F1 - F8 للتبويب، F12 للقفل)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // تجنب تشويش الاختصارات أثناء إدخال نصوص في بعض الحقول إذا دعت الحاجة
      if (hotkeyMap[e.key]) {
        e.preventDefault();
        sounds.playClick();
        onSelectTab(hotkeyMap[e.key]);
      } else if (e.key === 'F12') {
        e.preventDefault();
        sounds.playWarning();
        const electron = (window as any).electron;
        electron?.lockScreen?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectTab]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-app)',
      }}
    >
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title={tabTitles[activeTab]} />

        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            backgroundColor: 'var(--bg-app)',
            position: 'relative',
          }}
        >
          {/* هالات الإضاءة الجمالية الناعمة المطابقة لصفحة تسجيل الدخول */}
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: -60,
              left: 120,
              width: 500,
              height: 500,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 149, 165, 0.08) 0%, transparent 70%)',
              filter: 'blur(75px)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              bottom: 40,
              right: 280,
              width: 460,
              height: 460,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 149, 165, 0.06) 0%, transparent 70%)',
              filter: 'blur(80px)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            {children}
          </div>
        </main>

        <StatusBar />
      </div>
    </div>
  );
}

export default MainLayout;
