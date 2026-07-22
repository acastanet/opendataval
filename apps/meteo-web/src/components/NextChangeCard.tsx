import type { NextChange } from "../api/contracts";
import { formatTime } from "../domain/presentation";

interface NextChangeCardProps {
  change: NextChange;
}

export function NextChangeCard({ change }: NextChangeCardProps) {
  return (
    <section className={`next-change next-change--${change.type}`} aria-labelledby="next-change-title">
      <div>
        <p className="eyebrow">Prochain changement</p>
        <h2 id="next-change-title">
          {change.startsAt ? `Vers ${formatTime(change.startsAt)}` : "Pas de changement marqué"}
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
