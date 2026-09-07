-- Rebuild bb_token_holders from bb_token_transfers (the deduped source of truth) and refresh the
-- per-launch holders counters. Idempotent; safe to run any time (a few thousand rows).
-- Usage: fly ssh console -a basebid-db -C "sh -c 'PGPASSWORD=$OPERATOR_PASSWORD psql -h localhost -p 5433 -U postgres -d basebid -f /tmp/rebuild-holders.sql'"
BEGIN;
-- serialize against the indexer: transfers cannot be ingested while balances are recomputed
LOCK TABLE bb_token_transfers IN SHARE MODE;
LOCK TABLE bb_token_holders IN EXCLUSIVE MODE;
LOCK TABLE bb_launches IN EXCLUSIVE MODE;
WITH legs AS (
  SELECT chain_id, token, from_addr AS holder, -value AS d, block_number FROM bb_token_transfers WHERE from_addr <> '0x0000000000000000000000000000000000000000'
  UNION ALL
  SELECT chain_id, token, to_addr, value, block_number FROM bb_token_transfers WHERE to_addr <> '0x0000000000000000000000000000000000000000'
), agg AS (
  SELECT chain_id, token, holder, sum(d) AS balance, min(block_number) AS first_block, max(block_number) AS last_block FROM legs GROUP BY 1, 2, 3
)
INSERT INTO bb_token_holders (chain_id, token, holder, balance, first_block, last_block)
SELECT chain_id, token, holder, balance, first_block, last_block FROM agg
ON CONFLICT (chain_id, token, holder) DO UPDATE
  SET balance = EXCLUDED.balance, first_block = LEAST(bb_token_holders.first_block, EXCLUDED.first_block), last_block = GREATEST(bb_token_holders.last_block, EXCLUDED.last_block);
-- rows with no transfer legs left (should not exist) → zero them rather than delete, keeps history
UPDATE bb_token_holders h SET balance = 0
 WHERE NOT EXISTS (SELECT 1 FROM bb_token_transfers t WHERE t.chain_id = h.chain_id AND t.token = h.token AND (t.from_addr = h.holder OR t.to_addr = h.holder));
-- holders counter: wallets with balance > 0, excluding protocol + burn addresses on either chain
UPDATE bb_launches l SET holders = COALESCE(c.n, 0)
  FROM (SELECT l2.chain_id, l2.token,
               (SELECT count(*) FROM bb_token_holders h WHERE h.chain_id = l2.chain_id AND h.token = l2.token AND h.balance > 0
                  AND h.holder NOT IN ('0x0000000000000000000000000000000000000000',
                                       '0x000000000000000000000000000000000000dead',
                                       '0x000000000022d473030f116ddee9f6b43ac78ba3',
                                       '0x498581ff718922c3f8e6a244956af099b2652b2b',
                                       '0x58daec3116aae6d93017baaea7749052e8a04fa7',
                                       '0x6ff5693b99212da76ad316178a184ab56d299b43',
                                       '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
                                       '0x815542e8b392389a1389e22e588e4b62a67ade72',
                                       '0x8366a39cc670b4001a1121b8f6a443a643e40951',
                                       '0x8876789976decbfcbbbe364623c63652db8c0904',
                                       '0xcd1680d26922fcd9cabfbb8a56ba40c333fd842a')) AS n
          FROM bb_launches l2) c
 WHERE l.chain_id = c.chain_id AND l.token = c.token;
COMMIT;
-- check: every launch's balances + burns to zero must equal its supply
WITH sums AS (SELECT chain_id, token, sum(balance) held FROM bb_token_holders GROUP BY 1, 2),
     burned AS (SELECT chain_id, token, COALESCE(sum(value), 0) b FROM bb_token_transfers WHERE to_addr = '0x0000000000000000000000000000000000000000' GROUP BY 1, 2)
SELECT count(*) FILTER (WHERE l.supply = s.held + COALESCE(b.b, 0)) AS ok, count(*) FILTER (WHERE l.supply <> s.held + COALESCE(b.b, 0)) AS mismatch
  FROM bb_launches l LEFT JOIN sums s ON s.chain_id = l.chain_id AND s.token = l.token LEFT JOIN burned b ON b.chain_id = l.chain_id AND b.token = l.token;
