// -- React Imports --
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { Flame, Circle, PlusCircle, Disc2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CardHeaderMolecule } from '@/components/molecules/cards/CardHeader';
import { CardSectionHeader } from '@/components/molecules/cards/CardSectionHeader';
import { TagItem } from '@/components/molecules/TagItem';
import { PipTracker } from '@/components/molecules/PipTracker';
import { BlandTagItem } from '@/components/molecules/BlandTagItem';
import { CardFlipWrapper } from '@/components/molecules/cards/CardFlipWrapper';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useManualScroll } from '@/hooks/useManualScroll';
import { useToolbarHover } from '@/hooks/useToolbarHover';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';
import { useLiveCardDetails } from '@/hooks/character-sheet/useLiveCardDetails';

// -- Type Imports --
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Card as CardData, CardDetails, CardViewMode, OtherscapeThemeDetails, OtherscapeCrewDetails, OtherscapeLoadoutDetails, Tag, BlandTag } from '@/lib/types/character';



type ThemeDetails = OtherscapeThemeDetails | OtherscapeCrewDetails | OtherscapeLoadoutDetails;

interface OtherscapeThemeCardProps {
   card: CardData;
   isEditing?: boolean;
   isSnapshot?: boolean;
   isDrawerPreview?: boolean;
   isBoardEmbed?: boolean;
   isMobile?: boolean;
   useVerticalStack?: boolean;
   dragAttributes?: DraggableAttributes;
   dragListeners?: SyntheticListenerMap;
   onEditCard?: () => void;
   onExport?: () => void;
}



