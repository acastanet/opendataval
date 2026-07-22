import type { EssentialWeather } from "../api/contracts";

interface AlertBannerProps {
  alert: EssentialWeather["alert"];
}

export function AlertBanner({ alert }: AlertBannerProps) {
  const detail = alert.indisponible
    ? alert.departmentCode
      ? `Bulletin du département ${alert.departmentCode} temporairement indisponible.`
      : "Département non résolu : aucun niveau officiel affiché."
    : alert.phenomena.join(" · ");

  return (
    <section
      className={`alert-banner alert-banner--${alert.indisponible ? "unknown" : alert.level}`}
      aria-labelledby="alert-title"
    >
      <div className="alert-status" aria-hidden="true" />
      <div>
        <p className="eyebrow">Vigilance officielle</p>
        <h2 id="alert-title">{alert.indisponible ? "Vigilance indisponible" : alert.title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      <a href={alert.sourceUrl} target="_blank" rel="noreferrer">
        Bulletin<span className="sr-only"> Météo-France (nouvelle fenêtre)</span>
      </a>
    </section>
  );
}
