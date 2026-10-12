# Contributing

Thanks for looking. openlaunch is small on purpose: three contracts, one site, no platform fee. Changes that
keep it that way are welcome.

## Ground rules

- **No fee, no owner, no admin.** Pull requests that add a fee switch, an owner, a pause, an allowlist or an
  upgrade path to the contracts will not be merged. That is the product.
- **Facts over scores.** UI that ranks or flags tokens must be derived from on-chain data the reader can verify
  (see the holders panel and the trending strip for the pattern).
- **Tests with the change.** Pure logic lives in `app/src/lib/launchpad/*.ts` and is unit-tested with
  `node --test`; contracts are tested with Foundry. CI runs both on every pull request.

## Setup

```
git clone --recurse-submodules https://github.com/Twigpine/openlaunch.git
cd openlaunch/app && npm install && cp .env.example .env.local   # fill in RPCs + DATABASE_URL
npm run migrate && npm run dev
cd ../contracts && forge test --match-path test/LaunchFactory.t.sol
```

`app/README.md` covers running against anvil forks of the chains. `app/LAUNCH.md` is the production runbook.

## Before you open a pull request

```
cd app && npm run lint && npx tsc --noEmit -p . && npm test && npm run build
cd ../contracts && script/check-deployed-sources.sh && forge build && forge test --match-path test/LaunchFactory.t.sol
```

For contract changes, also run the live-fork suites locally (`FORK_TESTS=true forge test`) and say so in the PR.

## The pull request guard

Every pull request into `main` also runs `pr-guard` (`.github/workflows/pr-guard.yml`). It reads the diff and never runs
your code. It has two answers besides "passed":

- **Blocked.** Refused for everyone, maintainers included. The name in front of each point is the one the check prints.
  - `contract-locked`: a change to any file listed in `contracts/deployed.lock` (the deployed contract sources, their
    build settings, the pinned libraries and the deployment records), to the lock itself, to the scripts that check it
    (`contracts/script/check-deployed-sources.sh`, `contracts/script/check-arc-factory.sh`), to `.gitmodules`, or
    anything added under `contracts/lib/`.
  - `ci-config`: anything under `.github/`, or a `CODEOWNERS` file.
  - `dev-machine`: editor, agent or git hook configuration (`.vscode/`, `.claude/`, `AGENTS.md`, `.envrc` and the like).
  - `registry-config`: package manager configuration (`.npmrc` and the like).
  - `secret-file`, `secret`: a key, wallet or `.env` file, or a credential anywhere in the diff.
  - `submodule`, `symlink`: a submodule added, removed or re-pinned; a symbolic link.
  - `hidden-unicode`, `odd-path`: invisible or direction-changing Unicode in a file, or in a file's name.
  - `binary`: a binary file that is not a real image or font. Audio, video and PDF files are in the next list.
  - `svg-active`: an SVG with script or an event handler in it.
  - `dependency-source`, `lockfile`, `install-script`: a dependency or lockfile entry that does not come from the npm
    registry (git, a URL, a local path, an alias), a `package.json` or lockfile the guard cannot read in full, a new
    script that runs at install time.
  - `case-collision`: a file name that differs from an existing one only by letter case.
- **Needs a maintainer's approval.** Allowed, and listed for a maintainer to read. The check turns green when a
  maintainer approves the exact commit. A new push needs a new approval.
  - `contracts`, `contract-rules`: new files under `contracts/`; an owner, a pause, an allowlist, an upgrade path or a
    fee switch in a contract (see the ground rules above).
  - `dependencies`: dependency and npm script changes, a deleted `package.json` or lockfile included.
  - `address`, `wallet-call`: on-chain addresses; code that asks a wallet to sign, approve or send.
  - `new-host`, `new-env`: a host or an environment variable the repository has not used before.
  - `dangerous-code`: code that executes strings, injects raw HTML or starts a process.
  - `auth-removed`: a signature, nonce, rate-limit or validation check that was removed.
  - `security-config`: security headers, the request proxy, and files the site serves as they are (anything in
    `app/public/` that is not a plain image, font or text file, and every SVG).
  - `build-deploy`: build, deploy and migration files, shell scripts, a file made executable.
  - `policy`, `git-config`: the license and the security policy; `.gitattributes`.
  - `media`, `opaque`, `unscanned`: audio, video and PDF files; content that cannot be read by eye (very long lines,
    encoded blobs); anything the guard could not read.

The reason for each rule is in the `RULES` table at the top of `.github/scripts/pr-guard.mjs`. A test keeps the two
lists above and that table the same.

Deployed contracts are never edited. A change for another chain is a new file that copies the original, with its own
tests (`contracts/src/LaunchFactoryArc.sol` is the pattern).

To stay out of both lists, leave `.github/` and the lockfile alone unless the change needs them, write an invisible
character as an escape sequence, and keep unrelated changes in separate pull requests. You can run the guard on your
branch before you push:

```
node .github/scripts/pr-guard.mjs --base origin/main --head HEAD
```

### For maintainers

- The owners are `OWNERS` in `.github/scripts/pr-guard.mjs`, mirrored in `.github/CODEOWNERS`.
- To release a pull request the guard is holding: read the job summary, approve the head commit with a pull request
  review, then re-run the `pr-guard` job.
- The check is a snapshot of the reviews at the moment it ran, and a review does not start it again. If you take an
  approval back (dismiss it, or request changes), re-run the job as well: until then the earlier pass stays on that
  commit. The reason is in the header of `.github/workflows/pr-guard.yml`.
- On an owner's own pull request the sensitive changes are notices, as long as an owner pushed the head commit. If
  someone else pushed it (also when the pull request was opened or reopened after their push), the check waits like
  anyone's. GitHub does not let an author approve their own pull request, so read the changes and push the next commit
  yourself, or have another owner approve.
- A blocked pull request that should merge anyway (a CI change, a new entry in `contracts/deployed.lock`) is merged by
  an admin with the branch rule bypass, after reading it.
- The guard protects `main` only while `pr-guard` is a required status check in the branch rules.

## Style

- TypeScript strict, ESLint clean, no new dependencies without a reason in the PR.
- Commit messages: short imperative subject, a body that says *why*.
- Keep the design system: shared class tokens live in `app/src/components/ui.ts`.

## Security issues

Do not open a public issue. See [`SECURITY.md`](SECURITY.md).
