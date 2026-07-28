// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Component Imports --
import { CharacterNameHeader } from './CharacterNameHeader';

/*
 * Locks the character name's flush-on-unmount path. The header holds the name in a debounced buffer and
 * commits it from `useInputDebouncer`'s unmount effect, because the workspace surface unmounts on a tab or
 * character switch WITHOUT firing a blur. The commit is dirty-guarded, so a clean exit no-ops.
 *
 * The load-bearing case is the key swap: mounted with `key={character.id}`, a character switch unmounts the
 * old header, whose last-rendered closure holds the LEAVING character's own commit action. The typed name
 * must land there and never on the arriving character.
 */

afterEach(cleanup);

const header = (name: string, onCommit: (value: string) => void) => (
   <CharacterNameHeader name={name} onCommit={onCommit} placeholder="name" />
);

describe('CharacterNameHeader name buffer', () => {
   it('commits the buffered name when the surface unmounts without a blur (tab switch)', () => {
      const onCommit = vi.fn();
      const { getByPlaceholderText, unmount } = render(header('before', onCommit));

      fireEvent.change(getByPlaceholderText('name'), { target: { value: 'after' } });
      unmount();

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith('after');
   });

   it('does not commit an untouched name on unmount (dirty-guarded)', () => {
      const onCommit = vi.fn();
      const { unmount } = render(header('before', onCommit));

      unmount();

      expect(onCommit).not.toHaveBeenCalled();
   });

   it('commits once when the debounce already fired and the stored name came back (no double write)', () => {
      vi.useFakeTimers();
      try {
         const onCommit = vi.fn();
         const { getByPlaceholderText, rerender, unmount } = render(header('before', onCommit));

         fireEvent.change(getByPlaceholderText('name'), { target: { value: 'after' } });
         vi.advanceTimersByTime(500);
         // The store write echoes back as a new `name`, exactly as the page re-renders after a commit.
         rerender(header('after', onCommit));
         unmount();

         expect(onCommit).toHaveBeenCalledTimes(1);
         expect(onCommit).toHaveBeenCalledWith('after');
      } finally {
         vi.useRealTimers();
      }
   });

   it('commits a pending name to the LEAVING character when the key swaps, never to the arriving one', () => {
      const onCommitLeaving = vi.fn();
      const onCommitArriving = vi.fn();
      const { getByPlaceholderText, rerender } = render(
         <CharacterNameHeader key="char-a" name="Alice" onCommit={onCommitLeaving} placeholder="name" />,
      );

      fireEvent.change(getByPlaceholderText('name'), { target: { value: 'Alice the Bold' } });
      rerender(<CharacterNameHeader key="char-b" name="Bob" onCommit={onCommitArriving} placeholder="name" />);

      expect(onCommitLeaving).toHaveBeenCalledTimes(1);
      expect(onCommitLeaving).toHaveBeenCalledWith('Alice the Bold');
      expect(onCommitArriving).not.toHaveBeenCalled();
   });
});
