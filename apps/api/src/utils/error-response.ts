/**
 * Standardized API Error Response Factory
 * 
 * Ensures a consistent error format across all API endpoints.
 */

export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: any;
    }
}

export class ErrorFactory {
    static badRequest(message: string, details?: any): ApiError {
        return { error: { code: 'BAD_REQUEST', message, details } };
    }

    static unauthorized(message: string = 'Authentication required'): ApiError {
        return { error: { code: 'UNAUTHORIZED', message } };
    }

    static forbidden(message: string = 'Access denied'): ApiError {
        return { error: { code: 'FORBIDDEN', message } };
    }

    static notFound(message: string): ApiError {
        return { error: { code: 'NOT_FOUND', message } };
    }

    static rateLimited(message: string = 'Too many requests'): ApiError {
        return { error: { code: 'RATE_LIMITED', message } };
    }

    static internal(message: string = 'Internal server error', details?: any): ApiError {
        return { error: { code: 'INTERNAL_ERROR', message, details } };
    }
}
