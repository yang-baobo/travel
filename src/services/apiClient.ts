const configuredBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getBaseUrl(): string {
  if (configuredBaseUrl) return configuredBaseUrl;
  const expoPlatform = (process.env.EXPO_OS || '').toLowerCase();
  if (expoPlatform === 'web' || typeof window !== 'undefined') return '';
  // Node-based service tests use relative URLs and never issue a real request.
  if (typeof navigator === 'undefined') return '';
  throw new ApiError('原生 App 尚未配置 EXPO_PUBLIC_API_BASE_URL', 0, 'API_BASE_URL_MISSING');
}

export function buildApiUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error('API path must start with /');
  return `${getBaseUrl()}${path}`;
}

export async function apiRequest<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail;
      const message = typeof detail === 'string'
        ? detail
        : detail?.message || `服务请求失败（${response.status}）`;
      throw new ApiError(message, response.status, detail?.code);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('服务响应超时，请稍后重试', 0, 'TIMEOUT');
    }
    throw new ApiError('暂时无法连接旅行数据服务', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}
