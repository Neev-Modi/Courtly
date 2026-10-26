CREATE TABLE courtly_mail_deliveries (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES courtly_events(id),
  recipient_id UUID NOT NULL REFERENCES auth_users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, recipient_id)
);
CREATE INDEX courtly_mail_pending ON courtly_mail_deliveries(next_attempt_at) WHERE status='pending';
