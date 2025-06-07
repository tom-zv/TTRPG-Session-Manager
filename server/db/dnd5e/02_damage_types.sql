CREATE TABLE
    IF NOT EXISTS dnd5e.damage_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        category ENUM ('physical', 'elemental', 'magical', 'other') DEFAULT 'other',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );