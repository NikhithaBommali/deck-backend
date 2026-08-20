import { Server, Socket } from 'socket.io';
import { getProfileByUsername } from '../db/models';
import { roomManager } from '../rooms/roomManager';

interface PlayerSession {
  playerId: string;
  roomId: string;
}

const sessions = new Map<string, PlayerSession>();
const dealingIntervals = new Map<string, ReturnType<typeof setInterval>>();

function clearDealingInterval(roomId: string): void {
  const interval = dealingIntervals.get(roomId);
  if (interval) {
    clearInterval(interval);
    dealingIntervals.delete(roomId);
  }
}

function broadcastGameState(io: Server, roomId: string): void {
  const engine = roomManager.getRoom(roomId);
  if (!engine) return;

  const state = engine.getState();
  for (const player of state.players) {
    if (!player.isConnected || !player.socketId) continue;
    const clientState = engine.toClientState(player.id);
    if (clientState) {
      io.to(player.socketId).emit('gameState', clientState);
    }
  }
}

function detachSession(socket: Socket): PlayerSession | null {
  const session = sessions.get(socket.id);
  if (!session) return null;
  sessions.delete(socket.id);
  socket.leave(session.roomId);
  return session;
}

async function resolveProfilePicture(
  playerName: string,
  clientPicture?: string
): Promise<string> {
  if (clientPicture) return clientPicture;
  try {
    const profile = await getProfileByUsername(playerName);
    return profile?.profilePicture ?? '';
  } catch {
    return '';
  }
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on(
      'reconnectRoom',
      ({ playerId, roomCode }: { playerId: string; roomCode: string }, callback) => {
        const engine = roomManager.getRoomByCode(roomCode);
        if (!engine) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const player = engine.getPlayer(playerId);
        if (!player) {
          callback({ success: false, error: 'Player not found in room' });
          return;
        }

        const roomId = engine.getState().roomId;
        engine.reconnectPlayer(playerId, socket.id);
        roomManager.registerPlayer(playerId, roomId);
        sessions.set(socket.id, { playerId, roomId });
        socket.join(roomId);

        const code = roomManager.getRoomCode(roomId) ?? roomCode.toUpperCase();
        callback({ success: true, roomId, code, playerId });

        const clientState = engine.toClientState(playerId);
        if (clientState) socket.emit('gameState', clientState);
        broadcastGameState(io, roomId);
      }
    );

    socket.on(
      'createRoom',
      async ({ playerName, profilePicture: clientPicture }, callback) => {
        const profilePicture = await resolveProfilePicture(
          playerName,
          clientPicture
        );
        const tempHostId = `temp_${socket.id}`;
        const { roomId, code } = roomManager.createRoom(tempHostId);
        const engine = roomManager.getRoom(roomId)!;

        const player = engine.addPlayer(playerName, socket.id, profilePicture);
        if (!player) {
          callback({ success: false, error: 'Failed to create room' });
          return;
        }

        engine.getState().hostId = player.id;
        roomManager.registerPlayer(player.id, roomId);
        sessions.set(socket.id, { playerId: player.id, roomId });

        socket.join(roomId);
        callback({ success: true, roomId, code, playerId: player.id });

        const clientState = engine.toClientState(player.id);
        socket.emit('gameState', clientState);
      }
    );

    socket.on('peekRoom', ({ code }: { code: string }, callback) => {
      const engine = roomManager.getRoomByCode(code);
      if (!engine) {
        callback({
          success: true,
          exists: false,
          reason: 'NOT_FOUND',
        });
        return;
      }

      const state = engine.getState();
      const host = state.players.find((p) => p.id === state.hostId);
      const maxPlayers = 6;
      const isWaiting = state.phase === 'waiting';
      const hasSpace = state.players.length < maxPlayers;

      let reason: string | undefined;
      if (state.phase === 'finished') {
        reason = 'GAME_FINISHED';
      } else if (!isWaiting) {
        reason = 'GAME_IN_PROGRESS';
      } else if (!hasSpace) {
        reason = 'ROOM_FULL';
      }

      callback({
        success: true,
        exists: true,
        code: code.toUpperCase(),
        phase: state.phase,
        hostName: host?.name ?? 'Host',
        playerCount: state.players.length,
        maxPlayers,
        roundNumber: state.roundNumber,
        canJoin: isWaiting && hasSpace,
        reason,
      });
    });

    socket.on(
      'joinRoom',
      async ({ code, playerName, profilePicture: clientPicture }, callback) => {
        const engine = roomManager.getRoomByCode(code);
        if (!engine) {
          callback({
            success: false,
            error: 'Room not found',
            reason: 'NOT_FOUND',
          });
          return;
        }

        const state = engine.getState();
        if (state.phase !== 'waiting') {
          const phaseLabel =
            state.phase === 'finished'
              ? 'This game has already finished.'
              : `This game is already in progress${state.roundNumber > 0 ? ` (Round ${state.roundNumber})` : ''}. New players cannot join.`;
          callback({
            success: false,
            error: phaseLabel,
            reason:
              state.phase === 'finished' ? 'GAME_FINISHED' : 'GAME_IN_PROGRESS',
          });
          return;
        }

        if (state.players.length >= 6) {
          callback({
            success: false,
            error: 'This room is full (6/6 players).',
            reason: 'ROOM_FULL',
          });
          return;
        }

        const profilePicture = await resolveProfilePicture(
          playerName,
          clientPicture
        );
        const player = engine.addPlayer(playerName, socket.id, profilePicture);
        if (!player) {
          callback({
            success: false,
            error: 'Unable to join this room.',
            reason: 'JOIN_FAILED',
          });
          return;
        }

        const roomId = state.roomId;
        roomManager.registerPlayer(player.id, roomId);
        sessions.set(socket.id, { playerId: player.id, roomId });

        socket.join(roomId);
        callback({
          success: true,
          roomId,
          code: code.toUpperCase(),
          playerId: player.id,
        });

        broadcastGameState(io, roomId);
      }
    );

    socket.on('leaveRoom', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (engine) {
        clearDealingInterval(session.roomId);
        engine.leavePlayer(session.playerId);
        roomManager.unregisterPlayer(session.playerId);

        const remaining = engine.getState().players.length;
        if (remaining === 0) {
          roomManager.removeRoom(session.roomId);
        } else {
          broadcastGameState(io, session.roomId);
        }
      }

      detachSession(socket);
      callback({ success: true });
    });

    socket.on('updateProfilePicture', async ({ profilePicture }, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      engine.updatePlayerProfile(session.playerId, profilePicture ?? '');
      callback({ success: true });
      broadcastGameState(io, session.roomId);
    });

    socket.on('setReady', ({ ready }, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      engine.setReady(session.playerId, ready);
      callback({ success: true });
      broadcastGameState(io, session.roomId);
    });

    socket.on('startGame', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      const state = engine.getState();
      if (state.hostId !== session.playerId) {
        callback({ success: false, error: 'Only host can start' });
        return;
      }

      if (!engine.startGame()) {
        callback({ success: false, error: 'Cannot start game' });
        return;
      }

      callback({ success: true });
      broadcastGameState(io, session.roomId);
    });

    socket.on('startDealing', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      const state = engine.getState();
      if (state.hostId !== session.playerId) {
        callback({ success: false, error: 'Only host can deal cards' });
        return;
      }

      if (state.phase !== 'dealing') {
        callback({ success: false, error: 'Not in dealing phase' });
        return;
      }

      if (state.dealingStep > 0) {
        callback({ success: false, error: 'Dealing already started' });
        return;
      }

      if (dealingIntervals.has(session.roomId)) {
        callback({ success: false, error: 'Dealing in progress' });
        return;
      }

      callback({ success: true });

      const interval = setInterval(() => {
        const roomEngine = roomManager.getRoom(session.roomId);
        if (!roomEngine) {
          clearDealingInterval(session.roomId);
          return;
        }

        const dealt = roomEngine.dealNextCard();
        broadcastGameState(io, session.roomId);

        if (!dealt || roomEngine.isDealingComplete()) {
          clearDealingInterval(session.roomId);
        }
      }, 520);

      dealingIntervals.set(session.roomId, interval);
    });

    socket.on('distributeCards', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      if (!engine.distributeCards(session.playerId)) {
        callback({
          success: false,
          error: 'Deal all cards first, then host can start the round',
        });
        return;
      }

      clearDealingInterval(session.roomId);

      callback({ success: true });
      broadcastGameState(io, session.roomId);
    });

    socket.on('drawFromDeck', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      const card = engine.drawFromDeck(session.playerId);
      callback({ success: !!card, card });
      broadcastGameState(io, session.roomId);
    });

    socket.on('placeCard', ({ cardIds }, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      const ids = Array.isArray(cardIds) ? cardIds : [cardIds];
      const success = engine.placeCards(session.playerId, ids);
      callback({ success });
      broadcastGameState(io, session.roomId);
    });

    socket.on('pickFromDiscard', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      const card = engine.pickFromDiscard(session.playerId);
      callback({ success: !!card, card });
      broadcastGameState(io, session.roomId);
    });

    socket.on('show', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      const result = engine.show(session.playerId);
      callback(result);
      broadcastGameState(io, session.roomId);
    });

    socket.on('nextRound', (_, callback) => {
      const session = sessions.get(socket.id);
      if (!session) {
        callback({ success: false });
        return;
      }

      const engine = roomManager.getRoom(session.roomId);
      if (!engine) {
        callback({ success: false });
        return;
      }

      const state = engine.getState();
      if (state.hostId !== session.playerId) {
        callback({ success: false, error: 'Only host can start next round' });
        return;
      }

      const success = engine.nextRound(session.playerId);
      callback({ success });
      broadcastGameState(io, session.roomId);
    });

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      if (!session) return;

      const engine = roomManager.getRoom(session.roomId);
      if (engine) {
        engine.disconnectPlayer(session.playerId);
        broadcastGameState(io, session.roomId);
      }

      sessions.delete(socket.id);
      console.log(`Client disconnected (session preserved): ${socket.id}`);
    });
  });
}
