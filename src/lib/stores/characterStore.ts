// -- Other Library Imports --
import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import cuid from 'cuid';

// -- Utils Imports --
import { createNewCharacter, emptyChallengeDetails, hasChallengeVariant } from '../utils/character';
import { deepReId } from '../utils/drawer';
import { emptyTracker } from '@/lib/trackers/emptyTracker';
import { buildCard } from '@/lib/cards/buildCard';
import { DEFAULT_IMAGE_CARD_SIZE, clampCardWidth, clampCardHeight } from '../constants/imageCard';

// -- Store and Hook Imports --
import { useAppGeneralStateStore } from './appGeneralStateStore';
import { useActiveCharacterInstance } from '@/lib/character/ActiveCharacterStoreContext';

// -- Sheet layout manifest --
import { appendSheetLayoutEntry, removeSheetLayoutEntry, reorderSheetLayoutEntries } from '@/lib/character/sheetLayout';

// -- Type Imports --
import type { Character, Card, Tag, LegendsThemeDetails, OtherscapeThemeDetails, OtherscapeCharacterDetails, StatusTracker, StoryTagTracker, Tracker, LegendsHeroDetails, LegendsFellowshipDetails, FellowshipRelationship, BlandTag, CardDetails, CardViewMode, StoryThemeTracker, CrewMember, CityRiftDetails, ImageCardDetails } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';
import type { GeneralItemType, GameSystem } from '../types/drawer';
import type { CreateCardOptions } from '../types/creation';



// Power / weakness tag lists live on theme cards; backpack / specials / nemeses
// are the per-character-card tag lists that gained activation + burn in 1.3.0.
type TagListName = 'powerTags' | 'weaknessTags' | 'items' | 'backpack' | 'specials' | 'nemeses';
// Tag lists that remain "bland" (no activation / burn): the experience-style
// improvements on every theme card, and Hero quintessences.
type BlandTagListName = 'quintessences' | 'improvements';

type CharacterCardTagListName = 'backpack' | 'specials' | 'nemeses';
const CHARACTER_CARD_TAG_LIST_NAMES: readonly CharacterCardTagListName[] = ['backpack', 'specials', 'nemeses'];
const isCharacterCardTagListName = (listName: TagListName): listName is CharacterCardTagListName =>
   (CHARACTER_CARD_TAG_LIST_NAMES as readonly string[]).includes(listName);

type IndexableCardDetails = CardDetails & { [key in BlandTagListName]?: BlandTag[] };

const hasBlandTagList = (details: CardDetails, listName: string): listName is BlandTagListName => {
   return listName in details && Array.isArray((details as unknown as { [key: string]: unknown })[listName]);
};

const hasCharacterCardTagList = (details: CardDetails, listName: CharacterCardTagListName): boolean => {
   return listName in details && Array.isArray((details as unknown as { [key: string]: unknown })[listName]);
};

// Helper function to update Otherscape essence counts
const updateOtherscapeEssence = (cards: Card[]): Card[] => {
   const characterCard = cards.find(c => c.cardType === 'CHARACTER_CARD');
   if (!characterCard || (characterCard.details as OtherscapeCharacterDetails).game !== 'OTHERSCAPE') {
      return cards;
   }

   // Count theme types from CHARACTER_THEME cards
   const themeCounts = cards.reduce((acc, card) => {
      if (card.cardType === 'CHARACTER_THEME') {
         const themeDetails = card.details as OtherscapeThemeDetails;
         const themeType = themeDetails.themeType;
         if (themeType === 'Mythos') acc.mythos++;
         else if (themeType === 'Self') acc.self++;
         else if (themeType === 'Noise') acc.noise++;
      }
      return acc;
   }, { mythos: 0, self: 0, noise: 0 });

   // Update the character card with new essence counts
   return cards.map(card => {
      if (card.cardType === 'CHARACTER_CARD') {
         return {
            ...card,
            details: {
               ...card.details,
               essence: themeCounts,
            } as OtherscapeCharacterDetails,
         };
      }
      return card;
   });
};



