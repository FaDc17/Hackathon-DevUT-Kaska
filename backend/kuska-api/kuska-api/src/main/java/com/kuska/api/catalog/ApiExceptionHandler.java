package com.kuska.api.catalog;

import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.kuska.api.user.DuplicateUserException;
import com.kuska.api.content.ResourceConflictException;

@RestControllerAdvice
public class ApiExceptionHandler {

	private static final Logger logger = LoggerFactory.getLogger(ApiExceptionHandler.class);

	public record ErrorResponse(Instant timestamp, int status, String error, String message) {
	}

	@ExceptionHandler(ResourceNotFoundException.class)
	public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException exception) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(
				Instant.now(), HttpStatus.NOT_FOUND.value(), "NOT_FOUND", exception.getMessage()));
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<ErrorResponse> handleInvalidArgument(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ErrorResponse(
				Instant.now(), HttpStatus.BAD_REQUEST.value(), "BAD_REQUEST", exception.getMessage()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
		FieldError fieldError = exception.getBindingResult().getFieldErrors().stream()
				.findFirst()
				.orElse(null);
		String message = fieldError == null ? "La solicitud contiene datos inválidos."
				: fieldError.getField() + ": " + fieldError.getDefaultMessage();
		return ResponseEntity.badRequest().body(new ErrorResponse(
				Instant.now(), HttpStatus.BAD_REQUEST.value(), "VALIDATION_ERROR", message));
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException exception) {
		return ResponseEntity.badRequest().body(new ErrorResponse(
				Instant.now(), HttpStatus.BAD_REQUEST.value(), "VALIDATION_ERROR",
				"La solicitud contiene un cuerpo JSON inválido."));
	}

	@ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
	public ResponseEntity<ErrorResponse> handleConstraintViolation(
			jakarta.validation.ConstraintViolationException exception) {
		return ResponseEntity.badRequest().body(new ErrorResponse(
				Instant.now(), HttpStatus.BAD_REQUEST.value(), "VALIDATION_ERROR",
				"La solicitud excede los límites permitidos."));
	}

	@ExceptionHandler(BadCredentialsException.class)
	public ResponseEntity<ErrorResponse> handleBadCredentials(BadCredentialsException exception) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse(
				Instant.now(), HttpStatus.UNAUTHORIZED.value(), "INVALID_CREDENTIALS",
				"Usuario o contraseña incorrectos."));
	}

	@ExceptionHandler(DuplicateUserException.class)
	public ResponseEntity<ErrorResponse> handleDuplicateUser(DuplicateUserException exception) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
				Instant.now(), HttpStatus.CONFLICT.value(), "USER_ALREADY_EXISTS", exception.getMessage()));
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<ErrorResponse> handleIntegrityViolation(DataIntegrityViolationException exception) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
				Instant.now(), HttpStatus.CONFLICT.value(), "DATA_CONFLICT",
				"Los datos entran en conflicto con un registro existente."));
	}

	@ExceptionHandler(ResourceConflictException.class)
	public ResponseEntity<ErrorResponse> handleResourceConflict(ResourceConflictException exception) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
				Instant.now(), HttpStatus.CONFLICT.value(), "DATA_CONFLICT", exception.getMessage()));
	}

	@ExceptionHandler(AccessDeniedException.class)
	public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException exception) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
				Instant.now(), HttpStatus.FORBIDDEN.value(), "FORBIDDEN",
				"No tienes permiso para realizar esta operación."));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleUnexpected(Exception exception) {
		logger.error("Error interno procesando la solicitud.", exception);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ErrorResponse(
				Instant.now(), HttpStatus.INTERNAL_SERVER_ERROR.value(), "INTERNAL_ERROR",
				"No fue posible procesar la solicitud."));
	}
}
