import { definePane } from '@gestalts/sdk';
import { PronunciationPractice } from './PronunciationPractice';

/** The words of the mounted decks, practised by FSRS. */
export const PracticePane = definePane({
  title: 'Alphabet pronunciation',
  Component: () => (
    <div className="h-full overflow-y-auto px-4 py-8">
      <PronunciationPractice />
    </div>
  ),
});
