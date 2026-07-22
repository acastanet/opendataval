import type { EssentialWeather } from "../api/contracts";
import { alertLabel } from "../domain/presentation";

interface AlertBannerProps {
  alert: EssentialWeather["alert"];
}

export function AlertBanner({ alert }: AlertBannerProps) {
  return (
    <section className={`alert-banner alert-banner--${alert.level}`} aria-labelledby="alert-title">
      <div className="alert-status" aria-hidden="true" />
      <div>
        <p className="eyebrow">Vigilance officielle</p>
        <h2 id="alert-title">{alertLabel(alert.level)}</h2>
        {alert.phenomena.length > 0 ? <p>{alert.phenomena.join(" · ")}</p> : null}
      </div>
      <a href={alert.sourceUrl} target="_blank" rel="noreferrer">
        Bulletin<span className="sr-only"> Météo-France (nouvelle fenêtre)</span>
      </a>
    </section>
  );
}
