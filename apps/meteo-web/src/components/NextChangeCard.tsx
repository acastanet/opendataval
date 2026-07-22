import type { NextChange } from "../api/contracts";
import { formatTime } from "../domain/presentation";

interface NextChangeCardProps {
  change: NextChange;
}

export function NextChangeCard({ change }: NextChangeCardProps) {
  const quiet = change.type === "stable" || change.startsAt === null;
  const className = [
    "next-change",
    `next-change--${change.type}`,
    quiet ? "next-change--quiet" : null,
  ].filter(Boolean).join(" ");

  return (
    <section className={className} aria-labelledby="next-change-title">
      <div>
        <p className="eyebrow">Prochain changement</p>
        <h2 id="next-change-title">
          {quiet ? "Pas de changement marqué" : `Vers ${formatTime(change.startsAt as string)}`}
        </h2>
      </div>
      <p className="change-summary">{change.summary}</p>
      {change.probabilityPercent !== null ? (
        <p className="change-probability">
          <strong>{change.probabilityPercent}%</strong>
          <span>de probabilité</span>
        </p>
      ) : null}
    </section>
  );
}
