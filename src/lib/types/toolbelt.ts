import type { LucideIcon } from 'lucide-react';
import type { Card, StatusTracker, StoryTagTracker, StoryThemeTracker } from './character';

export type ToolbeltMode = 'side-panel' | 'fab';

export type ToolbeltGroup = 'item' | 'edit' | 'add' | 'workspace';

export interface ToolbeltAction {
	id: string;
	label: string;
	icon: LucideIcon;
	onClick: () => void;
	variant?: 'default' | 'destructive';
	// Which labelled section the action belongs to. The bottom sheet renders one
	// header per group; the FAB expresses grouping by order alone (no header rows).
	group: ToolbeltGroup;
	show: boolean;
	// Keep the toolbelt open after the action runs, for actions run repeatedly in a row (undo/redo).
	// Defaults to closing, so every action closes unless it opts in.
	keepOpen?: boolean;
	// Optional `data-tutorial` key stamped on the rendered tile, so a tutorial can anchor a coach-mark to a
	// dynamically-built action (the Edit toggle) without the renderers string-matching on ids.
	tutorialAnchor?: string;
}

export interface ToolbeltActions {
	itemActions: ToolbeltAction[];
	globalActions: ToolbeltAction[];
}

export type ToolbeltContext =
	| { type: 'card'; card: Card }
	| { type: 'tracker'; tracker: StatusTracker | StoryTagTracker | StoryThemeTracker }
	| { type: 'none' };
