import { useEffect, useState } from "react";
import { LocationPicker } from "../../components/map/KuskaMap";
import { coordsOf, districtCenter, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { FormEvent } from "react";
import { Icon, Modal } from "../../components/common/CommonComponents";
import type { Post, User } from "../../types";

export function CreateEmergency({
  user,
  onClose,
  onPublish,
}: {
  user: User;
  onClose: () => void;
  onPublish: (p: Post) => void;
}) {
  const [error, setError] = useState("");
  const [point, setPoint] = useState<LatLng | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get("title") || !fd.get("description"))
      return setError("El título y la descripción son obligatorios.");
    const newId = Date.now();
    const coords = point
      ? roundPoint(point)
      : coordsOf({ id: newId, district: user.district });
    onPublish({
      id: newId,
      owner: user.name,
      ownerId: user.id,
      title: String(fd.get("title")),
      description: String(fd.get("description")),
      category: "Emergencia",
      district: user.district,
      location: String(fd.get("location")),
      lat: coords.lat,
      lng: coords.lng,
      createdAt: Date.now(),
      mine: true,
    });
  };
  return (
    <Modal title="Reportar emergencia" onClose={onClose}>
      <div className="emergency-label">
        <Icon name="alert" />
        EMERGENCIA
      </div>
      <div className="safety-note">
        <Icon name="alert" />
        <p>Publicar aquí no reemplaza llamar a las autoridades si existe peligro inmediato.</p>
      </div>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Título *<input name="title" placeholder="Describe la alerta en pocas palabras" />
        </label>
        <label className="upload-box">
          <Icon name="camera" />
          <span>Agregar evidencia fotográfica</span>
          <small>Opcional y sin exponer personas</small>
          <input type="file" accept="image/*" />
        </label>
        <label>
          Descripción *
          <textarea name="description" placeholder="Brinda información útil y segura…" />
        </label>
        <label>
          Ubicación aproximada
          <input name="location" defaultValue={`${user.district} · referencia aproximada`} />
        </label>
        <div className="picker-field">
          <span className="picker-label">Marca la zona en el mapa</span>
          <LocationPicker
            center={districtCenter(user.district)}
            value={point}
            onChange={setPoint}
            kind="emergency"
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="danger-button">Publicar alerta</button>
        </div>
      </form>
    </Modal>
  );
}
