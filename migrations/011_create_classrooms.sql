-- Create classrooms table for per-classroom location tracking
CREATE TABLE public.classrooms (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g., "A101", "B205"
  name TEXT NOT NULL,
  building TEXT NOT NULL, -- e.g., "理工学部講義棟A"
  latitude DECIMAL(10, 7), -- GPS latitude
  longitude DECIMAL(10, 7), -- GPS longitude
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_classrooms_code ON public.classrooms(code);
CREATE INDEX idx_classrooms_building ON public.classrooms(building);
