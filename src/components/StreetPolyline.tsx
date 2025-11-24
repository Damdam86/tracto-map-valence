import { Polyline, Tooltip } from "react-leaflet";

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
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <div>
          <strong>{street.name}</strong>
          <br />
          {status} - {street.segments.length} segment(s)
        </div>
      </Tooltip>
    </Polyline>
  );
};

export default StreetPolyline;
