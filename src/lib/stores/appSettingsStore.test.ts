// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { useAppSettingsStore } from './appSettingsStore';

// -- Type Imports --
import type { DiceTrayContent } from '@/lib/dice/diceTrayTypes';
import type { CustomTheme } from '@/lib/theme/themeTokens';
import { PRESET_THEMES } from '@/lib/theme/themeTokens';
import type { CardPalette } from '@/lib/theme/cardPalettes';

/*
 * Tests for the app-wide dice-tray settings slice: the default (empty, closed), the open/toggle actions,
 * and that content edits land (the persist middleware saves them; here we assert the in-memory state, the
 * single source the panel reads).
 */

describe('appSettingsStore diceTray slice', () => {
   beforeEach(() => {
      useAppSettingsStore.setState({ diceTray: { content: { dice: [], modifiers: [] }, isOpen: false } });
   });

   it('defaults to an empty tray, closed', () => {
      const { diceTray } = useAppSettingsStore.getState();
      expect(diceTray.isOpen).toBe(false);
      expect(diceTray.content).toEqual({ dice: [], modifiers: [] });
   });

   it('toggleDiceTray flips isOpen, leaving content untouched', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.setDiceTrayContent({ dice: [{ id: 'a', sides: 20 }], modifiers: [] });
      actions.toggleDiceTray();
      expect(useAppSettingsStore.getState().diceTray.isOpen).toBe(true);
      expect(useAppSettingsStore.getState().diceTray.content.dice).toEqual([{ id: 'a', sides: 20 }]);
      actions.toggleDiceTray();
      expect(useAppSettingsStore.getState().diceTray.isOpen).toBe(false);
   });

   it('setDiceTrayOpen sets the panel state directly', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.setDiceTrayOpen(true);
      expect(useAppSettingsStore.getState().diceTray.isOpen).toBe(true);
      actions.setDiceTrayOpen(false);
      expect(useAppSettingsStore.getState().diceTray.isOpen).toBe(false);
   });

   it('setDiceTrayContent replaces content (config edits and rolls both land here, no undo)', () => {
      const { actions } = useAppSettingsStore.getState();
      const rolled: DiceTrayContent = {
         dice: [{ id: 'a', sides: 20 }],
         modifiers: [{ id: 'm', label: 'Bonus', value: 2 }],
         lastRoll: { faces: { a: 17 }, modifiers: [{ label: 'Bonus', value: 2 }], total: 19 },
      };
      actions.setDiceTrayContent(rolled);
      expect(useAppSettingsStore.getState().diceTray.content).toEqual(rolled);
      expect(useAppSettingsStore.getState().diceTray.isOpen).toBe(false); // content edit doesn't open the panel
   });
});

