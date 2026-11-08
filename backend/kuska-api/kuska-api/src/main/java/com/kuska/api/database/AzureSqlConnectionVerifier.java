package com.kuska.api.database;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
public class AzureSqlConnectionVerifier implements ApplicationRunner {

	private final DataSource dataSource;
	private final String expectedDatabase;
	private final String expectedServer;

	public AzureSqlConnectionVerifier(
			DataSource dataSource,
			org.springframework.core.env.Environment environment) {
		this.dataSource = dataSource;
		this.expectedDatabase = environment.getRequiredProperty("kuska.database.expected-name");
		this.expectedServer = environment.getRequiredProperty("kuska.database.expected-server");
	}

	@Override
	public void run(ApplicationArguments args) {
		try (Connection connection = dataSource.getConnection();
				Statement statement = connection.createStatement();
				ResultSet result = statement.executeQuery("SELECT DB_NAME(), @@SERVERNAME")) {

			if (!result.next()) {
				throw new IllegalStateException("Azure SQL no devolvio los datos de conexion esperados.");
			}

			String actualDatabase = result.getString(1);
			String actualServer = result.getString(2);
			validateDatabase(actualDatabase);
			validateServer(actualServer);

			org.slf4j.LoggerFactory.getLogger(AzureSqlConnectionVerifier.class)
					.info("Conexion JDBC con Azure SQL verificada: base={}, servidor={}",
							actualDatabase, actualServer);
		} catch (SQLException exception) {
			throw new IllegalStateException(
					"No se pudo verificar la conexion JDBC con Azure SQL.", exception);
		}
	}

	private void validateDatabase(String actualDatabase) {
		if (actualDatabase == null || !expectedDatabase.equalsIgnoreCase(actualDatabase)) {
			throw new IllegalStateException(
					"Azure SQL devolvio una base inesperada: se esperaba "
							+ expectedDatabase + ".");
		}
	}

	private void validateServer(String actualServer) {
		if (actualServer == null || actualServer.isBlank()) {
			throw new IllegalStateException(
					"Azure SQL no devolvio un nombre de servidor.");
		}

		String normalizedActual = actualServer.toLowerCase();
		String normalizedExpected = expectedServer.toLowerCase();
		String normalizedShortName = normalizedExpected.substring(
				0, normalizedExpected.indexOf('.'));

		boolean matches = normalizedActual.equals(normalizedExpected)
				|| normalizedActual.equals(normalizedShortName)
				|| normalizedActual.endsWith("." + normalizedExpected);

		if (!matches) {
			throw new IllegalStateException(
					"Azure SQL devolvio un servidor inesperado.");
		}
	}
}
