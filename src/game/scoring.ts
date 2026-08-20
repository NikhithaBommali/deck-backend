import { Card, Rank, RANK_VALUES } from '../types/game';

/** Joker card = 0. Open-card rank (non-joker) = 0. */
export function isZeroScoreCard(card: Card, openRank: Rank | null): boolean {
  if (card.suit === 'joker') return true;
  if (openRank && card.rank === openRank) return true;
  return false;
}

export function getCardScore(card: Card, openRank: Rank | null): number {
  if (isZeroScoreCard(card, openRank)) return 0;
  return RANK_VALUES[card.rank];
}

export function calculateHandScore(hand: Card[], openRank: Rank | null): number {
  return hand.reduce((sum, card) => sum + getCardScore(card, openRank), 0);
}

export function updatePlayerScore(hand: Card[], openRank: Rank | null): number {
  return calculateHandScore(hand, openRank);
}
