// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import * as TabsPrimitive from '@radix-ui/react-tabs';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// -- Icon Imports --
import { Database, GraduationCap, Info, Megaphone, Palette, SlidersHorizontal, Sparkles, SwatchBook } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Pane Imports --
import { GeneralSettingsPane } from './GeneralSettingsPane';
import { AppearanceSettingsPane } from './AppearanceSettingsPane';
import { CardPalettesSettingsPane } from './CardPalettesSettingsPane';
import { DataSettingsPane } from './DataSettingsPane';
import { LearnSettingsPane } from './LearnSettingsPane';
import { WhatsNewSettingsPane } from './WhatsNewSettingsPane';
import { AnnouncementsSettingsPane } from './AnnouncementsSettingsPane';
import { AboutSettingsPane } from './AboutSettingsPane';

// -- Store and Hook Imports --
import { useAppGeneralStateActions, useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useHasUnreadPatchNotes } from '@/hooks/useHasUnreadPatchNotes';
import { useHasUnseenAnnouncements } from '@/hooks/useHasUnseenAnnouncements';
import { useTutorialStore } from '@/lib/tutorial/tutorialStore';

// -- Focus Context Imports --
import { SettingsFocusProvider } from './settingsFocus';

// -- Type Imports --
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { GuardedThemeSwitch } from '@/components/organisms/dialogs/themeSwitchGuard';

/*
 * The desktop settings hub: one full-width header band over a section rail + a content pane, mirroring the
 * Themes window. Sections register declaratively below, grouped in the rail under group headers and rendered as
 * a real vertical tab set (Radix Tabs) so keyboard + focus flow come for free. Three surface shades read as
 * distinct bands - header `bg-card` (raised), rail `bg-popover` (middle), pane `bg-background` (recedes) - and
 * hold their brightness order in light and dark. New sections drop into `SECTIONS` with no shell changes.
 */

export type SettingsGroupId = 'configure' | 'help';
export type SettingsSectionId = 'general' | 'appearance' | 'cardPalettes' | 'data' | 'learn' | 'whatsNew' | 'announcements' | 'about';

interface SettingsSection {
   id: SettingsSectionId;
   group: SettingsGroupId;
   labelKey: string;
   icon: LucideIcon;
   Pane: ComponentType;
}

const GROUP_ORDER: SettingsGroupId[] = ['configure', 'help'];

const GROUP_LABEL_KEYS: Record<SettingsGroupId, string> = {
   configure: 'SettingsShell.groups.configure',
   help: 'SettingsShell.groups.help',
};

const SECTIONS: SettingsSection[] = [
   { id: 'general', group: 'configure', labelKey: 'Common.general', icon: SlidersHorizontal, Pane: GeneralSettingsPane },
   { id: 'appearance', group: 'configure', labelKey: 'Common.appearance', icon: Palette, Pane: AppearanceSettingsPane },
   { id: 'cardPalettes', group: 'configure', labelKey: 'SettingsShell.sections.cardPalettes', icon: SwatchBook, Pane: CardPalettesSettingsPane },
   { id: 'data', group: 'configure', labelKey: 'SettingsShell.sections.data', icon: Database, Pane: DataSettingsPane },
   { id: 'learn', group: 'help', labelKey: 'Common.learn', icon: GraduationCap, Pane: LearnSettingsPane },
   { id: 'whatsNew', group: 'help', labelKey: 'Common.whatSNew', icon: Sparkles, Pane: WhatsNewSettingsPane },
   { id: 'announcements', group: 'help', labelKey: 'SettingsShell.sections.announcements', icon: Megaphone, Pane: AnnouncementsSettingsPane },
   { id: 'about', group: 'help', labelKey: 'SettingsShell.sections.about', icon: Info, Pane: AboutSettingsPane },
];

const DEFAULT_SECTION: SettingsSectionId = 'general';
const SECTION_IDS = new Set<string>(SECTIONS.map((section) => section.id));

