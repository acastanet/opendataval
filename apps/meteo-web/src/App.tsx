import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EssentialWeather,
  LocationSummary,
  WeatherCoordinates,
} from "./api/contracts";
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
  const operationRef = useRef(0);
  const lastSuccessfulWeatherRef = useRef<EssentialWeather | null>(null);

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

  useEffect(() => {
    if (weatherQuery.data) {
      lastSuccessfulWeatherRef.current = weatherQuery.data;
    }
  }, [weatherQuery.data]);

  function selectLocation(location: LocationSummary) {
    operationRef.current += 1;
    setLocating(false);
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

    const operation = ++operationRef.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (operation !== operationRef.current) return;
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyM: coords.accuracy,
        });
        setLocating(false);
      },
      (error) => {
        if (operation !== operationRef.current) return;
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError(
            "La localisation est refusée pour ce site. Autorisez-la dans les réglages du navigateur puis réessayez.",
          );
        } else if (error.code === error.TIMEOUT) {
          setLocationError(
            "Le téléphone n’a pas obtenu votre position à temps. Vérifiez que la localisation est activée puis réessayez.",
          );
        } else {
          setLocationError(
            "Le téléphone n’a pas réussi à déterminer votre position. Vérifiez que la localisation est activée puis réessayez.",
          );
        }
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 120_000 },
    );
  }

  const weather = weatherQuery.data ?? lastSuccessfulWeatherRef.current;
  const loading =
    locationsQuery.isPending ||
    (coordinates !== null && weatherQuery.isPending && weather === null);
  const loadingError = locationsQuery.error ?? weatherQuery.error;
  const refreshError = weather !== null ? weatherQuery.error : null;

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

        {loadingError && weather === null ? (
          <section className="load-error" role="alert">
            <p className="eyebrow">Service indisponible</p>
            <h1>La météo n’a pas pu être chargée.</h1>
            <p>{loadingError.message}</p>
            <button type="button" onClick={() => void weatherQuery.refetch()}>Réessayer</button>
          </section>
        ) : null}

        {refreshError ? (
          <p className="inline-error" role="alert">
            La nouvelle position n’a pas pu être chargée. La dernière météo reste affichée.
          </p>
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
