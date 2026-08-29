// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Skull } from 'lucide-react';

// -- Hook Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';

// -- Component Imports --
import { ExpandedChallengeSheet } from '@/components/organisms/cards/ExpandedChallengeSheet';
import { ExpandedCityChallengeSheet } from '@/components/organisms/cards/ExpandedCityChallengeSheet';
import type { RowListOps } from '@/components/organisms/cards/challengeCardEditRows';

// -- Utils Imports --
import { challengePaletteClass } from '@/lib/cards/challengeCardFactories';
import { EXPANDED_CARD_SIZE } from '@/lib/board/embedDrawerItem';
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { Card } from '@/lib/types/character';
import type { BlandTag, CardDetails, ChallengeAbility, ChallengeSpecial, ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove, MightyTag, SharedChallengeDetails } from '@/lib/types/character';

/*
 * Static drawer preview for a Challenge Card: the card's own landscape sheet (the rich read view that
 * surfaces every section - art, name, difficulty, flavor, and the game's substance) rendered inert at its
 * natural footprint, then fit into the stage. Reuses the expanded sheets verbatim in read mode (isEditing
 * false), so no edit control ever mounts; the list ops and commit closures are inert placeholders the read
 * paths never call. Details are read defensively and every list coerced to an array, so an odd or empty
 * card renders a graceful placeholder rather than throwing.
 */

const noop = () => {};
function inertOps<T>(): RowListOps<T> {
   return { commitById: noop, removeById: noop, add: noop };
}

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Coerces the shared (LitM / Otherscape) challenge floor so every list the sheet maps over is present. */
function safeShared(details: SharedChallengeDetails): SharedChallengeDetails {
   const base = {
      assetId: details.assetId ?? null,
      challengeLevel: typeof details.challengeLevel === 'number' ? details.challengeLevel : 0,
      flavor: typeof details.flavor === 'string' ? details.flavor : '',
      limits: asArray<ChallengeStatus>(details.limits),
      statuses: asArray<ChallengeStatus>(details.statuses),
      tags: asArray<BlandTag>(details.tags),
      abilities: asArray<ChallengeAbility>(details.abilities).map((ability): ChallengeAbility => ({ ...ability, consequences: asArray<ChallengeAbility['consequences'][number]>(ability?.consequences) })),
      specials: asArray<ChallengeSpecial>(details.specials),
   };
   return details.game === 'LEGENDS'
      ? { ...base, game: 'LEGENDS', types: asArray<string>(details.types), mightyTags: asArray<MightyTag>(details.mightyTags) }
      : { ...base, game: 'OTHERSCAPE' };
}

/** Coerces the City of Mist challenge shape (its own spectrums + three move lists). */
function safeCity(details: CityChallengeDetails): CityChallengeDetails {
   return {
      game: 'CITY_OF_MIST',
      assetId: details.assetId ?? null,
      challengeLevel: typeof details.challengeLevel === 'number' ? details.challengeLevel : 0,
      flavor: typeof details.flavor === 'string' ? details.flavor : '',
      primaryType: details.primaryType === 'Mythos' ? 'Mythos' : 'Logos',
      logosSubtitle: typeof details.logosSubtitle === 'string' ? details.logosSubtitle : '',
      mythosSubtitle: typeof details.mythosSubtitle === 'string' ? details.mythosSubtitle : '',
      spectrums: asArray<ChallengeStatus>(details.spectrums),
      customMoves: asArray<CityCustomMove>(details.customMoves),
      hardMoves: asArray<CityMove>(details.hardMoves),
      softMoves: asArray<CityMove>(details.softMoves),
   };
}

export function ChallengeCardPreview({ card }: { card: Card }) {
   const { t } = useTranslation();
   const details = card?.details as CardDetails | undefined;
   const assetId = details && 'assetId' in details ? (details.assetId ?? null) : null;
   const { url } = useAssetObjectUrl(assetId);

   const name = card?.title || t('Cards.challenge.untitled');
   const game = details && 'game' in details ? details.game : undefined;
   const stars = Math.max(0, Math.min(10, typeof (details as { challengeLevel?: number })?.challengeLevel === 'number' ? (details as { challengeLevel: number }).challengeLevel : 0));

   // The sheet is `h-full w-full`; give it its natural landscape box so FitToBox can measure and scale it.
   const box = { width: EXPANDED_CARD_SIZE.width, height: EXPANDED_CARD_SIZE.height };

   if (game === 'LEGENDS' || game === 'OTHERSCAPE') {
      return (
         <div style={box}>
            <ExpandedChallengeSheet
               details={safeShared(details as SharedChallengeDetails)}
               name={name}
               stars={stars}
               url={url}
               isEditing={false}
               localFlavor=""
               setLocalFlavor={noop}
               localTitle=""
               setLocalTitle={noop}
               commitLevel={noop}
               commitImage={noop}
               commitTypes={noop}
               limitOps={inertOps()}
               statusOps={inertOps()}
               tagOps={inertOps()}
               mightyTagOps={inertOps()}
               specialOps={inertOps()}
               commitAbilityById={noop}
               addAbility={() => ''}
               removeAbilityById={noop}
               mentionClick={undefined}
            />
         </div>
      );
   }

   if (game === 'CITY_OF_MIST') {
      return (
         <div style={box}>
            <ExpandedCityChallengeSheet
               details={safeCity(details as CityChallengeDetails)}
               name={name}
               stars={stars}
               url={url}
               isEditing={false}
               localFlavor=""
               setLocalFlavor={noop}
               localTitle=""
               setLocalTitle={noop}
               localLogos=""
               setLocalLogos={noop}
               localMythos=""
               setLocalMythos={noop}
               commitPrimaryType={noop}
               commitLevel={noop}
               commitImage={noop}
               spectrumOps={inertOps()}
               customMoveOps={inertOps()}
               hardMoveOps={inertOps()}
               softMoveOps={inertOps()}
               mentionClick={undefined}
            />
         </div>
      );
   }

   // Odd or empty card: a centered glyph on the card palette, still filling the landscape footprint.
   return (
      <div style={box} className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-card-border bg-card-paper-bg text-card-paper-fg/40', challengePaletteClass('LEGENDS'))}>
         <Skull className="h-16 w-16" />
         <span className="text-lg font-semibold">{name}</span>
      </div>
   );
}
