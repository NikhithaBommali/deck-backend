import { Router } from 'express';
import { getProfileByUsername, upsertProfile } from '../db/models';

const MAX_IMAGE_LENGTH = 500_000;

export const profileRouter = Router();

profileRouter.get('/:username', async (req, res) => {
  try {
    const profile = await getProfileByUsername(req.params.username);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({
      username: profile.username,
      displayName: profile.displayName,
      profilePicture: profile.profilePicture,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

profileRouter.post('/', async (req, res) => {
  try {
    const { username, displayName, profilePicture } = req.body as {
      username?: string;
      displayName?: string;
      profilePicture?: string;
    };

    if (!username?.trim() || !displayName?.trim()) {
      res.status(400).json({ error: 'username and displayName are required' });
      return;
    }

    if (profilePicture && profilePicture.length > MAX_IMAGE_LENGTH) {
      res.status(400).json({ error: 'Profile picture too large (max ~500KB)' });
      return;
    }

    const profile = await upsertProfile(username, displayName, profilePicture);
    res.json({
      username: profile.username,
      displayName: profile.displayName,
      profilePicture: profile.profilePicture,
    });
  } catch {
    res.status(500).json({ error: 'Failed to save profile' });
  }
});