describe('appSettingsStore customThemes slice', () => {
   const makeTheme = (id: string): CustomTheme => ({
      id, name: `Theme ${id}`, radius: '0.5rem',
      light: PRESET_THEMES['theme-neutral'].light, dark: PRESET_THEMES['theme-neutral'].dark,
      paper: PRESET_THEMES['theme-neutral'].paper,
   });

   beforeEach(() => {
      useAppSettingsStore.setState({ theme: 'theme-neutral', customThemes: [] });
   });

   it('addCustomTheme appends and updateCustomTheme patches by id', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCustomTheme(makeTheme('a'));
      actions.addCustomTheme(makeTheme('b'));
      actions.updateCustomTheme('a', { name: 'Renamed' });
      const list = useAppSettingsStore.getState().customThemes;
      expect(list.map((t) => t.id)).toEqual(['a', 'b']);
      expect(list.find((t) => t.id === 'a')?.name).toBe('Renamed');
   });

   it('deleteCustomTheme resets the active theme to a preset when the deleted theme was active', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCustomTheme(makeTheme('a'));
      actions.setTheme('theme-custom-a');
      actions.deleteCustomTheme('a');
      expect(useAppSettingsStore.getState().customThemes).toEqual([]);
      expect(useAppSettingsStore.getState().theme).toBe('theme-neutral');
   });

   it('deleteCustomTheme leaves the active theme alone when a different theme was active', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCustomTheme(makeTheme('a'));
      actions.addCustomTheme(makeTheme('b'));
      actions.setTheme('theme-custom-b');
      actions.deleteCustomTheme('a');
      expect(useAppSettingsStore.getState().theme).toBe('theme-custom-b');
   });

   it('reorderCustomThemes moves the active id to the over id\'s slot (array IS the order)', () => {
      const { actions } = useAppSettingsStore.getState();
      ['a', 'b', 'c'].forEach((id) => actions.addCustomTheme(makeTheme(id)));
      actions.reorderCustomThemes('a', 'c'); // drag a onto c -> [b, c, a]
      expect(useAppSettingsStore.getState().customThemes.map((t) => t.id)).toEqual(['b', 'c', 'a']);
      actions.reorderCustomThemes('a', 'b'); // drag a back before b -> [a, b, c]
      expect(useAppSettingsStore.getState().customThemes.map((t) => t.id)).toEqual(['a', 'b', 'c']);
   });

   it('reorderCustomThemes is a no-op on missing or equal ids', () => {
      const { actions } = useAppSettingsStore.getState();
      ['a', 'b'].forEach((id) => actions.addCustomTheme(makeTheme(id)));
      actions.reorderCustomThemes('a', 'a');       // equal
      actions.reorderCustomThemes('a', 'missing'); // unknown over
      actions.reorderCustomThemes('missing', 'b'); // unknown active
      expect(useAppSettingsStore.getState().customThemes.map((t) => t.id)).toEqual(['a', 'b']);
   });
});

describe('appSettingsStore theme draft', () => {
   const makeTheme = (id: string): CustomTheme => ({
      id, name: `Theme ${id}`, radius: '0.5rem',
      light: { ...PRESET_THEMES['theme-neutral'].light }, dark: { ...PRESET_THEMES['theme-neutral'].dark },
      paper: { ...PRESET_THEMES['theme-neutral'].paper },
   });

   beforeEach(() => {
      useAppSettingsStore.setState({ theme: 'theme-neutral', customThemes: [], themeDraft: null });
   });

   it('beginThemeDraft sets a DEEP copy (editing the draft does not touch the saved theme)', () => {
      const { actions } = useAppSettingsStore.getState();
      const saved = makeTheme('a');
      actions.addCustomTheme(saved);
      actions.beginThemeDraft(saved);
      actions.patchThemeDraft({ light: { ...saved.light, background: 'lime' } });
      expect(useAppSettingsStore.getState().themeDraft?.light.background).toBe('lime');
      // The saved theme is untouched until Save.
      expect(useAppSettingsStore.getState().customThemes[0].light.background).toBe(saved.light.background);
   });

   it('patchThemeDraft is a no-op when there is no draft', () => {
      useAppSettingsStore.getState().actions.patchThemeDraft({ radius: '2rem' });
      expect(useAppSettingsStore.getState().themeDraft).toBeNull();
   });

   it('saveThemeDraft writes editor fields back to the saved theme, leaving name/id and the draft intact', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCustomTheme(makeTheme('a'));
      actions.updateCustomTheme('a', { name: 'Renamed mid-edit' }); // a rename that must survive Save
      actions.beginThemeDraft(useAppSettingsStore.getState().customThemes[0]);
      actions.patchThemeDraft({ radius: '1rem', light: { ...makeTheme('a').light, background: 'lime' }, paper: { ...makeTheme('a').paper, 'paper-primary': 'crimson' } });
      actions.saveThemeDraft();
      const saved = useAppSettingsStore.getState().customThemes[0];
      expect(saved.radius).toBe('1rem');
      expect(saved.light.background).toBe('lime');
      expect(saved.paper['paper-primary']).toBe('crimson'); // paper edits persist on Save too
      expect(saved.name).toBe('Renamed mid-edit'); // name is not an editor field, not clobbered
      expect(useAppSettingsStore.getState().themeDraft).not.toBeNull(); // draft stays (now clean)
   });

   it('discardThemeDraft clears the draft (the saved theme is whatever was last saved)', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCustomTheme(makeTheme('a'));
      actions.beginThemeDraft(makeTheme('a'));
      actions.patchThemeDraft({ radius: '3rem' });
      actions.discardThemeDraft();
      expect(useAppSettingsStore.getState().themeDraft).toBeNull();
      expect(useAppSettingsStore.getState().customThemes[0].radius).toBe('0.5rem');
   });
});

