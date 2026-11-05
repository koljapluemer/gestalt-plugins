import { describe, expect, it } from 'vitest';
import { fsrsStates, getScheduler, Rating, review, type FsrsStates } from '@gestalts/learning';
import type { Country, Group } from './model';
import { countryFacet, dayKey, facetOf, gradeOf, nextExercise } from './schedule';

const now = new Date('2026-11-05T12:00:00.000Z');

const country = (code: string, over: Partial<Country> = {}): Country => ({
  key: code.toLowerCase(), code, name: code, priority: 1, findOnWorldMap: true, identify: false, ...over,
});

const none: FsrsStates = fsrsStates([]);
/** always the first of each pick, and no group (0.99 > the group odds) */
const first = () => 0;

async function seen(states: FsrsStates, c: Country, dueIn: 'past' | 'future') {
  const s = await getScheduler();
  const at = dueIn === 'past' ? new Date('2026-10-01T00:00:00Z') : now;
  return states.with(countryFacet(c), review(s, undefined, Rating.Good, at));
}

describe('nextExercise', () => {
  it('starts a new country with telling it from a look-alike', () => {
    const c = country('KEN', { distractorChoice: { zoom: 118, distractors: ['TZA'] } });
    const e = nextExercise({ countries: [c], groups: [], states: none, lastCountry: null, now, random: () => 0.99 });
    expect(e).toMatchObject({ type: 'distractor-choice', country: 'KEN', distractor: 'TZA', zoom: 118 });
  });

  it('prefers due countries, and never the previous one', async () => {
    const [a, b, c] = [country('AAA'), country('BBB'), country('CCC')];
    let states = await seen(none, a, 'past');
    states = await seen(states, b, 'future');
    // c is unseen, a due: a comes first, unless it was the last one
    expect(nextExercise({ countries: [a, b, c], groups: [], states, lastCountry: null, now, random: () => 0.99 })).toMatchObject({ country: 'AAA' });
    expect(nextExercise({ countries: [a, b, c], groups: [], states, lastCountry: 'AAA', now, random: () => 0.99 })).toMatchObject({ country: 'CCC' });
  });

  it('prefers the rolled priority among the pool', () => {
    const cs = [country('AAA', { priority: 2 }), country('BBB', { priority: 1 })];
    expect(nextExercise({ countries: cs, groups: [], states: none, lastCountry: null, now, random: first })).toMatchObject({ country: 'BBB' });
  });

  it('offers a group when half its countries are due or unseen', () => {
    const cs = [country('AAA'), country('BBB')];
    const groups: Group[] = [{ key: 'g', id: 'pair', name: 'Pair', countries: ['AAA', 'BBB'] }];
    expect(nextExercise({ countries: cs, groups, states: none, lastCountry: null, now, random: first })).toMatchObject({ type: 'group-sequence', groupId: 'pair' });
  });

  it('skips a group practised today', async () => {
    const cs = [country('AAA'), country('BBB')];
    const groups: Group[] = [{ key: 'g', id: 'pair', name: 'Pair', countries: ['AAA', 'BBB'] }];
    const s = await getScheduler();
    const states = none.with(facetOf('group-sequence', cs[0], undefined, 'pair'), review(s, undefined, Rating.Good, now));
    expect(nextExercise({ countries: cs, groups, states, lastCountry: null, now, random: first })?.type).not.toBe('group-sequence');
    expect(dayKey(now)).toBe(dayKey(new Date(now.getTime() + 1000)));
  });

  it('has nothing without an enabled exercise', () => {
    expect(nextExercise({ countries: [country('AAA', { findOnWorldMap: false })], groups: [], states: none, lastCountry: null, now })).toBeNull();
  });

  it('uses only enabled exercise types, with identify needing a second country', () => {
    const c = country('AAA', { findOnWorldMap: false, identify: true, neighborhood: { zoom: 120 } });
    for (let i = 0; i < 20; i++) {
      const e = nextExercise({ countries: [c], groups: [], states: none, lastCountry: null, now, random: () => (i / 20 + 0.5) % 1 });
      expect(e?.type).toBe('find-in-neighborhood');
    }
  });
});

describe('gradeOf', () => {
  it('is Good only on a first right click without giving up', () => {
    const a = { type: 'find-on-world-map' as const, country: 'X', msToFirstClick: 1 };
    expect(gradeOf({ ...a, numberOfClicksNeeded: 1 })).toBe(Rating.Good);
    expect(gradeOf({ ...a, numberOfClicksNeeded: 2 })).toBe(Rating.Again);
    expect(gradeOf({ ...a, numberOfClicksNeeded: 1, gaveUp: true })).toBe(Rating.Again);
  });
});
