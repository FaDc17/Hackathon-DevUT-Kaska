package com.kuska.api.catalog;

import java.time.LocalDateTime;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "CanalesAyuda", schema = "dbo")
public class CanalAyuda {

	@Id
	@Column(name = "IdCanal", length = 100, nullable = false)
	private String id;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "IdDepartamento", referencedColumnName = "IdDepartamento")
	private Departamento departamento;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "IdDistrito", referencedColumnName = "IdDistrito")
	private Distrito distrito;

	@Column(name = "NombreInstitucion", nullable = false, length = 200)
	private String nombreInstitucion;

	@Column(name = "TipoAyuda", nullable = false, length = 100)
	private String tipoAyuda;

	@Column(name = "Telefono", nullable = false, length = 100)
	private String telefono;

	@Column(name = "Descripcion", length = 500)
	private String descripcion;

	@Column(name = "Direccion", length = 300)
	private String direccion;

	@Column(name = "Cobertura", nullable = false, length = 20)
	private String cobertura;

	@Column(name = "FuenteInformacion", length = 200)
	private String fuenteInformacion;

	@Column(name = "FechaVerificacion")
	private LocalDate fechaVerificacion;

	@Column(name = "FechaActualizacion")
	private LocalDateTime fechaActualizacion;

	@Column(name = "Estado", nullable = false)
	private boolean estado;

	@Column(name = "Eliminado", nullable = false)
	private boolean eliminado;

	protected CanalAyuda() {
	}

	public String getId() {
		return id;
	}

	public Departamento getDepartamento() {
		return departamento;
	}

	public Distrito getDistrito() {
		return distrito;
	}

	public String getNombreInstitucion() {
		return nombreInstitucion;
	}

	public String getTipoAyuda() {
		return tipoAyuda;
	}

	public String getTelefono() {
		return telefono;
	}

	public String getDescripcion() {
		return descripcion;
	}

	public String getDireccion() {
		return direccion;
	}

	public String getCobertura() {
		return cobertura;
	}

	public String getFuenteInformacion() {
		return fuenteInformacion;
	}

	public LocalDate getFechaVerificacion() {
		return fechaVerificacion;
	}

	public LocalDateTime getFechaActualizacion() {
		return fechaActualizacion;
	}

	public boolean isEstado() {
		return estado;
	}

	public boolean isEliminado() {
		return eliminado;
	}
}
