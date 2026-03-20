import { Controller, BaseController, Get, UseMiddleware } from '@onebun/core';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { MetricsService } from './metrics.service';

@Controller('/api/metrics')
@UseMiddleware(ApiKeyMiddleware)
export class MetricsController extends BaseController {
  constructor(private metrics: MetricsService) {
    super();
  }

  @Get('/')
  getAll() {
    return this.success(this.metrics.getAll());
  }
}
