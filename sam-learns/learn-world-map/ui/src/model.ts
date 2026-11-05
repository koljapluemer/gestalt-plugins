import { asMap, blob, field, relationships, str, strList, type IndexedNote, type Json } from '@gestalts/sdk';

/** A `country@1` note, as the exercises use it. Countries are told apart by `code` (ISO alpha-3), the map's ids too. */
export type Country = {
  key: string;
  code: string;
  name: string;
  /** 1 (learn first) to 3 */
  priority: number;
  findOnWorldMap: boolean;
  identify: boolean;
  /** find it in its neighbourhood, at this zoom */
  neighborhood?: { zoom: number };
  /** tell it apart from countries easily confused with it (`distractor` relationships), at this zoom */
  distractorChoice?: { zoom: number; distractors: string[] };
  /** blob name of its GeoJSON feature */
  geometry?: string;
};

/** A plain note (tag `country-group`) whose `member`s are practised in a row. */
export type Group = { key: string; id: string; name: string; countries: string[] };

/** What a deck practises (tag `world-map-selection`): its `member` countries. */
export type Selection = { key: string; title: string; members: Set<string> };

export const DEFAULT_PRIORITY = 2;
export const DEFAULT_ZOOM = 100;
export const DEFAULT_DISTRACTOR_ZOOM = 140;

const num = (v: Json | undefined) => (typeof v === 'number' ? v : undefined);

function switchOf(m: { [k: string]: Json } | null, name: string): { enabled: boolean; zoom?: number } {
  const s = asMap(m?.[name] ?? null);
  return { enabled: s?.enabled === true, zoom: num(s?.zoom) };
}

/** `notes`' countries by key; their distractors resolved to codes (ones not mounted are dropped). */
export function countriesOf(notes: IndexedNote[]): Country[] {
  const codeOf = new Map(notes.flatMap((n) => { const c = str(n, 'code'); return c ? [[n.id, c] as const] : []; }));
  return notes.flatMap((n): Country[] => {
    const code = str(n, 'code');
    if (!code) return [];
    const wm = asMap(field(n, 'world_map') ?? null);
    const nb = switchOf(wm, 'neighborhood');
    const dc = switchOf(wm, 'distractor_choice');
    const distractors = relationships(n).filter((r) => r.label === 'distractor').flatMap((r) => codeOf.get(r.target) ?? []);
    return [{
      key: n.id,
      code,
      name: str(n, 'title') ?? code,
      priority: num(field(n, 'priority')) ?? DEFAULT_PRIORITY,
      findOnWorldMap: wm?.find_on_world_map === true,
      identify: wm?.identify_country === true,
      ...(nb.enabled ? { neighborhood: { zoom: nb.zoom ?? DEFAULT_ZOOM } } : {}),
      ...(dc.enabled ? { distractorChoice: { zoom: dc.zoom ?? DEFAULT_DISTRACTOR_ZOOM, distractors } } : {}),
      geometry: blob(n, 'geometry'),
    }];
  });
}

/** Enabled groups whose members are all among `countries`, members as codes. */
export function groupsOf(notes: IndexedNote[], countries: Country[]): Group[] {
  const byKey = new Map(countries.map((c) => [c.key, c.code]));
  return notes.flatMap((n): Group[] => {
    if (field(n, 'enabled') !== true) return [];
    const members = relationships(n).filter((r) => r.label === 'member').map((r) => byKey.get(r.target));
    if (!members.length || members.some((m) => !m)) return [];
    return [{ key: n.id, id: str(n, 'group') ?? n.id, name: str(n, 'title') ?? n.id, countries: members as string[] }];
  });
}

export function selectionsOf(notes: IndexedNote[]): Selection[] {
  return notes
    .filter((n) => strList(n, 'tags').includes('world-map-selection'))
    .map((n) => ({ key: n.id, title: str(n, 'title') ?? n.id, members: new Set(relationships(n).filter((r) => r.label === 'member').map((r) => r.target)) }))
    .sort((a, b) => b.members.size - a.members.size || a.title.localeCompare(b.title));
}
