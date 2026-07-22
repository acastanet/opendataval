import type { LocationSummary, WeatherCoordinates } from "../api/contracts";

interface LocationSelectorProps {
  locations: LocationSummary[];
  selected: WeatherCoordinates | null;
  locating: boolean;
  onLocate: () => void;
  onSelect: (location: LocationSummary) => void;
}

function isSelected(
  location: LocationSummary,
  selected: WeatherCoordinates | null,
): boolean {
  if (!selected || selected.accuracyM !== undefined) return false;
  return (
    Math.abs(location.latitude - selected.latitude) < 0.00001 &&
    Math.abs(location.longitude - selected.longitude) < 0.00001
  );
}

export function LocationSelector({
  locations,
  selected,
  locating,
  onLocate,
  onSelect,
}: LocationSelectorProps) {
  return (
    <section className="location-selector" aria-labelledby="location-title">
      <div className="section-heading">
        <p className="eyebrow" id="location-title">
          Votre météo, ici
        </p>
        <button
          type="button"
          className="locate-button"
          onClick={onLocate}
          disabled={locating}
          aria-busy={locating}
        >
          <span className="target-mark" aria-hidden="true" />
          {locating ? "Localisation…" : "Me localiser"}
        </button>
      </div>

      <div className="quick-locations" aria-label="Lieux rapides">
        {locations.map((location) => {
          const active = isSelected(location, selected);
          return (
            <button
              key={location.id}
              type="button"
              className={active ? "quick-location is-active" : "quick-location"}
              aria-pressed={active}
              onClick={() => onSelect(location)}
            >
              {location.shortLabel}
            </button>
          );
        })}
      </div>
    </section>
  );
}
