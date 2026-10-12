import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, DomainErrorCode } from '../../domain/domain-error';

const STATUS: Record<DomainErrorCode, number> = {
  VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  LIMIT_EXCEEDED: HttpStatus.PAYMENT_REQUIRED,
  SUBSCRIPTION_INACTIVE: HttpStatus.PAYMENT_REQUIRED,
  INVALID_STATE: HttpStatus.CONFLICT,
  UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Formato único de erro: { statusCode, code, message, details? } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const statusCode = STATUS[exception.code];
      return res.status(statusCode).json({ statusCode, code: exception.code, message: exception.message, details: exception.details });
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      return res.status(statusCode).json({
        statusCode,
        code: HttpStatus[statusCode] ?? 'ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
      });
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, code: 'INTERNAL', message: 'Erro inesperado. Tente novamente.' });
  }
}
