/**
 * Erros de domínio são independentes de HTTP. A camada de interface
 * (DomainExceptionFilter) traduz cada código para o status adequado.
 */
export type DomainErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'LIMIT_EXCEEDED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'INVALID_STATE'
  | 'UNAVAILABLE';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (entity: string) => new DomainError('NOT_FOUND', `${entity} não encontrado(a).`);
export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new DomainError('FORBIDDEN', message);
export const validation = (message: string, details?: Record<string, unknown>) =>
  new DomainError('VALIDATION', message, details);
