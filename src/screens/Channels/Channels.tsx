import { useEffect, useState } from "react";
import { Icon, Header } from "../../components/common/CommonComponents";
import { getHelpChannels, phoneLinks, type Channel, type District } from "../../services/catalogs";
import { GeographicFields } from "../Register/GeographicFields";

export function Channels({
  state,
  setState,
  district,
  districtId,
  back,
  notify,
}: {
  state: string;
  setState: (s: "idle" | "asking" | "granted" | "denied") => void;
  district: string;
  districtId?: number;
  back: () => void;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState<District>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"api" | "local">("local");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setChannels([]);
    setError("");
    setLoading(false);
    if (!selected) return;
    setLoading(true);
    void getHelpChannels(selected)
      .then((result) => {
        if (active) {
          setChannels(result.channels);
          setSource(result.source);
        }
      })
      .catch(() => {
        if (active) setError("No pudimos consultar los contactos guardados. Inténtalo nuevamente.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  const activate = () => {
    setState("asking");
    if (!navigator.geolocation) {
      setState("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setState("granted");
        notify("Permiso concedido. Confirma tu distrito para ver los contactos correctos.");
      },
      () => setState("denied"),
      { timeout: 5000 },
    );
  };
  return (
    <section className="page">
      <Header title="Canales de ayuda" kicker="CONTACTOS OFICIALES" onBack={back} />
      <div className="location-permission">
        <span>
          <Icon name="pin" size={27} />
        </span>
        <h2>Ayuda según tu distrito</h2>
        <p>
          Confirma tu distrito para mostrar los contactos locales y los canales regionales o
          nacionales que lo cubren.
        </p>
        {state !== "granted" && (
          <button className="primary-button" onClick={activate} disabled={state === "asking"}>
            {state === "asking" ? "Consultando permiso…" : "Activar ubicación"}
          </button>
        )}
        {state === "granted" && (
          <div className="permission-ok">
            <Icon name="check" />
            Permiso de ubicación concedido. Confirma el distrito a continuación.
          </div>
        )}
        <GeographicFields districtId={districtId} districtName={district} onChange={setSelected} />
      </div>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">AUTORIDADES</span>
          <h2>{selected ? `Contactos para ${selected.nombre}` : "Selecciona tu distrito"}</h2>
          {selected && (
            <p>
              {selected.provincia} · {selected.departamento}
            </p>
          )}
        </div>
      </div>
      {loading && <p role="status">Buscando canales de ayuda…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && selected && !channels.length && !error && (
        <p className="verification-note" role="status">
          No hay canales verificados guardados para esta ubicación.
        </p>
      )}
      <div className="authority-list">
        {channels.map((channel) => (
          <article key={channel.id}>
            <span className="authority-icon">
              <Icon name="phone" />
            </span>
            <div>
              <h3>{channel.nombreInstitucion}</h3>
              <p>
                {channel.tipoAyuda} · {channel.cobertura}
              </p>
              {channel.descripcion && <p>{channel.descripcion}</p>}
              <small>{channel.telefono}</small>
              <p>
                <small>Verificado: {channel.fechaVerificacion}</small>
              </p>
            </div>
            <div>
              {phoneLinks(channel.telefono).map((phone) => (
                <a
                  key={phone.href}
                  href={phone.href}
                  aria-label={`Llamar a ${channel.nombreInstitucion}: ${phone.label}`}
                >
                  <Icon name="phone" size={17} />
                  {phone.label}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
      {selected && !loading && (
        <p className="verification-note">
          {source === "api"
            ? "Contactos consultados en Kuska."
            : "Contactos guardados en este dispositivo. Pueden estar desactualizados."}{" "}
          Solo mostramos coberturas y números registrados con fuente y fecha de verificación.
        </p>
      )}
    </section>
  );
}
