import { useEffect, useRef, useState } from "react";
import {
  districtsForProvince,
  getGeographicCatalog,
  provincesForDepartment,
  type District,
  type GeographicCatalog,
} from "../../services/catalogs";

export function GeographicFields({
  districtId,
  districtName,
  onChange,
}: {
  districtId?: number;
  districtName?: string;
  onChange: (district: District | undefined) => void;
}) {
  const [catalog, setCatalog] = useState<GeographicCatalog | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [province, setProvince] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const initialSelectionApplied = useRef(false);
  useEffect(() => {
    let active = true;
    setError("");
    void getGeographicCatalog()
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        if (!data.districts.length)
          setError("No hay ubicaciones guardadas. Conéctate a Kuska para cargarlas.");
      })
      .catch(() => {
        if (active) setError("No pudimos cargar las ubicaciones. Inténtalo nuevamente.");
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!catalog?.districts.length || initialSelectionApplied.current) return;
    const matches = catalog.districts.filter(
      (d) => districtId !== undefined && d.id === districtId,
    );
    // Un nombre sin ID tampoco identifica un lugar si el catálogo tiene regiones incompletas.
    if (matches.length === 1) {
      initialSelectionApplied.current = true;
      const d = matches[0];
      setDepartmentId(String(d.idDepartamento));
      setProvince(d.provincia);
      setSelectedId(String(d.id));
      onChange(d);
    }
  }, [catalog, districtId, districtName]);
  const allDistricts = catalog?.districts || [];
  const provinces = provincesForDepartment(allDistricts, departmentId);
  const provinceDistricts = districtsForProvince(allDistricts, departmentId, province);
  return (
    <>
      {error && (
        <p className="form-error" role="status">
          {error}{" "}
          <button type="button" className="text-button" onClick={() => setAttempt((n) => n + 1)}>
            Volver a cargar
          </button>
        </p>
      )}
      {!catalog && !error && <p role="status">Cargando ubicaciones…</p>}
      {catalog?.source === "local" && (
        <p className="verification-note">
          Mostramos las ubicaciones guardadas en este dispositivo. El registro de una cuenta
          requiere conexión con Kuska.
        </p>
      )}
      {districtId === undefined && districtName && (
        <p className="verification-note">
          Ubicación guardada: {districtName}. Confirma departamento, provincia y distrito.
        </p>
      )}
      <label>
        Departamento *
        <select
          name="departmentId"
          required
          disabled={!catalog?.departments.length}
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            setProvince("");
            setSelectedId("");
            onChange(undefined);
          }}
        >
          <option value="">Selecciona tu departamento</option>
          {catalog?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Provincia *
        <select
          name="province"
          required
          disabled={!departmentId}
          value={province}
          onChange={(event) => {
            setProvince(event.target.value);
            setSelectedId("");
            onChange(undefined);
          }}
        >
          <option value="">Ahora elige tu provincia</option>
          {departmentId && !provinces.length && (
            <option value="" disabled>Sin especificar — pendiente de catálogo válido</option>
          )}
          {provinces.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {departmentId && !provinces.length && (
        <p className="verification-note" role="status">
          Este departamento no tiene provincias ni un distrito “Sin especificar” con ID válido.
          El catálogo central debe habilitar esa ubicación antes de completar el registro.
        </p>
      )}
      <label>
        Distrito *
        <select
          name="districtId"
          required
          disabled={!province}
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            onChange(provinceDistricts.find((d) => String(d.id) === event.target.value));
          }}
        >
          <option value="">Selecciona tu distrito</option>
          {provinceDistricts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
        </select>
      </label>
    </>
  );
}
