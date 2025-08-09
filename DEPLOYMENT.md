# ENBBounty Deployment Guide

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
   - RPC URLs for your target network
   - Private key for deployment
   - Treasury and Authority addresses
   - Token addresses (USDC, ENB) if applicable
   - Fee configurations

## Deployment Steps

### 1. Compile Contracts
```bash
npx hardhat compile
```

### 2. Run Tests
```bash
npm test
```

### 3. Check Test Coverage
```bash
npx hardhat coverage
```

### 4. Deploy to Network

#### Local Network (Hardhat)
```bash
npx hardhat run scripts/deploy.ts --network localhost
```

#### Testnet (Sepolia)
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

#### Testnet (Base Sepolia)
```bash
npx hardhat run scripts/deploy.ts --network base-sepolia
```

#### Mainnet (Ethereum)
```bash
npx hardhat run scripts/deploy.ts --network mainnet
```

#### Mainnet (Base)
```bash
npx hardhat run scripts/deploy.ts --network base
```

## Contract Verification

After deployment, verify your contracts on Etherscan/Basescan:

1. Update your `.env` file with the deployed contract addresses:
   - `ENB_BOUNTY_NFT_ADDRESS`
   - `ENB_BOUNTY_ADDRESS`

2. Run the verification script:

#### For Ethereum networks (Mainnet/Sepolia):
```bash
npx hardhat run scripts/verify.ts --network [mainnet|sepolia]
```

#### For Base networks (Base/Base Sepolia):
```bash
npx hardhat run scripts/verify.ts --network [base|base-sepolia]
```

## Constructor Parameters

### ENBBountyNft Constructor
1. `_treasury`: Address to receive royalties
2. `_ENBBountyAuthority`: Address with authority to manage the NFT contract
3. `_feeNumerator`: Royalty fee numerator (e.g., 500 for 5% royalty)

### ENBBounty Constructor
1. `_ENBBountyNft`: Address of the deployed ENBBountyNft contract
2. `_treasury`: Address to receive platform fees
3. `_platformFee`: Platform fee in basis points (e.g., 25 for 2.5%)
4. `_usdcAddress`: Address of USDC token (or 0x0 if not using)
5. `_enbAddress`: Address of ENB token (or 0x0 if not using)

## Important Notes

### Fee Configuration
- **Platform Fee**: Set in the ENBBounty constructor (e.g., 25 = 2.5%)
- **Royalty Fee**: Set in the ENBBountyNft constructor (e.g., 500 = 5%)

### Post-Deployment Setup
After deployment, the ENBBounty contract needs to be authorized on the ENBBountyNft contract. The deployment script handles this automatically by calling:
```solidity
ENBBountyNft.setENBBountyContract(ENBBounty.address, true)
```

### Token Support
If you want to support token bounties, you need to add supported tokens after deployment:
```solidity
// Example: Add USDC as token type 1
ENBBounty.addSupportedToken(USDC_ADDRESS, 1)
```

### Network-Specific Addresses

#### Ethereum Mainnet
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

#### Base Mainnet
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

#### Testnets
Deploy your own mock tokens or use testnet faucets.

## Troubleshooting

### Verification Issues
- Ensure your API keys are correctly set in `.env`
- Make sure constructor arguments match exactly
- Wait a few minutes after deployment before verifying
- Check if contract is already verified

### Deployment Issues
- Ensure sufficient ETH for gas fees
- Verify all addresses are valid
- Check network configuration in `hardhat.config.ts`
- Ensure private key has correct permissions

### Gas Optimization
The contracts have been optimized for gas efficiency. Expected gas costs:
- ENBBountyNft deployment: ~2-3M gas
- ENBBounty deployment: ~4-5M gas
- Solo bounty creation: ~250k gas
- Open bounty creation: ~340k gas
- Claim creation: ~380k gas