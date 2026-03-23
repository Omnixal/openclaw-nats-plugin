import {
  Controller, Get, Query,
  BaseController,
  type OneBunResponse,
} from '@onebun/core';
import { LogService } from './log.service';

@Controller('/api/logs')
export class LogController extends BaseController {
  constructor(private logService: LogService) {
    super();
  }

  @Get()
  async getLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('success') successStr?: string,
    @Query('action') action?: string,
    @Query('subject') subjectLike?: string,
  ): Promise<OneBunResponse> {
    if (!entityType || !entityId) {
      return this.error('entityType and entityId are required', 400, 400);
    }

    const limit = Math.min(Number(limitStr) || 50, 200);
    const offset = Number(offsetStr) || 0;
    const success = successStr === 'true' ? true : successStr === 'false' ? false : undefined;

    const result = await this.logService.getLogsForEntity(entityType, entityId, {
      limit,
      offset,
      success,
      action: action || undefined,
      subjectLike: subjectLike || undefined,
    });
    return this.success(result);
  }

  @Get('/recent')
  async getRecentLogs(
    @Query('limit') limitStr?: string,
  ): Promise<OneBunResponse> {
    const limit = Math.min(Number(limitStr) || 20, 100);
    const logs = await this.logService.getRecentLogs(limit);
    return this.success(logs);
  }
}
