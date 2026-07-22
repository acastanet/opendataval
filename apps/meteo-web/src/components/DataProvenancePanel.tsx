import type { WeatherProvenance } from "../api/contracts";
import { formatDateTime } from "../domain/presentation";

interface DataProvenancePanelProps {
  provenance: WeatherProvenance;
}

function valueTime(value: WeatherProvenance["values"][keyof WeatherProvenance["values"]]): string | null {
  return value.time.observedAt
    ?? value.time.validAt
    ?? value.time.generatedAt
    ?? value.time.retrievedAt;
}

function timeDescription(
  value: WeatherProvenance["values"][keyof WeatherProvenance["values"]],
): string | null {
  const iso = valueTime(value);
  if (!iso) return null;
  if (value.time.observedAt) return `Observée ${formatDateTime(iso)}`;
  if (value.time.validAt) return `Valable ${formatDateTime(iso)}`;
  if (value.time.generatedAt) return `Produite ${formatDateTime(iso)}`;
  return `Récupérée ${formatDateTime(iso)}`;
}

function sourceDescription(
  value: WeatherProvenance["values"][keyof WeatherProvenance["values"]],
): string {
  if (!value.source) return value.label;
  const details = [value.source.product, value.source.model].filter(Boolean).join(" · ");
  return details ? `${value.source.name} — ${details}` : value.source.name;
}

function selectionDescription(selection: WeatherProvenance["stationSelection"]): string {
  switch (selection.status) {
    case "selected":
      return selection.eligibleCandidates && selection.eligibleCandidates > 1
        ? `Une station a été retenue parmi ${selection.eligibleCandidates} stations admissibles.`
        : "Une station locale répondant aux critères a été retenue.";
    case "no_measurements":
      return "Aucune mesure locale valide et suffisamment récente n’a été trouvée.";
    case "no_eligible_station":
      return selection.evaluatedCandidates
        ? `${selection.evaluatedCandidates} mesure(s) locale(s) ont été évaluées, sans station suffisamment représentative.`
        : "Aucune station suffisamment représentative n’a été trouvée.";
    case "provider_unavailable":
      return "Les observations locales sont momentanément indisponibles ; le modèle reste utilisé.";
    case "not_evaluated":
      return "La sélection d’une station locale n’a pas été exécutée pour cette réponse.";
  }
}

export function DataProvenancePanel({ provenance }: DataProvenancePanelProps) {
  const temperature = provenance.values.currentTemperature;
  const forecast = provenance.values.nextHours;
  const alert = provenance.values.alert;

  return (
    <div className="provenance-block">
      <div className={`provenance-summary provenance-summary--${provenance.weatherMode}`}>
        <span className="provenance-badge">{temperature.label}</span>
        <p>{provenance.summary}</p>
      </div>

      <details className="provenance-details">
        <summary>D’où viennent ces données ?</summary>
        <div className="provenance-grid">
          <section>
            <p className="eyebrow">Température</p>
            <h2>{sourceDescription(temperature)}</h2>
            {timeDescription(temperature) ? <p>{timeDescription(temperature)}</p> : null}
            {temperature.station ? (
              <dl>
                <div>
                  <dt>Station</dt>
                  <dd>{temperature.station.name}</dd>
                </div>
                <div>
                  <dt>Distance</dt>
                  <dd>{temperature.station.distanceKm.toLocaleString("fr-FR")} km</dd>
                </div>
                <div>
                  <dt>Écart d’altitude</dt>
                  <dd>
                    {temperature.station.altitudeDifferenceM === null
                      ? "Non calculé"
                      : `${Math.round(temperature.station.altitudeDifferenceM)} m`}
                  </dd>
                </div>
                <div>
                  <dt>Ancienneté</dt>
                  <dd>{Math.round(temperature.station.ageMinutes)} min</dd>
                </div>
              </dl>
            ) : null}
          </section>

          <section>
            <p className="eyebrow">Prévisions</p>
            <h2>{sourceDescription(forecast)}</h2>
            {timeDescription(forecast) ? <p>{timeDescription(forecast)}</p> : null}
            {forecast.quality.spatialResolution ? (
              <p>Résolution annoncée : {forecast.quality.spatialResolution}.</p>
            ) : null}
          </section>

          <section>
            <p className="eyebrow">Vigilance</p>
            <h2>{sourceDescription(alert)}</h2>
            {timeDescription(alert) ? <p>{timeDescription(alert)}</p> : null}
            {alert.notes.map((note) => <p key={note}>{note}</p>)}
          </section>

          <section>
            <p className="eyebrow">Observation locale</p>
            <h2>Sélection automatique · politique {provenance.stationSelection.policyVersion}</h2>
            <p>{selectionDescription(provenance.stationSelection)}</p>
          </section>
        </div>
      </details>
    </div>
  );
}
