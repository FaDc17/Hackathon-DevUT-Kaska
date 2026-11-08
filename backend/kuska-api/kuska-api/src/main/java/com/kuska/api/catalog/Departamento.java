package com.kuska.api.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "Departamentos", schema = "dbo")
public class Departamento {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "IdDepartamento")
	private Integer id;

	@Column(name = "NombreDepartamento", nullable = false, length = 100)
	private String nombre;

	protected Departamento() {
	}

	public Integer getId() {
		return id;
	}

	public String getNombre() {
		return nombre;
	}
}
