import { useState } from "react";
import type { FormEvent } from "react";
import { Icon, Logo } from "../../components/common/CommonComponents";
import type { Screen } from "../../types";
import { GeographicFields } from "./GeographicFields";
import type { District } from "../../services/catalogs";

type RegistrationForm = {
  username: string;
  password: string;
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
    address: "",
    phone: "",
    district: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<District>();
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
      if (!clean) return "Ingresa una contraseña";
      if (value.length < 8) return "La contraseña debe tener al menos 8 caracteres";
      if (value.length > 72) return "La contraseña puede tener hasta 72 caracteres";
      if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value) || !/\d/.test(value))
        return "Incluye al menos una letra y un número";
    }
    if (field === "address" && clean.length < 5) return "Ingresa tu dirección";
    if (field === "address" && clean.length > 300)
      return "La dirección puede tener hasta 300 caracteres";
    if (field === "phone") {
      if (!value) return "Ingresa tu número de celular";
      if (value.length !== 9) return "El celular debe tener 9 dígitos";
      if (!/^9\d{8}$/.test(value)) return "Ingresa un número celular peruano válido";
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
        address: values.address.trim(),
        phone: values.phone,
        district: values.district,
        districtId: selectedDistrict.id,
      });
      notify("Cuenta creada. ¡Bienvenida a Kuska!");
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
            onChange={(event) => update("phone", event.target.value.replace(/\D/g, "").slice(0, 9))}
            onBlur={() => blur("phone")}
            inputMode="numeric"
            placeholder="9XX XXX XXX"
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </label>
        <GeographicFields
          onChange={(district) => {
            setSelectedDistrict(district);
            update("district", district?.nombre || "");
          }}
        />
        {errors.district && <span className="field-error">{errors.district}</span>}
        <button className="primary-button" disabled={loading}>
          {loading ? "Creando cuenta…" : "Crear mi cuenta"}
        </button>
      </form>
    </section>
  );
}
