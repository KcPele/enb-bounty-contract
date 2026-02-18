import { ethers } from 'hardhat';
import fs from 'fs';

async function main() {
  console.log('Deploying to local Hardhat network with mock tokens...\n');

  const [deployer, treasury, alice, bob] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log(
    'Account balance:',
    (await ethers.provider.getBalance(deployer.address)).toString(),
  );

  // Deploy Mock Tokens
  console.log('\n=== Deploying Mock Tokens ===');
  const MockUSDC = await ethers.deployContract('MockUSDC');
  await MockUSDC.waitForDeployment();
  console.log('MockUSDC deployed to:', MockUSDC.target);

  const MockENB = await ethers.deployContract('MockENB');
  await MockENB.waitForDeployment();
  console.log('MockENB deployed to:', MockENB.target);

  // Deploy ENBBounty (new contract: only takes treasury)
  console.log('\n=== Deploying ENBBounty ===');
  const ENBBounty = await ethers.deployContract('ENBBounty', [
    treasury.address,
  ]);
  await ENBBounty.waitForDeployment();
  console.log('ENBBounty deployed to:', ENBBounty.target);

  // Add supported tokens (must be done by treasury)
  console.log('\n=== Configuring Token Support ===');
  const ENBBountyAsTreasury = ENBBounty.connect(treasury);

  const addUSDCTx = await ENBBountyAsTreasury.addSupportedToken(
    MockUSDC.target,
    1,
  );
  await addUSDCTx.wait();
  console.log('USDC added as supported token (type 1)');

  const addENBTx = await ENBBountyAsTreasury.addSupportedToken(
    MockENB.target,
    2,
  );
  await addENBTx.wait();
  console.log('ENB added as supported token (type 2)');

  // Distribute tokens to test accounts
  console.log('\n=== Distributing Test Tokens ===');
  const usdcAmount = ethers.parseUnits('10000', 6);
  const enbAmount = ethers.parseEther('10000');

  await MockUSDC.mint(alice.address, usdcAmount);
  await MockUSDC.mint(bob.address, usdcAmount);
  await MockUSDC.mint("0xf4030DdD79fc7Fd49b25C976C5021D07568B4F91", usdcAmount); // charity wallet
  console.log('Minted 10,000 USDC to Alice and Bob');

  await MockENB.mint(alice.address, enbAmount);
  await MockENB.mint(bob.address, enbAmount);
  await MockENB.mint("0xf4030DdD79fc7Fd49b25C976C5021D07568B4F91", enbAmount); // charity wallet
  console.log('Minted 10,000 ENB to Alice and Bob');

  // Log fee config
  const platformFee = await ENBBounty.platformFeeRate();
  const creationFee = await ENBBounty.creationFeeRate();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('DEPLOYMENT COMPLETE!');
  console.log('='.repeat(60));

  console.log('\nContract Addresses:');
  console.log('  ENBBounty:', ENBBounty.target);
  console.log('  MockUSDC:', MockUSDC.target);
  console.log('  MockENB:', MockENB.target);

  console.log('\nConfiguration:');
  console.log('  Treasury:', treasury.address);
  console.log(`  Platform Fee: ${Number(platformFee) / 10}%`);
  console.log(`  Creation Fee: ${Number(creationFee) / 10}%`);

  console.log('\nToken Distribution:');
  console.log('  Deployer: 1,000,000 USDC, 1,000,000 ENB');
  console.log('  Alice:', alice.address, '- 10,000 USDC, 10,000 ENB');
  console.log('  Bob:', bob.address, '- 10,000 USDC, 10,000 ENB');

  console.log('\nSupported Token Types:');
  console.log('  Type 0: ETH (native)');
  console.log('  Type 1: USDC (MockUSDC)');
  console.log('  Type 2: ENB (MockENB)');

  // Save deployment info
  const deploymentInfo = {
    network: 'localhost',
    deployer: deployer.address,
    contracts: {
      ENBBounty: ENBBounty.target,
      MockUSDC: MockUSDC.target,
      MockENB: MockENB.target,
    },
    configuration: {
      treasury: treasury.address,
      platformFee: Number(platformFee),
      creationFee: Number(creationFee),
    },
    testAccounts: {
      deployer: deployer.address,
      treasury: treasury.address,
      alice: alice.address,
      bob: bob.address,
    },
  };

  if (!fs.existsSync('./deployments')) {
    fs.mkdirSync('./deployments');
  }
  fs.writeFileSync(
    './deployments/localhost.json',
    JSON.stringify(deploymentInfo, null, 2),
  );
  console.log('\nDeployment info saved to deployments/localhost.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
