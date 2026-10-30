import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SafeUser, CreateUserInput, UpdateUserInput } from '../../../shared/types/users.types';
import { USER_ROLES, UserRole, ROLE_LABELS } from '../../../shared/constants/roles';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
  initialUser?: SafeUser | null;
}

export function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialUser,
}: UserFormModalProps): React.ReactElement | null {
  const isEditing = Boolean(initialUser);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>(USER_ROLES.CASHIER);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialUser) {
      setDisplayName(initialUser.display_name);
      setUsername(initialUser.username);
      setRole(initialUser.role);
      setPassword('');
      setPin('');
    } else {
      setDisplayName('');
      setUsername('');
      setRole(USER_ROLES.CASHIER);
      setPassword('');
      setPin('');
    }
    setError(null);
  }, [initialUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('الاسم الظاهر مطلوب');
      return;
    }

    if (!isEditing && !username.trim()) {
      setError('اسم المستخدم مطلوب');
      return;
    }

    if (!isEditing && (!password || password.length < 4)) {
      setError('كلمة المرور يجب ألا تقل عن 4 أحرف');
      return;
    }

    if (pin && !/^\d{4}$/.test(pin.trim())) {
      setError('رمز PIN يجب أن يتكون من 4 أرقام بالضبط');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        const updateData: UpdateUserInput = {
          display_name: displayName.trim(),
          role,
        };
        if (password.trim()) updateData.password = password.trim();
        if (pin.trim()) updateData.pin = pin.trim();
        await onSubmit(updateData);
      } else {
        const createData: CreateUserInput = {
          display_name: displayName.trim(),
          username: username.trim(),
          role,
          password: password.trim(),
          pin: pin.trim() || null,
        };
        await onSubmit(createData);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ المستخدم');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, direction: 'rtl' }}>
        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#DC2626',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
            الاسم الظاهر (الاسم بالكامل) *
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="مثال: أحمد محمود (فني صيانة أو كاشير)"
            required
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1.5px solid #262E3D',
              fontSize: 14,
              boxSizing: 'border-box',
              backgroundColor: '#0B0E14',
              color: '#F8FAFC',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
            اسم المستخدم لتسجيل الدخول *
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="مثال: ahmed_pos"
            disabled={isEditing}
            required={!isEditing}
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1.5px solid #262E3D',
              fontSize: 14,
              boxSizing: 'border-box',
              backgroundColor: isEditing ? '#161B22' : '#0B0E14',
              color: isEditing ? '#94A3B8' : '#F8FAFC',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
            الدور والصلاحيات *
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1.5px solid #262E3D',
              fontSize: 14,
              boxSizing: 'border-box',
              backgroundColor: '#0B0E14',
              color: '#F8FAFC',
            }}
          >
            <option value={USER_ROLES.CASHIER}>كاشير (واجهة البيع السريع والوردية)</option>
            <option value={USER_ROLES.MANAGER}>مدير (إشراف تشغيلي واعتماد الخصومات)</option>
            <option value={USER_ROLES.OWNER}>مالك (الصلاحيات الكاملة والأرباح والنسخ)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
            {isEditing ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required={!isEditing}
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1.5px solid #262E3D',
              fontSize: 14,
              boxSizing: 'border-box',
              backgroundColor: '#0B0E14',
              color: '#F8FAFC',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
            رمز الـ PIN للدخول السريع والتفويض (4 أرقام)
          </label>
          <input
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="مثال: 1234"
            maxLength={4}
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1.5px solid #262E3D',
              fontSize: 14,
              boxSizing: 'border-box',
              backgroundColor: '#0B0E14',
              color: '#FFB800',
              fontWeight: 700,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <Button variant="primary" type="submit" disabled={isSubmitting} style={{ flex: 1, height: 42 }}>
            {isSubmitting ? 'جاري الحفظ...' : isEditing ? 'حفظ التعديلات' : 'إضافة المستخدم'}
          </Button>
          <Button variant="secondary" type="button" onClick={onClose} style={{ width: 90, height: 42 }}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}
