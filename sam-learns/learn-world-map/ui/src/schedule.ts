import { Rating, type Facet, type FsrsStates, type Grade, type ReviewState } from '@gestalts/learning';
import type { Country, Group } from './model';

/**
 * Which exercise comes next, ported from sam-learns-things' world-map (`progressScheduler.ts`). Pure: the countries
 * and groups of the selection, and the FSRS states (`fsrs-state@1`) of each country (no facet) and of each exercise
 * on it (a facet, see `facetOf`).
 */

export type ExerciseType = 'find-in-neighborhood' | 'find-on-world-map' | 'identify-country' | 'distractor-choice' | 'group-sequence';

export type Exercise =
  | { type: 'find-in-neighborhood'; country: string; zoom: number; panIndex: number }
  | { type: 'find-on-world-map'; country: string }
  | { type: 'identify-country'; country: string; distractor: string }
  | { type: 'distractor-choice'; country: string; zoom: number; panIndex: number; distractor: string }
  | { type: 'group-sequence'; groupId: string; countries: string[] };

/** One answer, as an exercise reports it. */
export type Answer = {
  type: ExerciseType;
  country: string;
  panIndex?: number;
  groupId?: string;
  numberOfClicksNeeded: number;
  msToFirstClick: number;
  gaveUp?: boolean;
};

export const PAN_INDEX_COUNT = 9;
const GROUP_TRIGGER_FRACTION = 0.5;
// qualifying only makes group-sequence eligible: it then competes at equal odds with the other 4 types
const GROUP_EXERCISE_ODDS = 1 / 5;
// cumulative odds of preferring a due/fresh country of priority 1, then 2 (else 3)
const PRIORITY_1_ODDS = 0.5;
const PRIORITY_2_ODDS = 0.8;

/** The facet of an exercise on a country (the country's own state has none). */
export function facetOf(type: ExerciseType, country: Country, panIndex?: number, groupId?: string): Facet {
  switch (type) {
    case 'find-in-neighborhood': return { target: country.key, facet: `find-in-neighborhood:${panIndex ?? 0}` };
    case 'group-sequence': return { target: country.key, facet: `group-sequence:${groupId}` };
    default: return { target: country.key, facet: type };
  }
}

export const countryFacet = (c: Country): Facet => ({ target: c.key });

/** Right on the first click, without giving up: Good; else Again. */
export const gradeOf = (a: Answer): Grade => (a.gaveUp || a.numberOfClicksNeeded !== 1 ? Rating.Again : Rating.Good);

const isDue = (s: ReviewState, now: Date) => new Date(s.card.dueAt) <= now;

/** The local calendar day of a time, so "today" is the learner's. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

type Input = {
  countries: Country[];
  groups: Group[];
  states: FsrsStates;
  /** the country of the previous exercise, not picked again right away */
  lastCountry: string | null;
  now: Date;
  random?: () => number;
};

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

const enabledTypes = (c: Country) => !!(c.neighborhood || c.findOnWorldMap || c.identify || c.distractorChoice);

/** A group not practised today whose countries are at least half due or unseen. */
function qualifyingGroup({ countries, groups, states, now }: Input, random: () => number): Group | undefined {
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const today = dayKey(now);
  const qualifying = groups.filter((g) => {
    const members = g.countries.map((code) => byCode.get(code)).filter((c): c is Country => !!c);
    if (members.length !== g.countries.length) return false;
    const shownToday = members.some((c) => {
      const at = states.get(facetOf('group-sequence', c, undefined, g.id))?.card.lastReviewAt;
      return typeof at === 'string' && dayKey(new Date(at)) === today;
    });
    if (shownToday) return false;
    const dueOrUnseen = members.filter((c) => { const s = states.get(countryFacet(c)); return !s || isDue(s, now); }).length;
    return dueOrUnseen / members.length >= GROUP_TRIGGER_FRACTION;
  });
  return qualifying.length ? pick(qualifying, random) : undefined;
}