/** The `data-tutorial` anchor for each rail tab, so a tutorial can spotlight and walk every section. */
const SECTION_ANCHORS: Record<SettingsSectionId, string> = {
   general: 'settings-general',
   appearance: 'settings-appearance',
   cardPalettes: 'settings-card-palettes',
   data: 'settings-data',
   learn: 'settings-learn',
   whatsNew: 'settings-whatsNew',
   announcements: 'settings-announcements',
   about: 'settings-about',
};



interface SettingsShellProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
}

export function SettingsShell({ isOpen, onOpenChange }: SettingsShellProps) {
   const { t } = useTranslation();
   const [activeSection, setActiveSection] = useState<SettingsSectionId>(DEFAULT_SECTION);

   const settingsInitialSection = useAppGeneralStateStore((state) => state.settingsInitialSection);
   const { setSettingsInitialSection } = useAppGeneralStateActions();

   // The New! dot rides the What's-new rail row until the user opens that section (which marks the newest release read).
   const hasUnreadPatchNotes = useHasUnreadPatchNotes();
   // The Announcements dot rides its rail row until the banner is dismissed (opening the section never clears it).
   const hasUnseenAnnouncements = useHasUnseenAnnouncements();

   // While a tutorial walks the hub, its coach-mark (and the Next button) live OUTSIDE this modal dialog, so
   // a Next click reads to Radix as an outside dismissal and closes the hub - which the next step reopens,
   // flickering it in and out. Ignore outside-close + Esc during a run; the tutorial's own hooks own open/close.
   const isTutorialActive = useTutorialStore((state) => state.activeTutorialId !== null);

   // A pane can take the whole hub over (the Appearance pane's theme editor): the rail hides and the dialog
   // widens so the editor gets its two-column room. The pane raises/clears this through the focus context.
   const [editorOpen, setEditorOpen] = useState(false);

   // A pane that owns an unsaved draft registers a guard here, so closing the hub confirms before discarding.
   // Kept in a ref (not state) so registering it never re-renders the shell; the close path reads it live.
   const closeGuardRef = useRef<GuardedThemeSwitch | null>(null);
   const registerCloseGuard = useCallback((guard: GuardedThemeSwitch | null) => { closeGuardRef.current = guard; }, []);
   const requestClose = () => {
      const guard = closeGuardRef.current;
      if (guard) guard(() => onOpenChange(false));
      else onOpenChange(false);
   };

   // On open, honor a one-shot deep-link target (then clear it); otherwise land on the default section so a
   // reopen never drops the user back into wherever they last wandered (e.g. the Danger Zone). A reopen always
   // starts on the list, never mid-editor.
   useEffect(() => {
      if (!isOpen) return;
      setEditorOpen(false);
      if (settingsInitialSection && SECTION_IDS.has(settingsInitialSection)) {
         setActiveSection(settingsInitialSection as SettingsSectionId);
         setSettingsInitialSection(null);
      } else {
         setActiveSection(DEFAULT_SECTION);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- seed the section only when the hub opens
   }, [isOpen]);

   // Follow a live section push while already open (the tutorial's settings walk switches tab to tab), the
   // same one-shot field the open-seed reads. Consumed and cleared; ignored while closed (the open-seed
   // handles that case) so it never fights the reopen-on-default behaviour.
   useEffect(() => {
      if (!isOpen || !settingsInitialSection) return;
      if (SECTION_IDS.has(settingsInitialSection)) setActiveSection(settingsInitialSection as SettingsSectionId);
      setSettingsInitialSection(null);
   }, [isOpen, settingsInitialSection, setSettingsInitialSection]);

   return (
      <SettingsFocusProvider value={{ editorOpen, setEditorOpen, registerCloseGuard }}>
      <Dialog open={isOpen} onOpenChange={(open) => { if (open) onOpenChange(true); else requestClose(); }}>
         <DialogContent
            className={cn(
               'flex h-[min(70vh,640px)] w-full flex-col gap-0 overflow-hidden p-0',
               // A pane takeover (the theme editor) widens the hub a step so its two-column layout fits,
               // without the empty gutters a full-wide dialog leaves around it.
               editorOpen ? 'sm:max-w-4xl' : 'sm:max-w-3xl',
            )}
            onInteractOutside={(event) => { if (isTutorialActive) event.preventDefault(); }}
            onEscapeKeyDown={(event) => { if (isTutorialActive) event.preventDefault(); }}
         >
            {/* One full-width header band over the rail + pane, mirroring the Themes window - three surface
                shades (header card / rail popover / pane background) read as distinct bands, light and dark. */}
            <DialogHeader className="shrink-0 border-b border-border bg-card px-6 py-4 pr-10 text-left">
               <DialogTitle>{t('SettingsShell.title')}</DialogTitle>
               <DialogDescription>{t('SettingsDialog.description')}</DialogDescription>
            </DialogHeader>

            <TabsPrimitive.Root
               value={activeSection}
               onValueChange={(value) => setActiveSection(value as SettingsSectionId)}
               orientation="vertical"
               className="flex min-h-0 w-full flex-1"
            >
               {/* Nav rail: the middle `bg-popover` shade, grouped tabs; owns its own scroll. Hidden while a
                   pane takes the hub over (the theme editor), which gives the takeover the full width. */}
               <TabsPrimitive.List
                  aria-label={t('SettingsShell.title')}
                  className={cn(
                     'w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-popover p-2',
                     editorOpen ? 'hidden' : 'flex',
                  )}
               >
                  {GROUP_ORDER.map((group) => (
                     <div key={group}>
                        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                           {t(GROUP_LABEL_KEYS[group])}
                        </div>
                        <div className="flex flex-col gap-0.5">
                           {SECTIONS.filter((section) => section.group === group).map((section) => {
                              const Icon = section.icon;
                              return (
                                 <TabsPrimitive.Trigger
                                    key={section.id}
                                    value={section.id}
                                    data-tutorial={SECTION_ANCHORS[section.id]}
                                    className={cn(
                                       'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground outline-none transition-colors',
                                       'hover:bg-muted hover:text-foreground',
                                       'data-[state=active]:bg-accent data-[state=active]:font-medium data-[state=active]:text-accent-foreground',
                                       'focus-visible:ring-2 focus-visible:ring-ring',
                                    )}
                                 >
                                    <Icon className="size-4 shrink-0" aria-hidden />
                                    <span className="truncate">{t(section.labelKey)}</span>
                                    {section.id === 'whatsNew' && hasUnreadPatchNotes && (
                                       <span className="ml-auto size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                                    )}
                                    {section.id === 'announcements' && hasUnseenAnnouncements && (
                                       <span className="ml-auto size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                                    )}
                                 </TabsPrimitive.Trigger>
                              );
                           })}
                        </div>
                     </div>
                  ))}
               </TabsPrimitive.List>

               {/* Section pane: the receding `bg-background` shade; each active pane owns its scroll. */}
               <div className="flex min-w-0 flex-1 flex-col bg-background">
                  {SECTIONS.map((section) => {
                     const Pane = section.Pane;
                     return (
                        <TabsPrimitive.Content
                           key={section.id}
                           value={section.id}
                           // A pane takeover (the theme editor) owns its own scroll + layout, so the pane box
                           // sheds its padding and scroll then; otherwise it scrolls the section normally.
                           className={cn(
                              'min-h-0 flex-1 outline-none',
                              editorOpen ? 'overflow-hidden' : 'overflow-y-auto px-5 py-4',
                           )}
                        >
                           <Pane />
                        </TabsPrimitive.Content>
                     );
                  })}
               </div>
            </TabsPrimitive.Root>
         </DialogContent>
      </Dialog>
      </SettingsFocusProvider>
   );
}
