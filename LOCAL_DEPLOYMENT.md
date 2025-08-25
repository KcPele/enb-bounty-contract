# Local Hardhat Deployment Guide

This guide walks you through deploying the ENBBounty contracts to your local Hardhat blockchain for development and testing.

## Quick Start

### 1. Start Local Hardhat Node

In a terminal window, start the Hardhat node:

```bash
npx hardhat node
```

This will start a local blockchain on `http://127.0.0.1:8545` with 20 pre-funded test accounts.

### 2. Deploy Contracts

You have two deployment options:

#### Option B: Full Deployment with Mock Tokens (Recommended)

```bash
npx hardhat run scripts/deploy-local-with-tokens.ts --network localhost
```

This deploys MockUSDC and MockENB tokens for testing token-based bounties.

## Deployed Contract Information

### With Mock Tokens (deploy-local-with-tokens.ts)

```
📍 Contract Addresses:
  ENBBountyNft: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
  ENBBounty: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
  MockUSDC: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
  MockENB: 0x0165878A594ca255338adfa4d48449f69242Eb8F

⚙️ Configuration:
  Treasury: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  Authority: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  Platform Fee: 2.5%
  Royalty Fee: 5%

💰 Token Distribution:
  Deployer: 1,000,000 USDC, 1,000,000 ENB
  Alice: 10,000 USDC, 10,000 ENB
  Bob: 10,000 USDC, 10,000 ENB

🎯 Supported Token Types:
  Type 0: ETH (native)
  Type 1: USDC (MockUSDC)
  Type 2: ENB (MockENB)
```

### Basic Deployment (deploy-local.ts)

```
Contract Addresses:
  ENBBountyNft: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  ENBBounty: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9

Configuration:
  Treasury: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  Authority: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  Platform Fee: 2.5%
  Royalty Fee: 5%
```

## Test Accounts

The local deployment uses Hardhat's test accounts:

- **Deployer**: Account #0 (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)
- **Treasury**: Account #1 (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`)
- **Authority**: Account #2 (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`)

Hardhat default account.

Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000 ETH)
Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

alice
Account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (10000 ETH)
Private Key: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

bob
Account #4: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (10000 ETH)
Private Key: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

All test accounts have 10,000 ETH for testing.

## Interacting with Contracts

### Using Hardhat Console

```bash
npx hardhat console --network localhost
```

#### Example: ETH Bounties

```javascript
// Get contract instances (use addresses from deployment output)
const ENBBounty = await ethers.getContractAt(
  'ENBBounty',
  '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
);

// Get signers
const [owner, treasury, authority, alice, bob] = await ethers.getSigners();

// Create a solo bounty with ETH
await ENBBounty.createSoloBounty(
  'Bug Fix',
  'Fix the critical bug',
  alice.address,
  1, // maxWinners
  { value: ethers.parseEther('1.0') },
);

// Create an open bounty with ETH
await ENBBounty.createOpenBounty(
  'Feature Development',
  'Build new feature',
  3, // maxWinners
  { value: ethers.parseEther('5.0') },
);
```

#### Example: Token Bounties (with mock tokens)

```javascript
// Get token contracts
const MockUSDC = await ethers.getContractAt(
  'MockUSDC',
  '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
);
const MockENB = await ethers.getContractAt(
  'MockENB',
  '0x0165878A594ca255338adfa4d48449f69242Eb8F',
);

// Approve and create USDC bounty
const usdcAmount = ethers.parseUnits('100', 6); // 100 USDC
await MockUSDC.approve(ENBBounty.target, usdcAmount);
await ENBBounty.createSoloBountyToken(
  'USDC Task',
  'Complete this for USDC',
  alice.address,
  1, // maxWinners
  usdcAmount,
  1, // token type 1 = USDC
);

// Approve and create ENB bounty
const enbAmount = ethers.parseEther('50'); // 50 ENB
await MockENB.approve(ENBBounty.target, enbAmount);
await ENBBounty.createOpenBountyToken(
  'ENB Task',
  'Complete this for ENB',
  2, // maxWinners
  enbAmount,
  2, // token type 2 = ENB
);

// Mint more tokens if needed
await MockUSDC.mint(alice.address, ethers.parseUnits('1000', 6));
await MockENB.mint(bob.address, ethers.parseEther('100'));
```

### Running Tests on Local Network

```bash
npx hardhat test --network localhost
```

### Creating Custom Scripts

Create a script in `scripts/` directory:

```javascript
import { ethers } from 'hardhat';

async function main() {
  const ENBBounty = await ethers.getContractAt(
    'ENBBounty',
    'YOUR_DEPLOYED_ADDRESS',
  );

  // Your interactions here
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Run it:

```bash
npx hardhat run scripts/your-script.ts --network localhost
```

## Resetting the Local Blockchain

To reset your local blockchain:

1. Stop the Hardhat node (Ctrl+C)
2. Start it again: `npx hardhat node`
3. Redeploy contracts: `npx hardhat run scripts/deploy-local.ts --network localhost`

## Troubleshooting

### Port Already in Use

If port 8545 is already in use:

```bash
# Find and kill the process using port 8545
lsof -i :8545
kill -9 <PID>
```

### Contract Not Found

If you get "contract not found" errors, make sure:

1. The Hardhat node is running
2. You've deployed the contracts
3. You're using the correct contract addresses from the deployment output

### Gas Estimation Errors

The local network has unlimited gas by default, but if you encounter issues:

- Check that your account has sufficient ETH
- Verify the transaction parameters are correct

## Advanced Configuration

### Custom Test Accounts

You can modify `scripts/deploy-local.ts` to use different accounts:

```javascript
const [deployer, treasury, authority, alice, bob] = await ethers.getSigners();
```

### Custom Fees

Edit the fee parameters in `scripts/deploy-local.ts`:

```javascript
const royaltyFee = 500; // 5% royalty
const platformFee = 25; // 2.5% platform fee
```

### Mock Tokens

The `deploy-local-with-tokens.ts` script automatically deploys mock tokens:

- **MockUSDC**: 6 decimals (like real USDC)
- **MockENB**: 18 decimals (standard ERC20)

Both tokens have a `mint()` function for testing:

```javascript
// Mint tokens for testing
const MockUSDC = await ethers.getContractAt('MockUSDC', usdcAddress);
const MockENB = await ethers.getContractAt('MockENB', enbAddress);

await MockUSDC.mint(userAddress, ethers.parseUnits('1000', 6)); // 1000 USDC
await MockENB.mint(userAddress, ethers.parseEther('1000')); // 1000 ENB
```

## Network Configuration

The local network is configured in `hardhat.config.ts`:

```typescript
localhost: {
  url: 'http://127.0.0.1:8545',
  chainId: 31337,
}
```

## Next Steps

1. **Testing**: Run the full test suite against your local deployment
2. **Development**: Build frontend or scripts to interact with the contracts
3. **Debugging**: Use Hardhat's console.log() in contracts for debugging
4. **Gas Profiling**: Use hardhat-gas-reporter to analyze gas usage

## Useful Commands

```bash
# Start local node
npx hardhat node

# Deploy contracts (basic - ETH only)
npx hardhat run scripts/deploy-local.ts --network localhost

# Deploy contracts with mock tokens (recommended)
npx hardhat run scripts/deploy-local-with-tokens.ts --network localhost

# Open console
npx hardhat console --network localhost

# Run tests
npx hardhat test --network localhost

# Compile contracts
npx hardhat compile
```

## Deployment Output

The deployment script saves contract addresses and configuration to `deployments/localhost.json` for easy reference in your dApp or scripts.
