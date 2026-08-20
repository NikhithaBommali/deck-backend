import { v4 as uuidv4 } from 'uuid';
import { Card, Rank, Suit } from '../types/game';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

export function createDeck(includeJokers = true): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: uuidv4(), suit, rank });
    }
  }

  if (includeJokers) {
    deck.push({ id: uuidv4(), suit: 'joker', rank: 'J' });
    deck.push({ id: uuidv4(), suit: 'joker', rank: 'J' });
  }

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function isWildCard(card: Card, wildRank: Rank | null): boolean {
  if (card.suit === 'joker') return true;
  if (wildRank && card.rank === wildRank) return true;
  return false;
}

export function cardDisplayName(card: Card): string {
  if (card.suit === 'joker') return '🃏 Joker';
  const suitSymbols: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
    joker: '🃏',
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}
