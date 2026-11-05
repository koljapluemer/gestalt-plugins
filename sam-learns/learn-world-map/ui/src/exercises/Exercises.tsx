import { useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { HelpCircle } from 'lucide-react';
import { getCountryDisplayName } from '../map/mapProjection';
import { SUCCESS_COLOR } from '../map/mapStyle';
import { WorldMapCanvas, type MapHandle } from '../map/WorldMapCanvas';
import type { Answer } from '../schedule';

/**
 * The exercises, ported from sam-learns-things' world-map views. Each is mounted afresh per exercise (its parent keys
 * it), reports one `Answer` per country through `onSubmitted`, and scores as `scoring.md` there says: right on the
 * first click is Good, anything else (a wrong pick, more clicks, giving up) Again.
 */

const SUCCESS_DELAY_MS = 600;
const BOTTOM = 'pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]';

type Base = { geoData: FeatureCollection; onSubmitted: (a: Answer) => void };

function Instruction({ correct, children }: { correct: boolean; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-3 pt-4 sm:pt-6">
      <div className={`card card-border pointer-events-auto bg-base-100/90 p-3 text-center shadow-sm backdrop-blur ${correct ? 'bg-success/10' : ''}`}>
        {children}
      </div>
    </div>
  );
}

/** Clicks and the time to the first one, counted from mounting. */
function useClicks() {
  const [start] = useState(() => performance.now());
  const first = useRef<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  return {
    attempts,
    /** one more click; returns the count and the ms to the first */
    click: () => {
      first.current ??= performance.now() - start;
      const n = attempts + 1;
      setAttempts(n);
      return { n, ms: first.current };
    },
  };
}

/** Free clicking on the map, with "I have no idea" revealing the country. */
function FindOnMap({ geoData, onSubmitted, country, type, zoom, panIndex, instruction }: Base & {
  country: string; type: 'find-in-neighborhood' | 'find-on-world-map'; zoom?: number; panIndex?: number; instruction: string;
}) {
  const map = useRef<MapHandle>(null);
  const clicks = useClicks();
  const [highlight, setHighlight] = useState<{ country?: string; color?: string }>({});
  const [correct, setCorrect] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  const onClick = (clicked: string) => {
    if (correct) return;
    const { n, ms } = clicks.click();
    if (clicked !== country) { setHighlight({ country }); return; }
    setCorrect(true);
    setHighlight({ country, color: SUCCESS_COLOR });
    window.setTimeout(() => onSubmitted({ type, country, ...(type === 'find-in-neighborhood' ? { panIndex } : {}), numberOfClicksNeeded: n, msToFirstClick: ms, gaveUp }), SUCCESS_DELAY_MS);
  };
  const giveUp = () => {
    if (correct || gaveUp) return;
    setGaveUp(true);
    clicks.click();
    setHighlight({ country });
    map.current?.revealCountry(country);
  };

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <WorldMapCanvas ref={map} geoData={geoData} targetCountry={country} zoom={zoom} panIndex={panIndex}
                        highlightCountry={highlight.country} highlightColor={highlight.color} interactive onCountryClicked={onClick} />
      </div>
      <Instruction correct={correct}><p className="text-sm font-medium">{instruction}</p></Instruction>
      {!correct && !gaveUp && (
        <div className={BOTTOM}>
          <button type="button" className="btn btn-outline pointer-events-auto bg-base-100/90 shadow-sm backdrop-blur" onClick={giveUp}>
            <HelpCircle size={18} aria-hidden />I have no idea
          </button>
        </div>
      )}
    </div>
  );
}

export function NeighborhoodExercise(p: Base & { country: string; zoom: number; panIndex: number }) {
  return <FindOnMap {...p} type="find-in-neighborhood" instruction={`Find ${getCountryDisplayName(p.geoData, p.country)} in its neighborhood`} />;
}

export function WorldMapExercise(p: Base & { country: string }) {
  return <FindOnMap {...p} type="find-on-world-map" instruction={`Find ${getCountryDisplayName(p.geoData, p.country)} on the world map`} />;
}

