import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  // Deploy ENBBountyNft first
  const treasury = process.env.TREASURY_ADDRESS!;
  const authority = process.env.AUTHORITY_ADDRESS!;
  const royaltyFee = process.env.ROYALTY_FEE_NUMERATOR
    ? parseInt(process.env.ROYALTY_FEE_NUMERATOR)
    : 500; // Default 5% royalty

  console.log('Deploying ENBBountyNft with parameters:');
  console.log(`  Treasury: ${treasury}`);
  console.log(`  Authority: ${authority}`);
  console.log(`  Royalty Fee: ${royaltyFee}`);

  const ENBBountyNft = await ethers.deployContract('ENBBountyNft', [
    treasury,
    authority,
    royaltyFee,
  ]);
  await ENBBountyNft.waitForDeployment();
  console.log(`ENBBountyNft deployed to ${ENBBountyNft.target}`);

  // Deploy ENBBounty with ENBBountyNft address, treasury, startClaimIndex, USDC address, and ENB address
  const startClaimIndex = process.env.START_CLAIM_INDEX
    ? parseInt(process.env.START_CLAIM_INDEX)
    : 0;
  const platformFee = process.env.PLATFORM_FEE
    ? parseInt(process.env.PLATFORM_FEE)
    : 25; // Default 2.5% platform fee
  const usdcAddress = process.env.USDC_ADDRESS || ethers.ZeroAddress;
  const enbAddress = process.env.ENB_ADDRESS || ethers.ZeroAddress;
  
  console.log('\nDeploying ENBBounty with parameters:');
  console.log(`  ENBBountyNft: ${ENBBountyNft.target}`);
  console.log(`  Treasury: ${treasury}`);
  console.log(`  Platform Fee: ${platformFee}`);
  console.log(`  USDC Address: ${usdcAddress}`);
  console.log(`  ENB Address: ${enbAddress}`);

  const ENBBounty = await ethers.deployContract('ENBBounty', [
    ENBBountyNft.target,
    treasury,
    platformFee,
    usdcAddress,
    enbAddress,
  ]);
  await ENBBounty.waitForDeployment();
  console.log(`ENBBounty deployed to ${ENBBounty.target}`);
  
  // Set ENBBounty as authorized contract on ENBBountyNft
  console.log('\nSetting ENBBounty as authorized contract on ENBBountyNft...');
  const setTx = await ENBBountyNft.setENBBountyContract(ENBBounty.target, true);
  await setTx.wait();
  console.log('Authorization complete!');
  
  // Log deployment summary
  console.log('\n=== Deployment Summary ===');
  console.log(`ENBBountyNft: ${ENBBountyNft.target}`);
  console.log(`ENBBounty: ${ENBBounty.target}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Authority: ${authority}`);
  console.log(`Platform Fee: ${platformFee}/1000 (${platformFee/10}%)`);
  console.log(`Royalty Fee: ${royaltyFee}/10000 (${royaltyFee/100}%)`);
  console.log(`USDC Address: ${usdcAddress}`);
  console.log(`ENB Address: ${enbAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
