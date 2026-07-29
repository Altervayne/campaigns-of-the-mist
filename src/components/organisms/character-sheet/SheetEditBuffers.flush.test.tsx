// @vitest-environment jsdom

// -- React Imports --
import { useState } from 'react';

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import { StatusTrackerCard } from '@/components/organisms/trackers/StatusTracker';
import { StoryThemeTrackerCard } from '@/components/organisms/trackers/StoryThemeTracker';
import { LegendsThemeCard } from '@/components/organisms/cards/LegendsThemeCard';

// -- Store and Hook Imports --
import { ActiveCharacterStoreContext } from '@/lib/character/ActiveCharacterStoreContext';
import { createCharacterStore, useCharacterActions, useCharacterStore, type CharacterStore } from '@/lib/stores/characterStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Type Imports --
import type { ReactNode } from 'react';

/*
 * Pins what survives a debounced field's commit on the character sheet. The sheet's editable fields buffer
 * locally and commit on a timer, so every commit is a write that lands AFTER the keystroke that caused it -
 * potentially after a mode flip, an unmount, or a sibling field's own commit.
 *
 * Two things are covered, and they are separable:
 *   1. The Edit -> Play flip swaps every field from an Input to static text. The buffer must still reach the
 *      store; `useInputDebouncer` keeps its hook state above the branch and flushes on unmount, so it does.
 *   2. Two fields on the SAME card, dirty at the same time, commit in the same tick. A commit that spreads a
 *      render-time `details` snapshot writes back every OTHER key at its stale value, so the second commit
 *      erases the first. The challenge cards already avoid this by patching narrow keys off a live read;
 *      the theme cards do not.
 *
 * The CONTROL case below writes the failure deliberately, so a green result here means the components are
 * safe rather than that the probe never fired.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let store: CharacterStore;

const Harness = ({ children }: { children: ReactNode }) => (
   <ActiveCharacterStoreContext.Provider value={store}>{children}</ActiveCharacterStoreContext.Provider>
);

// The real prop chain: the surface reads `isEditing` from the general-state store and passes it down; the
// Edit / Play toggle writes that same flag and nothing else.
const setEditing = (value: boolean) => act(() => { useAppGeneralStateStore.setState({ isEditing: value }); });

const character = () => store.getState().character!;
const themeCard = () => character().cards.find((card) => card.cardType === 'CHARACTER_THEME')!;
const themeDetails = <T,>() => themeCard().details as T;

beforeEach(() => {
   store = createCharacterStore();
   store.getState().actions.createCharacter('LEGENDS');
   useAppGeneralStateStore.setState({ isEditing: true });
   useAppSettingsStore.setState({ isTrackersAlwaysEditable: false });
   vi.useFakeTimers();
});

afterEach(() => {
   vi.useRealTimers();
   cleanup();
});



// ####################
// ###   CONTROL    ###
// ####################

/*
 * The failure mode written on purpose: a local mirror committed only on blur. React fires no blur when a
 * focused input unmounts, and the Edit -> Play flip unmounts it, so the edit is dropped.
 */
function BlurOnlyField({ value, onCommit, isEditing }: { value: string; onCommit: (next: string) => void; isEditing: boolean }) {
   const [draft, setDraft] = useState(value);
   if (!isEditing) return <p>{value}</p>;
   return <input placeholder="blur-only" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => onCommit(draft)} />;
}

function BlurOnlyHarness() {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const { updateCharacterName } = useCharacterActions();
   const name = useCharacterStore((state) => state.character!.name);
   return <BlurOnlyField value={name} onCommit={updateCharacterName} isEditing={isEditing} />;
}

describe('control - the probe detects a dropped edit', () => {
   it('loses a blur-only buffer when Edit -> Play unmounts the input', () => {
      render(<Harness><BlurOnlyHarness /></Harness>);

      fireEvent.change(screen.getByPlaceholderText('blur-only'), { target: { value: 'Typed But Lost' } });
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(character().name).not.toBe('Typed But Lost');
   });
});



// #####################################
// ###   DEBOUNCE TIMER SEMANTICS    ###
// #####################################

/*
 * The debounce effect lists `onUpdate` in its deps and every call site passes a fresh inline arrow, so ANY
 * re-render restarts the timer - including one caused by a sibling field on the same card. This is why two
 * fields edited in one pass end up committing in the same tick instead of one after the other.
 */
function DebounceDepsProbe({ onUpdate, tick }: { onUpdate: (value: string) => void; tick: number }) {
   const [local, setLocal] = useInputDebouncer<string>('', (value) => onUpdate(value));
   return (
      <>
         <input placeholder="deps" value={local} onChange={(e) => setLocal(e.target.value)} />
         <span>{tick}</span>
      </>
   );
}

