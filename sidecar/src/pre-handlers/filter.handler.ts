import { Service, BaseService } from '@onebun/core';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { PreHandler, PipelineContext } from './pre-handler.interface';

interface FilterRule {
  subjectPattern: string;
  action: 'pass' | 'drop';
  priority: number;
}

@Service()
export class FilterHandler extends BaseService implements PreHandler {
  name = 'filter';

  private rules: FilterRule[] = [];

  async handle(msg: NatsEventEnvelope, _ctx: PipelineContext): Promise<'pass' | 'drop'> {
    for (const rule of this.rules) {
      if (this.matchSubject(msg.subject, rule.subjectPattern)) {
        return rule.action;
      }
    }
    return 'pass'; // default: pass everything
  }

  matchSubject(subject: string, pattern: string): boolean {
    // NATS-style subject matching:
    // '*' matches a single token, '>' matches one or more tokens at the end
    const subjectParts = subject.split('.');
    const patternParts = pattern.split('.');
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '>') return true; // matches rest
      if (i >= subjectParts.length) return false;
      if (patternParts[i] === '*') continue; // matches single token
      if (patternParts[i] !== subjectParts[i]) return false;
    }
    return subjectParts.length === patternParts.length;
  }
}
