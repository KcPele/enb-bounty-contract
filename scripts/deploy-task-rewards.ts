import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const treasury = process.env.TREASURY_ADDRESS!;
  const bountyContract = process.env.ENB_BOUNTY_ADDRESS!;
  const claimSigner = process.env.CLAIM_SIGNER_ADDRESS!;

  if (!treasury) throw new Error('TREASURY_ADDRESS not set');
  if (!bountyContract) throw new Error('ENB_BOUNTY_ADDRESS not set');
  if (!claimSigner) throw new Error('CLAIM_SIGNER_ADDRESS not set');

  console.log('Deploying ENBTaskRewards with parameters:');
  console.log(`  Treasury:        ${treasury}`);
  console.log(`  Bounty Contract: ${bountyContract}`);
  console.log(`  Claim Signer:    ${claimSigner}`);

  const ENBTaskRewards = await ethers.deployContract('ENBTaskRewards', [
    treasury,
    bountyContract,
  ]);
  await ENBTaskRewards.waitForDeployment();
  console.log(`ENBTaskRewards deployed to ${ENBTaskRewards.target}`);

  // Set claim signer
  const tx = await ENBTaskRewards.setClaimSigner(claimSigner);
  await tx.wait();
  console.log(`Claim signer set to ${claimSigner}`);

  console.log('\n=== Deployment Summary ===');
  console.log(`ENBTaskRewards: ${ENBTaskRewards.target}`);
  console.log(`Treasury:       ${treasury}`);
  console.log(`BountyContract: ${bountyContract}`);
  console.log(`ClaimSigner:    ${claimSigner}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
