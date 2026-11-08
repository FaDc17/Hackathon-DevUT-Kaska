package com.kuska.api.user;

/** The JWT is valid, but the user did not confirm the account password. */
public class AccountVerificationException extends RuntimeException {
	public AccountVerificationException() {
		super("La contraseña no es correcta. Tu cuenta no se ha eliminado.");
	}
}
