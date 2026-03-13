import { publishToSidecar } from '../shared/sidecar-client';

const handler = async (event: any) => {
  if (event.type !== 'tool_result_persist') return undefined;

  const subject = event.isError
    ? `agent.events.tool.${event.toolName}.failed`
    : `agent.events.tool.${event.toolName}.completed`;

  // fire-and-forget — don't block tool result persist
  void publishToSidecar(subject, {
    sessionKey: event.sessionKey,
    toolName: event.toolName,
    durationMs: event.durationMs,
  });

  return undefined; // don't mutate result
};

export default handler;
