import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const treasury = process.env.TREASURY_ADDRESS!;
  if (!treasury) throw new Error('TREASURY_ADDRESS not set');

  console.log('Deploying ENBBounty with parameters:');
  console.log(`  Treasury: ${treasury}`);

  const ENBBounty = await ethers.deployContract('ENBBounty', [treasury]);
  await ENBBounty.waitForDeployment();
  console.log(`ENBBounty deployed to ${ENBBounty.target}`);

  // Log fee config
  const platformFee = await ENBBounty.platformFeeRate();
  const creationFee = await ENBBounty.creationFeeRate();
  console.log(`Platform fee: ${platformFee}/1000 (${Number(platformFee) / 10}%)`);
  console.log(`Creation fee: ${creationFee}/1000 (${Number(creationFee) / 10}%)`);

  console.log('\n=== Deployment Summary ===');
  console.log(`ENBBounty: ${ENBBounty.target}`);
  console.log(`Treasury: ${treasury}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
