CREATE TABLE
  IF NOT EXISTS core.entities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    image_url VARCHAR(256),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS core.user_entities (
    user_id INT NOT NULL,
    entity_id INT NOT NULL,
    PRIMARY KEY (user_id, entity_id),
    CONSTRAINT fk_user_entities_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_entities_entity_id FOREIGN KEY (entity_id) REFERENCES entities (id) ON DELETE CASCADE
  );
