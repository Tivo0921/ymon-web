-- Create schedule table for time slot management
CREATE TABLE public.users_schedule (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6), -- 0=Sun, 1=Mon, ..., 6=Sat
  period INTEGER NOT NULL CHECK (period >= 1 AND period <= 7), -- 1-7 class periods
  subject TEXT,
  room TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, weekday, period)
);

CREATE INDEX idx_users_schedule_user_id ON public.users_schedule(user_id);
