import { ethers } from 'hardhat';
import fs from 'fs';

// Seeds the local chain with scenarios that trigger every indexer-relevant event:
//   TokenBountyCreated, ClaimAccepted, BatchClaimsAccepted,
//   BountyCancelled, SupportedTokenAdded, SupportedTokenRemoved
//
// Run after deploy-local-with-tokens.ts:
//   npx hardhat run scripts/create-test-all-events.ts --network localhost

async function main() {
  console.log('Seeding comprehensive ENB scenarios (all events)');
  console.log('='.repeat(70));

  const deployment = JSON.parse(
    fs.readFileSync('./deployments/localhost.json', 'utf8'),
  );

  const [deployer, treasury, alice, bob, charlie, david, eve] =
    await ethers.getSigners();

  const ENBBounty = await ethers.getContractAt(
    'ENBBounty',
    deployment.contracts.ENBBounty,
  );
  const MockUSDC = await ethers.getContractAt(
    'MockUSDC',
    deployment.contracts.MockUSDC,
  );
  const MockENB = await ethers.getContractAt(
    'MockENB',
    deployment.contracts.MockENB,
  );

  console.log('ENBBounty:', ENBBounty.target);
  console.log('MockUSDC :', MockUSDC.target);
  console.log('MockENB  :', MockENB.target);
  console.log('-'.repeat(70));

  // Top up test accounts with tokens
  const topUpUSDC = ethers.parseUnits('20000', 6);
  const topUpENB = ethers.parseEther('20000');
  for (const s of [alice, bob, charlie, david, eve]) {
    await (await MockUSDC.mint(s.address, topUpUSDC)).wait();
    await (await MockENB.mint(s.address, topUpENB)).wait();
  }

  // Helper: approve ERC20
  const approve = async (signer: any, token: any, amount: bigint) => {
    await (
      await token.connect(signer).approve(ENBBounty.target, amount)
    ).wait();
  };

  // -------------------------------------------------------
  // Scenario 0: Solo ETH bounty, 1 winner, accepted (closed)
  // Events: TokenBountyCreated, ClaimAccepted
  // -------------------------------------------------------
  console.log('\n#0 Solo ETH bounty (1 winner, closed)');
  await (
    await ENBBounty.connect(alice)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Fix login bug', 'Fix the authentication timeout issue', 1, 7, {
      value: ethers.parseEther('0.5'),
    })
  ).wait();
  // Accept charlie as winner
  await (
    await ENBBounty.connect(alice).acceptClaim(0, charlie.address)
  ).wait();
  console.log('  Created + accepted charlie as winner');

  // -------------------------------------------------------
  // Scenario 1: Solo ETH bounty, still open (no winners yet)
  // Events: TokenBountyCreated
  // -------------------------------------------------------
  console.log('\n#1 Solo ETH bounty (open, no winners)');
  await (
    await ENBBounty.connect(bob)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Design new logo', 'Create a modern logo for ENB platform', 1, 14, {
      value: ethers.parseEther('0.3'),
    })
  ).wait();
  console.log('  Created, waiting for submissions');

  // -------------------------------------------------------
  // Scenario 2: Multi-winner ETH bounty (3 winners), fully closed
  // Events: TokenBountyCreated, ClaimAccepted x3
  // -------------------------------------------------------
  console.log('\n#2 Multi-winner ETH bounty (3/3 winners, closed)');
  await (
    await ENBBounty.connect(alice)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Best meme contest', 'Top 3 memes win', 3, 7, {
      value: ethers.parseEther('0.9'),
    })
  ).wait();
  await (
    await ENBBounty.connect(alice).acceptClaim(2, bob.address)
  ).wait();
  await (
    await ENBBounty.connect(alice).acceptClaim(2, charlie.address)
  ).wait();
  await (
    await ENBBounty.connect(alice).acceptClaim(2, david.address)
  ).wait();
  console.log('  Created + accepted bob, charlie, david');

  // -------------------------------------------------------
  // Scenario 3: Multi-winner ETH, partial (2/5 accepted)
  // Events: TokenBountyCreated, ClaimAccepted x2
  // -------------------------------------------------------
  console.log('\n#3 Multi-winner ETH bounty (2/5 winners, open)');
  await (
    await ENBBounty.connect(bob)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Write tutorials', '5 best tutorial submissions', 5, 30, {
      value: ethers.parseEther('1.0'),
    })
  ).wait();
  await (
    await ENBBounty.connect(bob).acceptClaim(3, alice.address)
  ).wait();
  await (
    await ENBBounty.connect(bob).acceptClaim(3, eve.address)
  ).wait();
  console.log('  Created + accepted alice, eve (3 slots remaining)');

  // -------------------------------------------------------
  // Scenario 4: USDC solo bounty, accepted (closed)
  // Events: TokenBountyCreated (tokenType=1), ClaimAccepted
  // -------------------------------------------------------
  console.log('\n#4 USDC solo bounty (closed)');
  const usdcAmt = ethers.parseUnits('500', 6);
  const usdcFee =
    (usdcAmt * (await ENBBounty.creationFeeRate())) / 1000n;
  await approve(alice, MockUSDC, usdcAmt + usdcFee);
  await (
    await ENBBounty.connect(alice).createTokenBounty(
      'USDC Documentation',
      'Write comprehensive API docs',
      1,
      MockUSDC.target,
      usdcAmt,
      14,
    )
  ).wait();
  await (
    await ENBBounty.connect(alice).acceptClaim(4, david.address)
  ).wait();
  console.log('  Created + accepted david');

  // -------------------------------------------------------
  // Scenario 5: ENB multi-winner bounty, open
  // Events: TokenBountyCreated (tokenType=2)
  // -------------------------------------------------------
  console.log('\n#5 ENB multi-winner bounty (open)');
  const enbAmt = ethers.parseEther('1000');
  const enbFee =
    (enbAmt * (await ENBBounty.creationFeeRate())) / 1000n;
  await approve(bob, MockENB, enbAmt + enbFee);
  await (
    await ENBBounty.connect(bob).createTokenBounty(
      'ENB Community Work',
      'Contribute to the ENB ecosystem',
      4,
      MockENB.target,
      enbAmt,
      21,
    )
  ).wait();
  console.log('  Created, waiting for submissions');

  // -------------------------------------------------------
  // Scenario 6: ETH bounty, cancelled (no winners)
  // Events: TokenBountyCreated, BountyCancelled
  // -------------------------------------------------------
  console.log('\n#6 ETH bounty (cancelled)');
  await (
    await ENBBounty.connect(charlie)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Cancelled task', 'This will be cancelled', 1, 7, {
      value: ethers.parseEther('0.2'),
    })
  ).wait();
  await (await ENBBounty.connect(charlie).cancelSoloBounty(6)).wait();
  console.log('  Created + cancelled');

  // -------------------------------------------------------
  // Scenario 7: Multi-winner ETH, partial cancel (1/3 accepted then cancel)
  // Events: TokenBountyCreated, ClaimAccepted, BountyCancelled
  // -------------------------------------------------------
  console.log('\n#7 ETH bounty (1/3 accepted then cancelled)');
  await (
    await ENBBounty.connect(alice)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Partial cancel test', 'Accept 1 then cancel', 3, 14, {
      value: ethers.parseEther('0.6'),
    })
  ).wait();
  await (
    await ENBBounty.connect(alice).acceptClaim(7, bob.address)
  ).wait();
  await (await ENBBounty.connect(alice).cancelSoloBounty(7)).wait();
  console.log('  Created + accepted bob + cancelled (refund remaining)');

  // -------------------------------------------------------
  // Scenario 8: Batch accept claims (5 winners at once)
  // Events: TokenBountyCreated, ClaimAccepted x5, BatchClaimsAccepted
  // -------------------------------------------------------
  console.log('\n#8 Batch accept (5 winners at once)');
  await (
    await ENBBounty.connect(alice)[
      'createSoloBounty(string,string,uint256,uint256)'
    ]('Batch bounty', 'Accept 5 winners in one tx', 5, 7, {
      value: ethers.parseEther('1.0'),
    })
  ).wait();
  await (
    await ENBBounty.connect(alice).batchAcceptClaims(8, [
      bob.address,
      charlie.address,
      david.address,
      eve.address,
      deployer.address,
    ])
  ).wait();
  console.log('  Created + batch accepted 5 winners');

  // -------------------------------------------------------
  // Scenario 9: USDC bounty cancelled
  // Events: TokenBountyCreated (tokenType=1), BountyCancelled
  // -------------------------------------------------------
  console.log('\n#9 USDC bounty (cancelled)');
  const usdcCancel = ethers.parseUnits('200', 6);
  const usdcCancelFee =
    (usdcCancel * (await ENBBounty.creationFeeRate())) / 1000n;
  await approve(bob, MockUSDC, usdcCancel + usdcCancelFee);
  await (
    await ENBBounty.connect(bob).createTokenBounty(
      'USDC Cancelled',
      'Will cancel this one',
      1,
      MockUSDC.target,
      usdcCancel,
      7,
    )
  ).wait();
  await (await ENBBounty.connect(bob).cancelSoloBounty(9)).wait();
  console.log('  Created + cancelled');

  // -------------------------------------------------------
  // Scenario 10: SupportedTokenRemoved event
  // -------------------------------------------------------
  console.log('\n#10 Remove and re-add ENB token support');
  const ENBBountyAsTreasury = ENBBounty.connect(treasury);
  await (
    await ENBBountyAsTreasury.removeSupportedToken(MockENB.target)
  ).wait();
  console.log('  Removed ENB token support (SupportedTokenRemoved)');
  await (
    await ENBBountyAsTreasury.addSupportedToken(MockENB.target, 2)
  ).wait();
  console.log('  Re-added ENB token support (SupportedTokenAdded)');

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SEEDING COMPLETE');
  console.log('='.repeat(70));

  console.log('\nEvents exercised:');
  console.log('  TokenBountyCreated      - scenarios 0-9 (ETH, USDC, ENB)');
  console.log('  ClaimAccepted           - scenarios 0,2,3,4,7,8');
  console.log('  BatchClaimsAccepted     - scenario 8');
  console.log('  BountyCancelled         - scenarios 6,7,9');
  console.log('  SupportedTokenAdded     - deploy + scenario 10');
  console.log('  SupportedTokenRemoved   - scenario 10');

  console.log('\nBounty states:');
  console.log('  Closed (all winners):   #0, #2, #4, #8');
  console.log('  Open (in progress):     #1, #3, #5');
  console.log('  Cancelled:              #6, #7, #9');

  const totalBounties = await ENBBounty.bountyCounter();
  console.log(`\nTotal bounties created: ${totalBounties}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seeding scenarios:', err);
    process.exit(1);
  });
