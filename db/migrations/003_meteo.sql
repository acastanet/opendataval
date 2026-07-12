-- Séries climatologiques quotidiennes (Météo-France, fichiers départementaux RR-T-Vent)
create table series.meteo_quotidien (
  num_poste text not null,
  date date not null,
  rr numeric,
  tn numeric,
  tx numeric,
  tm numeric,
  primary key (num_poste, date)
);

-- Observations horaires (API DPObs v2), unités converties à l'ingestion (°C, hPa, km/h)
create table series.meteo_horaire (
  num_poste text not null,
  heure_utc timestamptz not null,
  t numeric,
  humidite smallint,
  vent_dir smallint,
  vent_kmh numeric,
  rafale_kmh numeric,
  pluie_1h_mm numeric,
  pression_hpa numeric,
  neige_cm numeric,
  primary key (num_poste, heure_utc)
);
