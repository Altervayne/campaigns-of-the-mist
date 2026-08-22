/*
 * Shared chrome for the image selection toolbar's buttons and popover triggers, so the action buttons and
 * the Style triggers share one look. Theme tokens only. A `.ts` const module (no component export) so it
 * dodges the react-refresh only-export-components rule.
 */
export const IMAGE_TOOLBAR_BUTTON_CLASS =
   'flex cursor-pointer items-center justify-center rounded p-1 text-popover-foreground hover:bg-muted';
