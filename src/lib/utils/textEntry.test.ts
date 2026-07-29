// @vitest-environment jsdom

// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { isEditableTarget } from './textEntry';

/*
 * Every bare-key shortcut and canvas gesture in the app gates on this, so the false cases matter as much as
 * the true ones: widening it silences a working shortcut, narrowing it makes a keystroke escape the field.
 */

const el = (tag: string, contentEditable = false): HTMLElement => {
   const node = document.createElement(tag);
   if (contentEditable) Object.defineProperty(node, 'isContentEditable', { value: true });
   return node;
};

describe('isEditableTarget', () => {
   it.each(['input', 'textarea', 'select'])('is true for a <%s>', (tag) => {
      expect(isEditableTarget(el(tag))).toBe(true);
   });

   it('is true for a rich-text editor host', () => {
      expect(isEditableTarget(el('div', true))).toBe(true);
   });

   it('is false for an ordinary element', () => {
      expect(isEditableTarget(el('div'))).toBe(false);
   });

   it('is false for a button, so a shortcut still fires with one focused', () => {
      expect(isEditableTarget(el('button'))).toBe(false);
   });

   it('is false for null and for a non-element target', () => {
      expect(isEditableTarget(null)).toBe(false);
      expect(isEditableTarget(window as unknown as EventTarget)).toBe(false);
   });
});