describe('useInputDebouncer timer', () => {
   it('restarts on an unrelated re-render, so it never fires while renders keep arriving below the delay', () => {
      const onUpdate = vi.fn();
      const { rerender } = render(<DebounceDepsProbe onUpdate={onUpdate} tick={0} />);

      fireEvent.change(screen.getByPlaceholderText('deps'), { target: { value: 'typed' } });
      for (let tick = 1; tick <= 10; tick += 1) {
         act(() => { vi.advanceTimersByTime(120); });
         rerender(<DebounceDepsProbe onUpdate={onUpdate} tick={tick} />);
      }
      expect(onUpdate).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(600); });
      expect(onUpdate).toHaveBeenCalledWith('typed');
   });
});



// ################################
// ###   TRACKERS ACROSS EDIT   ###
// ################################

function StatusHarness() {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const isAlwaysEditable = useAppSettingsStore((state) => state.isTrackersAlwaysEditable);
   const tracker = useCharacterStore((state) => state.character!.trackers.statuses[0]);
   return <StatusTrackerCard tracker={tracker} isEditing={isEditing || isAlwaysEditable} onExport={() => {}} />;
}

describe('status tracker name across the Edit -> Play toggle', () => {
   beforeEach(() => { act(() => { store.getState().actions.addStatus(); }); });

   it('keeps a name buffered right before the toggle', () => {
      render(<Harness><StatusHarness /></Harness>);

      fireEvent.change(screen.getByPlaceholderText('Trackers.statusPlaceholder'), { target: { value: 'Bleeding-3' } });
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(character().trackers.statuses[0].name).toBe('Bleeding-3');
   });

   it('keeps a name when the toggle is followed straight away by an unmount', () => {
      const { unmount } = render(<Harness><StatusHarness /></Harness>);

      fireEvent.change(screen.getByPlaceholderText('Trackers.statusPlaceholder'), { target: { value: 'Bleeding-3' } });
      setEditing(false);
      act(() => { unmount(); });

      expect(character().trackers.statuses[0].name).toBe('Bleeding-3');
   });

   it('keeps the last keystroke when the toggle lands with zero elapsed time', () => {
      render(<Harness><StatusHarness /></Harness>);

      for (const value of ['A', 'AB', 'ABC']) {
         fireEvent.change(screen.getByPlaceholderText('Trackers.statusPlaceholder'), { target: { value } });
      }
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(character().trackers.statuses[0].name).toBe('ABC');
   });
});

function StoryThemeHarness() {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const tracker = useCharacterStore((state) => state.character!.trackers.storyThemes[0]);
   return <StoryThemeTrackerCard tracker={tracker} isEditing={isEditing} onExport={() => {}} />;
}

describe('story theme tracker across the Edit -> Play toggle', () => {
   beforeEach(() => { act(() => { store.getState().actions.addStoryTheme(); }); });

   it('keeps a main-tag name buffered right before the toggle', () => {
      render(<Harness><StoryThemeHarness /></Harness>);

      fireEvent.change(screen.getByPlaceholderText('ThemeCard.placeholderName'), { target: { value: 'The Long Road' } });
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(character().trackers.storyThemes[0].mainTag.name).toBe('The Long Road');
   });

   it('keeps a sub-tag name buffered right before the toggle', () => {
      act(() => { store.getState().actions.addTagToStoryTheme(character().trackers.storyThemes[0].id, 'powerTags'); });
      render(<Harness><StoryThemeHarness /></Harness>);

      fireEvent.change(screen.getByPlaceholderText('TagItem.placeholder'), { target: { value: 'muddy boots' } });
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(character().trackers.storyThemes[0].powerTags[0].name).toBe('muddy boots');
   });
});



// #############################
// ###   CARDS ACROSS EDIT   ###
// #############################

function ThemeCardHarness() {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const card = useCharacterStore((state) => state.character!.cards.find((entry) => entry.cardType === 'CHARACTER_THEME')!);
   return <LegendsThemeCard card={card} isEditing={isEditing} useVerticalStack onExport={() => {}} />;
}

const renderThemeCard = () => render(<Harness><ThemeCardHarness /></Harness>);
const typeMainTag = (value: string) => fireEvent.change(screen.getByPlaceholderText('ThemeCard.placeholderName'), { target: { value } });
const typeQuest = (value: string) => fireEvent.change(screen.getByPlaceholderText('ThemeCard.questPlaceholder'), { target: { value } });

