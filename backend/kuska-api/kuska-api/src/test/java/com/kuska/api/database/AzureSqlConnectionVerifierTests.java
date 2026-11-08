package com.kuska.api.database;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AzureSqlConnectionVerifierTests {

	private DataSource dataSource;
	private Connection connection;
	private Statement statement;
	private ResultSet resultSet;
	private AzureSqlConnectionVerifier verifier;

	@BeforeEach
	void setUp() throws Exception {
		dataSource = mock(DataSource.class);
		connection = mock(Connection.class);
		statement = mock(Statement.class);
		resultSet = mock(ResultSet.class);

		when(dataSource.getConnection()).thenReturn(connection);
		when(connection.createStatement()).thenReturn(statement);
		when(statement.executeQuery("SELECT DB_NAME(), @@SERVERNAME")).thenReturn(resultSet);

		Environment environment = mock(Environment.class);
		when(environment.getRequiredProperty("kuska.database.expected-name"))
				.thenReturn("free-sql-db-8911281");
		when(environment.getRequiredProperty("kuska.database.expected-server"))
				.thenReturn("sql-kuska-fadc.database.windows.net");
		verifier = new AzureSqlConnectionVerifier(dataSource, environment);
	}

	@Test
	void acceptsExpectedDatabaseAndAzureServer() throws Exception {
		when(resultSet.next()).thenReturn(true);
		when(resultSet.getString(1)).thenReturn("free-sql-db-8911281");
		when(resultSet.getString(2)).thenReturn("sql-kuska-fadc");

		assertDoesNotThrow(() -> verifier.run(null));
		verify(resultSet).close();
		verify(statement).close();
		verify(connection).close();
	}

	@Test
	void rejectsUnexpectedDatabase() throws Exception {
		when(resultSet.next()).thenReturn(true);
		when(resultSet.getString(1)).thenReturn("otra-base");
		when(resultSet.getString(2)).thenReturn("sql-kuska-fadc");

		assertThrows(IllegalStateException.class, () -> verifier.run(null));
	}

	@Test
	void rejectsUnexpectedServer() throws Exception {
		when(resultSet.next()).thenReturn(true);
		when(resultSet.getString(1)).thenReturn("free-sql-db-8911281");
		when(resultSet.getString(2)).thenReturn("otro-servidor");

		assertThrows(IllegalStateException.class, () -> verifier.run(null));
	}
}
