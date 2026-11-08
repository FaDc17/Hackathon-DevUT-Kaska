import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/CommonComponents";
import { apiRequest, ApiError } from "../../services/apiClient";
import { passwordError, PASSWORD_HINT } from "../../utils/registration";

export function ChangePassword({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword"));
    const confirmPassword = String(data.get("confirmPassword"));
    const error = passwordError(newPassword) || (newPassword !== confirmPassword ? "Las contraseñas no coinciden." : "");
    if (error) { setMessage(error); return; }
    setBusy(true); setMessage("");
    try {
      await apiRequest<void>("/api/usuarios/me/password", { method: "PUT", body: JSON.stringify({
        currentPassword: String(data.get("currentPassword")), newPassword, confirmPassword,
      }) });
      form.reset(); setDone(true); setMessage("Contraseña actualizada. Usa la nueva contraseña en tu próximo inicio de sesión.");
    } catch (error) {
      setMessage(error instanceof ApiError && [404,405].includes(error.status)
        ? "El servidor todavía no tiene habilitado el cambio de contraseña."
        : error instanceof Error ? error.message : "No se pudo cambiar la contraseña.");
    } finally { setBusy(false); }
  }
  return <Modal title="Cambiar contraseña" onClose={() => { if (!busy) onClose(); }}>
    <form className="stack-form" onSubmit={submit}>
      {!done && <>
        <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={72} /></label>
        <label>Nueva contraseña<input name="newPassword" type="password" autoComplete="new-password" required maxLength={72} /></label>
        <small>{PASSWORD_HINT}</small>
        <label>Confirmar contraseña<input name="confirmPassword" type="password" autoComplete="new-password" required maxLength={72} /></label>
      </>}
      {message && <p role="status">{message}</p>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cerrar</button>
        {!done && <button className="primary-button" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>}
      </div>
    </form>
  </Modal>;
}
