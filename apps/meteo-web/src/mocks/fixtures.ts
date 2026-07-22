import type {
  EssentialWeather,
  LocationSummary,
  ResolvedLocation,
  WeatherCoordinates,
} from "../api/contracts";

export const locations: LocationSummary[] = [
  {
    id: "val-daigoual",
    label: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
    shortLabel: "Val-d’Aigoual",
    latitude: 44.081192,
    longitude: 3.641467,
  },
  {
    id: "paris",
    label: "Paris · Hôtel de Ville",
    shortLabel: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: "marseille",
    label: "Marseille · Hôtel de Ville",
    shortLabel: "Marseille",
    latitude: 43.2965,
    longitude: 5.3698,
  },
];

const profiles = {
  "val-daigoual": {
    municipality: { name: "Val-d’Aigoual", inseeCode: "30339" },
    department: { name: "Gard", code: "30" },
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
    municipality: { name: "Paris", inseeCode: "75056" },
    department: { name: "Paris", code: "75" },
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
    municipality: { name: "Marseille", inseeCode: "13055" },
    department: { name: "Bouches-du-Rhône", code: "13" },
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

export function resolvedLocationFixture(
  coordinates: WeatherCoordinates,
): ResolvedLocation {
  const preset = closestLocation(coordinates);
  const profile = profiles[preset.id as keyof typeof profiles] ?? profiles["val-daigoual"];
  return {
    coordinates: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
    label: profile.municipality.name,
    municipality: profile.municipality,
    department: profile.department,
    altitudeM: profile.altitudeM,
    resolution: { administrative: "ign", altitude: "ign" },
    unavailableSources: [],
    generatedAt: new Date().toISOString(),
  };
}

export function essentialWeatherFixture(
  coordinates: WeatherCoordinates,
): EssentialWeather {
  const preset = closestLocation(coordinates);
  const profile = profiles[preset.id as keyof typeof profiles] ?? profiles["val-daigoual"];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const isGps = coordinates.accuracyM !== undefined;
  const usesLocalObservation = preset.id === "val-daigoual";

  return {
    location: {
      id: isGps ? null : preset.id,
      label: isGps ? `Position GPS proche de ${preset.shortLabel}` : preset.label,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      municipality: profile.municipality,
      department: profile.department,
      altitudeM: profile.altitudeM,
      accuracyM: coordinates.accuracyM ?? null,
      source: isGps ? "gps" : "preset",
    },
    current: {
      temperatureC: profile.temperatureC,
      apparentTemperatureC: profile.apparentTemperatureC,
      weatherLabel: profile.weatherLabel,
      observedAt: now.toISOString(),
      nature: usesLocalObservation ? "observation" : "model",
      sourceLabel: usesLocalObservation
        ? "Température mesurée — station Infoclimat Valleraugue (1,6 km) ; reste estimé par AROME"
        : "AROME HD via Open-Meteo",
      stale: false,
      station: usesLocalObservation
        ? {
          id: "000UB",
          name: "Valleraugue",
          network: "infoclimat",
          altitudeM: 400,
          distanceKm: 1.6,
          altitudeDifferenceM: Math.abs(profile.altitudeM - 400),
          ageMinutes: 12,
          selectionScore: 11.4,
        }
        : null,
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
      title: {
        green: "Aucune vigilance particulière",
        yellow: "Vigilance jaune",
        orange: "Vigilance orange",
        red: "Vigilance rouge",
      }[profile.alertLevel],
      phenomena: profile.phenomena,
      validUntil: addHours(now, 24),
      sourceUrl: "https://vigilance.meteofrance.fr/fr",
      departmentCode: profile.department.code,
      indisponible: false,
    },
    unavailableSources: [],
    generatedAt: new Date().toISOString(),
  };
}
