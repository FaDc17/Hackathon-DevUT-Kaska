package com.kuska.api.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "Distritos", schema = "dbo")
public class Distrito {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "IdDistrito")
	private Integer id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "IdDepartamento", referencedColumnName = "IdDepartamento", nullable = false)
	private Departamento departamento;

	@Column(name = "NombreProvincia", nullable = false, length = 100)
	private String provincia;

	@Column(name = "NombreDistrito", nullable = false, length = 100)
	private String nombre;

	protected Distrito() {
	}

	public Integer getId() {
		return id;
	}

	public Departamento getDepartamento() {
		return departamento;
	}

	public String getProvincia() {
		return provincia;
	}

	public String getNombre() {
		return nombre;
	}
}
