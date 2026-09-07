# Security policy

## Reporting a vulnerability

Please report privately, not in a public issue:

- **GitHub private vulnerability reporting** (preferred): open the repository's *Security* tab → *Report a
  vulnerability*. Only maintainers can see the report.
- If that is unavailable, email **security@gitlawb.com**.

You will get an acknowledgement within 3 days and a status update within 14. Please give us reasonable time
to ship a fix before disclosing publicly; we will credit you in the release notes unless you prefer otherwise.

## Scope

- Contracts in `contracts/src` as deployed at the addresses listed in the README (Base and Robinhood Chain).
- The site and APIs at https://openlaunch.lol (`app/`).

Out of scope: third-party contracts we integrate with (Uniswap v4, Permit2, tokenized-stock issuers, wallets),
denial-of-service against public RPC endpoints, and findings that require a compromised user device.

## What we care about most

1. Anything that lets liquidity leave the locker, or lets a fee go anywhere but the recipients fixed at launch.
2. Anything that lets one wallet write or edit metadata, posts or images on behalf of another.
3. Anything that lets the site display balances, holders, prices or volumes that do not match the chain.

## Design notes for researchers

- The contracts have no owner, no admin, no pause and no upgrade path. There is no privileged key to steal.
- Every off-chain write is authorized by a wallet signature with a single-use nonce and a time window.
- Uploaded images are re-encoded server-side; the share-card renderer never fetches user-supplied URLs.
- Tokenized stocks are recognized only from their issuers' registries, never from on-chain names.
