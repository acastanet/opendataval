import cron from "node-cron";
import { createPool, runMigrations } from "@opendata-vda/shared";
import { JOBS, runAllOnce, runJob } from "./scheduler.js";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "/app/db/migrations";

async function main(): Promise<void> {
  const pool = createPool();
  await runMigrations(pool, MIGRATIONS_DIR);

  if (process.env.RUN_ONCE === "true") {
    const only = process.env.RUN_ONLY;
    let jobs = JOBS;
    if (only) {
      jobs = JOBS.filter((j) => j.slug === only);
      if (jobs.length === 0) {
        console.error(`RUN_ONLY=${only} inconnu (jobs disponibles : ${JOBS.map((j) => j.slug).join(", ")})`);
        process.exit(1);
      }
      const [job] = jobs;
      if (job?.actif && !job.actif()) {
        console.error(`RUN_ONLY=${only} : condition d'activation non remplie (ex. METEOFRANCE_API_TOKEN absent)`);
        process.exit(1);
      }
    }
    await runAllOnce(pool, jobs);
    await pool.end();
    process.exit(0);
  }

  // Premier run complet au démarrage du conteneur, puis planification récurrente.
  await runAllOnce(pool);
  for (const job of JOBS) {
    cron.schedule(job.cron, () => {
      void runJob(pool, job);
    }, { timezone: "Europe/Paris" });
  }
  console.log("worker : planification active, en attente des prochaines exécutions.");
}

main().catch((err) => {
  console.error("worker : échec fatal au démarrage", err);
  process.exit(1);
});
