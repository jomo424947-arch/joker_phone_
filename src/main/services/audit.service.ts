/**
 * خدمة سجل الرقابة والتدقيق الأمني (Audit Log Service)
 * تسجل جميع العمليات الحساسة في جدول audit_log (Append-Only)
 * وتوفر استعلامات الفلترة والتتبع والتصدير
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';

export interface AuditLogEntry {
  userId: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: any;
}

export interface AuditLogRecord {
  id: number;
  userId: number;
  username?: string;
  displayName?: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditFilterOptions {
  userId?: number;
  action?: string;
  entityType?: string;
  startDate?: string; // YYYY-MM-DD or ISO
  endDate?: string;   // YYYY-MM-DD or ISO
  limit?: number;
  offset?: number;
}

export class AuditService {
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * تسجيل عملية في سجل التدقيق (Append-Only)
   */
  log(entry: AuditLogEntry, txDb?: Database.Database): void {
    const db = txDb ?? this.getDb();

    try {
      let targetUserId: number | undefined = entry.userId;
      if (targetUserId && targetUserId > 0) {
        const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
        if (!exists) {
          targetUserId = undefined;
        }
      }

      if (!targetUserId || targetUserId <= 0) {
        const u = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as
          | { id: number }
          | undefined;
        if (u) {
          targetUserId = u.id;
        } else {
          try {
            db.prepare(`
              INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, is_active, created_at)
              VALUES (1, 'system', 'system', 'النظام', 'admin', 1, datetime('now'))
            `).run();
            targetUserId = 1;
          } catch {
            return;
          }
        }
      }

      const stmt = db.prepare(`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        targetUserId,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.details ? JSON.stringify(entry.details) : null
      );
    } catch {
      // سجل التدقيق الرقابي لا يجب أن يوقف المعاملة في حال حدوث أي خطأ غير متوقع
      return;
    }
  }

  /**
   * جلب سجلات التدقيق مع الفلترة والتقسيم لصفحات (Pagination)
   */
  listLogs(filters?: AuditFilterOptions): { logs: AuditLogRecord[]; total: number } {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.userId) {
      conditions.push('a.user_id = ?');
      params.push(filters.userId);
    }

    if (filters?.action) {
      conditions.push('a.action LIKE ?');
      params.push(`%${filters.action}%`);
    }

    if (filters?.entityType) {
      conditions.push('a.entity_type = ?');
      params.push(filters.entityType);
    }

    if (filters?.startDate) {
      conditions.push('date(a.created_at) >= date(?)');
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('date(a.created_at) <= date(?)');
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // إجمالي السجلات المطابقة
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM audit_log a ${whereClause}`).get(...params) as {
      count: number;
    };
    const total = countRow.count;

    // استعلام البيانات مع بيانات المستخدم
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 50;
    const offset = filters?.offset && filters.offset >= 0 ? filters.offset : 0;

    const rows = db
      .prepare(`
        SELECT
          a.id,
          a.user_id,
          u.username,
          u.display_name,
          a.action,
          a.entity_type,
          a.entity_id,
          a.details,
          a.created_at
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        ${whereClause}
        ORDER BY a.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const logs: AuditLogRecord[] = rows.map((r) => {
      let parsedDetails: Record<string, unknown> | null = null;
      if (r.details) {
        try {
          parsedDetails = JSON.parse(r.details);
        } catch {
          parsedDetails = { raw: r.details };
        }
      }
      return {
        id: r.id,
        userId: r.user_id,
        username: r.username ?? 'غير معروف',
        displayName: r.display_name ?? 'غير معروف',
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: parsedDetails,
        createdAt: r.created_at,
      };
    });

    return { logs, total };
  }

  /**
   * تصدير سجلات التدقيق إلى ملف نصي CSV متوافق مع Excel (BOM UTF-8)
   */
  exportToCSV(filters?: AuditFilterOptions): string {
    const { logs } = this.listLogs({ ...filters, limit: 5000, offset: 0 });

    const header = ['المعرف', 'اسم المستخدم', 'الاسم', 'نوع الحدث', 'الكيان', 'معرف الكيان', 'التفاصيل', 'التاريخ والوقت'];
    const rows = logs.map((l) => [
      l.id,
      `"${l.username || ''}"`,
      `"${l.displayName || ''}"`,
      `"${l.action || ''}"`,
      `"${l.entityType || ''}"`,
      l.entityId ?? '',
      `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
      `"${l.createdAt}"`,
    ]);

    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    return '\uFEFF' + csvContent;
  }
}

export const auditService = new AuditService();