function preferredPriority(random: () => number): number {
  const roll = random();
  if (roll < PRIORITY_1_ODDS) return 1;
  if (roll < PRIORITY_2_ODDS) return 2;
  return 3;
}

/** Due countries first, else unseen ones, else any; of the priority rolled when there is one. */
function pickCountry({ countries, states, lastCountry, now }: Input, random: () => number): Country | undefined {
  const enabled = countries.filter(enabledTypes);
  if (!enabled.length) return undefined;
  const candidates = enabled.length > 1 ? enabled.filter((c) => c.code !== lastCountry) : enabled;
  const due: Country[] = [];
  const fresh: Country[] = [];
  for (const c of candidates) {
    const s = states.get(countryFacet(c));
    if (!s) fresh.push(c);
    else if (isDue(s, now)) due.push(c);
  }
  const pool = due.length ? due : fresh.length ? fresh : candidates;
  const priority = preferredPriority(random);
  const preferred = pool.filter((c) => c.priority === priority);
  return pick(preferred.length ? preferred : pool, random);
}

type Instance = { type: 'find-in-neighborhood'; panIndex: number } | { type: 'find-on-world-map' } | { type: 'identify-country' } | { type: 'distractor-choice' };

function instances(c: Country, identifyPool: number): Instance[] {
  const out: Instance[] = [];
  if (c.neighborhood) for (let panIndex = 0; panIndex < PAN_INDEX_COUNT; panIndex++) out.push({ type: 'find-in-neighborhood', panIndex });
  if (c.findOnWorldMap) out.push({ type: 'find-on-world-map' });
  if (c.identify && identifyPool > 1) out.push({ type: 'identify-country' });
  if (c.distractorChoice?.distractors.length) out.push({ type: 'distractor-choice' });
  return out;
}

function distractorChoice(c: Country, random: () => number): Exercise {
  return {
    type: 'distractor-choice',
    country: c.code,
    zoom: c.distractorChoice!.zoom,
    panIndex: Math.floor(random() * PAN_INDEX_COUNT),
    distractor: pick(c.distractorChoice!.distractors, random),
  };
}

/** The next exercise, or `null` when no country of the selection has one enabled. */
export function nextExercise(input: Input): Exercise | null {
  const random = input.random ?? Math.random;
  const group = qualifyingGroup(input, random);
  if (group && random() < GROUP_EXERCISE_ODDS) {
    return { type: 'group-sequence', groupId: group.id, countries: random() < 0.5 ? group.countries : [...group.countries].reverse() };
  }
  const c = pickCountry(input, random);
  if (!c) return null;

  // a country seen for the first time starts with telling it apart from its look-alikes
  if (!input.states.has(countryFacet(c)) && c.distractorChoice?.distractors.length) return distractorChoice(c, random);

  const identifyPool = input.countries.filter((x) => x.identify).map((x) => x.code);
  const all = instances(c, identifyPool.length);
  if (!all.length) return null;
  const due: Instance[] = [];
  const fresh: Instance[] = [];
  for (const i of all) {
    const s = input.states.get(facetOf(i.type, c, i.type === 'find-in-neighborhood' ? i.panIndex : undefined));
    if (!s) fresh.push(i);
    else if (isDue(s, input.now)) due.push(i);
  }
  const chosen = pick(due.length ? due : fresh.length ? fresh : all, random);
  switch (chosen.type) {
    case 'find-in-neighborhood': return { type: 'find-in-neighborhood', country: c.code, zoom: c.neighborhood!.zoom, panIndex: chosen.panIndex };
    case 'identify-country': return { type: 'identify-country', country: c.code, distractor: pick(identifyPool.filter((x) => x !== c.code), random) };
    case 'distractor-choice': return distractorChoice(c, random);
    case 'find-on-world-map': return { type: 'find-on-world-map', country: c.code };
  }
}

/** The country an exercise ends on, so the next one picks another. */
export const lastCountryOf = (e: Exercise) => (e.type === 'group-sequence' ? e.countries[e.countries.length - 1] : e.country);
