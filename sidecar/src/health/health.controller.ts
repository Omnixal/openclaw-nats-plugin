import { Controller, Get, BaseController, type OneBunResponse } from '@onebun/core';
import { HealthService } from './health.service';

@Controller('/api/health')
export class HealthController extends BaseController {
  constructor(private healthService: HealthService) {
    super();
  }

  @Get('/')
  async getHealth(): Promise<OneBunResponse> {
    const status = await this.healthService.getStatus();
    return this.success(status);
  }
}
