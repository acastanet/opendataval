import type { EssentialWeather } from "../api/contracts";
import {
  formatDateTime,
  freshnessLabel,
  temperature,
} from "../domain/presentation";

interface WeatherHeroProps {
  weather: EssentialWeather;
}

export function WeatherHero({ weather }: WeatherHeroProps) {
  return (
    <section className="weather-hero" aria-labelledby="current-weather-title">
      <div className="place-line">
        <span className="place-pin" aria-hidden="true" />
        <div>
          <h1 id="current-weather-title">{weather.location.label}</h1>
          <p>
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
          <p className="data-kind">{freshnessLabel(weather)}</p>
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
        {weather.current.sourceLabel} · {formatDateTime(weather.current.observedAt)}
      </p>
    </section>
  );
}
