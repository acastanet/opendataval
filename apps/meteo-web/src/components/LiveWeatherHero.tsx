import type { LiveWeatherData } from "../api/contracts";
import { formatDateTime, temperature } from "../domain/presentation";

export function LiveWeatherHero({ data }: { data: LiveWeatherData }) {
  const { geography, temperature: weather } = data;
  const territory = geography?.territory.data;
  const address = geography?.address.data;
  const altitude = geography?.elevation.data?.meters ?? weather.location.altitudeMeters;
  const station = weather.stationSelection.selectedStation;
  const observed = weather.temperature.nature === "station_observation";
  const place = territory?.label ?? address?.formatted ?? "Votre position";

  return <>
    <section className="live-hero" aria-labelledby="live-weather-title">
      <p className="live-kicker">Météo locale · donnée en direct</p>
      <div className="live-place">
        <span aria-hidden="true" className="live-pin" />
        <div><h1 id="live-weather-title">{place}</h1><p>{address?.formatted ?? "Localisation résolue par les services OpenDataVal"}</p></div>
      </div>
      <div className="live-temperature-row">
        <div><p className="live-temperature" data-testid="current-temperature">{temperature(weather.temperature.valueCelsius)}<sup>°C</sup></p><p className="live-mode">{observed ? "Observation locale" : "Estimation au point"}</p></div>
        <div className="live-meta"><p>{observed ? "Mesurée" : "Calculée"}</p><strong>{formatDateTime(weather.temperature.referenceTime)}</strong>{weather.temperature.stale ? <span>Dernière donnée connue</span> : null}</div>
      </div>
    </section>
    <section className="live-facts" aria-label="Contexte de la mesure">
      <article><span>Lieu</span><strong>{territory?.commune.name ?? "En cours de résolution"}</strong><small>{territory?.department ? `${territory.department.name} (${territory.department.code})` : ""}</small></article>
      <article><span>Altitude</span><strong>{altitude === null || altitude === undefined ? "—" : `${Math.round(altitude)} m`}</strong><small>{altitude === null || altitude === undefined ? "Indisponible" : "Référence IGN"}</small></article>
      <article><span>Source</span><strong>{station ? station.name : weather.provenance.source.product}</strong><small>{station ? `${station.distanceKilometers.toFixed(1)} km · ${station.network}` : weather.provenance.source.provider}</small></article>
    </section>
    <section className="live-trust" aria-label="Méthode de la donnée">
      <p><b>{observed ? "Station retenue" : "Modèle au point"}</b>{station ? ` · ${station.distanceKilometers.toFixed(1)} km de votre position` : " · aucune station locale représentative disponible"}</p>
      <p>Référence : {formatDateTime(weather.temperature.referenceTime)}{weather.temperature.ageMinutes !== null ? ` · il y a ${Math.round(weather.temperature.ageMinutes)} min` : ""}</p>
    </section>
  </>;
}
