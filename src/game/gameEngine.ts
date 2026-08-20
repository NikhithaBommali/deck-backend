import { v4 as uuidv4 } from 'uuid';
import {
  Card,
  ClientGameState,
  GameState,
  Player,
  Rank,
} from '../types/game';
import { MAX_SCORE, ELIMINATION_SCORE, SHOW_THRESHOLD } from './constants';
import { createDeck, shuffleDeck } from './deck';
import { calculateHandScore, updatePlayerScore } from './scoring';

function cardsSameBatch(a: Card, b: Card): boolean {
  if (a.suit === 'joker' && b.suit === 'joker') return true;
  if (a.suit === 'joker' || b.suit === 'joker') return false;
  return a.rank === b.rank;
}

const CARDS_PER_PLAYER = 7;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

function getDiscardTop(state: GameState): Card | null {
  return state.discardPile.length > 0
    ? state.discardPile[state.discardPile.length - 1]
    : null;
}

export class GameEngine {
  private state: GameState;

  constructor(roomId: string, hostId: string) {
    this.state = {
      roomId,
      phase: 'waiting',
      players: [],
      openCard: null,
      wildRank: null,
      deck: [],
      discardPile: [],
      currentTurnIndex: 0,
      turnHasPlaced: false,
      turnSkippedDraw: false,
      turnHasDrawn: false,
      turnStartDiscardTopId: null,
      turnPlacedCount: 0,
      roundNumber: 0,
      winnerId: null,
      showPlayerId: null,
      showPenalty: false,
      cardsRevealed: false,
      dealingStep: 0,
      lastDealtPlayerId: null,
      hostId,
      roundScoresApplied: false,
    };
  }

  getActivePlayers(): Player[] {
    return this.state.players.filter((p) => !p.isEliminated);
  }

  private getActiveDealingPlayers(): Player[] {
    return this.getActivePlayers();
  }

  getState(): GameState {
    return this.state;
  }

  addPlayer(
    name: string,
    socketId: string,
    profilePicture = ''
  ): Player | null {
    if (this.state.phase !== 'waiting') return null;
    if (this.state.players.length >= MAX_PLAYERS) return null;

    const seatIndex = this.state.players.length;
    const player: Player = {
      id: uuidv4(),
      name,
      socketId,
      hand: [],
      score: 0,
      totalScore: 0,
      roundScores: [],
      isReady: false,
      hasShown: false,
      isEliminated: false,
      profilePicture,
      seatIndex,
      isConnected: true,
    };

    this.state.players.push(player);
    return player;
  }

  disconnectPlayer(playerId: string): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return false;

    const wasCurrentTurn =
      this.state.phase === 'playing' &&
      this.state.players[this.state.currentTurnIndex]?.id === playerId;

    player.isConnected = false;
    player.socketId = '';

    if (wasCurrentTurn) {
      this.advanceTurn();
    } else {
      this.ensureValidTurnIndex();
    }

