import mongoose from 'mongoose';

const UserProfileSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    profilePicture: { type: String, default: '' },
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model('UserProfile', UserProfileSchema);

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/deck-score';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

export async function getProfileByUsername(username: string) {
  return UserProfile.findOne({ username: username.toLowerCase().trim() });
}

export async function upsertProfile(
  username: string,
  displayName: string,
  profilePicture?: string
) {
  const normalized = username.toLowerCase().trim();
  const update: Record<string, string> = {
    displayName: displayName.trim(),
  };
  if (profilePicture !== undefined) {
    update.profilePicture = profilePicture;
  }
  return UserProfile.findOneAndUpdate(
    { username: normalized },
    { username: normalized, ...update },
    { upsert: true, new: true }
  );
}
