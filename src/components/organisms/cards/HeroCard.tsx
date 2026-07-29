// -- React Imports --
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

// -- Basic UI Imports --
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// -- Icon Imports --
import { PlusCircle, Users, Sparkles } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CardHeaderMolecule } from '@/components/molecules/cards/CardHeader';
import { CardSectionHeader } from '@/components/molecules/cards/CardSectionHeader';
import { PipTracker } from '@/components/molecules/PipTracker';
import { FellowshipRelationshipItem } from '@/components/molecules/FellowshipRelationshipItem';
import { BlandTagItem } from '@/components/molecules/BlandTagItem';
import { TagItem } from '@/components/molecules/TagItem';
import { CardFlipWrapper } from '@/components/molecules/cards/CardFlipWrapper';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useManualScroll } from '@/hooks/useManualScroll';
import { useToolbarHover } from '@/hooks/useToolbarHover';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';
import { useCardViewMode } from '@/hooks/useCardViewMode';

// -- Type Imports --
import type { Card as CardData, CardDetails, LegendsHeroDetails } from '@/lib/types/character';



interface HeroCardProps {
  card: CardData;
  isEditing?: boolean;
  isSnapshot?: boolean;
  isDrawerPreview?: boolean;
  isBoardEmbed?: boolean;
  isMobile?: boolean;
  useVerticalStack?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  onExport?: () => void;
}



