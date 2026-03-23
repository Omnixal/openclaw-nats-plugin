import { Module } from '@onebun/core';
import { LogRepository } from './log.repository';
import { LogService } from './log.service';
import { LogController } from './log.controller';

@Module({
  controllers: [LogController],
  providers: [LogRepository, LogService],
  exports: [LogService],
})
export class LogModule {}
