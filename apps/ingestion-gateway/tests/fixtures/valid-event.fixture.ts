import * as crypto from 'node:crypto';

export function createValidLogEvent(options: {
  eventId?: string;
  projectId?: string;
  environment?: string;
  overrides?: Record<string, any>;
} = {}): Record<string, any> {
  const eventId = options.eventId ?? crypto.randomUUID();
  const projectId = options.projectId ?? 'skyra-tech';
  const environment = options.environment ?? 'production';

  const base: Record<string, any> = {
    '@timestamp': '2026-10-24T00:00:00.000Z',
    'ecs.version': '8.11.0',
    event: {
      id: eventId,
      action: 'auth_attempt',
      dataset: 'application.logs',
      category: ['authentication'],
      type: ['access'],
      outcome: 'success',
      duration: 12000000,
    },
    log: {
      level: 'info',
      logger: 'test.logger',
    },
    message: 'User authentication succeeded',
    service: {
      name: 'auth-service',
      version: '1.0.0',
      environment,
    },
    skyra: {
      schema_version: '1.0.0',
      project_id: projectId,
    },
  };

  return { ...base, ...(options.overrides ?? {}) };
}
