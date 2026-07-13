import L from 'leaflet';
import { useRoutes } from '../context/RoutesContext';
import { useMapRef } from '../context/MapContext';

export function RouteList() {
  const { routes, toggleRouteVisible, removeRoute } = useRoutes();
  const mapRef = useMapRef();

  function zoomToRoute(routeId: string) {
    const route = routes.find((candidate) => candidate.id === routeId);
    const map = mapRef.current;
    if (!route || !map) return;
    const bounds = L.geoJSON(route.geojson).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.18));
    }
  }

  if (routes.length === 0) {
    return <div className="item-list empty-state">No routes imported.</div>;
  }

  return (
    <div className="item-list">
      {routes.map((route) => (
        <article className="list-item" key={route.id}>
          <div className="item-main">
            <div className="item-title">
              <span className="route-swatch" />
              {route.displayName}
            </div>
            <div className="item-meta">{route.filename}</div>
          </div>
          <div className="item-actions">
            <button type="button" onClick={() => toggleRouteVisible(route.id)}>
              {route.visible ? 'Hide' : 'Show'}
            </button>
            <button type="button" onClick={() => zoomToRoute(route.id)}>
              Zoom
            </button>
            <button type="button" onClick={() => removeRoute(route.id)}>
              Remove
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
