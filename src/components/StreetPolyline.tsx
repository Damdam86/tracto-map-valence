import { Polyline, Popup } from "react-leaflet";

interface StreetPolylineProps {
  street: {
    id: string;
    name: string;
    segments: Array<{ id: string; status: string }>;
  };
  positions: [number, number][];
  color: string;
  status: string;
}

const StreetPolyline = ({ street, positions, color, status }: StreetPolylineProps) => {
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: color,
        weight: 4,
        opacity: 0.8,
      }}
    >
      <Popup>
        <div style={{ padding: "8px" }}>
          <p style={{ fontWeight: 600, marginBottom: "4px" }}>{street.name}</p>
          <p style={{ 
            fontSize: "12px", 
            padding: "2px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            display: "inline-block",
            marginTop: "4px"
          }}>
            {status}
          </p>
          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
            {street.segments.length} segment(s)
          </p>
        </div>
      </Popup>
    </Polyline>
  );
};

export default StreetPolyline;
