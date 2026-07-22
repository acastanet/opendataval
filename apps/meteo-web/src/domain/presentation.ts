import type { AlertLevel, EssentialWeather } from "../api/contracts";

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function temperature(value: number): string {
  return Math.round(value).toLocaleString("fr-FR");
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso)).replace(":", " h ");
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso)).replace(":", " h ");
}

export function freshnessLabel(weather: EssentialWeather): string {
  if (weather.current.stale) return "Dernière donnée connue";
  return weather.current.nature === "observation"
    ? "Mesure locale"
    : "Estimation locale";
}

export function alertLabel(level: AlertLevel): string {
  return {
    green: "Aucune vigilance particulière",
    yellow: "Vigilance jaune",
    orange: "Vigilance orange",
    red: "Vigilance rouge",
  }[level];
}

export function alertRank(level: AlertLevel): number {
  return { green: 1, yellow: 2, orange: 3, red: 4 }[level];
}
