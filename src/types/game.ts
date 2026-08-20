export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';

export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  name: string;
  socketId: string;
  hand: Card[];
  score: number;
  totalScore: number;
  roundScores: number[];
  isReady: boolean;
  hasShown: boolean;
  isEliminated: boolean;
  profilePicture: string;
  seatIndex: number;
  isConnected: boolean;
}

export type GamePhase = 'waiting' | 'dealing' | 'playing' | 'round-end' | 'finished';

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  openCard: Card | null;
  wildRank: Rank | null;
  deck: Card[];
  discardPile: Card[];
  currentTurnIndex: number;
  turnHasPlaced: boolean;
  turnSkippedDraw: boolean;
  turnHasDrawn: boolean;
  turnStartDiscardTopId: string | null;
  turnPlacedCount: number;
  cardsRevealed: boolean;
  dealingStep: number;
  lastDealtPlayerId: string | null;
  roundNumber: number;
  winnerId: string | null;
  showPlayerId: string | null;
  showPenalty: boolean;
  hostId: string;
  roundScoresApplied: boolean;
}

export interface ClientPlayer {
  id: string;
  name: string;
  cardCount: number;
  score: number;
  handScore: number;
  totalScore: number;
  roundScores: number[];
  lastRoundScore: number | null;
  isReady: boolean;
  hasShown: boolean;
  isEliminated: boolean;
  isConnected: boolean;
  profilePicture: string;
  seatIndex: number;
}

export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  players: ClientPlayer[];
  myHand: Card[];
  myId: string;
  openCard: Card | null;
  wildRank: Rank | null;
  discardTop: Card | null;
  currentTurnPlayerId: string | null;
  isMyTurn: boolean;
  hasPlacedThisTurn: boolean;
  mustDrawAfterPlace: boolean;
  hasDrawnThisTurn: boolean;
  canPickFromDiscard: boolean;
  pickableDiscardCard: Card | null;
  myPlacedOnDiscard: Card[];
  hasLowestScore: boolean;
  canShow: boolean;
  myHandScore: number;
  myTotalScore: number;
  maxScore: number;
  eliminationScore: number;
  showThreshold: number;
  roundNumber: number;
  winnerId: string | null;
  showPlayerId: string | null;
  showPenalty: boolean;
  hostId: string;
  cardsRevealed: boolean;
  dealingStep: number;
  dealingTotalSteps: number;
  isDealingComplete: boolean;
  lastDealtPlayerId: string | null;
  deckRemaining: number;
  activePlayerCount: number;
}

export const RANK_VALUES: Record<Rank, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
};