export interface CharacterState {
   character: Character | null;
   /** True when the character differs from its saved drawer copy, or was never saved to the drawer. */
   hasUnsavedChanges: boolean;
   actions: {
      createCharacter: (game: GameSystem) => void;
      loadCharacter: (character: Character, drawerItemId?: string) => void;
      linkToDrawerItem: (drawerItemId: string) => void;
      /** Sets the unsaved-changes flag: the change subscription marks dirty on edit; save sites mark clean. */
      setHasUnsavedChanges: (value: boolean) => void;
      resetCharacter: () => void;
      returnToMenu: () => void;
      setGame: (game: Character['game']) => void;
      updateCharacterName: (name: string) => void;
      // Card Actions
      addCard: (options: CreateCardOptions) => string;
      /** Imports a card onto the sheet. Returns `false` (no mutation) when it would add a second portrait. */
      addImportedCard: (card: Card, index?: number) => boolean;
      /** Appends one empty portrait (IMAGE_CARD); no-op if the sheet already has one. */
      addPortrait: () => void;
      /** Appends a blank Challenge Card in the character's game and returns its id, so the caller opens the editor. */
      addChallengeCard: () => string;
      /** Sets (or clears, with `null`) a portrait card's image asset. */
      setCardImage: (cardId: string, assetId: string | null) => void;
      /** Sets a portrait card's display size (px), clamped to the card bounds. */
      setCardSize: (cardId: string, width: number, height: number) => void;
      deleteCard: (cardId: string) => void;
      updateCardDetails: (cardId: string, newDetails: Partial<CardDetails>) => void;
      /** Sets a card's display title (the challenge card's name lives here). */
      updateCardTitle: (cardId: string, title: string) => void;
      /** Kind-agnostic sheet reorder: moves the manifest entry for `fromId` to `toId`'s slot. */
      reorderSheetLayout: (fromId: string, toId: string) => void;
      flipCard: (cardId: string) => void;
      updateCardViewMode: (cardId: string, viewMode: CardViewMode | null) => void;
      /** Sets a card's board display mode (expanded landscape sheet vs the normal card). */
      setCardExpanded: (cardId: string, expanded: boolean) => void;
      // Journal Actions
      /** Appends a bare, empty Journal (the character's own notebook) to `character.journals`. */
      addJournal: () => string;
      /** Imports a journal onto the sheet as a COPY: a fresh top-level id, pages/bookmarks preserved. */
      addImportedJournal: (journal: Journal) => void;
      /** Replaces a journal in `character.journals` with an edited aggregate (page/bookmark edits). */
      updateJournal: (journalId: string, journal: Journal) => void;
      /** Removes a journal from `character.journals`. */
      removeJournal: (journalId: string) => void;
      // Tag Actions
      addTag: (cardId: string, listName: TagListName) => void;
      updateTag: (cardId: string, listName: TagListName, tagId: string, updatedTag: Partial<Tag>) => void;
      removeTag: (cardId: string, listName: TagListName, tagId: string) => void;
      // Bland Tag Actions (for Quintessences and theme-card Improvements)
      addBlandTag: (cardId: string, listName: BlandTagListName) => void;
      updateBlandTag: (cardId: string, listName: BlandTagListName, tagId: string, name: string) => void;
      removeBlandTag: (cardId: string, listName: BlandTagListName, tagId: string) => void;
      // Tracker Actions
      /** Appends a status tracker and returns its id, so a caller can set its tiers (e.g. a tapped mention). */
      addStatus: (name?: string) => string;
      addStoryTag: (name?: string) => void;
      addStoryTheme: (name?: string) => void;
      addImportedTracker: (tracker: Tracker, index?: number) => void;
      removeStatus: (trackerId: string) => void;
      removeStoryTag: (trackerId: string) => void;
      removeStoryTheme: (trackerId: string) => void;
      updateStatus: (trackerId: string, updates: Partial<StatusTracker>) => void;
      updateStoryTag: (trackerId: string, updates: Partial<StoryTagTracker>) => void;
      updateStoryTheme: (trackerId: string, updates: Partial<StoryThemeTracker>) => void;
      reorderStatuses: (oldIndex: number, newIndex: number) => void;
      reorderStoryTags: (oldIndex: number, newIndex: number) => void;
      reorderStoryThemes: (oldIndex: number, newIndex: number) => void;
      upgradeStoryTagToTheme: (trackerId: string) => void;
      downgradeStoryThemeToTag: (trackerId: string) => void;
      // Story Themes Tag Actions
      addTagToStoryTheme: (trackerId: string, listName: 'powerTags' | 'weaknessTags') => void;
      updateTagInStoryTheme: (trackerId: string, listName: 'mainTag' | 'powerTags' | 'weaknessTags', tagId: string, updatedTag: Partial<Tag>) => void;
      removeTagFromStoryTheme: (trackerId: string, listName: 'powerTags' | 'weaknessTags', tagId: string) => void;
      // Legend in the Mist ### Fellowship Relationship Actions
      addRelationship: (cardId: string) => void;
      updateRelationship: (cardId: string, relationshipId: string, updates: Partial<FellowshipRelationship>) => void;
      removeRelationship: (cardId: string, relationshipId: string) => void;
      // City of Mist ### Crew Actions
      addCrewMember: (cardId: string) => void;
      updateCrewMember: (cardId: string, crewId: string, updates: Partial<CrewMember>) => void;
      removeCrewMember: (cardId: string, crewId: string) => void;
   };
}



const initialState: Pick<CharacterState, 'character' | 'hasUnsavedChanges'> = {
   character: null,
   hasUnsavedChanges: false,
};

/**
 * Builds a fresh, fully-formed character (with its generated id) for `game`,
 * without touching any store. The TabManager needs the character and its id
 * *before* it can key an instance for it, so the
 * construction is extracted here as a pure helper. The `createCharacter` action
 * below delegates to it, so the "New Character" default name is shared.
 *
 * @param game - The game system the new character belongs to.
 * @returns A new {@link Character} with a generated id; not persisted or loaded.
 */
export function buildNewCharacter(game: GameSystem): Character {
   return createNewCharacter('New Character', game);
}

const updateCardInState = (state: CharacterState, cardId: string, updateFn: (card: Card) => Card): CharacterState => {
   if (!state.character) return state;
   return {
      ...state,
      character: {
         ...state.character,
         cards: state.character.cards.map(card => card.id === cardId ? updateFn(card) : card),
      },
   };
};



