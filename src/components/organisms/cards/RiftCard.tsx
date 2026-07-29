// -- React Imports --
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// -- Icon Imports --
import { PlusCircle, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CardHeaderMolecule } from '@/components/molecules/cards/CardHeader';
import { CardSectionHeader } from '@/components/molecules/cards/CardSectionHeader';
import { PipTracker } from '@/components/molecules/PipTracker';
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
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Card as CardData, CardDetails, CityRiftDetails, CrewMember } from '@/lib/types/character';



interface RiftCardProps {
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



const RiftCardContent = React.memo(
   React.forwardRef<HTMLDivElement, RiftCardProps>(
      ({ card, isEditing=false, isSnapshot, isDrawerPreview, isBoardEmbed=false, isMobile=false, useVerticalStack, dragAttributes, dragListeners, onExport }, ref) => {
      const { t: t } = useTranslation();
      const { t: tNemesis } = useTranslation();
      const actions = useCharacterActions();
      const details = card.details as CityRiftDetails;

      const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);

      const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
      const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);

      const crewScrollRef = useRef<HTMLDivElement>(null);
      const nemesesScrollRef = useRef<HTMLDivElement>(null);

      useManualScroll(crewScrollRef);
      useManualScroll(nemesesScrollRef);

      // Commits one key. `updateCardDetails` merges, so the patch stays narrow - spreading the render's
      // `details` here would write every other key back at its render-time value and revert whatever
      // landed since, including a debounced field that has already flushed.
      const handleDetailChange = (field: keyof CityRiftDetails, value: CityRiftDetails[keyof CityRiftDetails]) => {
         actions.updateCardDetails(card.id, { [field]: value } as Partial<CardDetails>);
      };

      const { handleCycleViewMode } = useCardViewMode(card);

      // Crew member handlers
      const handleCrewMemberChange = (crewId: string, field: keyof CrewMember, value: string) => {
         if (!isEditing) return;
         actions.updateCrewMember(card.id, crewId, { [field]: value });
      };

      const handleAddCrewMember = () => {
         if (!isEditing) return;
         actions.addCrewMember(card.id);
      };

      const handleRemoveCrewMember = (crewId: string) => {
         if (!isEditing) return;
         actions.removeCrewMember(card.id, crewId);
      };



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
            "card-type-rift-com",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeader className="p-0">
               <CardHeaderMolecule title={t('RiftCard.title')}></CardHeaderMolecule>
            </CardHeader>
            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="w-full text-center px-2 py-1 mb-1 shrink-0">
                  {isEditing ? (
                     <Input
                        className="text-2xl font-bold text-center bg-transparent border-none shadow-none"
                        value={localCharName || ''}
                        onChange={(e) => setLocalCharName(e.target.value)}
                        placeholder={t('RiftCard.characterNamePlaceholder')}
                     />
                  ) : (
                     <h2 className="text-2xl font-bold">{details.characterName || `[${t('RiftCard.noName')}]`}</h2>
                  )}
               </div>

               {/* Mythos Section */}
               <div className="border-b border-card-accent">
                  <CardSectionHeader title={t('RiftCard.mythos')} />
                  <div className="p-2">
                     {isEditing ? (
                        <Input
                           value={details.mythos}
                           onChange={(e) => handleDetailChange('mythos', e.target.value)}
                           placeholder={t('RiftCard.mythosPlaceholder')}
                           className="text-sm h-8"
                        />
                     ) : (
                        <div className="text-sm min-h-8 flex items-center">
                           <p>{details.mythos || "No Mythos defined"}</p>
                        </div>
                     )}
                  </div>
               </div>

               {/* Logos Section */}
               <div className="border-b border-card-accent">
                  <CardSectionHeader title={t('RiftCard.logos')} />
                  <div className="p-2">
                     {isEditing ? (
                        <Input
                           value={details.logos}
                           onChange={(e) => handleDetailChange('logos', e.target.value)}
                           placeholder={t('RiftCard.logosPlaceholder')}
                           className="text-sm h-8"
                        />
                     ) : (
                        <div className="text-sm min-h-8 flex items-center">
                           <p>{details.logos || "No Logos defined"}</p>
                        </div>
                     )}
                  </div>
               </div>

               {/* Crew Section */}
               <div className="flex flex-col grow overflow-hidden min-h-0">
                  <CardSectionHeader title={t('RiftCard.Crew.title')} />
                  <div className={cn("grid gap-1 bg-card-accent/15 px-2 border-b shrink-0", isEditing ? "grid-cols-12" : "grid-cols-10")}>
                     <p className="col-span-6 text-sm text-center py-1">{t('RiftCard.Crew.name')}</p>
                     <p className="col-span-2 text-sm text-center py-1">{t('RiftCard.Crew.help')}</p>
                     <p className="col-span-2 text-sm text-center py-1">{t('RiftCard.Crew.hurt')}</p>
                     {isEditing && <p className="col-span-2 text-sm text-center py-1"></p>}
                  </div>
                  <div className="flex flex-col grow overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 p-2" ref={crewScrollRef}>
                     {details.crewMembers.map((member) => (
                        <div key={member.id} className={cn("mb-2 grid gap-1 items-center", isEditing ? "grid-cols-12" : "grid-cols-10")}>
                           <div className="col-span-6">
                              {isEditing ? (
                                 <Input
                                    value={member.name}
                                    onChange={(e) => handleCrewMemberChange(member.id, 'name', e.target.value)}
                                    placeholder={t('RiftCard.Crew.name')}
                                    className="h-7 text-xs"
                                 />
                              ) : (
                                 <div className="text-xs py-1 text-center truncate">{member.name || t('RiftCard.Crew.noName')}</div>
                              )}
                           </div>
                           <div className="col-span-2">
                              {isEditing ? (
                                 <Input
                                    value={member.help}
                                    onChange={(e) => handleCrewMemberChange(member.id, 'help', e.target.value)}
                                    placeholder="+X"
                                    className="p-0 h-7 text-xs text-center"
                                 />
                              ) : (
                                 <div className="text-xs py-1 text-center">{member.help || ""}</div>
                              )}
                           </div>
                           <div className="col-span-2">
                              {isEditing ? (
                                 <Input
                                    value={member.hurt}
                                    onChange={(e) => handleCrewMemberChange(member.id, 'hurt', e.target.value)}
                                    placeholder="-X"
                                    className="p-0 h-7 text-xs text-center"
                                 />
                              ) : (
                                 <div className="text-xs py-1 text-center">{member.hurt || ""}</div>
                              )}
                           </div>
                           {isEditing && (
                              <div className="col-span-2 flex justify-end">
                                 <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveCrewMember(member.id)}
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                 >
                                    <Trash2 className="h-3 w-3" />
                                 </Button>
                              </div>
                           )}
                        </div>
                     ))}
                     {isEditing && (
                        <Button variant="ghost" size="sm" className="w-full border border-dashed cursor-pointer" onClick={handleAddCrewMember}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {t('RiftCard.Crew.addCrewMember')}
                        </Button>
                     )}
                  </div>
               </div>

