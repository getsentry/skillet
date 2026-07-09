CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  total_cents INTEGER
);
