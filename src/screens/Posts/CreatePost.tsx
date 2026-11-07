import { useEffect, useState } from "react";
import { LocationPicker } from "../../components/map/KuskaMap";
import { coordsOf, districtCenter, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { FormEvent } from "react";
import { Icon, Modal } from "../../components/common/CommonComponents";
import type { Post, User } from "../../types";

export function CreatePost({
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
    if (!fd.get("title") || !fd.get("description") || !fd.get("category"))
      return setError("Completa los campos obligatorios.");
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
      category: String(fd.get("category")) as Post["category"],
      district: user.district,
      location: String(fd.get("location")),
      lat: coords.lat,
      lng: coords.lng,
      createdAt: Date.now(),
      mine: true,
    });
  };
  return (
    <Modal title="Crear publicación" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Título *<input name="title" placeholder="¿Qué quieres compartir?" />
        </label>
        <label className="upload-box">
          <Icon name="camera" />
          <span>Agregar fotografía</span>
          <small>Opcional</small>
          <input type="file" accept="image/*" />
        </label>
        <label>
          Descripción *
          <textarea name="description" placeholder="Explica brevemente la situación…" />
        </label>
        <fieldset>
          <legend>Categoría *</legend>
          <div className="choice-row post-choices">
            {["Necesito", "Emergencia", "Solidaridad"].map((x) => (
              <label key={x}>
                <input type="radio" name="category" value={x} />
                <span>{x}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Ubicación aproximada
          <input name="location" defaultValue={`${user.district} · zona aproximada`} />
        </label>
        <div className="picker-field">
          <span className="picker-label">Marca la zona en el mapa</span>
          <LocationPicker
            center={districtCenter(user.district)}
            value={point}
            onChange={setPoint}
            kind="community"
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Publicar</button>
        </div>
      </form>
    </Modal>
  );
}
