-- facility_map.sql
-- Defines a facilities table used to map UI facility entries to HL7 field values.

CREATE TABLE IF NOT EXISTS facilities (
    id serial PRIMARY KEY,
    name text NOT NULL,
    code text NOT NULL,
    sending_id text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (code)
);

-- Seed values mirroring the UI defaults.
INSERT INTO facilities (name, code, sending_id)
VALUES
    ('Seattle Grace Hospital', 'SGH', 'SPAAPP'),
    ('St. Eligius Elsewhare', 'SEL', 'SPAAPP'),
    ('Princeton Plainsboro House', 'PPH', 'SPAAPP')
ON CONFLICT (code) DO NOTHING;
