import { ethers, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const treasury = process.env.TREASURY_ADDRESS!;
  if (!treasury) throw new Error('TREASURY_ADDRESS not set');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying ENBBounty (UUPS proxy) with:');
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Treasury: ${treasury}`);

  const ENBBounty = await ethers.getContractFactory('ENBBounty');
  const proxy = await upgrades.deployProxy(ENBBounty, [treasury], {
    kind: 'uups',
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  // Transfer ownership from deployer to treasury so treasury = admin
  if (treasury.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`\nTransferring ownership to treasury...`);
    const tx = await proxy.transferOwnership(treasury);
    await tx.wait();
    console.log(`  Owner -> ${await proxy.owner()}`);
  }

  const platformFee = await proxy.platformFeeRate();
  const creationFee = await proxy.creationFeeRate();

  console.log('\n=== Deployment Summary ===');
  console.log(`Proxy:          ${proxyAddress}`);
  console.log(`Implementation: ${implAddress}`);
  console.log(`Treasury:       ${treasury}`);
  console.log(`Owner:          ${await proxy.owner()}`);
  console.log(
    `Platform fee:   ${platformFee}/1000 (${Number(platformFee) / 10}%)`
  );
  console.log(
    `Creation fee:   ${creationFee}/1000 (${Number(creationFee) / 10}%)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
