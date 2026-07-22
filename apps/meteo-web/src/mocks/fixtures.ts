import type {
  EssentialWeather,
  LocationSummary,
  WeatherCoordinates,
} from "../api/contracts";

export const locations: LocationSummary[] = [
  {
    id: "val-daigoual",
    label: "Mairie de Val-d’Aigoual, Valleraugue",
    shortLabel: "Val-d’Aigoual",
    latitude: 44.0802,
    longitude: 3.6413,
  },
  {
    id: "paris",
    label: "Paris",
    shortLabel: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: "marseille",
    label: "Marseille",
    shortLabel: "Marseille",
    latitude: 43.2965,
    longitude: 5.3698,
  },
];

const profiles = {
  "val-daigoual": {
    altitudeM: 351,
    temperatureC: 26.6,
    apparentTemperatureC: 27.8,
    minimumC: 17.2,
    maximumC: 29.1,
    weatherLabel: "Éclaircies, vent faible",
    change: "Averses possibles en fin d’après-midi.",
    probability: 40,
    alertLevel: "green" as const,
    phenomena: [] as string[],
    hourlyTemperatures: [26.6, 27.2, 26.4, 24.8, 23.5],
  },
  paris: {
    altitudeM: 42,
    temperatureC: 30.4,
    apparentTemperatureC: 32.1,
    minimumC: 21.3,
    maximumC: 33.2,
    weatherLabel: "Chaud et ensoleillé",
    change: "La température commencera à baisser.",
    probability: null,
    alertLevel: "yellow" as const,
    phenomena: ["Canicule"],
    hourlyTemperatures: [30.4, 31.2, 31.8, 30.9, 29.7],
  },
  marseille: {
    altitudeM: 12,
    temperatureC: 31.2,
    apparentTemperatureC: 34.5,
    minimumC: 24.1,
    maximumC: 34.3,
    weatherLabel: "Soleil, mistral modéré",
    change: "Rafales plus fortes près du littoral.",
    probability: null,
    alertLevel: "orange" as const,
    phenomena: ["Canicule"],
    hourlyTemperatures: [31.2, 32.3, 32.8, 31.9, 30.6],
  },
};

function closestLocation(coordinates: WeatherCoordinates): LocationSummary {
  return locations.reduce((closest, candidate) => {
    const distance = Math.hypot(
      candidate.latitude - coordinates.latitude,
      candidate.longitude - coordinates.longitude,
    );
    const closestDistance = Math.hypot(
      closest.latitude - coordinates.latitude,
      closest.longitude - coordinates.longitude,
    );
    return distance < closestDistance ? candidate : closest;
  });
}

function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1_000).toISOString();
}

export function essentialWeatherFixture(
  coordinates: WeatherCoordinates,
): EssentialWeather {
  const preset = closestLocation(coordinates);
  const profile = profiles[preset.id as keyof typeof profiles] ?? profiles["val-daigoual"];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const isGps = coordinates.accuracyM !== undefined;

  return {
    location: {
      id: isGps ? null : preset.id,
      label: isGps ? `Position GPS proche de ${preset.shortLabel}` : preset.label,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      altitudeM: profile.altitudeM,
      accuracyM: coordinates.accuracyM ?? null,
      source: isGps ? "gps" : "preset",
    },
    current: {
      temperatureC: profile.temperatureC,
      apparentTemperatureC: profile.apparentTemperatureC,
      weatherLabel: profile.weatherLabel,
      observedAt: now.toISOString(),
      nature: "model",
      sourceLabel: "AROME HD via Open-Meteo",
      stale: false,
    },
    today: {
      minimumC: profile.minimumC,
      maximumC: profile.maximumC,
    },
    nextChange: {
      type: profile.probability === null ? "temperature" : "rain",
      startsAt: addHours(now, 3),
      summary: profile.change,
      probabilityPercent: profile.probability,
    },
    nextHours: profile.hourlyTemperatures.map((temperatureC, index) => ({
      at: addHours(now, index),
      temperatureC,
      rainProbabilityPercent: profile.probability === null ? 5 : Math.max(10, profile.probability - 20 + index * 10),
      windGustKmh: preset.id === "marseille" ? 38 + index * 4 : 14 + index * 2,
    })),
    alert: {
      level: profile.alertLevel,
      title: profile.alertLevel === "green" ? "Aucune vigilance particulière" : `Vigilance ${profile.alertLevel}`,
      phenomena: profile.phenomena,
      validUntil: addHours(now, 24),
      sourceUrl: "https://vigilance.meteofrance.fr/fr",
      indisponible: false,
    },
    unavailableSources: [],
    generatedAt: new Date().toISOString(),
  };
}
