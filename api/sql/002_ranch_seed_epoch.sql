-- Placeholder ranch was stamped with NOW() at migrate time, so last-write-wins
-- ignored older (but real) PWA ranch name/year. Reset only the unused seed.
UPDATE ranch
SET updated_at = '1970-01-01T00:00:00Z'
WHERE id = 1
  AND ranch_name = 'Record Book';
