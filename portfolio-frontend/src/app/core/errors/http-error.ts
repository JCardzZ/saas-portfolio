import { HttpErrorResponse } from '@angular/common/http';

import { ProblemDetails } from '../api';

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

/** Convierte un error HTTP (cuerpo RFC 7807 de la API) en un mensaje para el usuario. */
export function describeHttpError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return GENERIC_MESSAGE;
  }
  if (error.status === 0) {
    return 'No se pudo conectar con la API. Comprueba que el backend esté en ejecución.';
  }
  if (error.status === 429) {
    const retryAfter = Number(error.headers.get('Retry-After'));
    return retryAfter > 0
      ? `Demasiados intentos. Vuelve a intentarlo en ${describeWait(retryAfter)}.`
      : 'Demasiados intentos. Vuelve a intentarlo más tarde.';
  }

  const problem = error.error as Partial<ProblemDetails> | null;
  if (problem?.errors?.length) {
    return problem.errors.map((fieldError) => `${fieldError.field}: ${fieldError.message}`).join(' · ');
  }
  return problem?.detail ?? problem?.title ?? GENERIC_MESSAGE;
}

function describeWait(seconds: number): string {
  if (seconds < 90) {
    return `${seconds} segundos`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) {
    return `${minutes} minutos`;
  }
  return `${Math.ceil(minutes / 60)} horas`;
}