describe('theme card - one field at a time', () => {
   beforeEach(() => {
      act(() => {
         store.getState().actions.addCard({ cardType: 'CHARACTER_THEME', game: 'LEGENDS', themeType: 'Origin', themebook: 'Wanderer', powerTagsCount: 1, weaknessTagsCount: 1 } as never);
      });
   });

   it('keeps a buffered main-tag name across the toggle', () => {
      renderThemeCard();

      typeMainTag('Sword of the North');
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(themeDetails<{ mainTag: { name: string } }>().mainTag.name).toBe('Sword of the North');
   });

   it('keeps a buffered quest across the toggle', () => {
      renderThemeCard();

      typeQuest('Find the blade.');
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(themeDetails<{ quest: string }>().quest).toBe('Find the blade.');
   });

   it('keeps a buffered power-tag name across the toggle', () => {
      renderThemeCard();

      fireEvent.change(screen.getAllByPlaceholderText('TagItem.placeholder')[0], { target: { value: 'sharp eye' } });
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(themeDetails<{ powerTags: { name: string }[] }>().powerTags[0].name).toBe('sharp eye');
   });

   it('keeps a buffered quest when an unbuffered pip write lands in the same window', () => {
      renderThemeCard();

      typeQuest('Find the blade.');
      act(() => { store.getState().actions.updateCardDetails(themeCard().id, { abandon: 2 } as never); });
      act(() => { vi.advanceTimersByTime(2000); });

      const details = themeDetails<{ quest: string; abandon: number }>();
      expect(details.quest).toBe('Find the blade.');
      expect(details.abandon).toBe(2);
   });

   it('keeps a buffered quest when a Play-mode tap lands right after the toggle', () => {
      renderThemeCard();

      typeQuest('Find the blade.');
      setEditing(false);
      fireEvent.click(screen.getAllByRole('button')[0]); // the main-tag activation dot
      act(() => { vi.advanceTimersByTime(2000); });

      const details = themeDetails<{ quest: string; mainTag: { isActive: boolean } }>();
      expect(details.quest).toBe('Find the blade.');
      expect(details.mainTag.isActive).toBe(true);
   });
});

/*
 * Two fields on the same card, dirty together. Each of these commits through `updateCardDetails` with a
 * whole-`details` spread taken at render time, so the later commit rewrites the earlier one's key at its
 * stale value. The toggle is not required - it only shortens the window in which both are still pending.
 */
describe('theme card - two fields dirty at once', () => {
   beforeEach(() => {
      act(() => {
         store.getState().actions.addCard({ cardType: 'CHARACTER_THEME', game: 'LEGENDS', themeType: 'Origin', themebook: 'Wanderer', powerTagsCount: 1, weaknessTagsCount: 1 } as never);
      });
   });

   it('keeps both when the toggle flushes them together', () => {
      renderThemeCard();

      typeMainTag('Sword of the North');
      typeQuest('Find the blade.');
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      const details = themeDetails<{ mainTag: { name: string }; quest: string }>();
      expect(details.mainTag.name).toBe('Sword of the North');
      expect(details.quest).toBe('Find the blade.');
   });

   it('keeps both with no toggle at all', () => {
      renderThemeCard();

      typeMainTag('Sword of the North');
      typeQuest('Find the blade.');
      act(() => { vi.advanceTimersByTime(2000); });

      const details = themeDetails<{ mainTag: { name: string }; quest: string }>();
      expect(details.mainTag.name).toBe('Sword of the North');
      expect(details.quest).toBe('Find the blade.');
   });

   it('keeps both when a tab-switch unmount flushes them together', () => {
      const { unmount } = renderThemeCard();

      typeMainTag('Sword of the North');
      typeQuest('Find the blade.');
      act(() => { unmount(); });

      const details = themeDetails<{ mainTag: { name: string }; quest: string }>();
      expect(details.mainTag.name).toBe('Sword of the North');
      expect(details.quest).toBe('Find the blade.');
   });

   it('keeps both at a human typing cadence: name, short pause, then the quest', () => {
      renderThemeCard();

      typeMainTag('Sword of the North');
      act(() => { vi.advanceTimersByTime(300); });
      for (const value of ['F', 'Fi', 'Fin', 'Find', 'Find ', 'Find t', 'Find th', 'Find the', 'Find the blade.']) {
         typeQuest(value);
         act(() => { vi.advanceTimersByTime(120); });
      }
      act(() => { vi.advanceTimersByTime(2000); });

      const details = themeDetails<{ mainTag: { name: string }; quest: string }>();
      expect(details.mainTag.name).toBe('Sword of the North');
      expect(details.quest).toBe('Find the blade.');
   });

   it('keeps a power-tag name written surgically against a later whole-details commit', () => {
      renderThemeCard();

      fireEvent.change(screen.getAllByPlaceholderText('TagItem.placeholder')[0], { target: { value: 'sharp eye' } });
      typeQuest('Find the blade.');
      act(() => { vi.advanceTimersByTime(2000); });

      const details = themeDetails<{ powerTags: { name: string }[]; quest: string }>();
      expect(details.quest).toBe('Find the blade.');
      expect(details.powerTags[0].name).toBe('sharp eye');
   });
});