export const OtherscapeThemeCard = React.memo(
   React.forwardRef<HTMLDivElement, OtherscapeThemeCardProps>(
      ({ card, isEditing=false, isSnapshot, isDrawerPreview, isBoardEmbed=false, isMobile=false, useVerticalStack, dragAttributes, dragListeners, onEditCard, onExport }, ref) => {
      const { t: t } = useTranslation();
      const actions = useCharacterActions();
      const details = card.details as ThemeDetails;

      const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);

      const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
      const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);

      const tagsScrollRef = useRef<HTMLDivElement>(null);
      const mysteryScrollRef = useRef<HTMLDivElement>(null);
      const improvementsScrollRef = useRef<HTMLDivElement>(null);

      useManualScroll(tagsScrollRef);
      useManualScroll(mysteryScrollRef);
      useManualScroll(improvementsScrollRef);



      const cardTypeClass = (() => {
         if (card.cardType === 'CHARACTER_THEME') {
            return `card-type-${(details as OtherscapeThemeDetails).themeType.toLowerCase().replace(/\s+/g, '-')}-otherscape`;
         }
         if (card.cardType === 'GROUP_THEME') {
            return 'card-type-crew-otherscape';
         }
         // Loadout card type
         return 'card-type-loadout-otherscape';
      })();



      // Commits one key. `updateCardDetails` merges, so the patch stays narrow - spreading the render's
      // `details` here would write every other key back at its render-time value and revert whatever
      // landed since, including a debounced field that has already flushed.
      const handleDetailChange = (field: string, value: number | string | Tag | Tag[] | BlandTag[] | null) => {
         actions.updateCardDetails(card.id, { [field]: value } as Partial<CardDetails>);
      };

      // The main tag is a nested object, so a patch has to rebuild it. Rebuilding from the LIVE details
      // rather than the render's keeps a sibling key (name / isActive / isScratched) from being reverted
      // by a commit whose render predates it.
      const liveDetails = useLiveCardDetails<ThemeDetails>(card.id, details);
      const commitMainTag = (updates: Partial<Tag>) => {
         actions.updateCardDetails(card.id, { mainTag: { ...liveDetails().mainTag, ...updates } });
      };



      const handleCycleViewMode = () => {
         let nextMode: CardViewMode | null = null;
         if (card.viewMode === 'SIDE_BY_SIDE') {
            nextMode = 'FLIP';
         } else if (card.viewMode === 'FLIP') {
            nextMode = null;
         } else {
            nextMode = 'SIDE_BY_SIDE';
         }
         actions.updateCardViewMode(card.id, nextMode);
      };



      // ###########################
      // ###   INPUT DEBOUNCER   ###
      // ###########################

      // ==================
      //  Main Tag
      // ==================
      const [localMainTagName, setLocalMainTagName] = useInputDebouncer(
         details.mainTag.name,
         (value) => commitMainTag({ name: value })
      );

      // ==================
      //  Mystery/Identity/Description Text
      // ==================
      const mysteryIdentityOrDescription =
         card.cardType === 'CHARACTER_THEME'
            ? (details as OtherscapeThemeDetails).mystery
            : card.cardType === 'GROUP_THEME'
               ? (details as OtherscapeCrewDetails).identity
               : (details as OtherscapeLoadoutDetails).description;

      const [localMystery, setLocalMystery] = useInputDebouncer(
         mysteryIdentityOrDescription,
         (value) => {
            if (card.cardType === 'CHARACTER_THEME') {
               actions.updateCardDetails(card.id, { mystery: value });
            } else if (card.cardType === 'GROUP_THEME') {
               actions.updateCardDetails(card.id, { identity: value });
            } else {
               actions.updateCardDetails(card.id, { description: value });
            }
         }
      );



      const CardFront = (
         <Card className={cn(
            isMobile ? "w-full h-full" : "w-62.5 h-150",
            "flex flex-col border-2 shadow-lg p-0 overflow-hidden gap-0",
            "bg-card-paper-bg text-card-paper-fg border-card-border",
            "relative z-0",
            cardTypeClass,
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeader className="p-0">
               {card.cardType === 'CHARACTER_THEME' ? (
                  <CardHeaderMolecule
                     title={(details as OtherscapeThemeDetails).themebook}
                     type={(details as OtherscapeThemeDetails).themeType}
                     game="OTHERSCAPE"
                     className={cn("bg-card-header-bg text-card-header-fg")}
                  />
               ) : card.cardType === 'GROUP_THEME' ? (
                  <CardHeaderMolecule title={t('OtherscapeThemeCard.crewThemeTitle')} />
               ) : (
                  <CardHeaderMolecule title={t('Common.loadoutTheme')} />
               )}
               <div className="px-2 text-xs font-semibold text-center">
                  {card.cardType === 'LOADOUT_THEME' ? (
                     <><span>{t('OtherscapeThemeCard.gearTitle')}</span> • <span style={{ color: 'var(--card-destructive-bg)' }}>{t('OtherscapeThemeCard.flaw')}</span></>
                  ) : (
                     <><span>{t('Common.power')}</span> • <span style={{ color: 'var(--card-destructive-bg)' }}>{t('Common.weakness')}</span></>
                  )}
               </div>
            </CardHeader>

            <CardContent className="grow flex flex-col pt-2 px-0 overflow-hidden min-h-0">
               {card.cardType === 'LOADOUT_THEME' ? (
                  // Loadout card: Loaded/Unloaded Gear + Flaws + Wildcard Slots
                  <>
                     {/* Wildcard Slots as single line */}
                     <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold bg-black/10 border-y border-card-accent/30">
                        <span>{t('Common.wildcardSlots')}</span>
                        <div className="flex items-center gap-2">
                           {isEditing && (
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 className="h-5 w-5 cursor-pointer"
                                 onClick={() => handleDetailChange('wildcardSlots', Math.max(0, ((details as OtherscapeLoadoutDetails).wildcardSlots || 0) - 1))}
                              >
                                 <Circle className="h-3 w-3" />
                              </Button>
                           )}
                           <span className="text-sm font-bold min-w-6 text-center">{(details as OtherscapeLoadoutDetails).wildcardSlots || 0}</span>
                           {isEditing && (
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 className="h-5 w-5 cursor-pointer"
                                 onClick={() => handleDetailChange('wildcardSlots', ((details as OtherscapeLoadoutDetails).wildcardSlots || 0) + 1)}
                              >
                                 <PlusCircle className="h-3 w-3" />
                              </Button>
                           )}
                        </div>
                     </div>

                     {/* Tags section with more space */}
                     <div className="flex flex-col grow overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={tagsScrollRef}>
                        {/* Loaded Gear Section - gear that is NOT burned */}
                        <CardSectionHeader title={t('OtherscapeThemeCard.loadedGear')} />
                        {details.powerTags.filter(tag => !tag.isScratched).length > 0 ? (
                           details.powerTags.filter(tag => !tag.isScratched).map((tag, index) =>
                              <TagItem key={tag.id} cardId={card.id} tag={tag} tagType="power" isEditing={isEditing} index={index} isLoadoutGear={true} />
                           )
                        ) : (
                           <p className="text-sm text-center text-muted-foreground py-2">{t('OtherscapeThemeCard.noGear')}</p>
                        )}

                        {/* Unloaded Gear Section - gear that IS burned */}
                        <CardSectionHeader title={t('OtherscapeThemeCard.unloadedGear')} className="mt-2" />
                        {details.powerTags.filter(tag => tag.isScratched).length > 0 ? (
                           details.powerTags.filter(tag => tag.isScratched).map((tag, index) =>
                              <TagItem key={tag.id} cardId={card.id} tag={tag} tagType="power" isEditing={isEditing} index={index} isLoadoutGear={true} />
                           )
                        ) : (
                           <p className="text-sm text-center text-muted-foreground py-2">{t('OtherscapeThemeCard.noGear')}</p>
                        )}
                        {isEditing && <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'powerTags')}><PlusCircle className="h-4 w-4 mr-2"/>{t('OtherscapeThemeCard.addGearTag')}</Button>}

                        {/* Flaws Section */}
                        <CardSectionHeader title={t('Common.flaws')} className="mt-2" />
                        {details.weaknessTags.map((tag, index) =>
                           <TagItem key={tag.id} cardId={card.id} tag={tag} tagType="weakness" isEditing={isEditing} index={index} isDark />
                        )}
                        {isEditing && <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'weaknessTags')}><PlusCircle className="h-4 w-4 mr-2"/>{t('OtherscapeThemeCard.addFlawTag')}</Button>}
                     </div>
                  </>
               ) : (
                  // Regular theme card: Main Tag + Power/Weakness Tags
                  <>
                     <div className="w-full text-center px-1 py-2.5 shrink-0 flex justify-between items-center gap-2 border-y border-card-accent/30">
                        <div className="w-6">
                           {!isEditing && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" onClick={() => commitMainTag({ isActive: !details.mainTag.isActive })}>
                                 {details.mainTag.isActive ? <Disc2 className="h-5 w-5 text-card-paper" /> : <Circle className="h-4 w-4" />}
                              </Button>
                           )}
                        </div>
                        {isEditing ? (
                           <Input
                              className="text-xl font-bold text-center grow border-0 shadow-none"
                              placeholder={t('Common.writeYourMainTag')}
                              value={localMainTagName}
                              onChange={(e) => setLocalMainTagName(e.target.value)}
                           />
                        ) : (
                           <h2 className={cn("text-xl font-bold", details.mainTag.isScratched ? 'line-through opacity-50' : details.mainTag.isActive && 'underline')}>
                              {details.mainTag.name || `[${t('Common.noName')}]`}
                           </h2>
                        )}
                        <div className="w-6">
                           {!isEditing && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" onClick={() => commitMainTag({ isScratched: !details.mainTag.isScratched })}>
                                 <Flame className={cn('h-4 w-4', details.mainTag.isScratched && 'text-destructive fill-destructive')} />
                              </Button>
                           )}
                        </div>
                     </div>
                     <div className="flex flex-col grow align-middle overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={tagsScrollRef}>
                        {details.powerTags.map((tag, index) => <TagItem key={tag.id} cardId={card.id} tag={tag} tagType="power" isEditing={isEditing} index={index} />)}
                        {isEditing && <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'powerTags')}><PlusCircle className="h-4 w-4 mr-2"/>{t('ThemeCard.addPowerTag')}</Button>}

                        {details.weaknessTags.map((tag, index) => <TagItem key={tag.id} cardId={card.id} tag={tag} tagType="weakness" isEditing={isEditing} index={index} isDark />)}
                        {isEditing && <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'weaknessTags')}><PlusCircle className="h-4 w-4 mr-2"/>{t('ThemeCard.addWeaknessTag')}</Button>}
                     </div>
                  </>
               )}
            </CardContent>

            {!isDrawerPreview && card.cardType !== 'LOADOUT_THEME' &&
               <CardFooter className="p-0 flex flex-col min-h-[37%] max-h-[37%]">
                  <CardSectionHeader title={`${
                     card.cardType === 'GROUP_THEME'
                        ? t('Common.identity')
                        : card.cardType === 'CHARACTER_THEME'
                           ? ((details as OtherscapeThemeDetails).themeType === 'Mythos'
                              ? t('OtherscapeThemeCard.ritualTitle')
                              : (details as OtherscapeThemeDetails).themeType === 'Self'
                                 ? t('Common.identity')
                                 : t('OtherscapeThemeCard.itchTitle'))
                           : t('OtherscapeThemeCard.descriptionTitle')
                  }`}></CardSectionHeader>
                  <div className="w-full grow overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={mysteryScrollRef}>
                     {isEditing ? (
                        <Textarea
                           className="h-full p-0.5 text-xs text-center bg-card-paper-bg/10 border-card-accent/20 resize-none"
                           placeholder={
                              card.cardType === 'GROUP_THEME'
                                 ? t('Common.writeYourIdentityText')
                                 : card.cardType === 'CHARACTER_THEME'
                                    ? ((details as OtherscapeThemeDetails).themeType === 'Mythos'
                                       ? t('OtherscapeThemeCard.ritualPlaceholder')
                                       : (details as OtherscapeThemeDetails).themeType === 'Self'
                                          ? t('Common.writeYourIdentityText')
                                          : t('OtherscapeThemeCard.itchPlaceholder'))
                                    : t('OtherscapeThemeCard.descriptionPlaceholder')
                           }
                           value={localMystery || ''}
                           onChange={(e) => setLocalMystery(e.target.value)}
                        />
                     ) : (
                        <p className="p-2 text-xs text-center whitespace-pre-wrap">{
                           mysteryIdentityOrDescription || `[${
                              card.cardType === 'GROUP_THEME'
                                 ? t('Common.emptyIdentityText')
                                 : card.cardType === 'CHARACTER_THEME'
                                    ? ((details as OtherscapeThemeDetails).themeType === 'Mythos'
                                       ? t('OtherscapeThemeCard.noRitual')
                                       : (details as OtherscapeThemeDetails).themeType === 'Self'
                                          ? t('Common.emptyIdentityText')
                                          : t('OtherscapeThemeCard.noItch'))
                                    : t('OtherscapeThemeCard.noDescription')
                           }]`
                        }</p>
                     )}
                  </div>

                  <div className="flex justify-around items-center py-2 px-2 shrink-0 w-full border-t border-card-accent/30">
                     <PipTracker label="Upgrade" value={details.attention} onUpdate={(val) => handleDetailChange('attention', val)} />
                     <PipTracker label="Decay" value={card.cardType === 'CHARACTER_THEME' ? (details as OtherscapeThemeDetails).fadeOrCrack : (details as OtherscapeCrewDetails).crack} onUpdate={(val) => handleDetailChange(card.cardType === 'CHARACTER_THEME' ? 'fadeOrCrack' : 'crack', val)} />
                  </div>
               </CardFooter>
            }
            {!isDrawerPreview && card.cardType === 'LOADOUT_THEME' &&
               <CardFooter className="p-0 flex flex-col">
                  <div className="flex justify-around items-center py-2 px-2 shrink-0 w-full border-t border-card-accent/30">
                     <PipTracker label="Upgrade" value={details.attention} onUpdate={(val) => handleDetailChange('attention', val)} />
                  </div>
               </CardFooter>
            }
         </Card>
      );

      const CardBack = (
         <Card className={cn(
            isMobile ? "w-full h-full" : "w-62.5 h-150",
            "flex flex-col border-2 shadow-lg p-0 overflow-hidden gap-0",
            "bg-card-paper-bg text-card-paper-fg border-card-border",
            "relative z-0",
            cardTypeClass,
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            {card.cardType === 'CHARACTER_THEME' ? (
               <CardHeaderMolecule title={(details as OtherscapeThemeDetails).themebook} type={(details as OtherscapeThemeDetails).themeType} game="OTHERSCAPE" />
            ) : card.cardType === 'GROUP_THEME' ? (
               <CardHeaderMolecule title={t('OtherscapeThemeCard.crewThemeTitle')} />
            ) : (
               <CardHeaderMolecule title={t('Common.loadoutTheme')} />
            )}

            <CardSectionHeader title={t('Common.specialImprovements')} />

            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="grow overflow-y-auto space-y-0 p-0 overscroll-contain" ref={improvementsScrollRef}>
                  {details.improvements.map((imp, index) => (
                     <BlandTagItem
                        key={imp.id}
                        cardId={card.id}
                        tag={imp}
                        listName="improvements"
                        isEditing={isEditing}
                        index={index}
                     />
                  ))}
                  {isEditing && (
                     <div className="p-2 w-full">
                        <Button variant="ghost" size="sm" className="w-full border border-dashed cursor-pointer" onClick={() => actions.addBlandTag(card.id, 'improvements')}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {t('Common.addImprovement')}
                        </Button>
                     </div>
                  )}
               </div>
            </CardContent>
         </Card>
      );


      return (
         <CardFlipWrapper
            ref={ref}
            effectiveViewMode={effectiveViewMode}
            isDrawerPreview={isDrawerPreview ?? false}
            isBoardEmbed={isBoardEmbed}
            isSnapshot={isSnapshot}
            useVerticalStack={useVerticalStack}
            card={card}
            isHovered={isHovered}
            hoverHandlers={hoverHandlers}
            isEditing={isEditing}
            dragAttributes={dragAttributes}
            dragListeners={dragListeners}
            cardTheme={cardTypeClass}
            onExport={onExport}
            onCycleViewMode={handleCycleViewMode}
            onFlip={() => actions.flipCard(card.id)}
            onDelete={() => actions.deleteCard(card.id)}
            onEditCard={card.cardType === 'GROUP_THEME' || card.cardType === 'LOADOUT_THEME' ? undefined : onEditCard}
            cardFront={CardFront}
            cardBack={CardBack}
         />
      );
   })
);

OtherscapeThemeCard.displayName = 'OtherscapeThemeCard';
