import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Yml = { id: string; gestalt: string; name?: string; word?: string; 'practiced-by'?: Record<string, number>; parents?: string[]; children?: string[]; members?: string[] };

const dir = join(import.meta.dirname, 'decks/greek-alphabet/notes');
const ymls = readdirSync(dir).map((f) => parse(readFileSync(join(dir, f), 'utf8')) as Yml);
const concepts = ymls.filter((y) => y.gestalt === 'concept@1');
const exercises = ymls.filter((y) => y.gestalt === 'pronunciation-exercise@1');
const concept = (name: string) => concepts.find((c) => c.name === name);

describe('the Greek deck', () => {
  it('has every yml named after its id and listed in the deck', () => {
    for (const f of readdirSync(dir)) expect((parse(readFileSync(join(dir, f), 'utf8')) as Yml).id).toBe(f.replace(/\.yml$/, ''));
    const deck = ymls.find((y) => y.gestalt === 'deck@1')!;
    expect(new Set(deck.members)).toEqual(new Set(ymls.filter((y) => y !== deck).map((y) => y.id)));
  });

  it('practices each word fully, and each letter by its share of the word', () => {
    for (const e of exercises) {
      expect(concept(`grc:${e.word}`)?.['practiced-by']?.[e.id]).toBe(1);
      const letters = e.word!.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ς', 'σ');
      const held = concepts.filter((c) => /^grc:\p{L}$/u.test(c.name!) && c['practiced-by']?.[e.id]);
      expect(held.reduce((sum, c) => sum + c['practiced-by']![e.id], 0)).toBeCloseTo(1, 4);
      for (const c of held) {
        const letter = c.name!.slice(4);
        expect(c['practiced-by']![e.id]).toBeCloseTo([...letters].filter((l) => l === letter).length / letters.length, 4);
      }
    }
  });

  it('counts a repeated letter more than a single one', () => {
    const repeat = exercises.find((e) => { const l = e.word!.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ς', 'σ'); return new Set(l).size < l.length; })!;
    const shares = concepts.filter((c) => /^grc:\p{L}$/u.test(c.name!) && c['practiced-by']?.[repeat.id]).map((c) => c['practiced-by']![repeat.id]);
    expect(new Set(shares).size).toBeGreaterThan(1);
  });

  it('folds accents and final sigma into one letter', () => {
    expect(concept('grc:ς')).toBeUndefined();
    expect(concept('grc:ά')).toBeUndefined();
    expect(concept('grc:σ')).toBeDefined();
  });

  it('hangs every concept under the alphabet', () => {
    const root = concept('grc:alphabet')!;
    expect(root.children).toHaveLength(concepts.length - 1);
    for (const c of concepts) if (c !== root) expect(c.parents).toEqual([root.id]);
  });
});
