/**
 * معالجات IPC لخدمات الصيانة والورشة (Repairs IPC Handlers)
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { repairsService } from '../../services/repairs.service';
import { sessionService } from '../../services/session.service';
import {
  CreateRepairOrderInput,
  DeliverRepairInput,
  UpdateRepairOrderInput,
  AddRepairPartInput,
  RepairFilterOptions,
  RepairStatus,
} from '../../../shared/types/repairs.types';

export function registerRepairsIpcHandlers(): void {
  // قائمة أوامر الصيانة
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_LIST,
    async (_event, filters?: RepairFilterOptions) => {
      try {
        const data = await repairsService.list(filters);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تفاصيل أمر صيانة
  ipcMain.handle(IPC_CHANNELS.REPAIRS_GET, async (_event, id: number) => {
    try {
      const data = await repairsService.getById(id);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // إنشاء أمر صيانة جديد
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_CREATE,
    async (
      _event,
      params: { input: CreateRepairOrderInput; userId: number; shiftId?: number }
    ) => {
      try {
        const actorUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await repairsService.create(params.input, actorUserId, params.shiftId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تحديث بيانات أمر صيانة
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_UPDATE,
    async (
      _event,
      params: { id: number; input: UpdateRepairOrderInput; userId: number }
    ) => {
      try {
        const actorUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await repairsService.update(params.id, params.input, actorUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تحديث حالة أمر الصيانة
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_UPDATE_STATUS,
    async (
      _event,
      params: { id: number; status: RepairStatus; userId: number; note?: string }
    ) => {
      try {
        const actorUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await repairsService.updateStatus(
          params.id,
          params.status,
          actorUserId,
          params.note
        );
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تسليم الجهاز والمحاسبة النهائية
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_DELIVER,
    async (
      _event,
      params: DeliverRepairInput
    ) => {
      try {
        const actorUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await repairsService.deliverAndSettle({ ...params, userId: actorUserId });
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // إضافة قطعة غيار
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_ADD_PART,
    async (
      _event,
      params: { input: AddRepairPartInput; userId: number }
    ) => {
      try {
        const actorUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await repairsService.addPart(params.input, actorUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // حذف قطعة غيار
  ipcMain.handle(
    IPC_CHANNELS.REPAIRS_REMOVE_PART,
    async (
      _event,
      params: { partId: number; userId: number }
    ) => {
      try {
        const actorUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await repairsService.removePart(params.partId, actorUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
