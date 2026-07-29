// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import { CityThemeCard } from '@/components/organisms/cards/CityThemeCard';
import { LegendsThemeCard } from '@/components/organisms/cards/LegendsThemeCard';
import { OtherscapeThemeCard } from '@/components/organisms/cards/OtherscapeThemeCard';

// -- Store and Hook Imports --
import { ActiveCharacterStoreContext } from '@/lib/character/ActiveCharacterStoreContext';
import { createCharacterStore, useCharacterStore, type CharacterStore } from '@/lib/stores/characterStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { Card, Tag } from '@/lib/types/character';
import type { GameSystem, GeneralItemType } from '@/lib/types/common';
import type { CreateCardOptions } from '@/lib/types/creation';

/*
 * Pins how a theme card's inline edits reach the store, for all three games.
 *
 * `updateCardDetails` MERGES its patch into live state, so a commit that spreads the render's whole
 * `details` writes every other key back at the value that render saw. Two debounced fields dirty at once
 * commit in the same tick off the same snapshot, so the later one reverts the earlier - committed data
 * included. Every commit here therefore patches only the keys it owns, and the main tag (a nested object,
 * so a patch has to rebuild it) rebuilds from a live read.
 *
 * The Legends pair is covered in `SheetEditBuffers.flush.test.tsx`; City and Otherscape carry more
 * affected fields and are covered here.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let store: CharacterStore;

const Harness = ({ children }: { children: ReactNode }) => (
   <ActiveCharacterStoreContext.Provider value={store}>{children}</ActiveCharacterStoreContext.Provider>
);

const character = () => store.getState().character!;
const cardOfType = (cardType: GeneralItemType) => character().cards.find((entry) => entry.cardType === cardType)!;
const detailsOfType = <T,>(cardType: GeneralItemType) => cardOfType(cardType).details as T;

// The real prop chain: the surface reads `isEditing` from the general-state store and passes it down.
const setEditing = (value: boolean) => act(() => { useAppGeneralStateStore.setState({ isEditing: value }); });

const startCharacter = (game: GameSystem, options: CreateCardOptions) => {
   store = createCharacterStore();
   store.getState().actions.createCharacter(game);
   act(() => { store.getState().actions.addCard(options); });
};

const themeOptions = (cardType: CreateCardOptions['cardType']): CreateCardOptions => ({
   cardType, themebook: 'Wanderer', themeType: 'Mythos', powerTagsCount: 1, weaknessTagsCount: 1, wildcardSlots: 0,
});

// Each game's card under the store-driven `isEditing` the sheet uses, reading its card back out of the store.
const CityHarness = ({ cardType }: { cardType: GeneralItemType }) => {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const card = useCharacterStore((state) => state.character!.cards.find((entry) => entry.cardType === cardType)!);
   return <CityThemeCard card={card} isEditing={isEditing} useVerticalStack onExport={() => {}} />;
};

const OtherscapeHarness = ({ cardType }: { cardType: GeneralItemType }) => {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const card = useCharacterStore((state) => state.character!.cards.find((entry) => entry.cardType === cardType)!);
   return <OtherscapeThemeCard card={card} isEditing={isEditing} useVerticalStack onExport={() => {}} />;
};

const LegendsThemeCardHarness = () => {
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const card = useCharacterStore((state) => state.character!.cards.find((entry) => entry.cardType === 'CHARACTER_THEME')!);
   return <LegendsThemeCard card={card} isEditing={isEditing} useVerticalStack onExport={() => {}} />;
};

const typeInto = (placeholder: string, value: string) =>
   fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

/** Clicks the nth pip (1-based) of the tracker carrying `label`. Pips are bare icons, so they are reached through the label. */
const clickPip = (label: string, pip: number) => {
   const group = screen.getByText(`PipTracker.${label}`).parentElement!;
   fireEvent.click(group.querySelectorAll('svg')[pip - 1]);
};

beforeEach(() => {
   useAppGeneralStateStore.setState({ isEditing: true });
   vi.useFakeTimers();
});

afterEach(() => {
   vi.useRealTimers();
   cleanup();
});



// ##########################################
// ###   CITY OF MIST - TWO FIELDS DIRTY  ###
// ##########################################

