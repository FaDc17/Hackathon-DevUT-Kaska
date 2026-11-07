import { Icon } from "../../components/common/CommonComponents";

export function DemoMap({ single = false }: { single?: boolean }) {
  return (
    <div className="demo-map">
      <span className="map-road r1" />
      <span className="map-road r2" />
      <span className="map-road r3" />
      <span className="map-park" />
      {!single && (
        <>
          <span className="marker service" style={{ left: "25%", top: "29%" }}>
            <Icon name="tools" size={14} />
          </span>
          <span className="marker need" style={{ left: "72%", top: "56%" }}>
            <Icon name="user" size={14} />
          </span>
          <span className="marker emergency" style={{ left: "50%", top: "20%" }}>
            <Icon name="alert" size={14} />
          </span>
        </>
      )}
      <span
        className="marker solidarity"
        style={{ left: single ? "48%" : "43%", top: single ? "45%" : "66%" }}
      >
        <Icon name="pin" size={14} />
      </span>
      <small>Mapa demostrativo · ubicación aproximada</small>
    </div>
  );
}
