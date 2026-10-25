export interface GatewayConfig {
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly maxBatchSize: number;
  readonly maxPayloadBytes: number;
  readonly defaultRateLimitPerMin: number;
  readonly burstRateLimitPerMin: number;
  readonly corsOrigins: readonly string[];
  readonly durabilityBackendEnabled: boolean;
  readonly shutdownTimeoutMs: number;
}
