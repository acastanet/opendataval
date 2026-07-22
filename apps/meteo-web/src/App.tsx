import { useEffect, useMemo, useState } from "react";
import type { LocationSummary, WeatherCoordinates } from "./api/contracts";
import { useEssentialWeather, useLocations } from "./api/queries";
import { AlertBanner } from "./components/AlertBanner";
import { HourlyStrip } from "./components/HourlyStrip";
import { LocationSelector } from "./components/LocationSelector";
import { NextChangeCard } from "./components/NextChangeCard";
import { WeatherHero } from "./components/WeatherHero";

export default function App() {
  const locationsQuery = useLocations();
  const [coordinates, setCoordinates] = useState<WeatherCoordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const firstLocation = locationsQuery.data?.locations[0];
    if (coordinates === null && firstLocation) {
      setCoordinates({
        latitude: firstLocation.latitude,
        longitude: firstLocation.longitude,
      });
    }
  }, [coordinates, locationsQuery.data]);

  const weatherQuery = useEssentialWeather(coordinates);
  const locations = useMemo(
    () => locationsQuery.data?.locations ?? [],
    [locationsQuery.data],
  );

  function selectLocation(location: LocationSummary) {
    setLocationError(null);
    setCoordinates({
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }

  function locateUser() {
    setLocationError(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError("La localisation nécessite une page HTTPS et un navigateur compatible.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyM: coords.accuracy,
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "La localisation a été refusée. Vous pouvez choisir un lieu rapide."
            : "Votre position n’a pas pu être déterminée. Réessayez ou choisissez un lieu rapide.",
        );
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 120_000 },
    );
  }

  const weather = weatherQuery.data;
  const loading = locationsQuery.isPending || (coordinates !== null && weatherQuery.isPending);
  const loadingError = locationsQuery.error ?? weatherQuery.error;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/meteo-v2/" aria-label="OpenDataVal — Météo essentielle">
          <span className="brand-mark" aria-hidden="true">ODV</span>
          <span>
            <strong>Météo essentielle</strong>
            <small>OpenDataVal</small>
          </span>
        </a>
        <a className="about-link" href="/meteo/informations/">Sources & limites</a>
      </header>

      <main>
        <LocationSelector
          locations={locations}
          selected={coordinates}
          locating={locating}
          onLocate={locateUser}
          onSelect={selectLocation}
        />

        {locationError ? <p className="inline-error" role="alert">{locationError}</p> : null}

        {loading ? (
          <div className="weather-skeleton" role="status">
            <span className="sr-only">Chargement de la météo…</span>
            <div />
            <div />
            <div />
          </div>
        ) : null}

        {loadingError ? (
          <section className="load-error" role="alert">
            <p className="eyebrow">Service indisponible</p>
            <h1>La météo n’a pas pu être chargée.</h1>
            <p>{loadingError.message}</p>
            <button type="button" onClick={() => void weatherQuery.refetch()}>Réessayer</button>
          </section>
        ) : null}

        {weather ? (
          <>
            <WeatherHero weather={weather} />
            <NextChangeCard change={weather.nextChange} />
            <AlertBanner alert={weather.alert} />
            <HourlyStrip hours={weather.nextHours} />
            {weather.unavailableSources.length > 0 ? (
              <p className="source-warning" role="status">
                Données partielles : {weather.unavailableSources.join(", ")} indisponible(s).
              </p>
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="site-footer" id="analysis">
        <p>Prévision locale, sources publiques et limites toujours explicites.</p>
        <nav aria-label="Analyses météo">
          <a href="/meteo/comparaison/">Révisions J−1 / J</a>
          <a href="/meteo/bilan-thermique/">Bilan thermique</a>
        </nav>
      </footer>
    </div>
  );
}