/**
 * Builds a character store instance: the in-memory character plus the full action
 * API, wrapped in zundo `temporal` for snapshot undo/redo.
 *
 * Persistence is deliberately NOT part of the store; there is no zustand
 * `persist` here. The store is pure in-memory state; `characterPersistence.ts` is
 * the only bridge to IndexedDB (load-on-open + a debounced save subscription), and
 * harmonization runs at load time rather than in a persist `migrate` hook.
 *
 * It is a factory (rather than a bare `create(...)`) so each open character tab gets
 * one independent store, hence one independent undo stack.
 */
export function createCharacterStore() {
   // Forward reference to the instance being built. Action bodies run later (at
   // dispatch time), by which point `useStore` is assigned, so each instance's
   // temporal self-references target its OWN undo stack rather than a global
   // singleton, which is what makes the factory self-contained.
   const useStore = create<CharacterState>()(
      temporal(
         (set) => ({
            ...initialState,
            actions: {
               // Character Actions
               createCharacter: (game) => {
                  set(() => {
                    const newCharacter = buildNewCharacter(game);
                    useStore.temporal.getState().clear();
                    useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                    // A brand-new character was never saved to the drawer.
                    return { character: newCharacter, hasUnsavedChanges: true };
                  });
               },
               loadCharacter: (character: Character, drawerItemId?: string) => {
                  set(() => {
                     // Reset undo history on load so undo can never cross from this
                     // character into the previously loaded one. Matches
                     // createCharacter/returnToMenu.
                     useStore.temporal.getState().clear();
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     // Clean when opened from the drawer (has a link); dirty otherwise
                     // (a new or imported character that is not in the drawer).
                     return { character: {
                        ...character,
                        drawerItemId: drawerItemId
                     }, hasUnsavedChanges: !drawerItemId }
                  })
               },
               setHasUnsavedChanges: (value) => {
                  set({ hasUnsavedChanges: value });
               },
               linkToDrawerItem: (drawerItemId) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     // Link to a drawer item WITHOUT clearing the undo stack (unlike
                     // loadCharacter): used by the tab→drawer save so dragging a
                     // background tab to the drawer doesn't reset that tab's history.
                     return { character: { ...state.character, drawerItemId } };
                  });
               },
               resetCharacter: () => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newCharacter = createNewCharacter("New Character", state.character.game);
                     // The wiped character no longer matches its drawer copy.
                     return { character: newCharacter, hasUnsavedChanges: true };
                  });
               },
               returnToMenu: () => {
                  set(() => {
                     useStore.temporal.getState().clear();
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return { character: null, hasUnsavedChanges: false };
                  });
               },
               updateCharacterName: (name) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');

                     // Update character name and sync to all character cards
                     const updatedCards = state.character.cards.map(card => {
                        // Update characterName on all character cards that have this field
                        if (card.cardType === 'CHARACTER_CARD') {
                           if (card.details.game === 'LEGENDS') {
                              const details = card.details as LegendsHeroDetails;
                              return {
                                 ...card,
                                 details: {
                                       ...details,
                                       characterName: name,
                                 }
                              };
                           } else if (card.details.game === 'CITY_OF_MIST') {
                              const details = card.details as CityRiftDetails;
                              return {
                                 ...card,
                                 details: {
                                    ...details,
                                    characterName: name,
                                 }
                              };
                           } else if (card.details.game === 'OTHERSCAPE') {
                              const details = card.details as OtherscapeCharacterDetails;
                              return {
                                 ...card,
                                 details: {
                                    ...details,
                                    characterName: name,
                                 }
                              };
                           }
                        }
                        return card;
                     });

                     return {
                        character: {
                           ...state.character,
                           name,
                           cards: updatedCards
                        }
                     };
                  });
               },
               setGame: (game) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return { character: { ...state.character, game } };
                  });
               },
               // Card Actions
               addCard: (options) => {
                  let newCardId = '';
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');

                     // The card construction lives in the shared `buildCard` factory; the sheet keeps its
                     // familiar "<name>'s ..." titles by passing the character name, and its insertion order.
                     const newCard = buildCard(state.character.game, options, state.character.name);
                     if (!newCard) return {};
                     newCardId = newCard.id;

                     const updatedCards = [...state.character.cards, newCard];

                     // Update essence count for Otherscape characters
                     const updatedCardsWithEssence = state.character.game === 'OTHERSCAPE'
                        ? updateOtherscapeEssence(updatedCards)
                        : updatedCards;

                     return {
                        character: {
                           ...state.character,
                           cards: updatedCardsWithEssence,
                           sheetLayout: appendSheetLayoutEntry(state.character.sheetLayout, { kind: 'card', id: newCard.id }),
                        },
                     };
                  });
                  return newCardId;
               },
               addImportedCard: (card, index) => {
                  let added = false;
                  set((state) => {
                     if (!state.character) return {};

                     // Singleton portrait policy: a sheet holds at most one IMAGE_CARD.
                     // Unlike the CHARACTER_CARD branch below (replace), a second portrait
                     // is REJECTED with no mutation so the caller can warn the user.
                     if (card.cardType === 'IMAGE_CARD' && state.character.cards.some(c => c.cardType === 'IMAGE_CARD')) {
                        return {};
                     }

                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     added = true;

                     const newCardCopy = deepReId(card);
                     let finalCards: Card[];
                     let newCharacterName = state.character.name;
                     // Track the manifest entry for the new card: a replaced character card takes the
                     // ousted card's slot; an appended card gets a fresh trailing entry.
                     let sheetLayout = state.character.sheetLayout;

                     const uniqueCharacterCardTypes: GeneralItemType[] = ['CHARACTER_CARD'];

                     if (uniqueCharacterCardTypes.includes(newCardCopy.cardType)) {
                        const originalUniqueCard = state.character.cards.find(c => uniqueCharacterCardTypes.includes(c.cardType));

                        finalCards = state.character.cards.map(c =>
                           uniqueCharacterCardTypes.includes(c.cardType) ? newCardCopy : c
                        );

                        // The replaced card's manifest slot points at its now-dead id; repoint it to the
                        // new copy in place so the layout order is preserved. No original card → append.
                        sheetLayout = originalUniqueCard
                           ? sheetLayout.map((entry) => (entry.id === originalUniqueCard.id ? { kind: 'card', id: newCardCopy.id } : entry))
                           : appendSheetLayoutEntry(sheetLayout, { kind: 'card', id: newCardCopy.id });

                        if (newCardCopy.details.game === 'LEGENDS') {
                           newCharacterName = (newCardCopy.details as LegendsHeroDetails).characterName;
                        } else if (newCardCopy.details.game === 'CITY_OF_MIST') {
                           newCharacterName = (newCardCopy.details as CityRiftDetails).characterName;
                        };

                     } else {
                        const newCards = [...state.character.cards];
                        const insertionIndex = index ?? newCards.length;
                        newCards.splice(insertionIndex, 0, newCardCopy);

                        finalCards = newCards;
                        sheetLayout = appendSheetLayoutEntry(sheetLayout, { kind: 'card', id: newCardCopy.id });
                     }

                     // Update essence count for Otherscape characters
                     const updatedCardsWithEssence = state.character.game === 'OTHERSCAPE'
                        ? updateOtherscapeEssence(finalCards)
                        : finalCards;

                     return {
                        character: {
                           ...state.character,
                           name: newCharacterName,
                           cards: updatedCardsWithEssence,
                           sheetLayout,
                        },
                     };
                  });
                  return added;
               },
               addPortrait: () => {
                  set((state) => {
                     if (!state.character) return {};
                     // Sheet singleton policy: only one portrait per sheet (the add button is
                     // also hidden once one exists; this is the defensive backstop).
                     if (state.character.cards.some(c => c.cardType === 'IMAGE_CARD')) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newCard: Card = {
                        id: cuid(),
                        title: 'Portrait',
                        isFlipped: false,
                        cardType: 'IMAGE_CARD',
                        details: {
                           // Image cards are game-agnostic; they record no origin game.
                           game: 'NEUTRAL',
                           assetId: null,
                           fit: 'cover',
                           width: DEFAULT_IMAGE_CARD_SIZE.width,
                           height: DEFAULT_IMAGE_CARD_SIZE.height,
                        } as ImageCardDetails,
                     };
                     return {
                        character: {
                           ...state.character,
                           cards: [...state.character.cards, newCard],
                           sheetLayout: appendSheetLayoutEntry(state.character.sheetLayout, { kind: 'card', id: newCard.id }),
                        },
                     };
                  });
               },
               addChallengeCard: () => {
                  const newCardId = cuid();
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     // A challenge adopts the character's game.
                     const game = hasChallengeVariant(state.character.game) ? state.character.game : 'LEGENDS';
                     const newCard: Card = {
                        id: newCardId,
                        title: '',
                        isFlipped: false,
                        cardType: 'CHALLENGE_CARD',
                        details: emptyChallengeDetails(game),
                     };
                     return {
                        character: {
                           ...state.character,
                           cards: [...state.character.cards, newCard],
                           sheetLayout: appendSheetLayoutEntry(state.character.sheetLayout, { kind: 'card', id: newCard.id }),
                        },
                     };
                  });
                  return newCardId;
               },
               setCardImage: (cardId, assetId) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return updateCardInState(state, cardId, card => {
                        if (card.cardType !== 'IMAGE_CARD') return card;
                        return { ...card, details: { ...card.details, assetId } as CardDetails };
                     });
                  });
               },
               setCardSize: (cardId, width, height) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return updateCardInState(state, cardId, card => {
                        if (card.cardType !== 'IMAGE_CARD') return card;
                        return {
                           ...card,
                           details: { ...card.details, width: clampCardWidth(width), height: clampCardHeight(height) } as CardDetails,
                        };
                     });
                  });
               },
               deleteCard: (cardId) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');

                     const updatedCards = state.character.cards.filter((card) => card.id !== cardId);

                     // Update essence count for Otherscape characters
                     const updatedCardsWithEssence = state.character.game === 'OTHERSCAPE'
                        ? updateOtherscapeEssence(updatedCards)
                        : updatedCards;

                     return {
                        character: {
                           ...state.character,
                           cards: updatedCardsWithEssence,
                           sheetLayout: removeSheetLayoutEntry(state.character.sheetLayout, cardId),
                        },
                     };
                  });
               },
               updateCardDetails: (cardId, newDetails) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');

                     // Find the card being updated
                     const card = state.character.cards.find(c => c.id === cardId);

                     // Check if this is a character card and characterName is being updated
                     const isCharacterCard = card && card.cardType === 'CHARACTER_CARD';
                     const isUpdatingCharacterName = 'characterName' in newDetails && typeof newDetails.characterName === 'string';

                     // Update the card details
                     const updatedState = updateCardInState(state, cardId, card => ({
                        ...card,
                        details: { ...card.details, ...newDetails } as CardDetails
                     }));

                     // If updating character name on character card, sync it to Character.name
                     if (isCharacterCard && isUpdatingCharacterName && updatedState.character) {
                        return {
                           character: {
                              ...updatedState.character,
                              name: newDetails.characterName as string
                           }
                        };
                     }

                     return updatedState;
                  });
               },
               updateCardTitle: (cardId, title) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return updateCardInState(state, cardId, card => ({ ...card, title }));
                  });
               },
               reorderSheetLayout: (fromId, toId) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return { character: { ...state.character, sheetLayout: reorderSheetLayoutEntries(state.character.sheetLayout, fromId, toId) } };
                  });
               },
               flipCard: (cardId) => {
                  set(state => {
                  useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                  return updateCardInState(state, cardId, card => ({
                        ...card,
                        isFlipped: !card.isFlipped,
                     }))
                  });
               },
               updateCardViewMode: (cardId, viewMode) => {
                  set(state => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return updateCardInState(state, cardId, card => ({
                        ...card,
                        viewMode: viewMode,
                     }));
                  });
               },
               setCardExpanded: (cardId, expanded) => {
                  set(state => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return updateCardInState(state, cardId, card => ({
                        ...card,
                        expanded,
                     }));
                  });
               },
               // Journal Actions
               addJournal: () => {
                  let newJournalId = '';
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     // A bare, game-agnostic aggregate: a fresh notebook with no pages or bookmarks.
                     const newJournal: Journal = { id: cuid(), title: '', pages: [], bookmarks: [] };
                     newJournalId = newJournal.id;
                     return {
                        character: {
                           ...state.character,
                           journals: [...state.character.journals, newJournal],
                           sheetLayout: appendSheetLayoutEntry(state.character.sheetLayout, { kind: 'journal', id: newJournal.id }),
                        },
                     };
                  });
                  return newJournalId;
               },
               addImportedJournal: (journal) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     // A COPY: deep-clone, then regenerate ONLY the top-level id. Pages keep their ids and
                     // bookmarks keep their `pageId` references, so no bookmark is stranded (a blind deepReId
                     // would rewrite page ids and orphan every bookmark). Append its manifest entry too, or the
                     // imported journal renders but can't reorder (the pre-manifest bug).
                     const copy: Journal = { ...structuredClone(journal), id: cuid() };
                     return {
                        character: {
                           ...state.character,
                           journals: [...state.character.journals, copy],
                           sheetLayout: appendSheetLayoutEntry(state.character.sheetLayout, { kind: 'journal', id: copy.id }),
                        },
                     };
                  });
               },
               updateJournal: (journalId, journal) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           journals: state.character.journals.map((entry) => (entry.id === journalId ? journal : entry)),
                        },
                     };
                  });
               },
               removeJournal: (journalId) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           journals: state.character.journals.filter((entry) => entry.id !== journalId),
                           sheetLayout: removeSheetLayoutEntry(state.character.sheetLayout, journalId),
                        },
                     };
                  });
               },
               // Tag Actions
               addTag: (cardId, listName) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     // For Otherscape loadout cards, gear tags should be burned (unloaded) by default
                     const isLoadoutGear = card.cardType === 'LOADOUT_THEME' && listName === 'powerTags';
                     const newTag: Tag = { id: cuid(), name: '', isActive: false, isScratched: isLoadoutGear };

                     if ('powerTags' in card.details && (listName === 'powerTags' || listName === 'weaknessTags')) {
                        const details = card.details as LegendsThemeDetails | LegendsFellowshipDetails;
                        const updatedDetails = { ...details };

                        if (listName === 'powerTags') {
                           updatedDetails.powerTags = [...details.powerTags, newTag];
                        } else if (listName === 'weaknessTags') {
                           updatedDetails.weaknessTags = [...details.weaknessTags, newTag];
                        }

                        return { ...card, details: updatedDetails };
                     }

                     // Character-card tag lists (Hero backpack, Otherscape specials, Rift nemeses)
                     // - upgraded from BlandTag in 1.3.0 so they share the Tag actions.
                     if (isCharacterCardTagListName(listName) && hasCharacterCardTagList(card.details, listName)) {
                        const details = card.details as CardDetails & { [k in CharacterCardTagListName]?: Tag[] };
                        const currentList = details[listName] ?? [];
                        return { ...card, details: { ...details, [listName]: [...currentList, newTag] } };
                     }

                     return card;
                  }));
               },
               updateTag: (cardId, listName, tagId, updatedTag) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if ('powerTags' in card.details && (listName === 'powerTags' || listName === 'weaknessTags')) {
                        const details = card.details as LegendsThemeDetails | LegendsFellowshipDetails;
                        const updatedDetails = { ...details };
                        const updateList = (list: Tag[]) => list.map(tag => tag.id === tagId ? { ...tag, ...updatedTag } : tag);

                        if (listName === 'powerTags') {
                           updatedDetails.powerTags = updateList(details.powerTags);
                        } else if (listName === 'weaknessTags') {
                           updatedDetails.weaknessTags = updateList(details.weaknessTags);
                        }

                        return { ...card, details: updatedDetails };
                     }

                     if (isCharacterCardTagListName(listName) && hasCharacterCardTagList(card.details, listName)) {
                        const details = card.details as CardDetails & { [k in CharacterCardTagListName]?: Tag[] };
                        const currentList = details[listName] ?? [];
                        const updatedList = currentList.map(tag => tag.id === tagId ? { ...tag, ...updatedTag } : tag);
                        return { ...card, details: { ...details, [listName]: updatedList } };
                     }

                     return card;
                  }));
               },
               removeTag: (cardId, listName, tagId) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if ('powerTags' in card.details && (listName === 'powerTags' || listName === 'weaknessTags')) {
                        const details = card.details as LegendsThemeDetails | LegendsFellowshipDetails;
                        const updatedDetails = { ...details };
                        const filterList = (list: Tag[]) => list.filter(tag => tag.id !== tagId);

                        if (listName === 'powerTags') {
                           updatedDetails.powerTags = filterList(details.powerTags);
                        } else if (listName === 'weaknessTags') {
                           updatedDetails.weaknessTags = filterList(details.weaknessTags);
                        }

                        return { ...card, details: updatedDetails };
                     }

                     if (isCharacterCardTagListName(listName) && hasCharacterCardTagList(card.details, listName)) {
                        const details = card.details as CardDetails & { [k in CharacterCardTagListName]?: Tag[] };
                        const currentList = details[listName] ?? [];
                        return { ...card, details: { ...details, [listName]: currentList.filter(tag => tag.id !== tagId) } };
                     }

                     return card;
                  }));
               },
               // Bland Tag Actions (no activation / burn)
               addBlandTag: (cardId, listName) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (hasBlandTagList(card.details, listName)) {
                        const details = card.details as IndexableCardDetails;
                        const newTag: BlandTag = { id: cuid(), name: '' };
                        const currentList = details[listName] || [];
                        const updatedList = [...currentList, newTag];
                        return { ...card, details: { ...details, [listName]: updatedList } };
                     }
                     return card;
                  }));
               },
               updateBlandTag: (cardId, listName, tagId, name) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (hasBlandTagList(card.details, listName)) {
                        const details = card.details as IndexableCardDetails;
                        const currentList = details[listName] || [];
                        const updatedList = currentList.map((tag: BlandTag) =>
                        tag.id === tagId ? { ...tag, name } : tag
                        );
                        return { ...card, details: { ...details, [listName]: updatedList } };
                     }
                     return card;
                  }));
               },
               removeBlandTag: (cardId, listName, tagId) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (hasBlandTagList(card.details, listName)) {
                        const details = card.details as IndexableCardDetails;
                        const currentList = details[listName] || [];
                        const updatedList = currentList.filter((tag: BlandTag) => tag.id !== tagId);
                        return { ...card, details: { ...details, [listName]: updatedList } };
                     }
                     return card;
                  }));
               },
               // Tracker Actions
               addStatus: (name) => {
                  const newStatus: StatusTracker = { ...emptyTracker('STATUS'), name: name || '' };
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              statuses: [
                                 ...state.character.trackers.statuses,
                                 newStatus
                              ]
                           }
                        }
                     };
                  });
                  return newStatus.id;
               },
               addStoryTag: (name) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newStoryTag: StoryTagTracker = { ...emptyTracker('STORY_TAG'), name: name || '' };
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyTags: [
                                 ...state.character.trackers.storyTags,
                                 newStoryTag
                              ]
                           }
                        }
                     };
                  });
               },
               addStoryTheme: (name) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newStoryTheme: StoryThemeTracker = { ...emptyTracker('STORY_THEME'), name: name || '' };
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: [...state.character.trackers.storyThemes, newStoryTheme]
                           }
                        }
                     };
                  });
               },
               addImportedTracker: (tracker, index) => {
                  set((state) => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');

                     const newTrackerCopy = deepReId(tracker);

                     const newTrackers = { ...state.character.trackers };
                     if (newTrackerCopy.trackerType === 'STATUS') {
                        const list = [...newTrackers.statuses];
                        const insertionIndex = index ?? list.length;
                        list.splice(insertionIndex, 0, newTrackerCopy as StatusTracker);
                        newTrackers.statuses = list;
                     } else if (newTrackerCopy.trackerType === 'STORY_TAG') {
                        const list = [...newTrackers.storyTags];
                        const insertionIndex = index ?? list.length;
                        list.splice(insertionIndex, 0, newTrackerCopy as StoryTagTracker);
                        newTrackers.storyTags = list;
                     } else if (newTrackerCopy.trackerType === 'STORY_THEME') {
                        const list = [...newTrackers.storyThemes];
                        const insertionIndex = index ?? list.length;
                        list.splice(insertionIndex, 0, newTrackerCopy as StoryThemeTracker);
                        newTrackers.storyThemes = list;
                     }
                     
                     return {
                        character: {
                           ...state.character,
                           trackers: newTrackers,
                        },
                     };
                  });
               },
               removeStatus: (trackerId) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              statuses: state.character.trackers.statuses.filter(tracker => tracker.id !== trackerId)
                           }
                        }
                     };
                  });
               },
               removeStoryTag: (trackerId) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyTags: state.character.trackers.storyTags.filter(tracker => tracker.id !== trackerId)
                           }
                        }
                     };
                  });
               },
               removeStoryTheme: (trackerId) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: state.character.trackers.storyThemes.filter(tracker => tracker.id !== trackerId)
                           }
                        }
                     };
                  });
               },
               updateStatus: (trackerId, updates) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              statuses: state.character.trackers.statuses.map(tracker => tracker.id === trackerId ? { ...tracker, ...updates } : tracker)
                           }
                        }
                     };
                  });
               },
               updateStoryTag: (trackerId, updates) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyTags: state.character.trackers.storyTags.map(tracker => tracker.id === trackerId ? { ...tracker, ...updates } : tracker)
                           }
                        }
                     };
                  });
               },
               updateStoryTheme: (trackerId, updates) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: state.character.trackers.storyThemes.map(tracker => tracker.id === trackerId ? { ...tracker, ...updates } : tracker)
                           }
                        }
                     };
                  });
               },
               reorderStatuses: (oldIndex, newIndex) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newItems = Array.from(state.character.trackers.statuses);
                     const [moved] = newItems.splice(oldIndex, 1);
                     newItems.splice(newIndex, 0, moved);
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              statuses: newItems
                           }
                        }
                     };
                  });
               },
               reorderStoryTags: (oldIndex, newIndex) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newItems = Array.from(state.character.trackers.storyTags);
                     const [moved] = newItems.splice(oldIndex, 1);
                     newItems.splice(newIndex, 0, moved);
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyTags: newItems
                           }
                        }
                     };
                  });
               },
               reorderStoryThemes: (oldIndex, newIndex) => {
                  set(state => {
                     if (!state.character) return {};
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     const newItems = Array.from(state.character.trackers.storyThemes);
                     const [moved] = newItems.splice(oldIndex, 1);
                     newItems.splice(newIndex, 0, moved);
                     return {
                        character: {
                           ...state.character,
                           trackers: { ...state.character.trackers, storyThemes: newItems }
                        }
                     };
                  });
               },
               upgradeStoryTagToTheme: (trackerId) => {
                  set(state => {
                     if (!state.character) return {};

                     const storyTagIndex = state.character.trackers.storyTags.findIndex(t => t.id === trackerId);
                     if (storyTagIndex === -1) return {};

                     const originalTag = state.character.trackers.storyTags[storyTagIndex];

                     const newStoryTheme: StoryThemeTracker = {
                        id: cuid(),
                        name: originalTag.name,
                        trackerType: 'STORY_THEME',
                        mainTag: {
                           id: cuid(),
                           name: originalTag.name,
                           isActive: false,
                           isScratched: false,
                        },
                        powerTags: [],
                        weaknessTags: [],
                     };

                     const newStoryTags = state.character.trackers.storyTags.filter(t => t.id !== trackerId);
                     const newStoryThemes = [...state.character.trackers.storyThemes, newStoryTheme];

                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyTags: newStoryTags,
                              storyThemes: newStoryThemes,
                           }
                        }
                     };
                  });
               },
               downgradeStoryThemeToTag: (trackerId) => {
                  set(state => {
                     if (!state.character) return {};
                     const storyThemeIndex = state.character.trackers.storyThemes.findIndex(t => t.id === trackerId);
                     if (storyThemeIndex === -1) return {};
                     const originalTheme = state.character.trackers.storyThemes[storyThemeIndex];
                     const newStoryTag: StoryTagTracker = {
                        id: cuid(),
                        name: originalTheme.mainTag.name,
                        trackerType: 'STORY_TAG',
                        isScratched: originalTheme.mainTag.isScratched,
                     };
                     const newStoryThemes = state.character.trackers.storyThemes.filter(t => t.id !== trackerId);
                     const newStoryTags = [...state.character.trackers.storyTags, newStoryTag];
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: newStoryThemes,
                              storyTags: newStoryTags,
                           }
                        }
                     };
                  });
               },
               // Story Themes Tag Actions
               addTagToStoryTheme: (trackerId, listName) => {
                  set(state => {
                     if (!state.character) return {};
                     const newTag: Tag = { id: cuid(), name: '', isActive: false, isScratched: false };
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: state.character.trackers.storyThemes.map(t => {
                                 if (t.id === trackerId) {
                                    return { ...t, [listName]: [...t[listName], newTag] };
                                 }
                                 return t;
                              })
                           }
                        }
                     }
                  });
               },
               updateTagInStoryTheme: (trackerId, listName, tagId, updatedTag) => {
                  set(state => {
                     if (!state.character) return {};
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: state.character.trackers.storyThemes.map(t => {
                                 if (t.id === trackerId) {
                                    if (listName === 'mainTag') {
                                       return { ...t, mainTag: { ...t.mainTag, ...updatedTag }};
                                    }
                                    const updatedList = t[listName].map(tag => tag.id === tagId ? { ...tag, ...updatedTag } : tag);
                                    return { ...t, [listName]: updatedList };
                                 }
                                 return t;
                              })
                           }
                        }
                     }
                  });
               },
               removeTagFromStoryTheme: (trackerId, listName, tagId) => {
                  set(state => {
                     if (!state.character) return {};
                     return {
                        character: {
                           ...state.character,
                           trackers: {
                              ...state.character.trackers,
                              storyThemes: state.character.trackers.storyThemes.map(t => {
                                 if (t.id === trackerId) {
                                    const updatedList = t[listName].filter(tag => tag.id !== tagId);
                                    return { ...t, [listName]: updatedList };
                                 }
                                 return t;
                              })
                           }
                        }
                     }
                  });
               },
               // Legend in the Mist ### Fellowship Relationship Actions
               addRelationship: (cardId) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (card.cardType !== 'CHARACTER_CARD') return card;

                     const newRelationship: FellowshipRelationship = {
                        id: cuid(),
                        companionName: '',
                        relationshipTag: '',
                     };

                     if (card.details.game === 'LEGENDS') {
                        const details = card.details as LegendsHeroDetails;
                        return {
                           ...card,
                           details: {
                              ...details,
                              fellowshipRelationships: [...details.fellowshipRelationships, newRelationship],
                           },
                        };
                     } else if (card.details.game === 'OTHERSCAPE') {
                        const details = card.details as OtherscapeCharacterDetails;
                        return {
                           ...card,
                           details: {
                              ...details,
                              crewRelationships: [...details.crewRelationships, newRelationship],
                           },
                        };
                     }

                     return card;
                  }));
               },
               updateRelationship: (cardId, relationshipId, updates) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (card.cardType !== 'CHARACTER_CARD') return card;

                     if (card.details.game === 'LEGENDS') {
                        const details = card.details as LegendsHeroDetails;
                        return {
                           ...card,
                           details: {
                              ...details,
                              fellowshipRelationships: details.fellowshipRelationships.map(rel =>
                                 rel.id === relationshipId ? { ...rel, ...updates } : rel
                              ),
                           },
                        };
                     } else if (card.details.game === 'OTHERSCAPE') {
                        const details = card.details as OtherscapeCharacterDetails;
                        return {
                           ...card,
                           details: {
                              ...details,
                              crewRelationships: details.crewRelationships.map(rel =>
                                 rel.id === relationshipId ? { ...rel, ...updates } : rel
                              ),
                           },
                        };
                     }

                     return card;
                  }));
               },
               removeRelationship: (cardId, relationshipId) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (card.cardType !== 'CHARACTER_CARD') return card;

                     if (card.details.game === 'LEGENDS') {
                        const details = card.details as LegendsHeroDetails;
                        return {
                           ...card,
                           details: {
                              ...details,
                              fellowshipRelationships: details.fellowshipRelationships.filter(rel => rel.id !== relationshipId),
                           },
                        };
                     } else if (card.details.game === 'OTHERSCAPE') {
                        const details = card.details as OtherscapeCharacterDetails;
                        return {
                           ...card,
                           details: {
                              ...details,
                              crewRelationships: details.crewRelationships.filter(rel => rel.id !== relationshipId),
                           },
                        };
                     }

                     return card;
                  }));
               },
               // City of Mist ### Crew Actions
               addCrewMember: (cardId) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (card.cardType !== 'CHARACTER_CARD' || card.details.game !== 'CITY_OF_MIST') return card;
                     const details = card.details as CityRiftDetails;
                     const newCrewMember: CrewMember = {
                        id: cuid(),
                        name: '',
                        help: '',
                        hurt: '',
                     };
                     return {
                        ...card,
                        details: {
                           ...details,
                           crewMembers: [...details.crewMembers, newCrewMember],
                        },
                     };
                  }));
               },
               updateCrewMember: (cardId, crewId, updates) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (card.cardType !== 'CHARACTER_CARD' || card.details.game !== 'CITY_OF_MIST') return card;
                     const details = card.details as CityRiftDetails;
                     return {
                        ...card,
                        details: {
                           ...details,
                           crewMembers: details.crewMembers.map(member => 
                              member.id === crewId ? { ...member, ...updates } : member
                           ),
                        },
                     };
                  }));
               },
               removeCrewMember: (cardId, crewId) => {
                  set(state => updateCardInState(state, cardId, card => {
                     useAppGeneralStateStore.getState().actions.setLastModifiedStore('character');
                     if (card.cardType !== 'CHARACTER_CARD' || card.details.game !== 'CITY_OF_MIST') return card;
                     const details = card.details as CityRiftDetails;
                     return {
                        ...card,
                        details: {
                           ...details,
                           crewMembers: details.crewMembers.filter(member => member.id !== crewId),
                        },
                     };
                  }));
               },
            },
         }),
         // Only the character is undoable; the unsaved-changes flag and actions stay
         // out of undo snapshots (undo/redo restore content, not the dirty marker).
         { partialize: (state) => ({ character: state.character }) },
      )
   );

   return useStore;
}

/**
 * A single character store instance: the in-memory character + actions wrapped in
 * zundo `temporal`. The registry holds one of these per open character (one today,
 * N once tabs land); `getActiveCharacterStore()` resolves the active one for
 * non-React callers, and the hooks below resolve it for React callers.
 */
export type CharacterStore = ReturnType<typeof createCharacterStore>;

/**
 * Subscribes the calling component to the **active** character store instance with
 * `selector`. Resolves the instance from {@link ActiveCharacterStoreContext} rather
 * than a module global, so the same hook serves whichever tab is active. The public
 * signature and the `@/lib/stores/characterStore` import path are unchanged, so
 * consumers need no edit.
 *
 * @template T - The selected slice type.
 * @param selector - Maps the character state to the slice the component needs.
 * @returns The selected slice, re-rendering the component when it changes.
 */
export function useCharacterStore<T>(selector: (state: CharacterState) => T): T {
   const instance = useActiveCharacterInstance();
   return useStore(instance, selector);
}

/** Selector hook for the active character's action bag (a stable reference). */
export const useCharacterActions = () => useCharacterStore((state) => state.actions);