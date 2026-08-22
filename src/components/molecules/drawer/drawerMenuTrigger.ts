/*
 * The frosted backing shared by every drawer "..." overflow-menu trigger (rich item card, list row, folder
 * row, search result). The trigger is a ghost button - transparent until directly hovered - but it's
 * REVEALED on ROW hover, when it usually isn't itself hovered, so the bare icon sits on busy content (a
 * detailed preview, a dense row) and is hard to see. A semi-transparent background-token fill + a slight
 * blur make it read as a small frosted chip over anything; pointing at it still gives the ghost's stronger
 * hover:bg-accent. Kept in one place so the four triggers can't drift apart.
 *
 * On a coarse pointer hover never fires, so the reveal is made unconditional. The VISIBLE trigger keeps its
 * 24px size (growing it overflowed the fixed-height rows it overlays); instead a transparent `::before`
 * extends the tap area past its edges for a finger. These triggers are absolute-positioned, so the slop
 * rides their own positioning context - no `position: relative` needed. Fine pointer is unchanged.
 */
export const DRAWER_MENU_TRIGGER_CLASS = "bg-background/70 backdrop-blur-sm coarse:opacity-100 coarse:before:absolute coarse:before:-inset-2 coarse:before:content-['']";
