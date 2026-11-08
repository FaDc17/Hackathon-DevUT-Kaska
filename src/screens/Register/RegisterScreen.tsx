import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Icon, Logo } from "../../components/common/CommonComponents";
import type { Screen } from "../../types";
import { GeographicFields } from "./GeographicFields";
import type { District } from "../../services/catalogs";
import { normalizePhone, passwordError, PASSWORD_HINT } from "../../utils/registration";
import { readRegistrationDraft, saveRegistrationDraft, clearRegistrationDraft } from "../../services/registrationDraft";

type RegistrationForm = {
  username: string;
  password: string;
  confirmPassword: string;
  address: string;
  phone: string;
  district: string;
  districtId: number;
};

export function RegisterScreen({
  onRegister,
  go,
  notify,
}: {
  onRegister: (user: RegistrationForm) => Promise<void>;
  go: (s: Screen) => void;
  notify: (s: string) => void;
}) {
  const [values, setValues] = useState({
    name: "",
    password: "",
    confirmPassword: "",
    address: "",
    phone: "",
    district: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<District>();
  const [draftDistrictId, setDraftDistrictId] = useState<number>();
  const [draftReady, setDraftReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  useEffect(() => {
    let active = true;
    void readRegistrationDraft().then((draft) => {
      if (draft && active) {
        setValues((current) => ({ ...current, name: draft.name, phone: draft.phone, address: draft.address }));
        setDraftDistrictId(draft.districtId);
        setDraftMessage("Borrador pendiente. Introduce nuevamente tu contraseña y pulsa Crear mi cuenta cuando tengas conexión.");
      }
    }).catch(() => { if (active) setDraftMessage("No pudimos leer el borrador protegido."); })
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, []);
  const saveDraft = async () => {
    setLoading(true);
    try {
      await saveRegistrationDraft({ name: values.name, phone: values.phone, address: values.address, districtId: selectedDistrict?.id });
      setValues((current) => ({ ...current, password: "", confirmPassword: "" }));
      setDraftMessage("Borrador guardado sin contraseña. Tu cuenta todavía no está registrada. En el navegador se conserva solo mientras la aplicación esté abierta.");
    } catch { setDraftMessage("No se pudo guardar el borrador. Tus datos permanecen en el formulario."); }
    finally { setLoading(false); }
  };
  const validateField = (field: keyof typeof values, value: string) => {
    const clean = value.trim();
    if (field === "name") {
      if (!clean) return "Ingresa un nombre de usuario";
      if (clean.length < 3 || clean.length > 20)
        return "El usuario debe tener entre 3 y 20 caracteres";
      if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9_]+$/.test(clean))
        return "Usa solamente letras, números y guion bajo";
    }
    if (field === "password") {
      return passwordError(value);
    }
    if (field === "confirmPassword" && value !== values.password) return "Las contraseñas no coinciden";
    if (field === "address" && clean.length < 5) return "Ingresa tu dirección";
    if (field === "address" && clean.length > 300)
      return "La dirección puede tener hasta 300 caracteres";
    if (field === "phone") {
      try { normalizePhone(value); } catch (error) { return (error as Error).message; }
    }
    if (field === "district" && !value) return "Selecciona tu distrito";
    return "";
  };
  const update = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field])
      setErrors((current) => ({ ...current, [field]: validateField(field, value) }));
  };
  const blur = (field: keyof typeof values) =>
    setErrors((current) => ({ ...current, [field]: validateField(field, values[field]) }));
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading || !draftReady) return;
    if (!navigator.onLine) { setErrors({ form: "No hay conexión. Guarda un borrador y envíalo cuando vuelva Internet." }); return; }
    const nextErrors = Object.fromEntries(
      (Object.keys(values) as (keyof typeof values)[])
        .map((field) => [field, validateField(field, values[field])])
        .filter(([, message]) => message),
    );
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !selectedDistrict) return;
    setLoading(true);
    try {
      await onRegister({
        username: values.name.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        address: values.address.trim(),
        phone: normalizePhone(values.phone),
        district: values.district,
        districtId: selectedDistrict.id,
      });
      notify("Cuenta creada. ¡Bienvenida a Kuska!");
      await clearRegistrationDraft().catch(() => undefined);
    } catch (reason) {
      setErrors((current) => ({
        ...current,
        form: reason instanceof Error ? reason.message : "No fue posible crear la cuenta.",
      }));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="simple-auth">
      <button className="icon-button" onClick={() => go("login")}>
        <Icon name="back" />
      </button>
      <div className="mini-brand">
        <Logo compact />
        <span>Crear cuenta</span>
      </div>
      <h1>Únete a tu comunidad</h1>
      <p>Completa tus datos para empezar a conectar con tus vecinos.</p>
      <form className="stack-form" onSubmit={submit}>
        {errors.form && <p className="form-error">{errors.form}</p>}
        <label>
          Nombre de usuario *
          <input
            className={errors.name ? "invalid" : ""}
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            onBlur={() => blur("name")}
            maxLength={20}
            placeholder="¿Cómo te llamamos?"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <label>
          Contraseña *
          <div className="input-action">
            <input
              className={errors.password ? "invalid" : ""}
              value={values.password}
              onChange={(event) => update("password", event.target.value)}
              onBlur={() => blur("password")}
              type={showPassword ? "text" : "password"}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              <Icon name="eye" size={20} />
            </button>
          </div>
          {errors.password && <span className="field-error">{errors.password}</span>}
          <small>{PASSWORD_HINT}</small>
        </label>
        <label>
          Confirmar contraseña *
          <input type={showPassword ? "text" : "password"} autoComplete="new-password"
            value={values.confirmPassword} maxLength={72}
            onChange={(event) => update("confirmPassword", event.target.value)}
            onBlur={() => blur("confirmPassword")} />
          {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
        </label>
        <label>
          Dirección privada *
          <input
            className={errors.address ? "invalid" : ""}
            value={values.address}
            onChange={(event) => update("address", event.target.value)}
            onBlur={() => blur("address")}
            placeholder="Solo será visible para ti"
            maxLength={300}
          />
          {errors.address && <span className="field-error">{errors.address}</span>}
        </label>
        <label>
          Número celular *
          <input
            className={errors.phone ? "invalid" : ""}
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
            onBlur={() => blur("phone")}
            type="tel"
            inputMode="tel"
            maxLength={24}
            placeholder="987654321 o +51987654321"
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </label>
        {draftReady && <GeographicFields
          districtId={draftDistrictId}
          onChange={(district) => {
            setSelectedDistrict(district);
            update("district", district?.nombre || "");
          }}
        />}
        {errors.district && <span className="field-error">{errors.district}</span>}
        {draftMessage && <p className="verification-note" role="status">{draftMessage}</p>}
        <button type="button" className="secondary-button" disabled={loading || !draftReady} onClick={() => void saveDraft()}>Guardar borrador sin contraseña</button>
        <button className="primary-button" disabled={loading || !draftReady}>
          {loading ? "Creando cuenta…" : "Crear mi cuenta"}
        </button>
      </form>
    </section>
  );
}
