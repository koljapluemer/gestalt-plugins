import { definePane } from '@gestalts/sdk';
import { LearnWorldMap } from './LearnWorldMap';

/** The world map exercises, filling the pane. */
export const PracticePane = definePane({
  title: 'World map',
  Component: () => <div className="h-full"><LearnWorldMap /></div>,
});
