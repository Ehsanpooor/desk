import axios, { type AxiosError } from 'axios';

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'canceled' | 'unknown';

interface AccountErrorBody {
  statusCode?: number;
  error?: string;
  message?: string;
  errors?: Record<string, string[]>;
}

/** Every failure from the API layer is one of these. Screens never read `error.response`. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** The service's stable machine-readable code, e.g. `invalid_refresh_token`. */
  readonly code: string;
  readonly fields: Record<string, string[]> | undefined;
  readonly traceId: string | undefined;

  constructor(init: {
    kind: ApiErrorKind;
    status: number | null;
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    traceId?: string;
  }) {
    super(init.message);
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.traceId = init.traceId;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function normalizeError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (axios.isCancel(e)) {
    return new ApiError({ kind: 'canceled', status: null, code: 'canceled', message: 'Request canceled.' });
  }
  if (axios.isAxiosError(e)) {
    const err = e as AxiosError<AccountErrorBody>;
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new ApiError({ kind: 'timeout', status: null, code: 'timeout', message: 'The request timed out.' });
    }
    if (!err.response) {
      return new ApiError({
        kind: 'network',
        status: null,
        code: 'network',
        message: 'Could not reach the account service.',
      });
    }
    const body = err.response.data;
    return new ApiError({
      kind: 'http',
      status: err.response.status,
      code: typeof body?.error === 'string' ? body.error : `http_${err.response.status}`,
      message: typeof body?.message === 'string' ? body.message : err.message,
      fields: body?.errors,
      traceId: (err.response.headers?.['x-request-id'] as string | undefined) ?? undefined,
    });
  }
  return new ApiError({
    kind: 'unknown',
    status: null,
    code: 'unknown',
    message: e instanceof Error ? e.message : 'Something went wrong.',
  });
}
