import type { EssentialWeather } from "../api/contracts";
import {
  formatDateTime,
  temperature,
} from "../domain/presentation";
import { DataProvenancePanel } from "./DataProvenancePanel";

interface WeatherHeroProps {
  weather: EssentialWeather;
}

function currentTimeDescription(weather: EssentialWeather): string | null {
  const provenanceTime = weather.provenance.values.currentTemperature.time;

  if (provenanceTime.observedAt) {
    return `observation ${formatDateTime(provenanceTime.observedAt)}`;
  }
  if (provenanceTime.validAt) {
    return `prévision valable ${formatDateTime(provenanceTime.validAt)}`;
  }
  if (provenanceTime.generatedAt) {
    return `donnée produite ${formatDateTime(provenanceTime.generatedAt)}`;
  }
  if (provenanceTime.retrievedAt) {
    return `donnée récupérée ${formatDateTime(provenanceTime.retrievedAt)}`;
  }
  if (!weather.current.observedAt) return null;

  return weather.current.nature === "observation"
    ? `observation ${formatDateTime(weather.current.observedAt)}`
    : `prévision valable ${formatDateTime(weather.current.observedAt)}`;
}

export function WeatherHero({ weather }: WeatherHeroProps) {
  const administrativeLabel = weather.location.municipality
    ? weather.location.department
      ? `${weather.location.municipality.name} · ${weather.location.department.name} (${weather.location.department.code})`
      : weather.location.municipality.name
    : "Commune non disponible";
  const temperatureProvenance = weather.provenance.values.currentTemperature;
  const timeDescription = currentTimeDescription(weather);

  return (
    <section className="weather-hero" aria-labelledby="current-weather-title">
      <div className="place-line">
        <span className="place-pin" aria-hidden="true" />
        <div>
          <h1 id="current-weather-title">{weather.location.label}</h1>
          <p>
            {administrativeLabel}
            {" · "}
            {weather.location.altitudeM !== null
              ? `${weather.location.altitudeM} m d’altitude`
              : "Altitude non disponible"}
            {weather.location.accuracyM !== null
              ? ` · GPS ± ${Math.round(weather.location.accuracyM)} m`
              : ""}
          </p>
        </div>
      </div>

      <div className="now-grid">
        <div className="temperature-block">
          <p className="data-kind">{temperatureProvenance.label}</p>
          <p className="current-temperature" data-testid="current-temperature">
            {temperature(weather.current.temperatureC)}
            <span>°</span>
          </p>
        </div>

        <div className="current-details">
          <p className="condition">{weather.current.weatherLabel}</p>
          <p>
            Ressenti <strong>{temperature(weather.current.apparentTemperatureC)}°</strong>
          </p>
          <dl className="today-range">
            <div>
              <dt>Max.</dt>
              <dd>{temperature(weather.today.maximumC)}°</dd>
            </div>
            <div>
              <dt>Min.</dt>
              <dd>{temperature(weather.today.minimumC)}°</dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="source-line">
        {weather.current.sourceLabel}
        {timeDescription ? ` · ${timeDescription}` : ""}
      </p>

      <DataProvenancePanel provenance={weather.provenance} />
    </section>
  );
}
