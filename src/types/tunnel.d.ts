declare module 'tunnel' {
  export interface ProxyOptions {
    host: string;
    port: number;
    proxyAuth?: string;
    headers?: Record<string, string>;
    localAddress?: string;
    localPort?: number;
    proxy?: ProxyOptions;
  }

  export interface TunnelOptions {
    proxy?: ProxyOptions;
    maxSockets?: number;
  }

  export interface Agent {
    addRequest(req: any, options: any): void;
    destroy(): void;
  }

  export function httpOverHttp(options?: TunnelOptions): Agent;
  export function httpsOverHttp(options?: TunnelOptions): Agent;
  export function httpOverHttps(options?: TunnelOptions): Agent;
  export function httpsOverHttps(options?: TunnelOptions): Agent;
}