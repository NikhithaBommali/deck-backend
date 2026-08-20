import { GameEngine } from '../game/gameEngine';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

class RoomManager {
  private rooms: Map<string, GameEngine> = new Map();
  private codeToRoomId: Map<string, string> = new Map();
  private playerToRoom: Map<string, string> = new Map();

  createRoom(hostId: string): { roomId: string; code: string } {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let code = generateRoomCode();
    while (this.codeToRoomId.has(code)) {
      code = generateRoomCode();
    }

    const engine = new GameEngine(roomId, hostId);
    this.rooms.set(roomId, engine);
    this.codeToRoomId.set(code, roomId);

    return { roomId, code };
  }

  getRoomByCode(code: string): GameEngine | null {
    const roomId = this.codeToRoomId.get(code.toUpperCase());
    if (!roomId) return null;
    return this.rooms.get(roomId) ?? null;
  }

  getRoom(roomId: string): GameEngine | null {
    return this.rooms.get(roomId) ?? null;
  }

  registerPlayer(playerId: string, roomId: string): void {
    this.playerToRoom.set(playerId, roomId);
  }

  getPlayerRoom(playerId: string): string | null {
    return this.playerToRoom.get(playerId) ?? null;
  }

  unregisterPlayer(playerId: string): void {
    this.playerToRoom.delete(playerId);
  }

  removeRoom(roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (!engine) return;

    for (const player of engine.getState().players) {
      this.playerToRoom.delete(player.id);
    }

    this.rooms.delete(roomId);
    for (const [code, id] of this.codeToRoomId.entries()) {
      if (id === roomId) {
        this.codeToRoomId.delete(code);
        break;
      }
    }
  }

  getRoomCode(roomId: string): string | null {
    for (const [code, id] of this.codeToRoomId.entries()) {
      if (id === roomId) return code;
    }
    return null;
  }
}

export const roomManager = new RoomManager();
