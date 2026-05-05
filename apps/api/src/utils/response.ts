export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  meta?: any;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
    correlationId?: string;
  };
}

export const successResponse = (data: any, meta?: any, message?: any): ApiResponse => ({
  success: true,
  data,
  meta,
  message: typeof message === 'string' ? message : JSON.stringify(message),
});

export const errorResponse = (
  message: string,
  code: string = 'INTERNAL_ERROR',
  details?: any,
  correlationId?: string
): ApiResponse => ({
  success: false,
  error: {
    code,
    message,
    details,
    correlationId,
  },
});

export class ResponseUtil {
  static success(data: any, meta: any = {}, message: any = '') {
    return successResponse(data, meta, message);
  }

  static error(message: any, code: string = 'INTERNAL_ERROR', details: any = null, correlationId?: string) {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const detailPayload = details || (typeof message !== 'string' ? message : null);
    return errorResponse(msg, code, detailPayload, correlationId);
  }
}