               {/* Build-up Tracker */}
               <div className="px-4 py-3 border-t">
                  <div className="text-xs font-semibold text-card-paper-fg mb-2 text-center">{t("RiftCard.buildup")}</div>
                  <PipTracker
                     value={details.buildup}
                     onUpdate={(value) => handleDetailChange('buildup', value)}
                     maxPips={5}
                  />
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
            "card-type-rift-com",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeaderMolecule title={t('RiftCard.title')} />
            <CardSectionHeader title={`${tNemesis('RiftCard.Nemesis.title')}`}></CardSectionHeader>
            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="grow space-y-0 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={nemesesScrollRef}>
                  {details.nemeses.map((tag, index) => (
                     <TagItem
                        key={tag.id}
                        cardId={card.id}
                        tag={tag}
                        tagType="power"
                        listName="nemeses"
                        placeholderKey="nemeses.placeholder"
                        noNameKey="nemeses.noName"
                        isEditing={isEditing}
                        index={index}
                     />
                  ))}
                  {isEditing && (
                     <div className="p-2 w-full">
                        <Button variant="ghost" size="sm" className="w-full border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'nemeses')}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {tNemesis('RiftCard.Nemesis.addNemesis')}
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
            cardTheme="card-type-mythos-com"
            onExport={onExport}
            onCycleViewMode={handleCycleViewMode}
            onFlip={() => actions.flipCard(card.id)}
            cardFront={CardFront}
            cardBack={CardBack}
         />
      );
   })
);
RiftCardContent.displayName = 'RiftCardContent';

export const RiftCard = React.memo(
   React.forwardRef<HTMLDivElement, RiftCardProps>(
      (props, ref) => {
         if (props.card.details.game !== 'CITY_OF_MIST') {
            return null;
         }
         return <RiftCardContent {...props} ref={ref} />;
      }
   )
);
RiftCard.displayName = 'RiftCard';