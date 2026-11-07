import type { FormEvent } from "react";
import { Modal } from "../../components/common/CommonComponents";
import type { User } from "../../types";

export function EditProfile({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (u: User) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      ...user,
      name: String(fd.get("name")),
      phone: String(fd.get("phone")),
      address: String(fd.get("address")),
      district: String(fd.get("district")),
    });
  };
  return (
    <Modal title="Editar perfil" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Nombre
          <input name="name" defaultValue={user.name} required />
        </label>
        <label>
          Celular
          <input name="phone" defaultValue={user.phone} required />
        </label>
        <label>
          Dirección privada
          <input name="address" defaultValue={user.address} required />
        </label>
        <label>
          Distrito
          <select name="district" defaultValue={user.district}>
            <option>Pueblo Libre</option>
            <option>Jesús María</option>
            <option>Breña</option>
            <option>Magdalena del Mar</option>
            <option>San Miguel</option>
            <option>Bellavista</option>
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Guardar cambios</button>
        </div>
      </form>
    </Modal>
  );
}