const HeroCardContent = React.memo(
   React.forwardRef<HTMLDivElement, HeroCardProps>(
      ({ card, isEditing=false, isSnapshot, isDrawerPreview, isBoardEmbed=false, isMobile=false, useVerticalStack, dragAttributes, dragListeners, onExport }, ref) => {
      const { t: t } = useTranslation();
      const { t: tBackpack } = useTranslation();
      const actions = useCharacterActions();
      const details = card.details as LegendsHeroDetails;

      const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);

      const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
      const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);

      const relationshipsScrollRef = useRef<HTMLDivElement>(null);
      const quintessencesScrollRef = useRef<HTMLDivElement>(null);
      const backpackScrollRef = useRef<HTMLDivElement>(null);

      useManualScroll(relationshipsScrollRef);
      useManualScroll(quintessencesScrollRef);
      useManualScroll(backpackScrollRef);


      
      // Commits one key. `updateCardDetails` merges, so the patch stays narrow - spreading the render's
      // `details` here would write every other key back at its render-time value and revert whatever
      // landed since, including a debounced field that has already flushed.
      const handleDetailChange = (field: keyof LegendsHeroDetails, value: LegendsHeroDetails[keyof LegendsHeroDetails]) => {
         actions.updateCardDetails(card.id, { [field]: value } as Partial<CardDetails>);
      };

      const { handleCycleViewMode } = useCardViewMode(card);



      // ##########################################
      // ###   CHARACTER NAME INPUT DEBOUNCER   ###
      // ##########################################

      const [localCharName, setLocalCharName] = useInputDebouncer(
         details.characterName,
         (value) => actions.updateCharacterName(value)
      );



      const CardFront = (
         <Card className={cn(
            isMobile ? "w-full h-full" : "w-62.5 h-150",
            "flex flex-col border-2 shadow-lg p-0 overflow-hidden gap-0",
            "bg-card-paper-bg text-card-paper-fg border-card-accent",
            "relative z-0",
            "card-type-hero",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeader className="p-0">
               <CardHeaderMolecule title={t('HeroCard.title')}></CardHeaderMolecule>
            </CardHeader>
            
            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="w-full text-center px-2 py-1 mb-1 shrink-0">
                  {isEditing ? (
                     <Input
                        className="text-2xl font-bold text-center bg-transparent border-none shadow-none"
                        value={localCharName || ''}
                        onChange={(e) => setLocalCharName(e.target.value)}
                        placeholder={t('HeroCard.characterNamePlaceholder')}
                     />
                  ) : (
                     <h2 className="text-2xl font-bold">{details.characterName || `[${t('HeroCard.noName')}]`}</h2>
                  )}
               </div>

               <div className="flex flex-col h-[45%]">
                  <CardSectionHeader title={t('HeroCard.relationships')} icon={Users} />
                  <div className="flex flex-col grow align-middle overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={relationshipsScrollRef}>
                     <div className="flex bg-card-accent/15">
                        <p className="grow text-sm text-center py-1 border-b">{t('HeroCard.companion')}</p>
                        <p className="grow text-sm text-center py-1 border-b">{t('HeroCard.relationship')}</p>
                     </div>
                     {details.fellowshipRelationships.map((relation, index) => (
                        <FellowshipRelationshipItem key={relation.id} cardId={card.id} relationship={relation} isEditing={isEditing} index={index} />
                     ))}
                     {isEditing && (
                        <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addRelationship(card.id)}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {t('HeroCard.addRelationship')}
                        </Button>
                     )}
                  </div>
               </div>

               <div className="flex justify-around items-center py-2 px-2 shrink-0 w-full border-t border-black/30">
                  <PipTracker 
                     label="promise" 
                     value={details.promise} 
                     onUpdate={(val) => handleDetailChange('promise', val)}
                     maxPips={5}
                  />
               </div>

               <div className="flex flex-col grow overflow-hidden">
                  <CardSectionHeader title={t('HeroCard.quintessences')} icon={Sparkles} />
                  <div className="flex flex-col grow align-middle overflow-y-scroll overscroll-contain" ref={quintessencesScrollRef}>
                     {details.quintessences.map((quint, index) => (
                        <BlandTagItem 
                           key={quint.id} 
                           cardId={card.id} 
                           tag={quint} 
                           listName="quintessences" 
                           isEditing={isEditing} 
                           index={index} 
                        />
                     ))}
                     {isEditing && (
                        <Button variant="ghost" size="sm" className="m-2 border border-dashed cursor-pointer" onClick={() => actions.addBlandTag(card.id, 'quintessences')}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {t('HeroCard.addQuintessence')}
                        </Button>
                     )}
                  </div>
               </div>
            </CardContent>
         </Card>
      );

      const CardBack = (
         <Card className={cn(
            isMobile ? "w-full h-full" : "w-62.5 h-150",
            "flex flex-col border-2 shadow-lg p-0 overflow-hidden gap-0",
            "bg-card-paper-bg text-card-paper-fg border-card-accent",
            "relative z-0",
            "card-type-hero",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeaderMolecule title={t('HeroCard.title')} />
            <CardSectionHeader title={`${tBackpack('backpack.title')}`}></CardSectionHeader>
            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="grow space-y-0 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={backpackScrollRef}>
                  {details.backpack.map((tag, index) => (
                     <TagItem
                        key={tag.id}
                        cardId={card.id}
                        tag={tag}
                        tagType="power"
                        listName="backpack"
                        placeholderKey="backpack.placeholder"
                        noNameKey="backpack.noName"
                        isEditing={isEditing}
                        index={index}
                     />
                  ))}
                  {isEditing && (
                     <div className="p-2 w-full">
                        <Button variant="ghost" size="sm" className="w-full border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'backpack')}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {tBackpack('backpack.addItem')}
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
            cardTheme="card-type-hero"
            onExport={onExport}
            onCycleViewMode={handleCycleViewMode}
            onFlip={() => actions.flipCard(card.id)}
            cardFront={CardFront}
            cardBack={CardBack}
         />
      );
   })
);
HeroCardContent.displayName = 'HeroCardContent';



export const HeroCard = React.memo(
   React.forwardRef<HTMLDivElement, HeroCardProps>(
     (props, ref) => {
       if (props.card.details.game !== 'LEGENDS') {
         return null;
       }
       return <HeroCardContent {...props} ref={ref} />;
     }
   )
);
HeroCard.displayName = 'HeroCard';