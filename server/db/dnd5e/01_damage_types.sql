CREATE TABLE
    IF NOT EXISTS dnd5e.damage_types (
        name VARCHAR(64) PRIMARY KEY,
        category ENUM ('physical', 'elemental', 'magical', 'other') DEFAULT 'other',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Standard 5e damage types
INSERT IGNORE INTO dnd5e.damage_types (name, category) VALUES
    ('acid',        'elemental'),
    ('bludgeoning', 'physical'),
    ('cold',        'elemental'),
    ('fire',        'elemental'),
    ('force',       'magical'),
    ('lightning',   'elemental'),
    ('necrotic',    'magical'),
    ('piercing',    'physical'),
    ('poison',      'elemental'),
    ('psychic',     'magical'),
    ('radiant',     'magical'),
    ('slashing',    'physical'),
    ('thunder',     'elemental');