describe('appSettingsStore card palettes', () => {
   const paper = PRESET_THEMES['theme-neutral'].paper;
   const makePalette = (id: string, game: CardPalette['game'] = 'LEGENDS'): CardPalette => ({
      id, game, name: `Palette ${id}`, cardTypes: { hero: { ...paper } },
   });

   beforeEach(() => {
      useAppSettingsStore.setState({
         cardPalettes: [],
         activeCardPalettes: { LEGENDS: 'default', CITY_OF_MIST: 'default', OTHERSCAPE: 'default' },
         cardPaletteDraft: null,
      });
   });

   it('addCardPalette appends and updateCardPalette patches by id', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCardPalette(makePalette('a'));
      actions.addCardPalette(makePalette('b'));
      actions.updateCardPalette('a', { name: 'Renamed' });
      const list = useAppSettingsStore.getState().cardPalettes;
      expect(list.map((p) => p.id)).toEqual(['a', 'b']);
      expect(list.find((p) => p.id === 'a')?.name).toBe('Renamed');
   });

   it('setActiveCardPalette sets one game without touching the others', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.setActiveCardPalette('LEGENDS', 'a');
      const active = useAppSettingsStore.getState().activeCardPalettes;
      expect(active).toEqual({ LEGENDS: 'a', CITY_OF_MIST: 'default', OTHERSCAPE: 'default' });
   });

   it('deleteCardPalette resets any game pointing at it back to default', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCardPalette(makePalette('a'));
      actions.setActiveCardPalette('LEGENDS', 'a');
      actions.deleteCardPalette('a');
      expect(useAppSettingsStore.getState().cardPalettes).toEqual([]);
      expect(useAppSettingsStore.getState().activeCardPalettes.LEGENDS).toBe('default');
   });

   it('deleteCardPalette leaves a game alone when a different palette was active', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.addCardPalette(makePalette('a'));
      actions.addCardPalette(makePalette('b'));
      actions.setActiveCardPalette('LEGENDS', 'b');
      actions.deleteCardPalette('a');
      expect(useAppSettingsStore.getState().activeCardPalettes.LEGENDS).toBe('b');
   });

   it('reorderCardPalettes moves the active id to the over id\'s slot', () => {
      const { actions } = useAppSettingsStore.getState();
      ['a', 'b', 'c'].forEach((id) => actions.addCardPalette(makePalette(id)));
      actions.reorderCardPalettes('a', 'c'); // [b, c, a]
      expect(useAppSettingsStore.getState().cardPalettes.map((p) => p.id)).toEqual(['b', 'c', 'a']);
   });

   it('beginCardPaletteDraft sets a DEEP copy (editing the draft does not touch the saved palette)', () => {
      const { actions } = useAppSettingsStore.getState();
      const saved = makePalette('a');
      actions.addCardPalette(saved);
      actions.beginCardPaletteDraft(saved);
      actions.patchCardPaletteDraft({ cardTypes: { hero: { ...paper, 'paper-primary': 'lime' } } });
      expect(useAppSettingsStore.getState().cardPaletteDraft?.cardTypes.hero['paper-primary']).toBe('lime');
      expect(useAppSettingsStore.getState().cardPalettes[0].cardTypes.hero['paper-primary']).toBe(paper['paper-primary']);
   });

   it('patchCardPaletteDraft is a no-op when there is no draft', () => {
      useAppSettingsStore.getState().actions.patchCardPaletteDraft({ name: 'x' });
      expect(useAppSettingsStore.getState().cardPaletteDraft).toBeNull();
   });

   it('discardCardPaletteDraft clears the draft', () => {
      const { actions } = useAppSettingsStore.getState();
      actions.beginCardPaletteDraft(makePalette('a'));
      actions.discardCardPaletteDraft();
      expect(useAppSettingsStore.getState().cardPaletteDraft).toBeNull();
   });
});