describe('City theme card - main tag and mystery dirty at once', () => {
   beforeEach(() => { startCharacter('CITY_OF_MIST', themeOptions('CHARACTER_THEME')); });

   const typeMainTag = (value: string) => typeInto('ThemeCard.placeholderName', value);
   const typeMystery = (value: string) => typeInto('ThemeCard.mysteryPlaceholder', value);
   const read = () => detailsOfType<{ mainTag: Tag; mystery: string | null }>('CHARACTER_THEME');

   it('keeps both with no toggle at all', () => {
      render(<Harness><CityHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Doctor Nowhere');
      typeMystery('Who buried the case?');
      act(() => { vi.advanceTimersByTime(2000); });

      expect(read().mainTag.name).toBe('Doctor Nowhere');
      expect(read().mystery).toBe('Who buried the case?');
   });

   it('keeps both when the Edit -> Play toggle flushes them together', () => {
      render(<Harness><CityHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Doctor Nowhere');
      typeMystery('Who buried the case?');
      setEditing(false);
      act(() => { vi.advanceTimersByTime(2000); });

      expect(read().mainTag.name).toBe('Doctor Nowhere');
      expect(read().mystery).toBe('Who buried the case?');
   });

   it('keeps both when a tab-switch unmount flushes them together', () => {
      const { unmount } = render(<Harness><CityHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Doctor Nowhere');
      typeMystery('Who buried the case?');
      act(() => { unmount(); });

      expect(read().mainTag.name).toBe('Doctor Nowhere');
      expect(read().mystery).toBe('Who buried the case?');
   });

   it('keeps both at a human typing cadence: name, short pause, then the mystery', () => {
      render(<Harness><CityHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Doctor Nowhere');
      act(() => { vi.advanceTimersByTime(300); });
      for (const value of ['W', 'Wh', 'Who', 'Who ', 'Who b', 'Who buried the case?']) {
         typeMystery(value);
         act(() => { vi.advanceTimersByTime(120); });
      }
      act(() => { vi.advanceTimersByTime(2000); });

      expect(read().mainTag.name).toBe('Doctor Nowhere');
      expect(read().mystery).toBe('Who buried the case?');
   });

   it('keeps a power-tag name written surgically against a later mystery commit', () => {
      render(<Harness><CityHarness cardType="CHARACTER_THEME" /></Harness>);

      fireEvent.change(screen.getAllByPlaceholderText('TagItem.placeholder')[0], { target: { value: 'a good hunch' } });
      typeMystery('Who buried the case?');
      act(() => { vi.advanceTimersByTime(2000); });

      const details = detailsOfType<{ powerTags: Tag[]; mystery: string | null }>('CHARACTER_THEME');
      expect(details.powerTags[0].name).toBe('a good hunch');
      expect(details.mystery).toBe('Who buried the case?');
   });
});

describe('City crew card - main tag and identity dirty at once', () => {
   beforeEach(() => { startCharacter('CITY_OF_MIST', themeOptions('GROUP_THEME')); });

   it('keeps both with no toggle at all', () => {
      render(<Harness><CityHarness cardType="GROUP_THEME" /></Harness>);

      typeInto('ThemeCard.placeholderName', 'The Night Shift');
      typeInto('ThemeCard.identityPlaceholder', 'We answer the calls nobody else takes.');
      act(() => { vi.advanceTimersByTime(2000); });

      const details = detailsOfType<{ mainTag: Tag; identity: string | null }>('GROUP_THEME');
      expect(details.mainTag.name).toBe('The Night Shift');
      expect(details.identity).toBe('We answer the calls nobody else takes.');
   });
});



// #########################################
// ###   OTHERSCAPE - TWO FIELDS DIRTY   ###
// #########################################

describe('Otherscape theme card - main tag and ritual dirty at once', () => {
   beforeEach(() => { startCharacter('OTHERSCAPE', themeOptions('CHARACTER_THEME')); });

   const typeMainTag = (value: string) => typeInto('OtherscapeThemeCard.placeholderName', value);
   const typeRitual = (value: string) => typeInto('OtherscapeThemeCard.ritualPlaceholder', value);
   const read = () => detailsOfType<{ mainTag: Tag; mystery: string | null }>('CHARACTER_THEME');

   it('keeps both with no toggle at all', () => {
      render(<Harness><OtherscapeHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Ghost In The Signal');
      typeRitual('Speak the name backwards.');
      act(() => { vi.advanceTimersByTime(2000); });

      expect(read().mainTag.name).toBe('Ghost In The Signal');
      expect(read().mystery).toBe('Speak the name backwards.');
   });

   it('keeps both when a tab-switch unmount flushes them together', () => {
      const { unmount } = render(<Harness><OtherscapeHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Ghost In The Signal');
      typeRitual('Speak the name backwards.');
      act(() => { unmount(); });

      expect(read().mainTag.name).toBe('Ghost In The Signal');
      expect(read().mystery).toBe('Speak the name backwards.');
   });

   it('keeps both at a human typing cadence: name, short pause, then the ritual', () => {
      render(<Harness><OtherscapeHarness cardType="CHARACTER_THEME" /></Harness>);

      typeMainTag('Ghost In The Signal');
      act(() => { vi.advanceTimersByTime(300); });
      for (const value of ['S', 'Sp', 'Spe', 'Speak', 'Speak the name backwards.']) {
         typeRitual(value);
         act(() => { vi.advanceTimersByTime(120); });
      }
      act(() => { vi.advanceTimersByTime(2000); });

      expect(read().mainTag.name).toBe('Ghost In The Signal');
      expect(read().mystery).toBe('Speak the name backwards.');
   });
});

describe('Otherscape crew card - main tag and identity dirty at once', () => {
   beforeEach(() => { startCharacter('OTHERSCAPE', themeOptions('GROUP_THEME')); });

   it('keeps both with no toggle at all', () => {
      render(<Harness><OtherscapeHarness cardType="GROUP_THEME" /></Harness>);

      typeInto('OtherscapeThemeCard.placeholderName', 'The Quiet Contract');
      typeInto('OtherscapeThemeCard.identityPlaceholder', 'Nobody knows we were here.');
      act(() => { vi.advanceTimersByTime(2000); });

      const details = detailsOfType<{ mainTag: Tag; identity: string | null }>('GROUP_THEME');
      expect(details.mainTag.name).toBe('The Quiet Contract');
      expect(details.identity).toBe('Nobody knows we were here.');
   });
});



// ###############################
// ###   NARROW PATCH SHAPE    ###
// ###############################

/*
 * The click-driven commits have no same-tick partner today, so they cannot be shown losing data through
 * the UI. What they can be held to is the shape of the patch they send: only the keys they own. A spread
 * of the render's `details` is exactly what turns them into a clobber the moment a partner appears.
 */
describe('click-driven commits patch only their own key', () => {
   it('City: a pip sends just its own counter', () => {
      startCharacter('CITY_OF_MIST', themeOptions('CHARACTER_THEME'));
      render(<Harness><CityHarness cardType="CHARACTER_THEME" /></Harness>);
      const commit = vi.spyOn(store.getState().actions, 'updateCardDetails');

      clickPip('Attention', 2);

      expect(commit).toHaveBeenCalledWith(cardOfType('CHARACTER_THEME').id, { attention: 2 });
   });

   it('Otherscape: a pip sends just its own counter', () => {
      startCharacter('OTHERSCAPE', themeOptions('CHARACTER_THEME'));
      render(<Harness><OtherscapeHarness cardType="CHARACTER_THEME" /></Harness>);
      const commit = vi.spyOn(store.getState().actions, 'updateCardDetails');

      clickPip('Upgrade', 3);

      expect(commit).toHaveBeenCalledWith(cardOfType('CHARACTER_THEME').id, { attention: 3 });
   });

   it('Otherscape: a loadout wildcard slot sends just the slot count', () => {
      startCharacter('OTHERSCAPE', themeOptions('LOADOUT_THEME'));
      render(<Harness><OtherscapeHarness cardType="LOADOUT_THEME" /></Harness>);
      const commit = vi.spyOn(store.getState().actions, 'updateCardDetails');

      fireEvent.click(screen.getAllByRole('button')[1]); // the wildcard-slot increment

      expect(commit).toHaveBeenCalledWith(cardOfType('LOADOUT_THEME').id, { wildcardSlots: 1 });
   });

   it('Legends: a pip sends just its own counter', () => {
      startCharacter('LEGENDS', { ...themeOptions('CHARACTER_THEME'), themeType: 'Origin' });
      render(
         <Harness>
            <LegendsThemeCard card={cardOfType('CHARACTER_THEME')} isEditing useVerticalStack onExport={() => {}} />
         </Harness>,
      );
      const commit = vi.spyOn(store.getState().actions, 'updateCardDetails');

      clickPip('improve', 1);

      expect(commit).toHaveBeenCalledWith(cardOfType('CHARACTER_THEME').id, { improve: 1 });
   });
});



// ###########################################
// ###   MAIN TAG REBUILDS FROM THE STORE  ###
// ###########################################

/*
 * The main tag is the one nested object a theme card patches, so its commits have to rebuild it. Rebuilt
 * from the render's `details`, every sibling key (name / isActive / isScratched) rides along at its
 * render-time value and reverts whatever landed after that render.
 *
 * These render from a card object captured once, so the component's `details` cannot track the store -
 * an isolation harness for that one property, not a reproduction of a sheet flow. No surface freezes a
 * card prop like this today, which is why the hazard has no reachable path through the UI as it stands;
 * a second writer into the main tag would give it one.
 */
describe('main tag commits rebuild from live state', () => {
   /*
    * The nearest thing the sheet offers to the hazard above: a name still buffered when the Play-mode
    * toggles become clickable. It holds either way, because the toggle's own write re-renders the card
    * and so refreshes the pending commit's closure before it fires.
    */
   it('Legends: a buffered name and an activation tap both land', () => {
      startCharacter('LEGENDS', { ...themeOptions('CHARACTER_THEME'), themeType: 'Origin' });
      render(<Harness><LegendsThemeCardHarness /></Harness>);

      typeInto('ThemeCard.placeholderName', 'Sword of the North');
      setEditing(false);
      fireEvent.click(screen.getAllByRole('button')[0]); // the main-tag activation dot
      act(() => { vi.advanceTimersByTime(2000); });

      const mainTag = detailsOfType<{ mainTag: Tag }>('CHARACTER_THEME').mainTag;
      expect(mainTag.name).toBe('Sword of the North');
      expect(mainTag.isActive).toBe(true);
   });

   const nameIntoStore = (card: Card, name: string) => {
      const mainTag = (card.details as { mainTag: Tag }).mainTag;
      act(() => { store.getState().actions.updateCardDetails(card.id, { mainTag: { ...mainTag, name } }); });
   };

   it('Legends: the activation toggle keeps a name that landed after the render', () => {
      startCharacter('LEGENDS', { ...themeOptions('CHARACTER_THEME'), themeType: 'Origin' });
      const frozen = cardOfType('CHARACTER_THEME');
      render(<Harness><LegendsThemeCard card={frozen} isEditing={false} useVerticalStack onExport={() => {}} /></Harness>);

      nameIntoStore(frozen, 'Sword of the North');
      fireEvent.click(screen.getAllByRole('button')[0]); // the main-tag activation dot

      const mainTag = detailsOfType<{ mainTag: Tag }>('CHARACTER_THEME').mainTag;
      expect(mainTag.name).toBe('Sword of the North');
      expect(mainTag.isActive).toBe(true);
   });

   it('City: the activation toggle keeps a name that landed after the render', () => {
      startCharacter('CITY_OF_MIST', themeOptions('CHARACTER_THEME'));
      const frozen = cardOfType('CHARACTER_THEME');
      render(<Harness><CityThemeCard card={frozen} isEditing={false} useVerticalStack onExport={() => {}} /></Harness>);

      nameIntoStore(frozen, 'Doctor Nowhere');
      fireEvent.click(screen.getAllByRole('button')[0]);

      const mainTag = detailsOfType<{ mainTag: Tag }>('CHARACTER_THEME').mainTag;
      expect(mainTag.name).toBe('Doctor Nowhere');
      expect(mainTag.isActive).toBe(true);
   });

   it('Otherscape: the scratch toggle keeps a name that landed after the render', () => {
      startCharacter('OTHERSCAPE', themeOptions('CHARACTER_THEME'));
      const frozen = cardOfType('CHARACTER_THEME');
      render(<Harness><OtherscapeThemeCard card={frozen} isEditing={false} useVerticalStack onExport={() => {}} /></Harness>);

      nameIntoStore(frozen, 'Ghost In The Signal');
      fireEvent.click(screen.getAllByRole('button')[1]); // the main-tag scratch flame

      const mainTag = detailsOfType<{ mainTag: Tag }>('CHARACTER_THEME').mainTag;
      expect(mainTag.name).toBe('Ghost In The Signal');
      expect(mainTag.isScratched).toBe(true);
   });
});
