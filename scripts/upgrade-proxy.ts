import { ethers, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS!;
  if (!proxyAddress) throw new Error('PROXY_ADDRESS not set');

  console.log(`Upgrading ENBBounty proxy at ${proxyAddress}...`);

  const ENBBounty = await ethers.getContractFactory('ENBBounty');
  const upgraded = await upgrades.upgradeProxy(proxyAddress, ENBBounty, {
    kind: 'uups',
  });
  await upgraded.waitForDeployment();

  const newImpl = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  console.log('\n=== Upgrade Summary ===');
  console.log(`Proxy:              ${proxyAddress}`);
  console.log(`New Implementation: ${newImpl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
