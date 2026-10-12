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

- **Blocked.** Refused for everyone, maintainers included: a change to any file listed in `contracts/deployed.lock`
  (the deployed contract sources, their build settings, the pinned libraries and the deployment records), anything under
  `.github/`, a dependency or lockfile entry that does not come from the npm registry (git, a URL, a local path, an
  alias), a new install-time script, package manager configuration (`.npmrc` and the like), a committed key or `.env`
  file, invisible or direction-changing Unicode in a file or in its name, symlinks, new submodules, a binary file that
  is not a real image or font (audio, video and PDF files are allowed, and go to a maintainer: see the next point), an
  SVG with script or an event handler in it, a file name that differs from an existing one only by letter case, and
  editor or agent configuration (`.vscode/`, `.claude/`, `AGENTS.md`, `.envrc` and the like).
- **Needs a maintainer's approval.** Allowed, and listed for a maintainer to read: new files under `contracts/`,
  dependency and npm script changes (a deleted `package.json` or lockfile included), on-chain addresses, wallet calls,
  new hosts and environment variables, a signature, nonce or rate-limit check that was removed, security headers, files
  the site serves as they are (anything in `app/public/` that is not a plain image, font or text file, and every SVG),
  audio, video and PDF files, build and deploy files, migrations, the license and the security policy, code that
  executes strings or injects raw HTML, and content that cannot be read by eye (very long lines, encoded blobs). The
  check turns green when a maintainer approves the exact commit. A new push needs a new approval.

Every rule, with the reason for it, is in the `RULES` table at the top of `.github/scripts/pr-guard.mjs`.

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
