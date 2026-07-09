-- add status colum to orders
ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending';
