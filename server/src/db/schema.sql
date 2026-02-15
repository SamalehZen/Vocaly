-- Supabase PostgreSQL Schema for ito-speech-to-text
-- Run this in Supabase SQL Editor

-- 1. notes
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  interaction_id TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. interactions
CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  asr_output JSONB,
  llm_output JSONB,
  raw_audio BYTEA,
  raw_audio_id TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. dictionary_items
CREATE TABLE IF NOT EXISTS dictionary_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,
  pronunciation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 4. llm_settings
CREATE TABLE IF NOT EXISTS llm_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  asr_model TEXT,
  asr_provider TEXT,
  asr_prompt TEXT,
  llm_provider TEXT,
  llm_model TEXT,
  llm_temperature REAL,
  transcription_prompt TEXT,
  editing_prompt TEXT,
  no_speech_threshold REAL,
  low_quality_threshold REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. user_trials
CREATE TABLE IF NOT EXISTS user_trials (
  user_id TEXT PRIMARY KEY,
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,
  has_completed_trial BOOLEAN DEFAULT FALSE,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. user_subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_start_at TIMESTAMPTZ,
  subscription_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ip_link_candidates
CREATE TABLE IF NOT EXISTS ip_link_candidates (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_dictionary_items_user_id ON dictionary_items(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_link_user ON ip_link_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_link_ip ON ip_link_candidates(ip_hash);
