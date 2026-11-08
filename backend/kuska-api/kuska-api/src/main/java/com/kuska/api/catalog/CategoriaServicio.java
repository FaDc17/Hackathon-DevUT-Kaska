package com.kuska.api.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "CategoriasServicio", schema = "dbo")
public class CategoriaServicio {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "IdCategoria")
	private Integer id;

	@Column(name = "NombreCategoria", nullable = false, length = 100)
	private String nombre;

	@Column(name = "Descripcion", length = 500)
	private String descripcion;

	protected CategoriaServicio() {
	}

	public Integer getId() {
		return id;
	}

	public String getNombre() {
		return nombre;
	}

	public String getDescripcion() {
		return descripcion;
	}
}
