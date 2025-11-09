import { ethers } from 'hardhat';

async function main() {
  console.log('Deploying to local Hardhat network with mock tokens...\n');

  const [deployer, treasury, authority, alice, bob] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log(
    'Account balance:',
    (await ethers.provider.getBalance(deployer.address)).toString(),
  );

  const royaltyFee = 500; // 5% royalty
  const startClaimIndex = 0; // Optional offset for claim IDs

  console.log('\n=== Deployment Parameters ===');
  console.log('Treasury:', treasury.address);
  console.log('Authority:', authority.address);
  console.log('Royalty Fee:', royaltyFee, '(5%)');
  console.log('Start Claim Index:', startClaimIndex);

  // Deploy Mock USDC Token
  console.log('\n=== Deploying Mock USDC ===');
  const MockUSDC = await ethers.deployContract('MockUSDC');
  await MockUSDC.waitForDeployment();
  console.log('MockUSDC deployed to:', MockUSDC.target);
  console.log('USDC Decimals: 6');
  console.log('Initial Supply: 1,000,000 USDC');

  // Deploy Mock ENB Token
  console.log('\n=== Deploying Mock ENB ===');
  const MockENB = await ethers.deployContract('MockENB');
  await MockENB.waitForDeployment();
  console.log('MockENB deployed to:', MockENB.target);
  console.log('ENB Decimals: 18');
  console.log('Initial Supply: 1,000,000 ENB');

  // Deploy ENBBountyNft
  console.log('\n=== Deploying ENBBountyNft ===');
  const ENBBountyNft = await ethers.deployContract('ENBBountyNft', [
    treasury.address,
    authority.address,
    royaltyFee,
  ]);
  await ENBBountyNft.waitForDeployment();
  console.log('ENBBountyNft deployed to:', ENBBountyNft.target);

  // Deploy ENBBounty with token addresses
  console.log('\n=== Deploying ENBBounty ===');
  const ENBBounty = await ethers.deployContract('ENBBounty', [
    ENBBountyNft.target,
    treasury.address,
    startClaimIndex,
    MockUSDC.target,
    MockENB.target,
  ]);
  await ENBBounty.waitForDeployment();
  console.log('ENBBounty deployed to:', ENBBounty.target);

  // Authorize ENBBounty on ENBBountyNft (must be done by authority)
  console.log('\n=== Setting Permissions ===');
  const ENBBountyNftAsAuthority = ENBBountyNft.connect(authority);
  const setTx = await ENBBountyNftAsAuthority.setENBBountyContract(
    ENBBounty.target,
    true,
  );
  await setTx.wait();
  console.log('ENBBounty authorized on ENBBountyNft');

  // Add supported tokens to ENBBounty (must be done by treasury)
  console.log('\n=== Token Support ===');
  console.log('USDC and ENB registered during deployment.');

  // Distribute tokens to test accounts for testing
  console.log('\n=== Distributing Test Tokens ===');

  // Give Alice and Bob some USDC and ENB
  const usdcAmount = ethers.parseUnits('10000', 6); // 10,000 USDC
  const enbAmount = ethers.parseEther('10000'); // 10,000 ENB

  await MockUSDC.mint(alice.address, usdcAmount);
  await MockUSDC.mint(bob.address, usdcAmount);
  console.log('Minted 10,000 USDC to Alice and Bob');

  await MockENB.mint(alice.address, enbAmount);
  await MockENB.mint(bob.address, enbAmount);
  console.log('Minted 10,000 ENB to Alice and Bob');

  // Deployment summary
  console.log('\n' + '='.repeat(60));
  console.log('DEPLOYMENT COMPLETE!');
  console.log('='.repeat(60));

  console.log('\n📍 Contract Addresses:');
  console.log('  ENBBountyNft:', ENBBountyNft.target);
  console.log('  ENBBounty:', ENBBounty.target);
  console.log('  MockUSDC:', MockUSDC.target);
  console.log('  MockENB:', MockENB.target);

  console.log('\n⚙️  Configuration:');
  console.log('  Treasury:', treasury.address);
  console.log('  Authority:', authority.address);
  console.log('  Start Claim Index:', startClaimIndex);
  console.log('  Royalty Fee: 5%');

  console.log('\n💰 Token Distribution:');
  console.log('  Deployer: 1,000,000 USDC, 1,000,000 ENB');
  console.log('  Alice: 10,000 USDC, 10,000 ENB');
  console.log('  Bob: 10,000 USDC, 10,000 ENB');

  console.log('\n🎯 Supported Token Types:');
  console.log('  Type 0: ETH (native)');
  console.log('  Type 1: USDC (MockUSDC)');
  console.log('  Type 2: ENB (MockENB)');

  console.log('\n📝 Example Usage:');
  console.log('  Creating ETH bounty:');
  console.log(
    '    await ENBBounty.createSoloBounty("Task", "Description", winner, 1, {value: ethers.parseEther("1")})',
  );
  console.log('  Creating USDC bounty:');
  console.log('    await MockUSDC.approve(ENBBounty.target, amount)');
  console.log(
    '    await ENBBounty.createSoloBountyToken("Task", "Description", winner, 1, amount, 1)',
  );
  console.log('  Creating ENB bounty:');
  console.log('    await MockENB.approve(ENBBounty.target, amount)');
  console.log(
    '    await ENBBounty.createSoloBountyToken("Task", "Description", winner, 1, amount, 2)',
  );

  console.log('\n🔧 Interact with contracts:');
  console.log('  npx hardhat console --network localhost');
  console.log('  npx hardhat run scripts/your-script.ts --network localhost');

  // Save deployment info to file for reference
  const deploymentInfo = {
    network: 'localhost',
    deployer: deployer.address,
    contracts: {
      ENBBountyNft: ENBBountyNft.target,
      ENBBounty: ENBBounty.target,
      MockUSDC: MockUSDC.target,
      MockENB: MockENB.target,
    },
    configuration: {
      treasury: treasury.address,
      authority: authority.address,
      startClaimIndex,
      royaltyFee,
    },
    tokenTypes: {
      0: 'ETH (native)',
      1: 'USDC (MockUSDC)',
      2: 'ENB (MockENB)',
    },
    testAccounts: {
      deployer: deployer.address,
      treasury: treasury.address,
      authority: authority.address,
      alice: alice.address,
      bob: bob.address,
    },
  };

  const fs = require('fs');
  fs.writeFileSync(
    './deployments/localhost.json',
    JSON.stringify(deploymentInfo, null, 2),
  );
  console.log('\n✅ Deployment info saved to deployments/localhost.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// to run: npx hardhat run scripts/deploy-local-with-tokens.ts --network localhost
