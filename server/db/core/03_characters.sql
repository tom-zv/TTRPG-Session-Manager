CREATE TABLE
  IF NOT EXISTS core.characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    image_path VARCHAR(256),
    image_url VARCHAR(256),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS core.user_characters (
    user_id INT NOT NULL,
    character_id INT NOT NULL,
    PRIMARY KEY (user_id, character_id),
    CONSTRAINT fk_user_characters_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_characters_character_id FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
  );
