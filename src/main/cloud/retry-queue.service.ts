/**
 * طابور إعادة المحاولة للعمليات السحابية الفاشلة (Cloud Retry Queue)
 * يحفظ العمليات التي فشلت بسبب انقطاع الإنترنت ويعيد تنفيذها تلقائياً عند عودة الاتصال
 * مع تطبيق سياسة التراجع الأسي (Exponential Backoff)
 */

import fs from 'fs';
import path from 'path';

export interface QueuedTask {
  id: string;
  type: 'backup';
  payload?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
}

export class CloudRetryQueueService {
  private queueFilePath: string;
  private queue: QueuedTask[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private backupExecutor?: () => Promise<boolean>;

  constructor(customStorageDir?: string) {
    let dir = process.cwd();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      if (app && typeof app.getPath === 'function') {
        dir = app.getPath('userData');
      }
    } catch {
      // بيئة الاختبار
    }

    if (customStorageDir) {
      dir = customStorageDir;
    }

    this.queueFilePath = path.join(dir, 'cloud_retry_queue.json');
    this.loadQueue();
  }

  setBackupExecutor(fn: () => Promise<boolean>): void {
    this.backupExecutor = fn;
  }

  private loadQueue(): void {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const raw = fs.readFileSync(this.queueFilePath, 'utf-8');
        this.queue = JSON.parse(raw);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue(): void {
    try {
      const dir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.queueFilePath, JSON.stringify(this.queue, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[RetryQueue] تعذر حفظ ملف الطابور:', err);
    }
  }

  enqueue(type: 'backup', payload?: Record<string, unknown>): void {
    // تفادي تراكم مهام النسخ المتطابقة
    if (type === 'backup' && this.queue.some((t) => t.type === 'backup')) {
      return;
    }

    const task: QueuedTask = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: Date.now() + 60000, // المحاولة الأولى بعد دقيقة
    };

    this.queue.push(task);
    this.saveQueue();
    console.log(`[RetryQueue] تم إدراج مهمة ${type} في طابور إعادة المحاولة`);
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  startWorker(intervalMs: number = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processQueue().catch((err) => {
        console.warn('[RetryQueue] خطأ أثناء معالجة طابور المهام:', err);
      });
    }, intervalMs);
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const readyTasks = this.queue.filter((t) => t.nextAttemptAt <= now);

      for (const task of readyTasks) {
        if (task.type === 'backup' && this.backupExecutor) {
          try {
            const success = await this.backupExecutor();
            if (success) {
              this.queue = this.queue.filter((t) => t.id !== task.id);
              this.saveQueue();
              console.log(`[RetryQueue] نجحت إعادة محاولة مهمة النسخ ${task.id}`);
              continue;
            }
          } catch {
            // فشلت المحاولة
          }

          task.attempts += 1;
          // التراجع الأسي: 2m, 4m, 8m, 16m بحد أقصى ساعة
          const backoffMinutes = Math.min(60, Math.pow(2, task.attempts));
          task.nextAttemptAt = now + backoffMinutes * 60 * 1000;
          this.saveQueue();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const cloudRetryQueueService = new CloudRetryQueueService();

