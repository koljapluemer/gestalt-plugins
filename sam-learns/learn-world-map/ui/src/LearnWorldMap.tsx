import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { asMap, definePerspective, field, logger, stateKey, useSettings, type IndexedNote, type Json, type Query } from '@gestalts/sdk';
import { fsrsStates, getScheduler, review, saveReview, useLocalReviews, usePracticeSession, type FsrsStates } from '@gestalts/learning';
import { BarChart3, Globe } from 'lucide-react';
import { DistractorChoiceExercise, GroupSequenceExercise, IdentifyCountryExercise, NeighborhoodExercise, WorldMapExercise } from './exercises/Exercises';
import { formatDuration } from './map/formatDuration';
import { countriesOf, groupsOf, selectionsOf, type Country } from './model';
import { useGeoData } from './useGeoData';
import { countryFacet, dayKey, facetOf, gradeOf, lastCountryOf, nextExercise, type Answer, type Exercise } from './schedule';

const APP = 'learn-world-map';
const log = logger('world-map');

type Data = { countries: Query; groups: Query; selections: Query; reviews: Query; sessions: Query };

/**
 * Where the countries are: the exercises of sam-learns-things' world-map over the mounted decks' countries. The
 * learner picks what to practise (a deck's selection: the whole world, Africa, …); the map shows every mounted
 * country around it.
 */
export const LearnWorldMap = definePerspective<Data>({
  id: APP,
  title: 'World map',
  data: {
    countries: { gestalt: 'country@1', tagsNone: ['retired'] },
    groups: { tagsAll: ['country-group'], tagsNone: ['retired'] },
    selections: { tagsAll: ['world-map-selection'], tagsNone: ['retired'] },
    reviews: { gestalt: 'fsrs-state@1' },
    sessions: { gestalt: 'practice-session@1', where: { app: APP } },
  },
  Component: ({ data, repo }) => {
    const all = useMemo(() => countriesOf(data.countries), [data.countries]);
    const selections = useMemo(() => selectionsOf(data.selections), [data.selections]);
    const [settings, setSettings] = useSettings(APP, { selection: '' });
    const selection = selections.find((s) => s.key === settings.selection) ?? selections[0];
    const countries = useMemo(() => (selection ? all.filter((c) => selection.members.has(c.key)) : all), [all, selection]);
    const groups = useMemo(() => groupsOf(data.groups, countries), [data.groups, countries]);
    const geoData = useGeoData(all);

    const stored = useMemo(() => fsrsStates(data.reviews), [data.reviews]);
    const { states, put } = useLocalReviews(stored);
    const practice = usePracticeSession(APP);
    const [view, setView] = useState<'practice' | 'stats'>('practice');
    const [saveError, setSaveError] = useState<string | null>(null);

    const byCode = useMemo(() => new Map(all.map((c) => [c.code, c])), [all]);
    const [current, setCurrent] = useState<{ exercise: Exercise | null; n: number } | null>(null);
    const last = useRef<string | null>(null);
    const statesRef = useRef(states);
    useLayoutEffect(() => { statesRef.current = states; }, [states]);

    const pickNext = (s: FsrsStates = statesRef.current) => {
      const exercise = nextExercise({ countries, groups, states: s, lastCountry: last.current, now: new Date() });
      if (exercise) last.current = lastCountryOf(exercise);
      setCurrent((c) => ({ exercise, n: (c?.n ?? 0) + 1 }));
      practice.shown();
    };

    // a new selection (or the countries arriving) starts afresh
    const selectionKey = `${selection?.key ?? ''}:${countries.length}`;
    useEffect(() => {
      if (countries.length) pickNext(stored);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only when what's practised changes
    }, [selectionKey]);

    /** Rates the country and the exercise on it, and logs the trial; returns the states with both. */
    const submit = async (a: Answer): Promise<FsrsStates> => {
      const c = byCode.get(a.country);
      if (!c) return statesRef.current;
      const now = new Date();
      const grade = gradeOf(a);
      const scheduler = await getScheduler();
      let s = statesRef.current;
      const saves: Promise<unknown>[] = [];
      for (const f of [countryFacet(c), facetOf(a.type, c, a.panIndex, a.groupId)]) {
        const prev = s.get(f);
        const next = { ...review(scheduler, prev, grade, now), key: prev?.key ?? stateKey('fsrs-state', f.target, f.facet) };
        put(f, next);
        s = s.with(f, next);
        saves.push(saveReview(repo, f, prev, next));
      }
      statesRef.current = s;
      saves.push(practice.trial({
        kind: 'world-map', exercise: a.type, country: a.country,
        ...(a.panIndex !== undefined ? { pan_index: a.panIndex } : {}), ...(a.groupId ? { group: a.groupId } : {}),
        clicks: a.numberOfClicksNeeded, ms: Math.round(a.msToFirstClick), ...(a.gaveUp ? { gave_up: true } : {}), rating: grade,
      }));
      Promise.all(saves).then(
        () => log.info('rated', { country: a.country, exercise: a.type, grade }),
        (e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)),
      );
      return s;
    };

    const answered = (a: Answer) => { void submit(a).then((s) => pickNext(s)); };

    const header = (
      <div className="flex flex-wrap items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-2">
        <Globe className="size-4 text-base-content/60" aria-hidden />
        {selections.length > 1 ? (
          <select className="select select-sm w-auto" value={selection?.key} aria-label="What to practise"
                  onChange={(e) => void setSettings({ selection: e.target.value })}>
            {selections.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
          </select>
        ) : <span className="text-sm font-medium">{selection?.title ?? 'World map'}</span>}
        <span className="flex-1" />
        <button type="button" className={`btn btn-sm btn-ghost ${view === 'stats' ? 'btn-active' : ''}`} onClick={() => setView(view === 'stats' ? 'practice' : 'stats')}>
          <BarChart3 className="size-4" aria-hidden />Stats
        </button>
      </div>
    );

    const body = (() => {
      if (!all.length) return <Centered>No countries here yet. Install a world-map deck.</Centered>;
      if (view === 'stats') return <Stats countries={countries} states={states} sessions={data.sessions} />;
      if (!geoData || !current) return <Centered><span className="loading loading-spinner" /></Centered>;
      const e = current.exercise;
      if (!e) return <Centered><p>No exercises in {selection?.title ?? 'this selection'}.</p></Centered>;
      const common = { key: current.n, geoData, onSubmitted: answered };
      switch (e.type) {
        case 'find-in-neighborhood': return <NeighborhoodExercise {...common} country={e.country} zoom={e.zoom} panIndex={e.panIndex} />;
        case 'find-on-world-map': return <WorldMapExercise {...common} country={e.country} />;
        case 'identify-country': return <IdentifyCountryExercise {...common} country={e.country} distractor={e.distractor} />;
        case 'distractor-choice': return <DistractorChoiceExercise {...common} country={e.country} distractor={e.distractor} zoom={e.zoom} panIndex={e.panIndex} />;
        case 'group-sequence':
          // each step is an answer; the next exercise once the group is done
          return <GroupSequenceExercise {...common} groupId={e.groupId} countries={e.countries} onSubmitted={(a) => void submit(a)} onDone={() => pickNext()} />;
      }
    })();

    return (
      <div className="flex h-full min-h-[24rem] flex-col">
        {header}
        {saveError && (
          <div role="alert" className="alert alert-error m-2 text-sm">
            <span>Couldn't save your last answer: {saveError}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSaveError(null)}>Dismiss</button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">{body}</div>
      </div>
    );
  },
});

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-base-content/70">{children}</div>;
}

/** "in 3d", "in 5h", "in 20m" */
function formatDue(ms: number): string {
  const h = ms / 3_600_000;
  if (h >= 24) return `in ${Math.round(h / 24)}d`;
  if (h >= 1) return `in ${Math.round(h)}h`;
  return `in ${Math.max(1, Math.round(ms / 60_000))}m`;
}

const STATES: Record<number, { label: string; badge: string }> = {
  0: { label: 'New', badge: 'badge-neutral' },
  1: { label: 'Learning', badge: 'badge-info' },
  2: { label: 'Review', badge: 'badge-success' },
  3: { label: 'Relearning', badge: 'badge-warning' },
};

/** What was practised: counts from the session notes, and each practised country's FSRS state. */
function Stats({ countries, states, sessions }: { countries: Country[]; states: FsrsStates; sessions: IndexedNote[] }) {
  const [now] = useState(() => new Date());
  const today = dayKey(now);
  const events = sessions.flatMap((s) => (Array.isArray(field(s, 'events')) ? (field(s, 'events') as Json[]) : []))
    .map((e) => asMap(e))
    .filter((e) => e?.kind === 'world-map');
  const attemptsToday = events.filter((e) => typeof e?.at === 'string' && dayKey(new Date(e.at)) === today).length;
  const activeMs = sessions.reduce((sum, s) => sum + (typeof field(s, 'active_ms') === 'number' ? (field(s, 'active_ms') as number) : 0), 0);
  const rows = countries
    .flatMap((c) => { const s = states.get(countryFacet(c)); return s ? [{ c, card: s.card }] : []; })
    .sort((a, b) => a.c.name.localeCompare(b.c.name));
  const stats = [
    { label: 'Countries practiced', value: rows.length },
    { label: 'Attempts today', value: attemptsToday },
    { label: 'Total attempts', value: events.length },
    { label: 'Time practiced', value: formatDuration(activeMs) },
  ];
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="stats stats-vertical w-full shadow-sm sm:stats-horizontal">
        {stats.map((s) => <div key={s.label} className="stat"><div className="stat-title">{s.label}</div><div className="stat-value text-2xl">{s.value}</div></div>)}
      </div>
      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead><tr><th>Country</th><th>State</th><th className="text-right">Stability</th><th className="text-right">Due</th></tr></thead>
            <tbody>
              {rows.map(({ c, card }) => {
                const st = STATES[typeof card.state === 'number' ? card.state : 0] ?? STATES[0];
                const stability = typeof card.stability === 'number' && card.stability > 1 ? `${Math.round(card.stability)}d` : '—';
                const dueIn = new Date(card.dueAt).getTime() - now.getTime();
                return (
                  <tr key={c.key}>
                    <td>{c.name}</td>
                    <td><span className={`badge badge-sm ${st.badge}`}>{st.label}</span></td>
                    <td className="text-right">{stability}</td>
                    <td className="text-right">{dueIn <= 0 ? 'now' : formatDue(dueIn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

