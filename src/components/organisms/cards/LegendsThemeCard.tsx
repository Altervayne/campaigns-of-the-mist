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
import { getCardTypeClass } from '@/lib/utils/character';

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
import { useCardViewMode } from '@/hooks/useCardViewMode';
import { useLiveCardDetails } from '@/hooks/character-sheet/useLiveCardDetails';

// -- Type Imports --
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Card as CardData, CardDetails, LegendsFellowshipDetails, LegendsThemeDetails, Tag } from '@/lib/types/character';



type ThemeDetails = LegendsThemeDetails | LegendsFellowshipDetails;
type DetailValue = ThemeDetails[keyof ThemeDetails];

interface ThemeCardProps {
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



export const LegendsThemeCard = React.memo(
   React.forwardRef<HTMLDivElement, ThemeCardProps>(
      ({ card, isEditing=false, isSnapshot, isDrawerPreview, isBoardEmbed=false, isMobile=false, useVerticalStack, dragAttributes, dragListeners, onEditCard, onExport }, ref) => {
      const { t: t } = useTranslation();
      const actions = useCharacterActions();
      const details = card.details as ThemeDetails;

      const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);

      const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
      const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);

      const tagsScrollRef = useRef<HTMLDivElement>(null);
      const questScrollRef = useRef<HTMLDivElement>(null);
      const improvementsScrollRef = useRef<HTMLDivElement>(null);
      
      useManualScroll(tagsScrollRef);
      useManualScroll(questScrollRef);
      useManualScroll(improvementsScrollRef);


      
      const cardTypeClass = (() => {
         if (card.cardType === 'CHARACTER_THEME') {
            return getCardTypeClass((details as LegendsThemeDetails).themeType);
         }
         if (card.cardType === 'GROUP_THEME') {
            return 'card-type-fellowship';
         }
         return '';
      })();



      // Commits one key. `updateCardDetails` merges, so the patch stays narrow - spreading the render's
      // `details` here would write every other key back at its render-time value and revert whatever
      // landed since, including a debounced field that has already flushed.
      const handleDetailChange = (field: keyof ThemeDetails, value: DetailValue) => {
         actions.updateCardDetails(card.id, { [field]: value } as Partial<CardDetails>);
      };

      // The main tag is a nested object, so a patch has to rebuild it. Rebuilding from the LIVE details
      // rather than the render's keeps a sibling key (name / isActive / isScratched) from being reverted
      // by a commit whose render predates it.
      const liveDetails = useLiveCardDetails<ThemeDetails>(card.id, details);
      const commitMainTag = (updates: Partial<Tag>) => {
         actions.updateCardDetails(card.id, { mainTag: { ...liveDetails().mainTag, ...updates } });
      };

      const { handleCycleViewMode } = useCardViewMode(card);



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
      //  Quest Text
      // ==================
      const [localQuest, setLocalQuest] = useInputDebouncer(
         details.quest,
         (value) => actions.updateCardDetails(card.id, { quest: value })
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
                     title={(details as LegendsThemeDetails).themebook}
                     type={(details as LegendsThemeDetails).themeType}
                     className={cn("bg-card-header-bg text-card-header-fg")}
                  />
               ) : card.cardType === 'GROUP_THEME' && (
                  <CardHeaderMolecule title={t('Cards.fellowshipCard')} />
               )}
               <div className="px-2 text-xs font-semibold text-center">
                  <span>{t('Common.power')}</span> • <span className="text-destructive/50">{t('Common.weakness')}</span>
               </div>
            </CardHeader>
            
            <CardContent className="grow flex flex-col pt-2 px-0 overflow-hidden min-h-0">
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
                  
                  {details.weaknessTags.map((tag, index) => <TagItem key={tag.id} cardId={card.id} tag={tag} tagType="weakness" isEditing={isEditing} index={index} />)}
                  {isEditing && <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'weaknessTags')}><PlusCircle className="h-4 w-4 mr-2"/>{t('ThemeCard.addWeaknessTag')}</Button>}
               </div>
            </CardContent>

            {!isDrawerPreview &&
               <CardFooter className="p-0 flex flex-col min-h-[37%] max-h-[37%]">
                  <CardSectionHeader title={`${t('ThemeCard.questTitle')}`}></CardSectionHeader>
                  <div className="w-full grow overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={questScrollRef}>
                     {isEditing ? (
                        <Textarea 
                           className="h-full p-0.5 text-xs text-center bg-card-paper-bg/10 border-card-accent/20 resize-none" 
                           placeholder={t('ThemeCard.questPlaceholder')} 
                           value={localQuest || ''} 
                           onChange={(e) => setLocalQuest(e.target.value)} 
                        />
                     ) : (
                        <p className="p-2 text-xs text-center whitespace-pre-wrap">{details.quest || `[${t('ThemeCard.noQuest')}]`}</p>
                     )}
                  </div>
                  
                  <div className="flex justify-around items-center py-2 px-2 shrink-0 w-full border-t border-card-accent/30">
                     <PipTracker label="abandon" value={details.abandon} onUpdate={(val) => handleDetailChange('abandon', val)} />
                     <PipTracker label="improve" value={details.improve} onUpdate={(val) => handleDetailChange('improve', val)} />
                     <PipTracker label="milestone" value={details.milestone} onUpdate={(val) => handleDetailChange('milestone', val)} />
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
               <CardHeaderMolecule title={(details as LegendsThemeDetails).themebook} type={(details as LegendsThemeDetails).themeType} />
            ) : (
               <CardHeaderMolecule title={card.title} />
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
            onEditCard={card.cardType === 'GROUP_THEME' ? undefined : onEditCard}
            cardFront={CardFront}
            cardBack={CardBack}
         />
      );
   })
);

LegendsThemeCard.displayName = 'ThemeCard';
