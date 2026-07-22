import type { EssentialWeather } from "../api/contracts";
import { formatTime, temperature } from "../domain/presentation";

interface HourlyStripProps {
  hours: EssentialWeather["nextHours"];
}

export function HourlyStrip({ hours }: HourlyStripProps) {
  return (
    <section className="hourly-section" aria-labelledby="hourly-title">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Évolution locale</p>
          <h2 id="hourly-title">Les prochaines heures</h2>
        </div>
        <a href="#analysis">Voir l’analyse</a>
      </div>
      <ol className="hourly-list">
        {hours.map((hour, index) => (
          <li key={hour.at}>
            <time dateTime={hour.at}>{index === 0 ? "Maintenant" : formatTime(hour.at)}</time>
            <strong>{temperature(hour.temperatureC)}°</strong>
            <span>{hour.rainProbabilityPercent}% pluie</span>
            <span>Raf. {Math.round(hour.windGustKmh)} km/h</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
