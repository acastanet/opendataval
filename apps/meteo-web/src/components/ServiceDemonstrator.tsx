import type { ReactNode } from "react";
import type { LiveWeatherData } from "../api/contracts";
import { formatDateTime, temperature } from "../domain/presentation";

function Status({ value }: { value: string }) {
  return <span className={`service-status service-status--${value}`}>{value.replace("_", " ")}</span>;
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return <div className="service-value"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function ServiceDemonstrator({ data }: { data: LiveWeatherData }) {
  const geography = data.geography;
  const weather = data.temperature;
  const station = weather.stationSelection.selectedStation;

  return <section className="service-demo" aria-labelledby="service-demo-title">
    <div className="service-demo-intro"><p className="eyebrow">Démonstrateur technique</p><h1 id="service-demo-title">Les deux services, sans boîte noire.</h1><p>Chaque bloc ci-dessous correspond à une réponse réellement reçue du gateway pour le lieu sélectionné.</p></div>

    <article className="service-card">
      <header><div><p className="service-name">01 · Geography</p><h2>Résolution du lieu</h2></div><Status value={geography ? "available" : "unavailable"} /></header>
      {geography ? <>
        <dl className="service-grid">
          <Value label="Coordonnées">{geography.query.latitude.toFixed(6)}, {geography.query.longitude.toFixed(6)}</Value>
          <Value label="Origine">{geography.query.positionSource}</Value>
          <Value label="Territoire"><Status value={geography.territory.status} /> {geography.territory.data?.label ?? "—"}</Value>
          <Value label="Commune">{geography.territory.data?.commune.name ?? "—"} · {geography.territory.data?.commune.inseeCode ?? "—"}</Value>
          <Value label="Département">{geography.territory.data?.department.name ?? "—"} ({geography.territory.data?.department.code ?? "—"})</Value>
          <Value label="Adresse"><Status value={geography.address.status} /> {geography.address.data?.formatted ?? "—"}</Value>
          <Value label="Précision adresse">{geography.address.data?.precision ?? "—"}{geography.address.data?.distanceMeters !== null && geography.address.data?.distanceMeters !== undefined ? ` · ${Math.round(geography.address.data.distanceMeters)} m` : ""}</Value>
          <Value label="Altitude"><Status value={geography.elevation.status} /> {geography.elevation.data ? `${Math.round(geography.elevation.data.meters)} m` : "—"}</Value>
          <Value label="Request ID">{geography.requestId}</Value>
        </dl>
        <details><summary>Réponse Geography complète</summary><pre>{JSON.stringify(geography, null, 2)}</pre></details>
      </> : <p className="service-unavailable">Le service Geography n’a pas répondu, mais Weather reste affiché lorsque sa résolution interne réussit.</p>}
    </article>

    <article className="service-card">
      <header><div><p className="service-name">02 · Weather</p><h2>Détermination de température</h2></div><Status value={weather.degraded ? "degraded" : "available"} /></header>
      <dl className="service-grid">
        <Value label="Température"><strong className="service-temperature">{temperature(weather.temperature.valueCelsius)} °C</strong></Value>
        <Value label="Nature">{weather.temperature.nature}</Value>
        <Value label="Référence">{formatDateTime(weather.temperature.referenceTime)}</Value>
        <Value label="Qualité">{weather.temperature.quality}{weather.temperature.stale ? " · dernière donnée connue" : ""}</Value>
        <Value label="Sélection station"><Status value={weather.stationSelection.status} /></Value>
        <Value label="Station">{station ? `${station.name} · ${station.network}` : "Aucune station retenue"}</Value>
        <Value label="Distance">{station ? `${station.distanceKilometers.toFixed(1)} km` : "—"}</Value>
        <Value label="Écart altitude">{station?.altitudeDifferenceMeters === null || station?.altitudeDifferenceMeters === undefined ? "—" : `${Math.round(station.altitudeDifferenceMeters)} m`}</Value>
        <Value label="Fournisseur">{weather.provenance.source.provider} · {weather.provenance.source.product}</Value>
        <Value label="Méthode">{weather.method ? `${weather.method.id} v${weather.method.version} · politique ${weather.method.stationSelectionPolicyVersion}` : "—"}</Value>
        <Value label="Sources indisponibles">{weather.unavailableSources.length ? weather.unavailableSources.join(", ") : "Aucune"}</Value>
        <Value label="Request ID">{weather.requestId}</Value>
      </dl>
      <details><summary>Réponse Weather complète</summary><pre>{JSON.stringify(weather, null, 2)}</pre></details>
    </article>
  </section>;
}