/** Two buttons, the right one and a distractor, in random order. A wrong pick is disabled; the right one ends it. */
function Choice({ geoData, country, distractor, onRight }: { geoData: FeatureCollection; country: string; distractor: string; onRight: (clicks: number, ms: number) => void }) {
  const [options] = useState(() => (Math.random() < 0.5 ? [country, distractor] : [distractor, country]));
  const clicks = useClicks();
  const [selected, setSelected] = useState<string>();
  const correct = selected === country;
  const choose = (o: string) => {
    if (correct) return;
    const { n, ms } = clicks.click();
    setSelected(o);
    if (o === country) onRight(n, ms);
  };
  return (
    <div className={BOTTOM}>
      <div className="pointer-events-auto grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => choose(o)}
                  className={`btn shadow-sm backdrop-blur ${o === selected ? (correct ? 'btn-success' : 'btn-error') : 'btn-outline bg-base-100/90'} ${correct || o === selected ? 'pointer-events-none' : ''}`}>
            {getCountryDisplayName(geoData, o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function IdentifyCountryExercise({ geoData, country, distractor, onSubmitted }: Base & { country: string; distractor: string }) {
  const [correct, setCorrect] = useState(false);
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0"><WorldMapCanvas geoData={geoData} highlightCountry={country} markerCountry={country} interactive /></div>
      <Instruction correct={correct}><p className="text-sm font-medium">Which country is this?</p></Instruction>
      <Choice geoData={geoData} country={country} distractor={distractor} onRight={(n, ms) => {
        setCorrect(true);
        window.setTimeout(() => onSubmitted({ type: 'identify-country', country, numberOfClicksNeeded: n, msToFirstClick: ms }), SUCCESS_DELAY_MS);
      }} />
    </div>
  );
}

export function DistractorChoiceExercise({ geoData, country, distractor, zoom, panIndex, onSubmitted }: Base & { country: string; distractor: string; zoom: number; panIndex: number }) {
  const [correct, setCorrect] = useState(false);
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0"><WorldMapCanvas geoData={geoData} targetCountry={country} zoom={zoom} panIndex={panIndex} highlightCountry={country} interactive /></div>
      <Instruction correct={correct}><p className="text-sm font-medium">Which country is highlighted?</p></Instruction>
      <Choice geoData={geoData} country={country} distractor={distractor} onRight={(n, ms) => {
        setCorrect(true);
        window.setTimeout(() => onSubmitted({ type: 'distractor-choice', country, numberOfClicksNeeded: n, msToFirstClick: ms }), SUCCESS_DELAY_MS);
      }} />
    </div>
  );
}

/**
 * Each country of a group in turn, against another of the group. Every step is an answer of its own; `onDone` after
 * the last.
 */
export function GroupSequenceExercise({ geoData, groupId, countries, onSubmitted, onDone }: Base & { groupId: string; countries: string[]; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [correct, setCorrect] = useState(false);
  const current = countries[step];
  const [distractor, setDistractor] = useState(() => otherThan(countries, countries[0]));
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0"><WorldMapCanvas geoData={geoData} groupCountries={countries} highlightCountry={current} markerCountry={current} interactive /></div>
      <Instruction correct={correct}>
        <p className="text-sm font-medium">Which country is this?</p>
        <p className="text-xs text-base-content/60">{step + 1} / {countries.length}</p>
      </Instruction>
      <Choice key={step} geoData={geoData} country={current} distractor={distractor} onRight={(n, ms) => {
        setCorrect(true);
        onSubmitted({ type: 'group-sequence', country: current, groupId, numberOfClicksNeeded: n, msToFirstClick: ms });
        window.setTimeout(() => {
          if (step === countries.length - 1) { onDone(); return; }
          setStep(step + 1);
          setDistractor(otherThan(countries, countries[step + 1]));
          setCorrect(false);
        }, SUCCESS_DELAY_MS);
      }} />
    </div>
  );
}

function otherThan(countries: string[], c: string): string {
  const others = countries.filter((x) => x !== c);
  return others[Math.floor(Math.random() * others.length)];
}
