import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDatabase } from './db/models';
import { profileRouter } from './routes/profile';
import { setupSocketHandlers } from './socket/handlers';

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  CLIENT_URL,
].filter(Boolean);

const app = express();
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', game: 'Deck Score' });
});

app.use('/api/profile', profileRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

setupSocketHandlers(io);

async function start() {
  try {
    await connectDatabase();
  } catch (err) {
    console.warn('MongoDB unavailable — profiles disabled:', (err as Error).message);
  }

  httpServer.listen(PORT, () => {
    console.log(`Deck game server running on http://localhost:${PORT}`);
  });
}

start();
