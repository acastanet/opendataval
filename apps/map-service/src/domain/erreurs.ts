export interface ErreurPublique {
  error: { code: string; message: string; retryable: boolean };
  requestId: string;
}

export function erreurPublique(code: string, message: string, retryable: boolean, requestId: string): ErreurPublique {
  return { error: { code, message, retryable }, requestId };
}
