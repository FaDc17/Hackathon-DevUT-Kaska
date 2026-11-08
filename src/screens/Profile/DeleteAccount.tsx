import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/CommonComponents";

export function DeleteAccount({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || confirmation !== "ELIMINAR") return;
    if (!navigator.onLine) {
      setError("Conéctate a internet para eliminar tu cuenta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(password);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la eliminación. Tu cuenta se conserva.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Eliminar mi cuenta"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack-form" onSubmit={submit}>
        <p>
          Tu cuenta y su contenido dejarán de estar disponibles. El servidor debe confirmar esta
          acción.
        </p>
        <label>
          Tu contraseña
          <input
            type="password"
            autoComplete="current-password"
            maxLength={72}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Escribe ELIMINAR para confirmar
          <input
            required
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy || confirmation !== "ELIMINAR"}>
            {busy ? "Confirmando…" : "Eliminar mi cuenta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
