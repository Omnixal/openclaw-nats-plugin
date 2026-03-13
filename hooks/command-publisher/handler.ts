import { publishToSidecar } from '../shared/sidecar-client';

const COMMAND_SUBJECTS: Record<string, string> = {
  new: 'agent.events.session.new',
  reset: 'agent.events.session.reset',
  stop: 'agent.events.session.stop',
};

const handler = async (event: any) => {
  if (event.type !== 'command') return;

  const subject = COMMAND_SUBJECTS[event.action];
  if (!subject) return;

  // fire-and-forget
  void publishToSidecar(subject, {
    sessionKey: event.sessionKey,
    command: event.action,
    timestamp: new Date().toISOString(),
  });
};

export default handler;