    return true;
  }

  reconnectPlayer(playerId: string, socketId: string): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return false;
    player.isConnected = true;
    player.socketId = socketId;
    this.ensureValidTurnIndex();
    return true;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  leavePlayer(playerId: string): boolean {
    const idx = this.state.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return false;

    const leavingId = this.state.players[idx].id;
    this.state.players.splice(idx, 1);

    if (this.state.players.length === 0) return true;

    if (idx < this.state.currentTurnIndex) {
      this.state.currentTurnIndex = Math.max(0, this.state.currentTurnIndex - 1);
    } else if (idx === this.state.currentTurnIndex) {
      this.state.currentTurnIndex =
        this.state.currentTurnIndex % this.state.players.length;
    }

    if (this.state.hostId === leavingId) {
      const nextHost =
        this.getActivePlayers()[0] ??
        this.state.players.find((p) => p.isConnected) ??
        this.state.players[0];
      this.state.hostId = nextHost.id;
    }

    this.state.players.forEach((p, i) => {
      p.seatIndex = i;
    });

    this.ensureValidTurnIndex();

    const active = this.getActivePlayers();
    if (active.length < MIN_PLAYERS) {
      if (this.state.phase === 'finished') return true;
      if (active.length === 1 && this.state.phase !== 'waiting') {
        this.state.phase = 'finished';
        this.state.winnerId = active[0].id;
      } else if (
        this.state.phase === 'playing' ||
        this.state.phase === 'dealing' ||
        this.state.phase === 'round-end'
      ) {
        if (active.length === 0) {
          this.state.phase = 'finished';
        } else if (this.state.phase !== 'round-end') {
          this.state.phase = 'waiting';
        }
      }
    }

    return true;
  }

  private ensureValidTurnIndex(): void {
    if (this.state.players.length === 0) return;
    if (this.state.currentTurnIndex >= this.state.players.length) {
      this.state.currentTurnIndex = 0;
    }
    if (this.state.phase !== 'playing') return;

    const n = this.state.players.length;
    let steps = 0;
    while (
      steps < n &&
      !this.isTurnEligible(this.state.players[this.state.currentTurnIndex])
    ) {
      this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % n;
      steps++;
    }
  }

  removePlayer(playerId: string): void {
    this.leavePlayer(playerId);
  }

  updatePlayerProfile(playerId: string, profilePicture: string): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return false;
    player.profilePicture = profilePicture;
    return true;
  }

  setReady(playerId: string, ready: boolean): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || this.state.phase !== 'waiting') return false;
    player.isReady = ready;
    return true;
  }

  canStart(): boolean {
    return (
      this.state.phase === 'waiting' &&
      this.state.players.length >= MIN_PLAYERS &&
      this.state.players.every((p) => p.isReady)
    );
  }

  startGame(): boolean {
    if (!this.canStart()) return false;
    this.prepareRound();
    return true;
  }

  distributeCards(playerId: string): boolean {
    if (this.state.phase !== 'dealing') return false;
    if (this.state.hostId !== playerId) return false;
    if (!this.isDealingComplete()) return false;
    this.state.cardsRevealed = true;
    this.state.phase = 'playing';
    return true;
  }

  isDealingComplete(): boolean {
    return (
      this.state.dealingStep >=
      this.getActiveDealingPlayers().length * CARDS_PER_PLAYER
    );
  }

  getDealingTotalSteps(): number {
    return this.getActiveDealingPlayers().length * CARDS_PER_PLAYER;
  }

  dealNextCard(): boolean {
    if (this.state.phase !== 'dealing') return false;
    if (this.isDealingComplete()) return false;

    const active = this.getActiveDealingPlayers();
    if (active.length === 0) return false;

    const playerIndex = this.state.dealingStep % active.length;
    const player = active[playerIndex];

    if (this.state.deck.length === 0) return false;

    const card = this.state.deck.pop()!;
    player.hand.push(card);
    this.state.lastDealtPlayerId = player.id;
    this.state.dealingStep++;

    if (this.isDealingComplete()) {
      for (const p of active) {
        p.score = updatePlayerScore(p.hand, this.state.wildRank);
      }
    }

    return true;
  }

  private prepareRound(): void {
    const active = this.getActivePlayers();
    if (active.length < MIN_PLAYERS) {
      this.state.phase = 'finished';
      this.state.winnerId =
        active.sort((a, b) => a.totalScore - b.totalScore)[0]?.id ?? null;
      return;
    }

    this.state.roundNumber++;
    this.state.phase = 'dealing';
    this.state.cardsRevealed = false;
    this.state.dealingStep = 0;
    this.state.lastDealtPlayerId = null;
    this.state.winnerId = null;
    this.state.showPlayerId = null;
    this.state.showPenalty = false;
    this.state.roundScoresApplied = false;

    let deck = shuffleDeck(createDeck());

    const openCard = deck.pop()!;
    this.state.openCard = openCard;
    this.state.wildRank = openCard.suit === 'joker' ? null : openCard.rank;

    for (const player of this.state.players) {
      player.hand = [];
      player.hasShown = false;
      if (!player.isEliminated) {
        player.score = 0;
      }
    }

    this.state.deck = deck;
    this.state.discardPile = [];

    const firstActive = this.state.players.findIndex((p) => !p.isEliminated);
    this.state.currentTurnIndex = firstActive >= 0 ? firstActive : 0;
    this.resetTurnFlags();
  }

  private applyRoundScoresToTotals(): void {
    if (this.state.roundScoresApplied) return;

    for (const p of this.state.players) {
      if (p.isEliminated) continue;
      p.totalScore += p.score;
      p.roundScores.push(p.score);
      if (p.totalScore >= ELIMINATION_SCORE) {
        p.isEliminated = true;
        p.hand = [];
      }
    }

    this.state.roundScoresApplied = true;
  }

  private resetTurnFlags(): void {
    this.state.turnHasPlaced = false;
    this.state.turnSkippedDraw = false;
    this.state.turnHasDrawn = false;
    this.state.turnPlacedCount = 0;
    this.state.turnStartDiscardTopId = getDiscardTop(this.state)?.id ?? null;
  }

  private isTurnEligible(player: Player | undefined): boolean {
    if (!player) return false;
    if (player.isEliminated) return false;
    if (this.state.phase === 'playing' && !player.isConnected) return false;
    return true;
  }

  getCurrentPlayer(): Player | null {
    if (this.state.players.length === 0) return null;
    const player = this.state.players[this.state.currentTurnIndex];
    if (!this.isTurnEligible(player)) return null;
    return player;
  }

  placeCards(playerId: string, cardIds: string[]): boolean {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId || this.state.phase !== 'playing') {
      return false;
    }
    if (player.isEliminated) return false;
    if (this.state.turnHasPlaced || cardIds.length === 0) return false;

    const idsSet = new Set(cardIds);
    const cardsToPlace = player.hand.filter((c) => idsSet.has(c.id));

    if (cardsToPlace.length !== cardIds.length) return false;

    const placedRank = cardsToPlace[0].rank;
    if (!cardsToPlace.every((c) => cardsSameBatch(c, cardsToPlace[0]))) return false;

    const discardTop = getDiscardTop(this.state);
    const matchedTop = discardTop !== null && placedRank === discardTop.rank;

    player.hand = player.hand.filter((c) => !idsSet.has(c.id));
    for (const card of cardsToPlace) {
      this.state.discardPile.push(card);
    }

    player.score = updatePlayerScore(player.hand, this.state.wildRank);
    this.state.turnHasPlaced = true;
    this.state.turnPlacedCount = cardsToPlace.length;

    if (matchedTop) {
      this.state.turnSkippedDraw = true;
      this.advanceTurn();
    }

    return true;
  }

  drawFromDeck(playerId: string): Card | null {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId || this.state.phase !== 'playing') {
      return null;
    }
    if (!this.state.turnHasPlaced || this.state.turnSkippedDraw || this.state.turnHasDrawn) {
      return null;
    }

    if (this.state.deck.length === 0) {
      if (this.state.discardPile.length <= 1) return null;
      const top = this.state.discardPile.pop()!;
      this.state.deck = shuffleDeck(this.state.discardPile);
      this.state.discardPile = [top];
    }

    const card = this.state.deck.pop()!;
    player.hand.push(card);
    player.score = updatePlayerScore(player.hand, this.state.wildRank);
    this.state.turnHasDrawn = true;
    this.advanceTurn();
    return card;
  }

  pickFromDiscard(playerId: string): Card | null {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId || this.state.phase !== 'playing') {
      return null;
    }
    if (
      !this.state.turnHasPlaced ||
      this.state.turnSkippedDraw ||
      this.state.turnHasDrawn ||
      !this.state.turnStartDiscardTopId
    ) {
      return null;
    }

    const pickIndex =
      this.state.discardPile.length - this.state.turnPlacedCount - 1;
    if (pickIndex < 0) return null;

    const cardAtIndex = this.state.discardPile[pickIndex];
    if (cardAtIndex.id !== this.state.turnStartDiscardTopId) {
      const idx = this.state.discardPile.findIndex(
        (c) => c.id === this.state.turnStartDiscardTopId
      );
      if (idx === -1) return null;
      const [card] = this.state.discardPile.splice(idx, 1);
      player.hand.push(card);
      player.score = updatePlayerScore(player.hand, this.state.wildRank);
      this.state.turnHasDrawn = true;
      this.advanceTurn();
      return card;
    }

    const [card] = this.state.discardPile.splice(pickIndex, 1);
    player.hand.push(card);
    player.score = updatePlayerScore(player.hand, this.state.wildRank);
    this.state.turnHasDrawn = true;
    this.advanceTurn();
    return card;
  }

  show(playerId: string): {
    success: boolean;
    score: number;
    won: boolean;
    penalty: boolean;
    error?: string;
  } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId || this.state.phase !== 'playing') {
      return { success: false, score: -1, won: false, penalty: false, error: 'Not your turn' };
    }

    if (this.state.turnHasPlaced) {
      return {
        success: false,
        score: -1,
        won: false,
        penalty: false,
        error: 'Cannot show after placing a card this turn',
      };
    }

    const myScore = calculateHandScore(player.hand, this.state.wildRank);
    if (myScore >= SHOW_THRESHOLD) {
      return {
        success: false,
        score: myScore,
        won: false,
        penalty: false,
        error: `Score must be less than ${SHOW_THRESHOLD} to show (yours is ${myScore})`,
      };
    }

    for (const p of this.state.players) {
      if (p.isEliminated) continue;
      p.score = calculateHandScore(p.hand, this.state.wildRank);
    }

    const active = this.getActivePlayers();
    const handScore = player.score;
    const others = active.filter((p) => p.id !== playerId);
    const otherScores = others.map((p) => p.score);
    const hasSomeoneWithLowerScore = otherScores.some((s) => s < handScore);
    const penaltyScore = otherScores.reduce((sum, s) => sum + s, 0);

    player.hasShown = true;
    this.state.showPlayerId = playerId;

    if (hasSomeoneWithLowerScore) {
      player.score = penaltyScore;
      this.state.showPenalty = true;
      this.state.winnerId =
        others.sort((a, b) => a.score - b.score)[0]?.id ?? null;
    } else {
      player.score = 0;
      this.state.winnerId = playerId;
      this.state.showPenalty = false;
    }

    this.state.phase = 'round-end';
    this.applyRoundScoresToTotals();
    return {
      success: true,
      score: player.score,
      won: !hasSomeoneWithLowerScore,
      penalty: hasSomeoneWithLowerScore,
    };
  }

  nextRound(playerId: string): boolean {
    if (this.state.phase !== 'round-end') return false;
    if (this.state.hostId !== playerId) return false;

    const active = this.getActivePlayers();
    if (active.length < MIN_PLAYERS) {
      this.state.phase = 'finished';
      this.state.winnerId =
        active.sort((a, b) => a.totalScore - b.totalScore)[0]?.id ??
        this.state.players
          .filter((p) => !p.isEliminated)
          .sort((a, b) => a.totalScore - b.totalScore)[0]?.id ??
        null;
      return true;
    }

    this.prepareRound();
    return true;
  }

  private advanceTurn(): void {
    const n = this.state.players.length;
    if (n === 0) return;

    let steps = 0;
    do {
      this.state.currentTurnIndex =
        (this.state.currentTurnIndex + 1) % n;
      steps++;
    } while (
      !this.isTurnEligible(this.state.players[this.state.currentTurnIndex]) &&
      steps < n
    );
    this.resetTurnFlags();
  }

  toClientState(playerId: string): ClientGameState | null {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return null;

    const currentPlayer = this.getCurrentPlayer();
    const isMyTurn = currentPlayer?.id === playerId;
    const handScore = calculateHandScore(player.hand, this.state.wildRank);
    const discardTop = getDiscardTop(this.state);

    const mustDrawAfterPlace =
      isMyTurn &&
      this.state.turnHasPlaced &&
      !this.state.turnSkippedDraw &&
      !this.state.turnHasDrawn;

    let pickableDiscardCard: Card | null = null;
    if (this.state.turnStartDiscardTopId) {
      pickableDiscardCard =
        this.state.discardPile.find((c) => c.id === this.state.turnStartDiscardTopId) ??
        null;
    }

    const canPickFromDiscard = mustDrawAfterPlace && pickableDiscardCard !== null;

    let myPlacedOnDiscard: Card[] = [];
    if (isMyTurn && this.state.turnHasPlaced && this.state.turnPlacedCount > 0) {
      myPlacedOnDiscard = this.state.discardPile.slice(-this.state.turnPlacedCount);
    }

    const otherScores = this.getActivePlayers()
      .filter((p) => p.id !== playerId)
      .map((p) => calculateHandScore(p.hand, this.state.wildRank));
    const hasLowestScore =
      otherScores.length === 0 ||
      otherScores.every((s) => handScore <= s);

    const showHand =
      this.state.cardsRevealed || this.state.phase === 'round-end';
    const inDealing = this.state.phase === 'dealing';
    const showMyHand = showHand || inDealing;

    const inRoundEnd = this.state.phase === 'round-end';
    const lastRoundScore = inRoundEnd ? player.score : null;

    return {
      roomId: this.state.roomId,
      phase: this.state.phase,
      players: this.state.players.map((p) => {
        const handScore =
          this.state.phase === 'playing' || inDealing
            ? calculateHandScore(p.hand, this.state.wildRank)
            : p.score;
        return {
          id: p.id,
          name: p.name,
          cardCount: p.hand.length,
          score: inRoundEnd ? p.score : showHand || (inDealing && this.isDealingComplete()) ? handScore : 0,
          handScore,
          totalScore: p.totalScore,
          roundScores: [...p.roundScores],
          lastRoundScore: inRoundEnd ? p.score : p.roundScores.length > 0 ? p.roundScores[p.roundScores.length - 1] : null,
          isReady: p.isReady,
          hasShown: p.hasShown,
          isEliminated: p.isEliminated,
          isConnected: p.isConnected,
          profilePicture: p.profilePicture,
          seatIndex: p.seatIndex,
        };
      }),
      myHand: showMyHand ? player.hand : [],
      myId: playerId,
      openCard: this.state.openCard,
      wildRank: this.state.wildRank,
      discardTop,
      currentTurnPlayerId: currentPlayer?.id ?? null,
      isMyTurn,
      hasPlacedThisTurn: isMyTurn ? this.state.turnHasPlaced : false,
      mustDrawAfterPlace,
      hasDrawnThisTurn: isMyTurn ? this.state.turnHasDrawn : false,
      canPickFromDiscard,
      pickableDiscardCard: isMyTurn ? pickableDiscardCard : null,
      myPlacedOnDiscard: isMyTurn ? myPlacedOnDiscard : [],
      hasLowestScore,
      canShow:
        isMyTurn &&
        !player.isEliminated &&
        !this.state.turnHasPlaced &&
        handScore < SHOW_THRESHOLD,
      myHandScore: handScore,
      myTotalScore: player.totalScore,
      maxScore: MAX_SCORE,
      eliminationScore: ELIMINATION_SCORE,
      showThreshold: SHOW_THRESHOLD,
      roundNumber: this.state.roundNumber,
      winnerId: this.state.winnerId,
      showPlayerId: this.state.showPlayerId,
      showPenalty: this.state.showPenalty,
      hostId: this.state.hostId,
      cardsRevealed: this.state.cardsRevealed,
      dealingStep: this.state.dealingStep,
      dealingTotalSteps: this.getDealingTotalSteps(),
      isDealingComplete: this.isDealingComplete(),
      lastDealtPlayerId: this.state.lastDealtPlayerId,
      deckRemaining: this.state.deck.length,
      activePlayerCount: this.getActivePlayers().length,
    };
  }
}

export { MIN_PLAYERS, MAX_PLAYERS, CARDS_PER_PLAYER };
