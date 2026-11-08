package com.kuska.api.user;

public class DuplicateUserException extends RuntimeException {

	public DuplicateUserException() {
		super("El nombre de usuario o el celular ya están registrados.");
	}
}
