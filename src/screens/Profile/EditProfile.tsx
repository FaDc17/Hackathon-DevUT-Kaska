import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/CommonComponents";
import type { User } from "../../types";
import { GeographicFields } from "../Register/GeographicFields";

export function EditProfile({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (u: User) => Promise<void>;
}) {
  const [selectedDistrict, setSelectedDistrict] = useState<
    { id: number; nombre: string } | undefined
  >(user.districtId ? { id: user.districtId, nombre: user.district } : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (!selectedDistrict) {
      setError("Selecciona tu distrito.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...user,
        name: String(fd.get("name")).trim(),
        phone: String(fd.get("phone")),
        address: String(fd.get("address")),
        district: selectedDistrict.nombre,
        districtId: selectedDistrict.id,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar el perfil.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Editar perfil"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack-form" onSubmit={submit}>
        <label>
          Nombre
          <input
            name="name"
            defaultValue={user.name}
            minLength={3}
            maxLength={20}
            pattern="[A-Za-zÁÉÍÓÚáéíóúÑñ0-9_]+"
            required
          />
        </label>
        <label>
          Celular
          <input
            name="phone"
            defaultValue={user.phone}
            type="tel"
            inputMode="numeric"
            pattern="9[0-9]{8}"
            maxLength={9}
            required
          />
        </label>
        <label>
          Dirección privada
          <input
            name="address"
            defaultValue={user.address}
            minLength={5}
            maxLength={300}
            required
          />
        </label>
        <GeographicFields
          districtId={user.districtId}
          districtName={user.district}
          onChange={setSelectedDistrict}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
