import assert from 'assert';
import { PathaoClient } from '../src/index.js';
import { SQLiteAdapter } from '../src/db/sqlite.js';
import { createLocationTables, dropLocationTables } from '../src/db/schema.js';
import { getCities, getZones, getAreas, seedLocationData } from '../src/api/location.js';

export async function runLocationTests() {
  const client = new PathaoClient();
  assert.strictEqual(PathaoClient.hello(), 'pathao-unofficial');
  assert.strictEqual(client.version(), '0.1.0');

  // Real sqlite schema & API tests (in-memory)
  const db = new SQLiteAdapter({ filename: ':memory:' });
  await db.connect();
  await createLocationTables(db);

  const sample = {
    cities: [
      { city_id: 1, city_name: 'Dhaka' },
      { city_id: 2, city_name: 'Chittagong' }
    ],
    zones: [
      { zone_id: 100, city_id: 1, zone_name: 'Zone A' },
      { zone_id: 200, city_id: 2, zone_name: 'Zone B' }
    ],
    areas: [
      { area_id: 10, zone_id: 100, area_name: 'Area X', home_delivery_available: true, pickup_available: false },
      { area_id: 20, zone_id: 100, area_name: 'Area Y', home_delivery_available: true, pickup_available: true }
    ]
  };

  await seedLocationData(db, sample);

  const cities = await getCities(db);
  assert(Array.isArray(cities));
  assert(cities.find((c) => c.city_id === 1 && c.city_name === 'Dhaka'));

  const zones = await getZones(db, 1);
  assert(Array.isArray(zones));
  assert(zones.find((z) => z.zone_id === 100));

  const areas = await getAreas(db, 100);
  assert(Array.isArray(areas));
  assert(areas.find((a) => a.area_id === 10 && a.area_name.includes('Area')));

  await dropLocationTables(db);
  await db.close();
}

// --- Pathao token persistence test
import { createAuthTables, dropAuthTables } from '../src/db/schema.js';
import { saveToken, getLatestToken } from '../src/pathao/client.js';

export async function runAuthTest() {
  const db = new SQLiteAdapter({ filename: ':memory:' });
  await db.connect();
  await createAuthTables(db);

  const sample = {
    access_token: 'TEST_TOKEN_123',
    refresh_token: 'REFRESH_123',
    token_type: 'Bearer',
    expires_in: 3600
  };

  await saveToken(db, sample);
  const latest = await getLatestToken(db);
  if (!latest || latest.access_token !== sample.access_token) throw new Error('token not saved correctly');

  await dropAuthTables(db);
  await db.close();
}

// ensure auth test runs as part of integration
export default async function runTests() {
  await runLocationTests();
  await runAuthTest();
}
