import { ethers } from 'hardhat';

async function main() {
  console.log('Deploying to local Hardhat network...\n');
  
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await ethers.provider.getBalance(deployer.address)).toString());
  
  // Use first two test accounts as treasury and authority
  const treasury = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Account #1
  const authority = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // Account #2
  const royaltyFee = 500; // 5% royalty
  const platformFee = 25; // 2.5% platform fee
  
  console.log('\n=== Deployment Parameters ===');
  console.log('Treasury:', treasury);
  console.log('Authority:', authority);
  console.log('Royalty Fee:', royaltyFee, '(5%)');
  console.log('Platform Fee:', platformFee, '(2.5%)');
  
  // Deploy ENBBountyNft
  console.log('\n=== Deploying ENBBountyNft ===');
  const ENBBountyNft = await ethers.deployContract('ENBBountyNft', [
    treasury,
    authority,
    royaltyFee,
  ]);
  await ENBBountyNft.waitForDeployment();
  console.log('ENBBountyNft deployed to:', ENBBountyNft.target);
  
  // Deploy ENBBounty
  console.log('\n=== Deploying ENBBounty ===');
  const ENBBounty = await ethers.deployContract('ENBBounty', [
    ENBBountyNft.target,
    treasury,
    platformFee,
    ethers.ZeroAddress, // USDC address (not needed for local testing)
    ethers.ZeroAddress, // ENB address (not needed for local testing)
  ]);
  await ENBBounty.waitForDeployment();
  console.log('ENBBounty deployed to:', ENBBounty.target);
  
  // Authorize ENBBounty on ENBBountyNft (must be done by authority)
  console.log('\n=== Setting Permissions ===');
  // Get the authority signer (Account #2)
  const signers = await ethers.getSigners();
  const authoritySigner = signers[2]; // Account #2 is the authority
  
  const ENBBountyNftAsAuthority = ENBBountyNft.connect(authoritySigner);
  const setTx = await ENBBountyNftAsAuthority.setENBBountyContract(ENBBounty.target, true);
  await setTx.wait();
  console.log('ENBBounty authorized on ENBBountyNft');
  
  // Deployment summary
  console.log('\n' + '='.repeat(50));
  console.log('DEPLOYMENT COMPLETE!');
  console.log('='.repeat(50));
  console.log('\nContract Addresses:');
  console.log('  ENBBountyNft:', ENBBountyNft.target);
  console.log('  ENBBounty:', ENBBounty.target);
  console.log('\nConfiguration:');
  console.log('  Treasury:', treasury);
  console.log('  Authority:', authority);
  console.log('  Platform Fee: 2.5%');
  console.log('  Royalty Fee: 5%');
  console.log('\nYou can now interact with the contracts using:');
  console.log('  - Hardhat console: npx hardhat console --network localhost');
  console.log('  - Scripts: npx hardhat run scripts/your-script.ts --network localhost');
  console.log('  - Tests: npx hardhat test --network localhost');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });