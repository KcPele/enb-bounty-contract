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
  ]);
  await ENBBounty.waitForDeployment();
  console.log(`ENBBounty deployed to ${ENBBounty.target}`);

  // Set ENBBounty as authorized contract on ENBBountyNft: manually done in the explorer
  // console.log('\nSetting ENBBounty as authorized contract on ENBBountyNft...');
  const setTx = await ENBBountyNft.setENBBountyContract(ENBBounty.target, true);
  await setTx.wait();
  // Add USDC as token type 1
  // const addUSDCTx = await ENBBounty.addSupportedToken(usdcAddress, 1);
  // await addUSDCTx.wait();
  // console.log('USDC added as supported token (type 1)');

  // // Add ENB as token type 2
  // const addENBTx = await ENBBounty.addSupportedToken(enbAddress, 2);
  // await addENBTx.wait();
  // console.log('ENB added as supported token (type 2)');

  console.log('Authorization complete!');

  // Log deployment summary
  console.log('\n=== Deployment Summary ===');
  console.log(`ENBBountyNft: ${ENBBountyNft.target}`);
  console.log(`ENBBounty: ${ENBBounty.target}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Authority: ${authority}`);
  console.log(`Platform Fee: ${platformFee}/1000 (${platformFee / 10}%)`);
  console.log(`Royalty Fee: ${royaltyFee}/10000 (${royaltyFee / 100}%)`);
  console.log(`USDC Address: ${usdcAddress}`);
  console.log(`ENB Address: ${enbAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
