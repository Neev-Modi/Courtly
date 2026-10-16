CREATE TABLE IF NOT EXISTS courtly_courts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  location TEXT NOT NULL CHECK (length(location) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS courtly_court_name ON courtly_courts(lower(name));
CREATE TABLE IF NOT EXISTS courtly_blocks (
  id UUID PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES courtly_courts(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS courtly_blocks_court_time ON courtly_blocks(court_id,start_time,end_time);
CREATE TABLE IF NOT EXISTS courtly_bookings (
  id UUID PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES courtly_courts(id),
  creator_id UUID NOT NULL REFERENCES auth_users(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  confirmation_deadline TIMESTAMPTZ NOT NULL,
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES auth_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS courtly_bookings_court_time ON courtly_bookings(court_id,start_time,end_time);
CREATE TABLE IF NOT EXISTS courtly_booking_players (
  booking_id UUID NOT NULL REFERENCES courtly_bookings(id),
  user_id UUID NOT NULL REFERENCES auth_users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','declined')),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY(booking_id,user_id)
);
CREATE INDEX IF NOT EXISTS courtly_booking_player_user ON courtly_booking_players(user_id);
CREATE TABLE IF NOT EXISTS courtly_events (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS courtly_events_unprocessed ON courtly_events(created_at) WHERE processed_at IS NULL;
