// -- React Imports --
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// -- Icon Imports --
import { PlusCircle } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CardHeaderMolecule } from '@/components/molecules/cards/CardHeader';
import { CardSectionHeader } from '@/components/molecules/cards/CardSectionHeader';
import { TagItem } from '@/components/molecules/TagItem';
import { FellowshipRelationshipItem } from '@/components/molecules/FellowshipRelationshipItem';
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
import type { Card as CardData, OtherscapeCharacterDetails } from '@/lib/types/character';



interface OtherscapeCharacterCardProps {
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



const OtherscapeCharacterCardContent = React.memo(
   React.forwardRef<HTMLDivElement, OtherscapeCharacterCardProps>(
      ({ card, isEditing=false, isSnapshot, isDrawerPreview, isBoardEmbed=false, isMobile=false, useVerticalStack, dragAttributes, dragListeners, onExport }, ref) => {
      const { t: t } = useTranslation();
      const { t: tSpecials } = useTranslation();
      const actions = useCharacterActions();
      const details = card.details as OtherscapeCharacterDetails;

      const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);

      const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
      const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);

      const relationshipsScrollRef = useRef<HTMLDivElement>(null);
      const specialsScrollRef = useRef<HTMLDivElement>(null);

      useManualScroll(relationshipsScrollRef);
      useManualScroll(specialsScrollRef);

      const { handleCycleViewMode } = useCardViewMode(card);

      // Fellowship relationship handlers - uses same actions as Hero card
      const handleAddRelationship = () => {
         if (!isEditing) return;
         actions.addRelationship(card.id);
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
            "card-type-character-os",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeader className="p-0">
               <CardHeaderMolecule title={t('Common.mercCard')}></CardHeaderMolecule>
            </CardHeader>
            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="w-full text-center px-2 py-1 mb-1 shrink-0">
                  {isEditing ? (
                     <Input
                        className="text-2xl font-bold text-center bg-transparent border-none shadow-none"
                        value={localCharName || ''}
                        onChange={(e) => setLocalCharName(e.target.value)}
                        placeholder={t('OtherscapeCharacterCard.characterNamePlaceholder')}
                     />
                  ) : (
                     <h2 className="text-2xl font-bold">{details.characterName || `[${t('OtherscapeCharacterCard.noName')}]`}</h2>
                  )}
               </div>

               {/* Essence Hexagonal Diagram Section */}
               <div className="border-b border-card-accent">
                  <CardSectionHeader title={t('OtherscapeCharacterCard.essence')} />
                  <div className="p-2 flex flex-col items-center">
                     {/* Hexagonal Essence Diagram */}
                     <svg width="230" height="180" viewBox="-10 10 220 180" className="mb-2">
                        {/* Center point */}
                        <circle cx="100" cy="100" r="1.5" fill="currentColor" className="text-card-accent" />

                        {/* Layered diamond sections for each theme type - 4 layers each */}
                        {/* Self section (top) - Layer 4 (outermost, most transparent) */}
                        <polygon points="100,30 160,65 100,100 40,65" fill="hsl(338, 100%, 55%)" fillOpacity="0.04" stroke="none" />
                        {/* Self - Layer 3 */}
                        <polygon points="100,47.5 145,73.75 100,100 55,73.75" fill="hsl(338, 100%, 55%)" fillOpacity="0.06" stroke="none" />
                        {/* Self - Layer 2 */}
                        <polygon points="100,65 130,82.5 100,100 70,82.5" fill="hsl(338, 100%, 55%)" fillOpacity="0.08" stroke="none" />
                        {/* Self - Layer 1 (innermost, most opaque) */}
                        <polygon points="100,82.5 115,91.25 100,100 85,91.25" fill="hsl(338, 100%, 55%)" fillOpacity="0.12" stroke="none" />

                        {/* Mythos section (bottom-right) - Layer 4 (outermost) */}
                        <polygon points="160,65 160,135 100,170 100,100" fill="hsl(268, 100%, 64%)" fillOpacity="0.04" stroke="none" />
                        {/* Mythos - Layer 3 */}
                        <polygon points="145,73.75 145,126.25 100,152.5 100,100" fill="hsl(268, 100%, 64%)" fillOpacity="0.06" stroke="none" />
                        {/* Mythos - Layer 2 */}
                        <polygon points="130,82.5 130,117.5 100,135 100,100" fill="hsl(268, 100%, 64%)" fillOpacity="0.08" stroke="none" />
                        {/* Mythos - Layer 1 (innermost) */}
                        <polygon points="115,91.25 115,108.75 100,117.5 100,100" fill="hsl(268, 100%, 64%)" fillOpacity="0.12" stroke="none" />

                        {/* Noise section (bottom-left) - Layer 4 (outermost) */}
                        <polygon points="40,65 40,135 100,170 100,100" fill="hsl(187, 79%, 46%)" fillOpacity="0.04" stroke="none" />
                        {/* Noise - Layer 3 */}
                        <polygon points="55,73.75 55,126.25 100,152.5 100,100" fill="hsl(187, 79%, 46%)" fillOpacity="0.06" stroke="none" />
                        {/* Noise - Layer 2 */}
                        <polygon points="70,82.5 70,117.5 100,135 100,100" fill="hsl(187, 79%, 46%)" fillOpacity="0.08" stroke="none" />
                        {/* Noise - Layer 1 (innermost) */}
                        <polygon points="85,91.25 85,108.75 100,117.5 100,100" fill="hsl(187, 79%, 46%)" fillOpacity="0.12" stroke="none" />

                        {/* Division lines from center to vertices */}
                        <line x1="100" y1="100" x2="100" y2="30" stroke="currentColor" strokeWidth="1" className="text-card-accent/40" />
                        <line x1="100" y1="100" x2="160" y2="65" stroke="currentColor" strokeWidth="1" className="text-card-accent/40" />
                        <line x1="100" y1="100" x2="160" y2="135" stroke="currentColor" strokeWidth="1" className="text-card-accent/40" />
                        <line x1="100" y1="100" x2="100" y2="170" stroke="currentColor" strokeWidth="1" className="text-card-accent/40" />
                        <line x1="100" y1="100" x2="40" y2="135" stroke="currentColor" strokeWidth="1" className="text-card-accent/40" />
                        <line x1="100" y1="100" x2="40" y2="65" stroke="currentColor" strokeWidth="1" className="text-card-accent/40" />

                        {/* Level 3 - Innermost (1 unit from center = 1/4 scale) */}
                        <polygon points="100,82.5 115,91.25 115,108.75 100,117.5 85,108.75 85,91.25"
                           fill="currentColor" fillOpacity="0.03" stroke="currentColor" strokeWidth="0.5" className="text-card-accent/30" />

                        {/* Level 2 - Middle (2 units from center = 1/2 scale) */}
                        <polygon points="100,65 130,82.5 130,117.5 100,135 70,117.5 70,82.5"
                           fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="0.75" className="text-card-accent/40" />

                        {/* Level 1 - Outer middle (3 units from center = 3/4 scale) */}
                        <polygon points="100,47.5 145,73.75 145,126.25 100,152.5 55,126.25 55,73.75"
                           fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeWidth="1" className="text-card-accent/50" />

                        {/* Level 0 - Outer hexagon outline (4 units from center = full scale) */}
                        <polygon points="100,30 160,65 160,135 100,170 40,135 40,65"
                           fill="currentColor" fillOpacity="0.09" stroke="currentColor" strokeWidth="2" className="text-card-accent" />

                        {/* Vertex Labels - Essence Names */}
                        {/* Top - Real (Self only) */}
                        <text x="100" y="24" textAnchor="middle" className="fill-current text-[9px] font-bold">
                           {t('OtherscapeCharacterCard.Essence.vertices.real')}
                        </text>

                        {/* Top-right - Spiritualist (Self + Mythos) */}
                        <text x="152" y="55" textAnchor="start" className="fill-current text-[8px] font-semibold">
                           {t('OtherscapeCharacterCard.Essence.vertices.spiritualist')}
                        </text>

                        {/* Bottom-right - Avatar/Conduit (Mythos only) */}
                        <text x="152" y="151" textAnchor="start" className="fill-current text-[8px] font-bold">
                           {t('OtherscapeCharacterCard.Essence.vertices.avatar')}
                        </text>
                        <text x="152" y="161" textAnchor="start" className="fill-current text-[8px] font-bold">
                           {t('OtherscapeCharacterCard.Essence.vertices.conduit')}
                        </text>

                        {/* Bottom - Transhuman (Mythos + Noise) */}
                        <text x="100" y="181" textAnchor="middle" className="fill-current text-[8px] font-semibold">
                           {t('OtherscapeCharacterCard.Essence.vertices.transhuman')}
                        </text>

                        {/* Bottom-left - Singularity (Noise only) */}
                        <text x="48" y="151" textAnchor="end" className="fill-current text-[8px] font-bold">
                           {t('OtherscapeCharacterCard.Essence.vertices.singularity')}
                        </text>

                        {/* Top-left - Cyborg (Noise + Self) */}
                        <text x="48" y="55" textAnchor="end" className="fill-current text-[8px] font-semibold">
                           {t('OtherscapeCharacterCard.Essence.vertices.cyborg')}
                        </text>

                        {/* Center - Nexus */}
                        <text x="105" y="108" textAnchor="start" className="fill-current text-[9px] font-bold">
                           {t('OtherscapeCharacterCard.Essence.vertices.nexus')}
                        </text>

                        {/* Theme Type Labels inside triangular sections */}
                        {/* Self - top section */}
                        <text x="120" y="73" textAnchor="middle" className="fill-current text-[11px] font-bold opacity-80" style={{fill: 'hsl(338, 100%, 30%)'}}>
                           {t('OtherscapeCharacterCard.Essence.self')}
                        </text>

                        {/* Mythos - bottom-right section */}
                        <text x="127" y="137" textAnchor="middle" className="fill-current text-[11px] font-bold opacity-80" style={{fill: 'hsl(268, 100%, 35%)'}}>
                           {t('OtherscapeCharacterCard.Essence.mythos')}
                        </text>

                        {/* Noise - bottom-left section */}
                        <text x="65" y="105" textAnchor="middle" className="fill-current text-[11px] font-bold opacity-80" style={{fill: 'hsl(187, 79%, 25%)'}}>
                           {t('OtherscapeCharacterCard.Essence.noise')}
                        </text>

                        {/* Essence Position Point */}
                        {(() => {
                           const self = details.essence.self;
                           const mythos = details.essence.mythos;
                           const noise = details.essence.noise;

                           // Hexagon center coordinates
                           const centerX = 100;
                           const centerY = 100;

                           // Determine which axis/vertex the character is on based on theme types
                           const hasSelf = self > 0;
                           const hasMythos = mythos > 0;
                           const hasNoise = noise > 0;
                           let posX = centerX;
                           let posY = centerY;
                           const fixedDistance = 35;

                           if (hasSelf && hasMythos && hasNoise) {
                              // All three types = Nexus (center)
                              posX = centerX;
                              posY = centerY;
                           } else if (hasSelf && !hasMythos && !hasNoise) {
                              // Only Self = Real
                              posX = centerX;
                              posY = centerY - fixedDistance;
                           } else if (!hasSelf && hasMythos && !hasNoise) {
                              // Only Mythos = Avatar/Conduit
                              const angle = Math.atan2(35, 60);
                              posX = centerX + fixedDistance * Math.cos(angle);
                              posY = centerY + fixedDistance * Math.sin(angle);
                           } else if (!hasSelf && !hasMythos && hasNoise) {
                              // Only Noise = Singularity
                              const angle = Math.atan2(35, -60);
                              posX = centerX + fixedDistance * Math.cos(angle);
                              posY = centerY + fixedDistance * Math.sin(angle);
                           } else if (hasSelf && hasMythos && !hasNoise) {
                              // Self + Mythos = Spiritualist
                              const angle = Math.atan2(-35, 60);
                              posX = centerX + fixedDistance * Math.cos(angle);
                              posY = centerY + fixedDistance * Math.sin(angle);
                           } else if (hasMythos && hasNoise && !hasSelf) {
                              // Mythos + Noise = Transhuman
                              posX = centerX;
                              posY = centerY + fixedDistance;
                           } else if (hasNoise && hasSelf && !hasMythos) {
                              // Noise + Self = Cyborg
                              const angle = Math.atan2(-35, -60);
                              posX = centerX + fixedDistance * Math.cos(angle);
                              posY = centerY + fixedDistance * Math.sin(angle);
                           }

                           // Only render if character has themes
                           if (self === 0 && mythos === 0 && noise === 0) {
                              return null;
                           }

                           return (
                              <>
                                 {/* Essence position indicator */}
                                 <circle cx={posX} cy={posY} r="4" fill="hsl(0, 0%, 20%)" stroke="hsl(0, 0%, 100%)" strokeWidth="2" />
                              </>
                           );
                        })()}
                     </svg>
                     {/* Current Essence Label */}
                     {(() => {
                        const self = details.essence.self;
                        const mythos = details.essence.mythos;
                        const noise = details.essence.noise;

                        const hasSelf = self > 0;
                        const hasMythos = mythos > 0;
                        const hasNoise = noise > 0;

                        let essenceName = '';
                        let textColor = '';
                        let bgColor = '';
                        let borderColor = '';

                        if (hasSelf && hasMythos && hasNoise) {
                           // Nexus - All types
                           essenceName = t('OtherscapeCharacterCard.Essence.vertices.nexus');
                           textColor = 'text-gray-600';
                           bgColor = 'bg-gray-600/20';
                           borderColor = 'border-gray-700';
                        } else if (hasSelf && !hasMythos && !hasNoise) {
                           // Real - Self only
                           essenceName = t('OtherscapeCharacterCard.Essence.vertices.real');
                           textColor = 'text-pink-800';
                           bgColor = 'bg-pink-600/20';
                           borderColor = 'border-pink-700';
                        } else if (!hasSelf && hasMythos && !hasNoise) {
                           // Avatar - Mythos only
                           essenceName = `${t('OtherscapeCharacterCard.Essence.vertices.avatar')} / ${t('OtherscapeCharacterCard.Essence.vertices.conduit')}`;
                           textColor = 'text-purple-800';
                           bgColor = 'bg-purple-600/20';
                           borderColor = 'border-purple-700';
                        } else if (!hasSelf && !hasMythos && hasNoise) {
                           // Singularity - Noise only
                           essenceName = t('OtherscapeCharacterCard.Essence.vertices.singularity');
                           textColor = 'text-cyan-800';
                           bgColor = 'bg-cyan-600/20';
                           borderColor = 'border-cyan-700';
                        } else if (hasSelf && hasMythos && !hasNoise) {
                           // Spiritualist - Mythos and Self
                           essenceName = t('OtherscapeCharacterCard.Essence.vertices.spiritualist');
                           textColor = 'text-purple-800';
                           bgColor = 'bg-pink-600/20';
                           borderColor = 'border-pink-700';
                        } else if (hasMythos && hasNoise && !hasSelf) {
                           // Transhuman - Noise and Mythos 
                           essenceName = t('OtherscapeCharacterCard.Essence.vertices.transhuman');
                           textColor = 'text-cyan-800';
                           bgColor = 'bg-purple-600/20';
                           borderColor = 'border-purple-700';
                        } else if (hasNoise && hasSelf && !hasMythos) {
                           // Cyborg - Self and Noise
                           essenceName = t('OtherscapeCharacterCard.Essence.vertices.cyborg');
                           textColor = 'text-pink-800';
                           bgColor = 'bg-cyan-600/20';
                           borderColor = 'border-cyan-700';
                        }

                        if (!essenceName) return null;

                        return (
                           <div className={`px-3 py-1 rounded border ${bgColor} ${textColor} ${borderColor} text-sm font-semibold`}>
                              {essenceName}
                           </div>
                        );
                     })()}
                  </div>
               </div>

               {/* Crew Relationships Section */}
               <div className="flex flex-col grow overflow-hidden min-h-0">
                  <CardSectionHeader title={t('OtherscapeCharacterCard.relationships')} />
                  <div className="flex flex-col grow overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={relationshipsScrollRef}>
                     {details.crewRelationships.map((relationship, index) => (
                        <FellowshipRelationshipItem
                           key={relationship.id}
                           cardId={card.id}
                           relationship={relationship}
                           isEditing={isEditing}
                           index={index}
                           translationNamespace="OtherscapeCharacterCard"
                        />
                     ))}
                     {isEditing && (
                        <div className="p-2">
                           <Button variant="ghost" size="sm" className="w-full border border-dashed cursor-pointer" onClick={handleAddRelationship}>
                              <PlusCircle className="h-4 w-4 mr-2" /> {t('Common.addCrewMember')}
                           </Button>
                        </div>
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
            "card-type-character-os",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>
            <CardHeaderMolecule title={t('Common.mercCard')} />
            <CardSectionHeader title={`${tSpecials('Common.specials')}`}></CardSectionHeader>
            <CardContent className="grow flex flex-col p-0 overflow-hidden min-h-0">
               <div className="grow space-y-0 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" ref={specialsScrollRef}>
                  {details.specials.map((tag, index) => (
                     <TagItem
                        key={tag.id}
                        cardId={card.id}
                        tag={tag}
                        tagType="power"
                        listName="specials"
                        placeholderKey="specials.placeholder"
                        noNameKey="specials.noName"
                        isEditing={isEditing}
                        index={index}
                     />
                  ))}
                  {isEditing && (
                     <div className="p-2 w-full">
                        <Button variant="ghost" size="sm" className="w-full border border-dashed cursor-pointer" onClick={() => actions.addTag(card.id, 'specials')}>
                           <PlusCircle className="h-4 w-4 mr-2" /> {tSpecials('Common.addSpecial')}
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
            cardTheme="card-type-character-os"
            onExport={onExport}
            onCycleViewMode={handleCycleViewMode}
            onFlip={() => actions.flipCard(card.id)}
            cardFront={CardFront}
            cardBack={CardBack}
         />
      );
   })
);
OtherscapeCharacterCardContent.displayName = 'OtherscapeCharacterCardContent';

export const OtherscapeCharacterCard = React.memo(
   React.forwardRef<HTMLDivElement, OtherscapeCharacterCardProps>(
      (props, ref) => {
         if (props.card.details.game !== 'OTHERSCAPE') {
            return null;
         }
         return <OtherscapeCharacterCardContent {...props} ref={ref} />;
      }
   )
);
OtherscapeCharacterCard.displayName = 'OtherscapeCharacterCard';
