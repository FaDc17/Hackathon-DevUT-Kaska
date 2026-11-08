import { useState } from "react";
import type { FormEvent } from "react";
import { Icon, Logo } from "../../components/common/CommonComponents";
import type { Screen, User } from "../../types";
import { login, type AuthResponse } from "../../services/auth";

export function AuthScreen({
  accounts,
  go,
  notify,
  onLogin,
}: {
  accounts: User[];
  go: (s: Screen) => void;
  notify: (s: string) => void;
  onLogin: (response: AuthResponse) => Promise<void>;
}) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get("user") || !fd.get("password"))
      return setError("Completa tu usuario y contraseña para continuar.");
    setLoading(true);
    try {
      const response = await login(String(fd.get("user")).trim(), String(fd.get("password")));
      await onLogin(response);
      setError("");
      notify("¡Qué gusto tenerte de vuelta!");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="auth-screen">
      <div className="auth-ornament one" />
      <div className="auth-ornament two" />
      <div className="brand-block">
        <Logo />
        <p>Juntos hacemos comunidad</p>
      </div>
      <div className="auth-panel">
        <span className="eyebrow">BIENVENIDA</span>
        <h1>Ingresa a tu comunidad</h1>
        <p>Servicios y apoyo vecinal, más cerca de ti.</p>
        <form onSubmit={submit}>
          <label>
            Usuario
            <input name="user" placeholder="Tu nombre de usuario" />
          </label>
          <label>
            Contraseña
            <div className="input-action">
              <input
                name="password"
                type={show ? "text" : "password"}
                placeholder="Tu contraseña"
              />
              <button type="button" onClick={() => setShow(!show)} aria-label="Mostrar contraseña">
                <Icon name="eye" size={20} />
              </button>
            </div>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
        <button className="text-button" onClick={() => go("recover")}>
          ¿Perdiste tu contraseña?
        </button>
        <div className="auth-divider">
          <span>o</span>
        </div>
        <p className="signup-copy">
          ¿Aún no tienes cuenta? <button onClick={() => go("register")}>Regístrate</button>
        </p>
      </div>
    </section>
  );
}
