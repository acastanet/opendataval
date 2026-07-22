import type { WeatherProvenance } from "../api/contracts";
import { formatDateTime } from "../domain/presentation";

interface DataProvenancePanelProps {
  provenance: WeatherProvenance;
}

type StationSelection = WeatherProvenance["stationSelection"];
type StationCandidate = NonNullable<StationSelection["nearestCandidate"]>;

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

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

function selectionDescription(selection: StationSelection): string {
  const publicMessage = (selection as { message?: unknown }).message;
  if (typeof publicMessage === "string" && publicMessage.length > 0) return publicMessage;

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

function summaryDescription(provenance: WeatherProvenance): string {
  const selection = provenance.stationSelection;

  if (provenance.weatherMode === "hybrid") {
    return "La température provient d’une station locale ; le ressenti et les prévisions restent modélisés.";
  }
  if (provenance.weatherMode === "observation") {
    return "Les conditions actuelles proviennent d’une station locale.";
  }
  if (provenance.weatherMode === "unavailable") {
    return provenance.summary;
  }

  switch (selection.status) {
    case "no_eligible_station":
      return "Aucune station suffisamment représentative. La température affichée provient donc du modèle.";
    case "no_measurements":
      return "Aucune observation locale valide n’est disponible. La température affichée provient du modèle.";
    case "provider_unavailable":
      return "Les observations locales sont momentanément indisponibles. La température affichée provient du modèle.";
    case "not_evaluated":
      return "La température affichée provient du modèle ; la sélection d’une station locale n’a pas été exécutée.";
    case "selected":
      return provenance.summary;
  }
}

function networkLabel(network: StationCandidate["network"]): string {
  return network === "meteofrance" ? "Météo-France" : "Infoclimat";
}

function ageLabel(ageMinutes: number | null): string {
  if (ageMinutes === null) return "Non déterminée";
  const rounded = Math.max(0, Math.round(ageMinutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, "0")}`;
}

function rejectionLabel(reason: string): string {
  switch (reason) {
    case "INVALID_TEMPERATURE":
      return "Température absente ou invalide";
    case "INVALID_TIMESTAMP":
      return "Heure d’observation absente ou invalide";
    case "FUTURE_TIMESTAMP":
      return "Observation datée anormalement dans le futur";
    case "TOO_OLD":
      return "Observation trop ancienne";
    case "TOO_FAR":
      return "Station trop éloignée";
    case "ALTITUDE_UNKNOWN_TOO_FAR":
      return "Altitude du lieu inconnue et station trop éloignée";
    case "ALTITUDE_MISMATCH":
      return "Écart d’altitude trop important";
    case "SCORE_TOO_HIGH":
      return "Représentativité globale insuffisante";
    case "ELIGIBLE_NOT_SELECTED":
      return "Une autre station a obtenu un meilleur classement";
    default:
      return "Critère de représentativité non satisfait";
  }
}

function SelectionCounts({ selection }: { selection: StationSelection }) {
  const received = (selection as { receivedMeasurements?: number | null }).receivedMeasurements;
  if (received == null && selection.evaluatedCandidates == null && selection.eligibleCandidates == null) {
    return null;
  }

  return (
    <dl className="selection-counts" aria-label="Bilan de la sélection des stations">
      <div>
        <dt>Mesures reçues</dt>
        <dd>{received ?? "—"}</dd>
      </div>
      <div>
        <dt>Stations évaluées</dt>
        <dd>{selection.evaluatedCandidates ?? "—"}</dd>
      </div>
      <div>
        <dt>Stations admissibles</dt>
        <dd>{selection.eligibleCandidates ?? "—"}</dd>
      </div>
    </dl>
  );
}

function CandidateCard({ candidate }: { candidate: StationCandidate }) {
  return (
    <div className="station-candidate">
      <p className="station-candidate__label">
        {candidate.selected ? "Station retenue" : "Station la plus proche examinée"}
      </p>
      <h3>{candidate.name}</h3>
      <p>{networkLabel(candidate.network)} · identifiant {candidate.id}</p>

      <dl>
        <div>
          <dt>Distance</dt>
          <dd>{number.format(candidate.distanceKm)} km</dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>{Math.round(candidate.altitudeM)} m</dd>
        </div>
        <div>
          <dt>Écart d’altitude</dt>
          <dd>
            {candidate.altitudeDifferenceM === null
              ? "Non calculé"
              : `${Math.round(candidate.altitudeDifferenceM)} m`}
          </dd>
        </div>
        <div>
          <dt>Ancienneté</dt>
          <dd>{ageLabel(candidate.ageMinutes)}</dd>
        </div>
      </dl>

      {candidate.observedAt ? <p>Dernière observation : {formatDateTime(candidate.observedAt)}.</p> : null}

      {candidate.rejectionReasons.length > 0 ? (
        <div className="station-rejections">
          <h4>Pourquoi cette station n’a pas été retenue</h4>
          <ul>
            {candidate.rejectionReasons.map((reason) => (
              <li key={reason}>{rejectionLabel(reason)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="station-candidate__accepted">Cette station satisfait les critères appliqués.</p>
      )}
    </div>
  );
}

function SelectionCriteria({ selection }: { selection: StationSelection }) {
  const criteria = (selection as Partial<StationSelection>).criteria;
  if (!criteria || selection.status === "provider_unavailable" || selection.status === "not_evaluated") {
    return null;
  }

  return (
    <div className="selection-criteria">
      <h3>Critères appliqués</h3>
      <p>
        Distance maximale {number.format(criteria.maximumDistanceKm)} km · écart d’altitude maximal{" "}
        {Math.round(criteria.maximumAltitudeDifferenceM)} m · observation âgée de moins de{" "}
        {Math.round(criteria.maximumObservationAgeMinutes)} min.
      </p>
      <p>
        Lorsque l’altitude du lieu n’est pas connue, la station doit se trouver à moins de{" "}
        {number.format(criteria.maximumDistanceWithoutAltitudeKm)} km.
      </p>
    </div>
  );
}

export function DataProvenancePanel({ provenance }: DataProvenancePanelProps) {
  const temperature = provenance.values.currentTemperature;
  const forecast = provenance.values.nextHours;
  const alert = provenance.values.alert;
  const selection = provenance.stationSelection;
  const candidate = (selection as Partial<StationSelection>).nearestCandidate;
  const rejectionSummary = (selection as Partial<StationSelection>).rejectionSummary;

  return (
    <div className="provenance-block">
      <div className={`provenance-summary provenance-summary--${provenance.weatherMode}`}>
        <p>{summaryDescription(provenance)}</p>
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

          <section className="station-selection-section">
            <p className="eyebrow">Observation locale</p>
            <h2>Sélection automatique · politique {selection.policyVersion}</h2>
            <p>{selectionDescription(selection)}</p>
            <SelectionCounts selection={selection} />

            {selection.status !== "selected" && candidate ? <CandidateCard candidate={candidate} /> : null}

            {rejectionSummary && rejectionSummary.length > 1 ? (
              <div className="rejection-summary">
                <h3>Motifs relevés sur l’ensemble des stations</h3>
                <ul>
                  {rejectionSummary.map(({ reason, count }) => (
                    <li key={reason}>
                      {rejectionLabel(reason)} : {count}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <SelectionCriteria selection={selection} />
          </section>
        </div>
      </details>
    </div>
  );
}
