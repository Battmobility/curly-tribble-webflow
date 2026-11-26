#!/usr/bin/env node
// Live voertuigkaart: haalt de publieke website-feed van de BFF op en houdt
// alleen de velden over die op battmobility.be mogen staan (allowlist).
//
// Bron: GET https://bff.battmobility.be/website/vehicle/v1/vehicles
//   publiek (@PermitAll) door de devs gebouwd voor de website; geen login, geen token.
//   Coördinaten = vaste standplaats (nagekeken 26/11/2026), geen live GPS.
//
// Kopie van website-b2c/tools/vloot-feed.mjs (bron). Gebruik: node scripts/vloot-feed.mjs [uitvoerbestand]   (standaard data/vloot-live.json)
//
// Nooit naar buiten: nummerplaat, actuele positie, beschrijving (bevat interne
// notities zoals "Laadkabel in de koffer aub"), gereduceerde prijzen, boekingen.
// Nieuwe velden in de BFF gaan dus niet vanzelf mee: elk veld hieronder is expliciet.

import { writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE = "https://bff.battmobility.be/website/vehicle/v1/vehicles";
const OUT = resolve(process.argv[2] || "data/vloot-live.json");
const REFRESH_SECONDS = 300;
const MIN_VEHICLES = 50; // minder dan dit = waarschijnlijk een storing: oud bestand laten staan
const IMG_HOST = "https://battmobilitycomprodsa.blob.core.windows.net/booking-public/";

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x) => (typeof x === "string" && x.trim() ? x.trim() : null);
const img = (x) => (typeof x === "string" && x.startsWith(IMG_HOST) ? x : null);

function pick(v) {
  const c = v?.homeLocation?.coordinates || {};
  const lat = num(c.latitude), lon = num(c.longitude);
  // binnen België en omstreken, anders weglaten
  if (lat === null || lon === null || lat < 49 || lat > 52 || lon < 2 || lon > 7) return null;
  const p = v.pricePerUnit || {};
  return {
    vehicleReference: {
      id: str(v.id),
      name: str(v.name),
      model: { brand: str(v.model?.brand), name: str(v.model?.name), fullName: str(v.model?.fullName) },
    },
    images: {
      thumbnail300x300Url: img(v.images?.thumbnail300x300Url),
      square1000x1000Url: img(v.images?.square1000x1000Url),
      wide1600x1000Url: img(v.images?.wide1600x1000Url),
    },
    homeLocation: {
      coordinates: { latitude: lat, longitude: lon },
      address: str(v.homeLocation?.address),
      addressLine1: str(v.homeLocation?.addressLine1),
      addressLine2: str(v.homeLocation?.addressLine2),
    },
    electricRangeKm: num(v.electricRangeKm),
    pricePerUnit: { dayPrice: num(p.dayPrice), hourPrice: num(p.hourPrice), kmPrice: num(p.kmPrice) },
  };
}

const res = await fetch(SOURCE, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) });
if (!res.ok) throw new Error(`BFF gaf ${res.status}`);
const data = await res.json();
const list = Array.isArray(data) ? data : data.vehicles;
if (!Array.isArray(list)) throw new Error("Onverwacht formaat van de BFF");
const vehicles = list.map(pick).filter((v) => v && v.vehicleReference.id);
if (vehicles.length < MIN_VEHICLES) throw new Error(`Maar ${vehicles.length} wagens: bestand niet overschreven`);

const out = { generatedAt: new Date().toISOString(), refreshSeconds: REFRESH_SECONDS, vehicles };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT + ".tmp", JSON.stringify(out));
renameSync(OUT + ".tmp", OUT);
console.log(`${vehicles.length} wagens -> ${OUT}`);
