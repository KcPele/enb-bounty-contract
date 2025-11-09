# ENB Bounty Contracts

Smart contracts that power the Everybody Needs Base bounty marketplace. This package bundles the Solidity sources, deployment scripts, and Hardhat-based test suites that secure the on-chain bounty, claim, and reward flows.

## Contents

| Path | Description |
| --- | --- |
| `contracts/ENBBounty.sol` | Main entry point that manages bounty lifecycle, claim acceptance, voting, payouts, and token integrations. |
| `contracts/ENBBountyNft.sol` | Minimal ERC‑721 used to mint claim receipts/NFTs. |
| `contracts/libraries/` | Storage, management, and voting libraries (`BountyStorageLib`, `ClaimManagementLib`, `TokenManagementLib`, etc.). |
| `contracts/interfaces/` | External interfaces (currently only the NFT contract). |
| `scripts/` | Deployment helpers for localhost, testnets, and token-rich dev environments. |
| `test/` | Gas, security, integration, and scenario suites (Hardhat + ethers v6). |
| `deployments/` | JSON artifacts with addresses from local deployments. |

## Architecture Overview

- **Bounty Types**: Supports solo (issuer-funded) and open (multi-participant) ETH bounties plus ERC‑20 token bounties via `TokenManagementLib`.
- **Claims**: Contributors submit work with metadata + URI. Claims mint an NFT to the contract, later transferred to the issuer when accepted.
- **Acceptance Paths**:
  - `acceptClaim(bountyId, claimId)` for single selections.
  - `acceptClaims(bountyId, claimIds[])` for batch approval (up to 10, enforced on-chain via `ClaimManagementLib.MAX_BATCH_ACCEPT`).
  - Open bounties use `submitClaimForVote` + voting logic in `VotingLib`.
- **Payouts & Fees**: Rewards split evenly between `maxWinners`, minus a 2.5% treasury fee; library functions handle ETH/ERC‑20 safe transfers.
- **Storage Model**: `BountyStorageLib` keeps canonical state (bounties, claims, participants, winners) and exposes getter helpers consumed by the main contract.

## Getting Started

### Prerequisites

- Node.js ≥ 18.17 (Hardhat officially supports 18/20; v22 works but prints a warning).
- pnpm ≥ 9.x

### Install Dependencies

```bash
pnpm install
```

### Environment Variables

Copy `.env.example` → `.env` and populate values as needed. Local development typically only needs the defaults, but deployment scripts can read RPC URLs or private keys from this file.

## Local Development Workflow

1. **Start a Hardhat node**
   ```bash
   pnpm hardhat node
   ```
2. **Deploy contracts with mock tokens (recommended)**
   ```bash
   pnpm hardhat run scripts/deploy-local-with-tokens.ts --network localhost
   ```
   Outputs contract addresses and writes them to `deployments/localhost.json`.
3. **Interact via console**
   ```bash
   pnpm hardhat console --network localhost
   ```
4. **Run targeted tests against your node**
   ```bash
   pnpm test -- test/integration/BatchAccept.test.ts --network localhost
   ```
   Omit `--network localhost` to use Hardhat’s in-process network.

## Testing

| Command | Description |
| --- | --- |
| `pnpm test` | Runs the entire suite (gas, integration, security). |
| `pnpm test -- test/integration/BatchAccept.test.ts` | Validates the new multi-claim acceptance flow. |
| `REPORT_GAS=true pnpm test` | Enables gas reporting (see Hardhat config). |

> **Tip:** Tests expect the constructor to whitelist two ERC‑20 tokens. When running against a clean in-process network this happens automatically. If you deploy manually with different params, adjust tests or the setup accordingly.

## Deployment Scripts

| Script | Purpose |
| --- | --- |
| `scripts/deploy-local.ts` | Minimal ETH-only deployment. |
| `scripts/deploy-local-with-tokens.ts` | Deploys MockUSDC + MockENB, configures treasury/authority, distributes balances (best for feature dev). |
| `scripts/deploy.ts` | Example template for live networks (customize with your signer + RPC). |

Run with:

```bash
pnpm hardhat run scripts/deploy-local-with-tokens.ts --network <network>
```

## Auditing Notes

- **Access Control**: `addSupportedToken`/`removeSupportedToken` guarded by treasury-only modifier; treasury address is immutable after deployment. Verify actual treasury control on production deployments.
- **Batch Acceptance**: `acceptClaims` enforces max 10 selections, rejects duplicates, cross-bounty claim IDs, and ensures winner slots remain. Review the limit (`ClaimManagementLib.MAX_BATCH_ACCEPT`) before adjusting the UI.
- **Payout Math**: Each acceptance computes `payoutPerWinner = bounty.amount / maxWinners`. Any remainder stays in the bounty pool; auditors should confirm this economic choice is intentional.
- **Open Bounties**: Issuers cannot bypass voting once multiple participants have funded the bounty; `NotSoloBounty` enforces this invariant. Review `VotingLib` time windows and quorum for protocol requirements.
- **Token Transfers**: Uses OpenZeppelin `SafeERC20`. ERC‑777 style hooks are not implemented; if supporting tokens with callbacks, consider reentrancy implications. Reentrancy tests live under `test/security/Reentrancy.test.ts`.
- **Upgradability**: Contracts are not upgradeable. Any changes require redeploying and migrating data via the indexer/off-chain systems.

## Useful Hardhat Tasks

```bash
pnpm hardhat compile                # Build all contracts
pnpm hardhat test                   # Run tests
pnpm hardhat node                   # Local chain
pnpm hardhat console --network localhost
pnpm hardhat verify --network <net> <address> <ctor-args...>
```

## Need Help?

- Review `LOCAL_DEPLOYMENT.md` for detailed walkthroughs.
- Ping the ENB core team or open an issue in the main repository for contract-related questions.
