import React, { useState, useEffect } from 'react';
import type { NavTab } from '../../App';
import { ROLE_LABELS } from '../../../shared/constants/roles';
import { SafeUser } from '../../../shared/types/users.types';
import { GlassIcon, GlassIconVariant } from '../common/GlassIcon';
import { AppIcon } from '../common/AppIcon';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { sounds } from '../../lib/sounds';
import logoImg from '../../assets/logo.png';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentUser?: SafeUser | null;
  onLogout?: () => void;
}

interface NavItemDef {
  id: NavTab;
  label: string;
  icon: string;
  variant: GlassIconVariant;
}

const navItems: NavItemDef[] = [
  { id: 'pos', label: 'شاشة البيع (POS)', icon: 'point_of_sale', variant: 'brand' },
  { id: 'invoices', label: 'سجل الفواتير', icon: 'receipt_long', variant: 'brand' },
  { id: 'repairs', label: 'الصيانة والورشة', icon: 'build', variant: 'brand' },
  { id: 'customers', label: 'العملاء والديون', icon: 'people', variant: 'brand' },
  { id: 'products', label: 'المنتجات والباركود', icon: 'sell', variant: 'brand' },
  { id: 'inventory', label: 'المخزون والضمان', icon: 'inventory_2', variant: 'brand' },
  { id: 'purchases', label: 'المشتريات والموردين', icon: 'local_shipping', variant: 'brand' },
  { id: 'returns', label: 'المرتجعات والبدائل', icon: 'assignment_return', variant: 'brand' },
  { id: 'cash', label: 'الخزنة والورديات', icon: 'payments', variant: 'brand' },
  { id: 'reports', label: 'التقارير والإحصائيات', icon: 'query_stats', variant: 'brand' },
  { id: 'settings', label: 'الإعدادات والمستخدمين', icon: 'settings', variant: 'brand' },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  currentUser: propUser,
  onLogout,
}: SidebarProps): React.ReactElement {
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(propUser || null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.getIsMuted());

  useEffect(() => {
    if (propUser) {
      setCurrentUser(propUser);
      return;
    }
    const fetchUser = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.getCurrentUser) {
          const res = await electron.getCurrentUser();
          if (res?.success && res.data) {
            setCurrentUser(res.data);
          }
        }
      } catch {
        // ignore
      }
    };
    fetchUser();
  }, [propUser]);

  const handleTabClick = (tabId: NavTab) => {
    sounds.playClick();
    onSelectTab(tabId);
  };

  const handleManualLock = async () => {
    sounds.playWarning();
    const electron = (window as any).electron;
    await electron?.lockScreen?.();
  };

  const handleConfirmLogout = async () => {
    sounds.playClick();
    setShowLogoutConfirm(false);
    if (onLogout) {
      onLogout();
    } else {
      const electron = (window as any).electron;
      await electron?.logout?.();
      window.location.reload();
    }
  };

  const handleToggleMute = () => {
    const next = sounds.toggleMute();
    setIsMuted(next);
    if (!next) {
      sounds.playClick();
    }
  };

  return (
    <>
      <aside
        className="glass-sidebar"
        style={{
          width: 270,
          backgroundColor: '#12161F',
          borderLeft: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          zIndex: 20,
          userSelect: 'none',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: '16px 16px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'linear-gradient(180deg, #161B22 0%, #12161F 100%)',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 48,
              height: 48,
              minWidth: 48,
              borderRadius: '12px',
              padding: 2,
              background: 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)',
              boxShadow: '0 4px 14px rgba(255, 184, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={logoImg}
              alt="شعار الجوكر فون"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '10px',
                objectFit: 'cover',
                backgroundColor: '#0B0E14',
              }}
            />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text-main)',
                margin: 0,
                lineHeight: 1.25,
                fontFamily: 'var(--font-family)',
                letterSpacing: '-0.2px',
              }}
            >
              الجوكر فون
            </h2>
            <span
              style={{
                fontSize: 11,
                color: '#FFB800',
                fontWeight: 600,
                display: 'block',
                marginTop: 2,
              }}
            >
              JOKER PHONE • هواتف وصيانة
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav
          style={{
            flex: 1,
            padding: '14px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            overflowY: 'auto',
          }}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  borderRight: isActive
                    ? '3px solid #FFB800'
                    : '3px solid transparent',
                  borderTop: '1px solid transparent',
                  borderBottom: '1px solid transparent',
                  borderLeft: '1px solid transparent',
                  background: isActive
                    ? 'linear-gradient(to left, rgba(255, 184, 0, 0.16) 0%, rgba(255, 184, 0, 0.02) 100%)'
                    : 'transparent',
                  color: isActive ? '#FFB800' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  textAlign: 'right',
                  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  fontFamily: 'var(--font-family)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#1C222D';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <GlassIcon
                  icon={item.icon}
                  size="sm"
                  variant={item.variant}
                  active={isActive}
                />
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Sound Toggle & System Tools Strip */}
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#141923',
          }}
        >
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            المؤثرات الصوتية
          </span>
          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'تشغيل المؤثرات الصوتية' : 'كتم المؤثرات الصوتية'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isMuted ? 'var(--color-danger)' : 'var(--color-primary)',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-family)',
            }}
          >
            <AppIcon name={isMuted ? 'volume_off' : 'volume_up'} size={17} />
            <span>{isMuted ? 'صامت' : 'مفعل'}</span>
          </button>
        </div>

        {/* User / Shift Footer & Security Actions */}
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border-light)',
            backgroundColor: '#161B22',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  fontFamily: 'var(--font-family)',
                }}
              >
                {currentUser?.display_name || 'كاشير المحل'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                {currentUser ? ROLE_LABELS[currentUser.role] : 'مستخدم نشط'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleManualLock}
                title="قفل الشاشة فورياً لحماية المحل (F12)"
                style={{
                  background: '#1C222D',
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#CBD5E1',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262E3D')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
              >
                <AppIcon name="lock" size={17} />
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                title="تسجيل الخروج"
                style={{
                  background: '#1C222D',
                  border: '1px solid rgba(220, 38, 38, 0.4)',
                  borderRadius: 8,
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--color-danger)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
              >
                <AppIcon name="logout" size={17} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* مودال تأكيد تسجيل الخروج */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="تأكيد تسجيل الخروج"
        message="هل أنت متأكد من رغبتك في تسجيل الخروج من النظام؟ سيتم إنهاء جلستك الحالية والعودة لشاشة الدخول."
        confirmLabel="تسجيل الخروج"
        cancelLabel="البقاء"
        isDangerous
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}

export default Sidebar;
