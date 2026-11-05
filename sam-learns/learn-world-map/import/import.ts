/**
 * Builds learn-world-map's decks from sam-learns-things' world-map data (see README.md): `node import.ts <checkout>`.
 * Writes `decks/<deck>/notes` and `blobs` afresh; `mise run publish-data` then names the blobs by their content and
 * writes `index.json`.
 *
 * Every deck holds notes of the same shape, keyed by what they are (a country by its ISO code), so a country two
 * decks hold is one note, merged when both are mounted.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

type Countries = Record<string, {
  distractorChoice?: { distractors?: string[]; enabled?: boolean; zoom?: number };
  identifyCountry?: { enabled?: boolean };
  learningPriority?: number;
  neighborhood?: { enabled?: boolean; zoom?: number };
  worldMap?: { enabled?: boolean };
}>;
type Groups = Record<string, { name: string; countries: string[]; enabled: boolean }>;
type Feature = { type: 'Feature'; properties: { code: string; name: string }; geometry: unknown };

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, '..');
const source = process.argv[2];
if (!source) throw new Error('usage: node import.ts <sam-learns-things checkout>');
const data = join(source, 'public/data/world-map');
const SOURCE_NOTE = 'sam-learns-things world-map; regions: UN M49 (lukes/ISO-3166-Countries-with-Regional-Codes)';
// the exercises' own default when a country has no curated priority (sam-learns-things learningPriorityContent.ts)
const DEFAULT_PRIORITY = 2;

/** Natural Earth's codes (the map's) for places whose ISO 3166 alpha-3 code differs. */
const TO_ISO: Record<string, string> = { SDS: 'SSD', SAH: 'ESH', PSX: 'PSE', ALD: 'ALA' };
/**
 * Places with no ISO code of their own keep Natural Earth's; for their region they count as the ISO country they're
 * internationally recognised as part of.
 */
const REGION_OF: Record<string, string> = { SOL: 'SOM', CYN: 'CYP', KAS: 'IND', KOS: 'SRB', IOA: 'AUS', ATC: 'AUS' };

// stableId (gestalts-core repo.rs): uuid v5 of `name` in the v5 namespace of `namespace` under the URL namespace
function uuid5(namespace: Buffer, name: string): Buffer {
  const h = createHash('sha1').update(namespace).update(name, 'utf8').digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  return h;
}
const URL_NAMESPACE = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
const hex = (b: Buffer) => b.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const stableId = (namespace: string, name: string) => hex(uuid5(uuid5(URL_NAMESPACE, namespace), name));

const read = <T>(file: string) => JSON.parse(readFileSync(join(data, file), 'utf8')) as T;
const countries = read<Countries>('countries.json');
const groups = read<Groups>('groups.json');
const features = read<{ features: Feature[] }>('map.geo.json').features;

const regions = new Map<string, { region: string; alpha2: string }>();
const [header, ...rows] = readFileSync(join(here, 'iso-3166-m49.csv'), 'utf8').trim().split('\n').map(csvRow);
const col = (name: string) => header.indexOf(name);
for (const r of rows) regions.set(r[col('alpha-3')], { region: r[col('region')], alpha2: r[col('alpha-2')] });

function csvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const iso = (code: string) => TO_ISO[code] ?? code;
const keyOf = (code: string) => stableId('country', iso(code));
function regionOf(code: string): string {
  const r = regions.get(iso(code)) ?? regions.get(REGION_OF[code] ?? '');
  if (!r) throw new Error(`${code}: no UN M49 region; add it to TO_ISO or REGION_OF`);
  return r.region;
}

for (const f of features) if (!countries[f.properties.code]) throw new Error(`${f.properties.code} is on the map but not in countries.json`);

type Deck = { id: string; title: string; has: (code: string) => boolean };
const decks: Deck[] = [
  { id: 'whole-world', title: 'Whole World', has: () => true },
  { id: 'africa', title: 'Countries of Africa', has: (code) => regionOf(code) === 'Africa' },
];

for (const deck of decks) {
  const dir = join(plugin, 'decks', deck.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'notes'), { recursive: true });
  mkdirSync(join(dir, 'blobs'), { recursive: true });
  const write = (key: string, value: Record<string, unknown>) => writeFileSync(join(dir, 'notes', `${key}.yml`), stringify({ id: key, ...value }));

  const members = features.map((f) => f.properties.code).filter(deck.has).sort();
  for (const code of members) {
    const f = features.find((x) => x.properties.code === code)!;
    const c = countries[code];
    const key = keyOf(code);
    const blob = `${iso(code)}.json`;
    writeFileSync(join(dir, 'blobs', blob), JSON.stringify({ type: 'Feature', properties: { code: iso(code), name: f.properties.name }, geometry: f.geometry }));
    const alpha2 = regions.get(iso(code))?.alpha2;
    const distractors = (c.distractorChoice?.distractors ?? []).filter(deck.has);
    write(key, {
      title: f.properties.name,
      tags: ['country'],
      code: iso(code),
      ...(alpha2 ? { alpha2 } : {}),
      priority: c.learningPriority ?? DEFAULT_PRIORITY,
      world_map: {
        find_on_world_map: c.worldMap?.enabled ?? false,
        identify_country: c.identifyCountry?.enabled ?? false,
        neighborhood: { enabled: c.neighborhood?.enabled ?? false, ...(c.neighborhood?.zoom !== undefined ? { zoom: c.neighborhood.zoom } : {}) },
        distractor_choice: { enabled: c.distractorChoice?.enabled ?? false, ...(c.distractorChoice?.zoom !== undefined ? { zoom: c.distractorChoice.zoom } : {}) },
      },
      ...(distractors.length ? { relationships: distractors.map((d) => ({ to: keyOf(d), label: 'distractor' })) } : {}),
      blobs: [{ label: 'geometry', file: blob }],
      source: SOURCE_NOTE,
    });
  }

  for (const [id, g] of Object.entries(groups)) {
    if (!g.countries.length || !g.countries.every(deck.has)) continue;
    write(stableId('country-group', id), {
      title: g.name,
      tags: ['country-group', 'world-map'],
      group: id,
      enabled: g.enabled,
      relationships: g.countries.map((code) => ({ to: keyOf(code), label: 'member' })),
      source: SOURCE_NOTE,
    });
  }

  write(stableId('world-map-selection', deck.id), {
    title: deck.title,
    tags: ['world-map-selection', 'world-map'],
    relationships: members.map((code) => ({ to: keyOf(code), label: 'member' })),
    source: SOURCE_NOTE,
  });
  console.log(`${deck.id}: ${members.length} countries`);
}
