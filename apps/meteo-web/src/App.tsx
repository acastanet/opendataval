import { useRef, useState } from "react";
import type { LocationSummary, WeatherCoordinates } from "./api/contracts";
import { useLiveWeather } from "./api/queries";
import { LiveWeatherHero } from "./components/LiveWeatherHero";
import { LocationSelector } from "./components/LocationSelector";
import { ServiceDemonstrator } from "./components/ServiceDemonstrator";

const places: LocationSummary[] = [
  { id: "val-daigoual", shortLabel: "Val-d’Aigoual", label: "Val-d’Aigoual", latitude: 44.081192, longitude: 3.641467 },
  { id: "le-vigan", shortLabel: "Le Vigan", label: "Le Vigan", latitude: 43.991, longitude: 3.606 },
  { id: "l-esperou", shortLabel: "L’Espérou", label: "L’Espérou", latitude: 44.121, longitude: 3.535 },
  { id: "paris", shortLabel: "Paris", label: "Paris", latitude: 48.8566, longitude: 2.3522 },
  { id: "marseille", shortLabel: "Marseille", label: "Marseille", latitude: 43.2965, longitude: 5.3698 },
];

export default function App() {
  const [coordinates, setCoordinates] = useState<WeatherCoordinates>(places[0]!);
  const [source, setSource] = useState<"browser-geolocation" | "manual" | "unknown">("manual");
  const [locating, setLocating] = useState(false);
  const [activeTab, setActiveTab] = useState<"weather" | "services">("weather");
  const [locationError, setLocationError] = useState<string | null>(null);
  const operationRef = useRef(0);
  const weatherQuery = useLiveWeather(coordinates, source);

  function selectLocation(location: LocationSummary) {
    operationRef.current += 1;
    setLocating(false); setLocationError(null); setSource("manual");
    setCoordinates({ latitude: location.latitude, longitude: location.longitude });
  }

  function locateUser() {
    setLocationError(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError("La localisation nécessite HTTPS et un navigateur compatible."); return;
    }
    const operation = ++operationRef.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (operation !== operationRef.current) return;
      setCoordinates({ latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy });
      setSource("browser-geolocation"); setLocating(false);
    }, (error) => {
      if (operation !== operationRef.current) return;
      setLocating(false);
      setLocationError(error.code === error.PERMISSION_DENIED
        ? "La localisation est refusée. Autorisez-la dans les réglages du navigateur puis réessayez."
        : "Votre position n’a pas pu être déterminée. Vérifiez que la localisation est activée puis réessayez.");
    }, { enableHighAccuracy: false, timeout: 20_000, maximumAge: 120_000 });
  }

  return <div className="app-shell live-app">
    <header className="site-header live-header">
      <a className="brand" href="/meteo-v2/" aria-label="OpenDataVal — Météo locale"><span className="brand-mark">ODV</span><span><strong>Météo locale</strong><small>Val-d’Aigoual · en direct</small></span></a>
      <span className="live-badge">BÊTA · v2</span>
    </header>
    <main>
      <div className="live-tabs" role="tablist" aria-label="Vues météo V2">
        <button id="weather-tab" role="tab" type="button" aria-selected={activeTab === "weather"} aria-controls="weather-panel" onClick={() => setActiveTab("weather")}>Météo locale</button>
        <button id="services-tab" role="tab" type="button" aria-selected={activeTab === "services"} aria-controls="services-panel" onClick={() => setActiveTab("services")}>Démonstrateur</button>
      </div>
      <LocationSelector locations={places} selected={coordinates} locating={locating} onLocate={locateUser} onSelect={selectLocation} />
      {locationError ? <p className="inline-error" role="alert">{locationError}</p> : null}
      {weatherQuery.isPending ? <div className="weather-skeleton" role="status"><span className="sr-only">Chargement de la météo en direct…</span><div /><div /><div /></div> : null}
      {weatherQuery.error ? <section className="load-error" role="alert"><p className="eyebrow">Service indisponible</p><h1>La température n’a pas pu être chargée.</h1><p>{weatherQuery.error.message}</p><button type="button" onClick={() => void weatherQuery.refetch()}>Réessayer</button></section> : null}
      {weatherQuery.data && activeTab === "weather" ? <div id="weather-panel" role="tabpanel" aria-labelledby="weather-tab"><LiveWeatherHero data={weatherQuery.data} /></div> : null}
      {weatherQuery.data && activeTab === "services" ? <div id="services-panel" role="tabpanel" aria-labelledby="services-tab"><ServiceDemonstrator data={weatherQuery.data} /></div> : null}
    </main>
    <footer className="site-footer live-footer"><p>Cette première page teste Geography, Weather et Weather Vigilance via le gateway. La vigilance affichée est officielle et départementale ; les prévisions et routes historiques restent séparées.</p><a href="/meteo/essentiel/">Voir la météo essentielle existante</a></footer>
  </div>;
}
