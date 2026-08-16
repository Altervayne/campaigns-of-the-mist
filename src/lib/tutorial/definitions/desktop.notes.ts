// -- Icon Imports --
import { NotebookPen } from 'lucide-react';

// -- Store Imports --
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';

// -- Local Imports --
import { createDemoNote } from '../demo/demoNote';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D4 - Notes. A tour of the note document: what a note is, that it opens in Live where you edit the finished
 * look in place, then the one hands-on beat - type markdown on the blank line and watch it form - with
 * mentions, links, the toolbar, images, and the mode toggle taught around it. Every beat stays in Live, so the
 * editor chrome never unmounts and back-nav stays bulletproof; the mode switch is narrated, not driven (mode is
 * `NoteView` local state the engine cannot restore). The one gate watches the demo note's BODY against a fixture
 * baseline - the honest "you typed in the document" signal, read fresh - and runs `scrim:'none'` + `anchor-only`
 * so the editor stays lit and live under the user's hands; the body signal is input-debounced, so its copy never
 * promises an instant jump. Making a link and inserting an image are narrated invites, never gated: the link
 * picker lists the user's own drawer and an image write would touch the asset store, both out of the sandbox.
 * `needsDemo:'note'` seeds the isolated, asset-free demo note the whole tour reads.
 */

// The demo note's body at seed time, derived from the fixture itself so a fixture change can never leave the
// type-markdown gate pre-satisfied. The gate fires when the live body diverges from this baseline.
const NOTES_BODY_BASELINE = createDemoNote().body;

/** The active (demo) note's live body, read fresh for the gate. Empty before the note mounts. */
function noteBody(): string {
   return getActiveNoteStore()?.getState().note?.body ?? '';
}

export const DESKTOP_NOTES_TUTORIAL: TutorialDefinition = {
   id: 'desktop.notes',
   platform: 'desktop',
   system: 'notes',
   titleKey: 'Common.notes',
   teachKey: 'TutorialsDialog.tutorials.notes.teach',
   icon: NotebookPen,
   needsDemo: 'note',
   steps: [
      {
         id: 'welcome',
         titleKey: 'Common.notes',
         bodyKey: 'Tutorial.notes.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // A read of the whole document: the demo note is already active and in Live, so the paper anchor
         // resolves without a drive. Blocked - a look before the first touch.
         id: 'surface',
         anchorKey: 'note-editor',
         titleKey: 'Tutorial.notes.surface_title',
         bodyKey: 'Tutorial.notes.surface_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // Live is the payoff: the rendered look IS the editor. Keep the paper lit (`scrim:'none'` +
         // `anchor-only`) so the reader can look over and scroll the formatted document while they read.
         id: 'live-preview',
         anchorKey: 'note-editor',
         titleKey: 'Tutorial.notes.livePreview_title',
         bodyKey: 'Tutorial.notes.livePreview_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user types markdown on the blank line under "Your turn" and watches it form. The signal is
         // the live body diverging from the fixture baseline - the honest "you typed" read, fresh each change.
         // The body is input-debounced, so the advance lands a beat after the keystroke; the paper stays lit +
         // live (`scrim:'none'` + `anchor-only`) so the editor is typeable, and the skip-step escape covers a
         // back-nav into a body already edited.
         id: 'type-markdown',
         anchorKey: 'note-editor',
         titleKey: 'Tutorial.notes.typeMarkdown_title',
         bodyKey: 'Tutorial.notes.typeMarkdown_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => noteBody() !== NOTES_BODY_BASELINE },
         },
      },
      {
         // Mentions are narrated, not a second gate (same type->widget mechanic, and a CM6 pill carries no stable
         // anchor). Point the eye at the pre-authored `{brace}` pills in the body; keep the paper lit so they read.
         id: 'mentions',
         anchorKey: 'note-editor',
         titleKey: 'Tutorial.notes.mentions_title',
         bodyKey: 'Tutorial.notes.mentions_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Links out are one line that hands off to the Portals tutorial. Spotlight the link button; the picker
         // lists the user's own drawer, so making a link stays a narrated aside. Dim - a read beat over the button.
         id: 'links-out',
         anchorKey: 'note-link-button',
         titleKey: 'Tutorial.notes.linksOut_title',
         bodyKey: 'Tutorial.notes.linksOut_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // The toolbar: type it or click it. Spotlight the whole row so the reader sees every control at once.
         id: 'toolbar',
         anchorKey: 'note-toolbar',
         titleKey: 'Common.theToolbar',
         bodyKey: 'Tutorial.notes.toolbar_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // Images are narrated (button / paste / drag), never gated - an insert would write to the asset store,
         // out of the sandbox. Spotlight the insert-image button and explain the three ways in. Dim - a read beat.
         id: 'images',
         anchorKey: 'note-insert-image',
         titleKey: 'Tutorial.notes.images_title',
         bodyKey: 'Tutorial.notes.images_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // The cover is a note's banner image, narrated over the toolbar's cover button (an add would write to
         // the asset store, out of the sandbox). The demo note is coverless, so the button reads "Add cover". Dim.
         id: 'cover',
         anchorKey: 'note-cover-button',
         titleKey: 'Tutorial.notes.cover_title',
         bodyKey: 'Tutorial.notes.cover_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // The three modes narrated over the toggle: Live (home), Reading (the clean handout), Source (raw
         // markdown). The switch is not driven - mode is `NoteView` state the engine can't restore. Dim.
         id: 'modes',
         anchorKey: 'note-mode-toggle',
         titleKey: 'Tutorial.notes.modes_title',
         bodyKey: 'Tutorial.notes.modes_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         titleKey: 'Tutorial.notes.wrap_title',
         bodyKey: 'Tutorial.notes.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
