import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  // Deploy ENBBountyNft first
  const treasury = process.env.TREASURY_ADDRESS!;
  const authority = process.env.AUTHORITY_ADDRESS!;
  const royaltyFee = process.env.ROYALTY_FEE_NUMERATOR
    ? parseInt(process.env.ROYALTY_FEE_NUMERATOR)
    : 0;

  const ENBBountyNft = await ethers.deployContract('ENBBountyNft', [
    treasury,
    authority,
    royaltyFee,
  ]);
  await ENBBountyNft.waitForDeployment();
  console.log(`ENBBountyNft deployed to ${ENBBountyNft.target}`);

  // Deploy ENBBounty with ENBBountyNft address, treasury, and startClaimIndex
  const startClaimIndex = process.env.START_CLAIM_INDEX
    ? parseInt(process.env.START_CLAIM_INDEX)
    : 0;
  const ENBBounty = await ethers.deployContract('ENBBounty', [
    ENBBountyNft.target,
    treasury,
    startClaimIndex,
  ]);
  await ENBBounty.waitForDeployment();
  console.log(`ENBBounty deployed to ${ENBBounty.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
