export interface ConfigType {
  app: {
    outputDir: string;
    logLevel: string;
  };
  reddit: {
    username: string;
    password: string;
    clientId: string;
    clientSecret: string;
    userAgent: string;
  };
  sqlite: {
    path: string;
  };
  postgresql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };
  useProxies?: boolean; // Tùy chọn sử dụng proxy
}
