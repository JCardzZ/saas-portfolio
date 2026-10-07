package dev.portfolio.infrastructure.adapter.in.web.error;

import dev.portfolio.domain.exception.AiServiceUnavailableException;
import dev.portfolio.domain.exception.InvalidCredentialsException;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.exception.UnsupportedGrantTypeException;
import dev.portfolio.model.FieldError;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    public static final String RATE_LIMIT_LIMIT_HEADER = "X-RateLimit-Limit";
    public static final String RATE_LIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";

    private final ProblemDetailFactory problemDetailFactory;

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.RESOURCE_NOT_FOUND, ex.getMessage(), request));
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ProblemDetail> handleInvalidCredentials(InvalidCredentialsException ex,
                                                                  HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.INVALID_CREDENTIALS, ex.getMessage(), request));
    }

    @ExceptionHandler(UnsupportedGrantTypeException.class)
    public ResponseEntity<ProblemDetail> handleUnsupportedGrantType(UnsupportedGrantTypeException ex,
                                                                    HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.UNSUPPORTED_GRANT_TYPE, ex.getMessage(), request));
    }

    @ExceptionHandler(AiServiceUnavailableException.class)
    public ResponseEntity<ProblemDetail> handleAiUnavailable(AiServiceUnavailableException ex,
                                                             HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.SERVICE_UNAVAILABLE, ex.getMessage(), request));
    }

    @ExceptionHandler(SystemUnavailableException.class)
    public ResponseEntity<ProblemDetail> handleSystemUnavailable(SystemUnavailableException ex,
                                                                 HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.SERVICE_UNAVAILABLE, ex.getMessage(), request));
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ProblemDetail> handleRateLimit(RateLimitExceededException ex, HttpServletRequest request) {
        ProblemDetail problem = problemDetailFactory.create(ApiError.RATE_LIMIT_EXCEEDED, ex.getMessage(), request);
        long retryAfterSeconds = Math.max(1, ex.getRetryAfter().plusMillis(999).toSeconds());
        return ResponseEntity.status(problem.getStatus())
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds))
                .header(RATE_LIMIT_LIMIT_HEADER, String.valueOf(ex.getLimit()))
                .header(RATE_LIMIT_REMAINING_HEADER, "0")
                .body(problem);
    }

    @ExceptionHandler(InvalidRequestException.class)
    public ResponseEntity<ProblemDetail> handleInvalidRequest(InvalidRequestException ex, HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.VALIDATION_ERROR, ex.getMessage(), request));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ProblemDetail> handleUploadTooLarge(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return respond(problemDetailFactory.create(ApiError.VALIDATION_ERROR, "El archivo subido supera el tamaño máximo", request));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException ex,
                                                          HttpServletRequest request) {
        List<FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldError(error.getField(), error.getCode(), error.getDefaultMessage()))
                .toList();
        ProblemDetail problem = problemDetailFactory.create(
                ApiError.VALIDATION_ERROR, "Uno o más campos no son válidos", request);
        problem.setProperty("errors", errors);
        return respond(problem);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleUnreadableBody(HttpMessageNotReadableException ex,
                                                              HttpServletRequest request) {
        return respond(problemDetailFactory.create(
                ApiError.MALFORMED_REQUEST, "El cuerpo de la petición no es un JSON válido", request));
    }

    // El contrato declara application/json para los errores, no application/problem+json.
    private ResponseEntity<ProblemDetail> respond(ProblemDetail problem) {
        return ResponseEntity.status(problem.getStatus()).contentType(MediaType.APPLICATION_JSON).body(problem);
    }
}
