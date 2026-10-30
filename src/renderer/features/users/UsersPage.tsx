import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ShieldAlert,
  ShieldCheck,
  User,
  KeyRound,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { GlassIcon } from '../../components/common/GlassIcon';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { SafeUser, CreateUserInput, UpdateUserInput } from '../../../shared/types/users.types';
import { ROLE_LABELS, USER_ROLES } from '../../../shared/constants/roles';
import { UserFormModal } from './UserFormModal';
import { sounds } from '../../lib/sounds';
import { useToast } from '../../components/common/ToastContext';
import { MESSAGES } from '../../lib/messages';

export function UsersPage(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);

  // حالة تأكيد تعطيل/تفعيل المستخدم
  const [toggleUserTarget, setToggleUserTarget] = useState<SafeUser | null>(null);

  // حالة إعادة تعيين كلمة المرور
  const [resetPasswordUser, setResetPasswordUser] = useState<SafeUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (electron?.listUsers) {
        const res = await electron.listUsers();
        if (res?.success && Array.isArray(res.data)) {
          setUsers(res.data);
          return;
        }
      }
      setUsers([]);
    } catch (err: any) {
      toastError(err.message || 'خطأ أثناء جلب المستخدمين');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSaveUser = async (data: CreateUserInput | UpdateUserInput) => {
    const electron = (window as any).electron;
    if (editingUser) {
      if (electron?.updateUser) {
        const res = await electron.updateUser(editingUser.id, data);
        if (!res.success) throw new Error(res.error);
      }
      sounds.playSaleSuccess();
      toastSuccess('تم تحديث بيانات المستخدم بنجاح');
    } else {
      if (electron?.createUser) {
        const res = await electron.createUser(data);
        if (!res.success) throw new Error(res.error);
      }
      sounds.playSaleSuccess();
      toastSuccess(MESSAGES.USER_SAVED);
    }
    await fetchUsers();
  };

  const handleConfirmToggleActive = async () => {
    if (!toggleUserTarget) return;

    try {
      const electron = (window as any).electron;
      if (electron?.toggleUserActive) {
        const res = await electron.toggleUserActive(toggleUserTarget.id);
        if (!res.success) {
          toastError(res.error || 'فشلت العملية');
          return;
        }
      }
      sounds.playClick();
      toastSuccess('تم تغيير حالة نشاط المستخدم بنجاح');
      setToggleUserTarget(null);
      await fetchUsers();
    } catch (err: any) {
      toastError(err.message || 'خطأ أثناء تبديل الحالة');
    }
  };

  const handleUnlock = async (userId: number) => {
    try {
      const electron = (window as any).electron;
      if (electron?.unlockUser) {
        const res = await electron.unlockUser(userId);
        if (res.success) {
          sounds.playSaleSuccess();
          toastSuccess('تم فك تجميد الحساب بنجاح');
          await fetchUsers();
        } else {
          toastError(res.error || 'فشل فك التجميد');
        }
      }
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPassword.trim()) return;

    try {
      const electron = (window as any).electron;
      if (electron?.resetUserPassword) {
        const res = await electron.resetUserPassword(resetPasswordUser.id, newPassword.trim());
        if (!res.success) {
          toastError(res.error || 'فشلت إعادة التعيين');
          return;
        }
      }
      sounds.playSaleSuccess();
      toastSuccess(MESSAGES.PASSWORD_CHANGED);
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === USER_ROLES.OWNER) return <GlassIcon icon={ShieldAlert} size="xs" variant="gold" />;
    if (role === USER_ROLES.MANAGER) return <GlassIcon icon={ShieldCheck} size="xs" variant="brand" />;
    return <GlassIcon icon={User} size="xs" variant="primary" />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GlassIcon icon={Users} size="sm" variant="primary" />
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-brand-deep)', margin: 0 }}>
            إدارة مستخدمي النظام والصلاحيات
          </h3>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            sounds.playClick();
            setEditingUser(null);
            setIsModalOpen(true);
          }}
          style={{ height: 42, padding: '0 18px' }}
        >
          <Plus size={16} />
          <span>إضافة مستخدم جديد</span>
        </Button>
      </div>

      {/* جدول المستخدمين */}
      <div
        className="glass-card"
        style={{
          padding: 0,
          overflow: 'hidden',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          borderRadius: 14,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead>
            <tr style={{ background: '#1C222D', borderBottom: '1px solid #262E3D' }}>
              <th style={{ width: '6%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>#</th>
              <th style={{ width: '28%', padding: '12px 16px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الاسم الظاهر والبيانات</th>
              <th style={{ width: '20%', padding: '12px 16px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>اسم المستخدم (Login)</th>
              <th style={{ width: '18%', padding: '12px 16px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الدور والصلاحيات</th>
              <th style={{ width: '12%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الحالة</th>
              <th style={{ width: '16%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #262E3D' }}>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                  {idx + 1}
                </td>

                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {getRoleIcon(u.role)}
                    <div>
                      <div style={{ fontWeight: 700, color: '#F8FAFC', fontSize: 14 }}>
                        {u.display_name}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>
                        تاريخ الإنشاء: {u.created_at?.split('T')[0] || '2026-01-01'}
                      </div>
                    </div>
                  </div>
                </td>

                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#FFB800' }}>
                  {u.username}
                </td>

                <td style={{ padding: '12px 16px' }}>
                  <span className="badge badge-primary">
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>

                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  {u.is_active === 1 ? (
                    <span className="badge badge-success">نشط ومفعل</span>
                  ) : (
                    <span className="badge badge-danger">معطل</span>
                  )}
                </td>

                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setEditingUser(u);
                        setIsModalOpen(true);
                      }}
                      className="btn btn-secondary"
                      style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setResetPasswordUser(u);
                      }}
                      className="btn btn-secondary"
                      style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                      title="إعادة تعيين كلمة المرور"
                    >
                      كلمة المرور
                    </button>

                    {u.role !== USER_ROLES.OWNER && (
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playWarning();
                          setToggleUserTarget(u);
                        }}
                        className={`btn ${u.is_active === 1 ? 'btn-danger-outline' : 'btn-secondary'}`}
                        style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                      >
                        {u.is_active === 1 ? 'تعطيل' : 'تفعيل'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* نافذة إضافة أو تعديل مستخدم */}
      <UserFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveUser}
        initialUser={editingUser}
      />

      {/* نافذة إعادة تعيين كلمة المرور */}
      <Modal
        isOpen={Boolean(resetPasswordUser)}
        onClose={() => setResetPasswordUser(null)}
        title={`إعادة تعيين كلمة مرور: ${resetPasswordUser?.display_name || ''}`}
        width={420}
      >
        <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              كلمة المرور الجديدة *
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button type="submit" variant="primary" style={{ flex: 1, height: 42 }}>
              حفظ كلمة المرور الجديدة
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetPasswordUser(null)}
              style={{ width: 90, height: 42 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* تأكيد تعطيل أو تفعيل المستخدم */}
      <ConfirmDialog
        isOpen={Boolean(toggleUserTarget)}
        title={toggleUserTarget?.is_active === 1 ? 'تأكيد تعطيل حساب المستخدم' : 'تأكيد إعادة تفعيل الحساب'}
        message={
          toggleUserTarget?.is_active === 1
            ? `هل أنت متأكد من تعطيل حساب "${toggleUserTarget?.display_name}"؟ لن يتمكن من تسجيل الدخول إلى النظام حتى إعادة تفعيله.`
            : `هل أنت متأكد من إعادة تفعيل حساب "${toggleUserTarget?.display_name}"؟`
        }
        confirmLabel={toggleUserTarget?.is_active === 1 ? 'تعطيل الحساب' : 'إعادة التفعيل'}
        cancelLabel="تراجع"
        isDangerous={toggleUserTarget?.is_active === 1}
        onConfirm={handleConfirmToggleActive}
        onCancel={() => setToggleUserTarget(null)}
      />
    </div>
  );
}

export default UsersPage;
