CREATE TABLE
    IF NOT EXISTS dnd5e.damage_types (
        name VARCHAR(64) PRIMARY KEY,
        category ENUM ('physical', 'elemental', 'magical', 'other') DEFAULT 'other',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );