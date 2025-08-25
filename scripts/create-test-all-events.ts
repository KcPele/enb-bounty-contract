import { ethers } from 'hardhat';
import fs from 'fs';

async function main() {
  console.log('🚀 Starting comprehensive event testing...\n');
  console.log('='.repeat(60));

  // Load deployment info
  const deployment = JSON.parse(
    fs.readFileSync('./deployments/localhost.json', 'utf8'),
  );

  const [deployer, treasury, authority, alice, bob, charlie, david] =
    await ethers.getSigners();

  // Get contract instances
  const ENBBounty = await ethers.getContractAt(
    'ENBBounty',
    deployment.contracts.ENBBounty,
  );
  const ENBBountyNft = await ethers.getContractAt(
    'ENBBountyNft',
    deployment.contracts.ENBBountyNft,
  );
  const MockUSDC = await ethers.getContractAt(
    'MockUSDC',
    deployment.contracts.MockUSDC,
  );
  const MockENB = await ethers.getContractAt(
    'MockENB',
    deployment.contracts.MockENB,
  );

  console.log('📝 Contract Addresses:');
  console.log('  ENBBounty:', ENBBounty.target);
  console.log('  ENBBountyNft:', ENBBountyNft.target);
  console.log('  MockUSDC:', MockUSDC.target);
  console.log('  MockENB:', MockENB.target);
  console.log('\n' + '='.repeat(60) + '\n');

  // Track bounty IDs for later operations
  const bountyIds: number[] = [];
  const claimIds: bigint[] = [];

  // Get initial claim counter to track actual claim IDs
  const initialClaimCounter = await ENBBounty.claimCounter();
  console.log('Initial claim counter:', initialClaimCounter.toString());

  // ===========================================
  // SECTION 1: CREATE BOUNTIES (Testing TokenBountyCreated)
  // ===========================================
  console.log('📌 SECTION 1: CREATING BOUNTIES\n');

  // 1.1 ETH Solo Bounty (1 winner)
  console.log('1.1 Creating ETH solo bounty (1 winner)...');
  const tx1 = await ENBBounty.connect(alice)[
    'createSoloBounty(string,string,uint256)'
  ]('Bug Fix Competition', 'Fix the critical payment bug', 1, {
    value: ethers.parseEther('0.1'),
  });
  await tx1.wait();
  bountyIds.push(0);
  console.log('   ✅ Bounty #0 created - ETH solo (0.1 ETH, 1 winner)');

  // 1.2 ETH Multi-winner Bounty (3 winners)
  console.log('1.2 Creating ETH multi-winner bounty (3 winners)...');
  const tx2 = await ENBBounty.connect(bob)[
    'createSoloBounty(string,string,uint256)'
  ]('Meme Contest', 'Create the best Web3 memes', 3, {
    value: ethers.parseEther('0.3'),
  });
  await tx2.wait();
  bountyIds.push(1);
  console.log('   ✅ Bounty #1 created - ETH multi (0.3 ETH, 3 winners)');

  // 1.3 USDC Token Bounty
  console.log('1.3 Creating USDC token bounty...');
  const usdcAmount = ethers.parseUnits('100', 6);
  await MockUSDC.connect(alice).approve(ENBBounty.target, usdcAmount);
  const tx3 = await ENBBounty.connect(alice).createTokenBounty(
    'Documentation Task',
    'Write comprehensive API docs',
    1,
    MockUSDC.target,
    usdcAmount,
    { value: 0 },
  );
  await tx3.wait();
  bountyIds.push(2);
  console.log('   ✅ Bounty #2 created - USDC token (100 USDC, 1 winner)');

  // 1.4 ENB Token Bounty (2 winners)
  console.log('1.4 Creating ENB token bounty (2 winners)...');
  const enbAmount = ethers.parseEther('500');
  await MockENB.connect(bob).approve(ENBBounty.target, enbAmount);
  const tx4 = await ENBBounty.connect(bob).createTokenBounty(
    'Marketing Campaign',
    'Create viral marketing content',
    2,
    MockENB.target,
    enbAmount,
    { value: 0 },
  );
  await tx4.wait();
  bountyIds.push(3);
  console.log('   ✅ Bounty #3 created - ENB token (500 ENB, 2 winners)');

  // 1.5 Open ETH Bounty (5 winners)
  console.log('1.5 Creating open ETH bounty (5 winners)...');
  const tx5 = await ENBBounty.connect(alice)[
    'createOpenBounty(string,string,uint256)'
  ]('Community Art Project', 'Collaborative digital art', 5, {
    value: ethers.parseEther('0.05'),
  });
  await tx5.wait();
  bountyIds.push(4);
  console.log(
    '   ✅ Bounty #4 created - Open ETH (0.05 ETH initial, 5 winners)',
  );

  // 1.6 Open USDC Token Bounty (10 winners)
  console.log('1.6 Creating open USDC bounty (10 winners)...');
  const openUsdcAmount = ethers.parseUnits('50', 6);
  await MockUSDC.connect(bob).approve(ENBBounty.target, openUsdcAmount);
  const tx6 = await ENBBounty.connect(bob).createOpenTokenBounty(
    'Bug Bounty Program',
    'Find security vulnerabilities',
    10,
    MockUSDC.target,
    openUsdcAmount,
    { value: 0 },
  );
  await tx6.wait();
  bountyIds.push(5);
  console.log(
    '   ✅ Bounty #5 created - Open USDC (50 USDC initial, 10 winners)',
  );

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 2: JOIN OPEN BOUNTIES (Testing BountyJoined)
  // ===========================================
  console.log('📌 SECTION 2: JOINING OPEN BOUNTIES\n');

  // 2.1 Join ETH open bounty (bounty #4 was created by Alice, so others join)
  console.log('2.1 Charlie joining open ETH bounty #4...');
  const tx7 = await ENBBounty.connect(charlie).joinOpenBounty(4, {
    value: ethers.parseEther('0.02'),
  });
  await tx7.wait();
  console.log('   ✅ Charlie joined with 0.02 ETH');

  console.log('2.2 David joining open ETH bounty #4...');
  const tx8 = await ENBBounty.connect(david).joinOpenBounty(4, {
    value: ethers.parseEther('0.015'),
  });
  await tx8.wait();
  console.log('   ✅ David joined with 0.015 ETH');

  // 2.2 Join USDC open bounty (bounty #5 was created by Bob, so others join)
  console.log('2.3 Alice joining open USDC bounty #5...');
  const joinUsdcAmount = ethers.parseUnits('30', 6);
  await MockUSDC.connect(alice).approve(ENBBounty.target, joinUsdcAmount);
  const tx9 = await ENBBounty.connect(alice).joinOpenBountyWithToken(
    5,
    joinUsdcAmount,
    { value: 0 },
  );
  await tx9.wait();
  console.log('   ✅ Alice joined with 30 USDC');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 3: CREATE CLAIMS (Testing ClaimCreated)
  // ===========================================
  console.log('📌 SECTION 3: CREATING CLAIMS\n');

  // 3.1 Create claims on bounty #0 (ETH solo)
  console.log('3.1 Creating claims on bounty #0 (ETH solo)...');
  const claim1 = await ENBBounty.connect(charlie).createClaim(
    0,
    'Bug Fix Solution',
    'https://example.com/bugfix1',
    'Fixed the payment processing bug',
  );
  await claim1.wait();
  const claimId0 = initialClaimCounter;
  claimIds.push(claimId0);
  console.log(`   ✅ Claim #${claimId0} created by Charlie`);

  const claim2 = await ENBBounty.connect(david).createClaim(
    0,
    'Alternative Fix',
    'https://example.com/bugfix2',
    'Alternative solution to payment bug',
  );
  await claim2.wait();
  const claimId1 = initialClaimCounter + 1n;
  claimIds.push(claimId1);
  console.log(`   ✅ Claim #${claimId1} created by David`);

  // 3.2 Create claims on bounty #1 (ETH multi - 3 winners)
  console.log('3.2 Creating claims on bounty #1 (ETH multi)...');
  const claim3 = await ENBBounty.connect(alice).createClaim(
    1,
    'Funny DeFi Meme',
    'https://example.com/meme1',
    'DeFi degen meme',
  );
  await claim3.wait();
  const claimId2 = initialClaimCounter + 2n;
  claimIds.push(claimId2);
  console.log(`   ✅ Claim #${claimId2} created by Alice`);

  const claim4 = await ENBBounty.connect(charlie).createClaim(
    1,
    'NFT Joke Meme',
    'https://example.com/meme2',
    'NFT market satire',
  );
  await claim4.wait();
  const claimId3 = initialClaimCounter + 3n;
  claimIds.push(claimId3);
  console.log(`   ✅ Claim #${claimId3} created by Charlie`);

  const claim5 = await ENBBounty.connect(david).createClaim(
    1,
    'Gas Fees Meme',
    'https://example.com/meme3',
    'Ethereum gas fees joke',
  );
  await claim5.wait();
  const claimId4 = initialClaimCounter + 4n;
  claimIds.push(claimId4);
  console.log(`   ✅ Claim #${claimId4} created by David`);

  const claim6 = await ENBBounty.connect(deployer).createClaim(
    1,
    'DAO Governance Meme',
    'https://example.com/meme4',
    'DAO voting comedy',
  );
  await claim6.wait();
  const claimId5 = initialClaimCounter + 5n;
  claimIds.push(claimId5);
  console.log(`   ✅ Claim #${claimId5} created by Deployer`);

  // 3.3 Create claim on USDC bounty #2
  console.log('3.3 Creating claim on bounty #2 (USDC)...');
  const claim7 = await ENBBounty.connect(bob).createClaim(
    2,
    'API Documentation',
    'https://example.com/docs',
    'Complete API documentation with examples',
  );
  await claim7.wait();
  const claimId6 = initialClaimCounter + 6n;
  claimIds.push(claimId6);
  console.log(`   ✅ Claim #${claimId6} created by Bob`);

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 4: ACCEPT CLAIMS (Testing ClaimAccepted & Multiple Winners)
  // ===========================================
  console.log('📌 SECTION 4: ACCEPTING CLAIMS\n');

  // 4.1 Accept single claim on bounty #0
  console.log(
    `4.1 Accepting claim #${claimIds[0]} on bounty #0 (single winner)...`,
  );
  const accept1 = await ENBBounty.connect(alice).acceptClaim(0, claimIds[0]);
  await accept1.wait();
  console.log(`   ✅ Claim #${claimIds[0]} accepted - Charlie wins bounty #0`);

  // 4.2 Accept multiple claims on bounty #1 (3 winners max)
  console.log('4.2 Accepting multiple claims on bounty #1 (3 winners)...');

  console.log(`   Accepting claim #${claimIds[2]} (Alice)...`);
  const accept2 = await ENBBounty.connect(bob).acceptClaim(1, claimIds[2]);
  await accept2.wait();
  console.log('   ✅ First winner: Alice');

  console.log(`   Accepting claim #${claimIds[3]} (Charlie)...`);
  const accept3 = await ENBBounty.connect(bob).acceptClaim(1, claimIds[3]);
  await accept3.wait();
  console.log('   ✅ Second winner: Charlie');

  console.log(`   Accepting claim #${claimIds[4]} (David)...`);
  const accept4 = await ENBBounty.connect(bob).acceptClaim(1, claimIds[4]);
  await accept4.wait();
  console.log(
    '   ✅ Third winner: David - Bounty #1 fully claimed (3/3 winners)',
  );

  // 4.3 Accept claim on USDC bounty
  console.log(`4.3 Accepting claim #${claimIds[6]} on bounty #2 (USDC)...`);
  const accept5 = await ENBBounty.connect(alice).acceptClaim(2, claimIds[6]);
  await accept5.wait();
  console.log(`   ✅ Claim #${claimIds[6]} accepted - Bob wins USDC bounty #2`);

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 5: VOTING WORKFLOW (Testing ClaimSubmittedForVote, VoteClaim)
  // ===========================================
  console.log('📌 SECTION 5: VOTING WORKFLOW\n');

  // 5.1 Create claims on open bounty #4 for voting
  console.log('5.1 Creating claims on open bounty #4 for voting...');
  const claim8 = await ENBBounty.connect(david).createClaim(
    4,
    'Digital Art Piece 1',
    'https://example.com/art1',
    'Abstract digital art',
  );
  await claim8.wait();
  const claimId7 = initialClaimCounter + 7n;
  claimIds.push(claimId7);
  console.log(`   ✅ Claim #${claimId7} created by David`);

  // 5.2 Submit claim for vote (must be done by claim issuer - David)
  console.log(`5.2 Submitting claim #${claimIds[7]} for vote on bounty #4...`);
  const submitVote = await ENBBounty.connect(david).submitClaimForVote(
    4,
    claimIds[7],
  );
  await submitVote.wait();
  console.log(`   ✅ Claim #${claimIds[7]} submitted for voting`);

  // 5.3 Cast votes (only participants can vote - Alice created bounty #4, Charlie and David joined)
  console.log('5.3 Participants voting on claim #32...');

  console.log('   Alice voting YES...');
  const vote1 = await ENBBounty.connect(alice).voteClaim(4, true);
  await vote1.wait();
  console.log('   ✅ Alice voted YES');

  console.log('   Charlie voting NO...');
  const vote2 = await ENBBounty.connect(charlie).voteClaim(4, false);
  await vote2.wait();
  console.log('   ✅ Charlie voted NO');

  // Note: David can't vote on his own claim

  // 5.4 Advancing time and resolving vote for bounty #4 (weighted by stake)
  console.log('5.4 Advancing time and resolving vote for bounty #4...');
  const votingPeriod4 = await ENBBounty.votingPeriod();
  await ethers.provider.send('evm_increaseTime', [Number(votingPeriod4) + 1]);
  await ethers.provider.send('evm_mine', []);
  const resolve4 = await ENBBounty.connect(alice).resolveVote(4);
  await resolve4.wait();
  console.log('   ✅ Vote resolved for bounty #4, winning claim accepted');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 6: CANCELLATIONS & WITHDRAWALS
  // ===========================================
  console.log('📌 SECTION 6: CANCELLATIONS & WITHDRAWALS\n');

  // 6.1 Create a bounty to cancel
  console.log('6.1 Creating bounty #6 to test cancellation...');
  const tx10 = await ENBBounty.connect(david)[
    'createSoloBounty(string,string,uint256)'
  ]('To Be Cancelled', 'This bounty will be cancelled', 1, {
    value: ethers.parseEther('0.05'),
  });
  await tx10.wait();
  console.log('   ✅ Bounty #6 created');

  // 6.2 Cancel the bounty
  console.log('6.2 Cancelling bounty #6...');
  const cancel = await ENBBounty.connect(david).cancelSoloBounty(6);
  await cancel.wait();
  console.log('   ✅ Bounty #6 cancelled - Funds returned to David');

  // 6.3 Create open bounty for withdrawal test
  console.log('6.3 Creating open bounty #7 for withdrawal test...');
  const tx11 = await ENBBounty.connect(alice)[
    'createOpenBounty(string,string,uint256)'
  ]('Withdrawal Test', 'Testing withdrawal functionality', 2, {
    value: ethers.parseEther('0.1'),
  });
  await tx11.wait();
  console.log('   ✅ Bounty #7 created');

  console.log('6.4 Charlie joining bounty #7...');
  const tx12 = await ENBBounty.connect(charlie).joinOpenBounty(7, {
    value: ethers.parseEther('0.05'),
  });
  await tx12.wait();
  console.log('   ✅ Charlie joined with 0.05 ETH');

  // 6.5 Withdraw from open bounty
  console.log('6.5 Charlie withdrawing from bounty #7...');
  const withdraw = await ENBBounty.connect(charlie).withdrawFromOpenBounty(7);
  await withdraw.wait();
  console.log('   ✅ Charlie withdrew 0.05 ETH from bounty #7');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 7: VOTING PERIOD RESET (Testing VotingPeriodReset)
  // ===========================================
  console.log('📌 SECTION 7: VOTING PERIOD RESET\n');

  // 7.1 Create another claim for voting
  console.log('7.1 Creating claim on bounty #5 for voting reset test...');
  const claim9 = await ENBBounty.connect(charlie).createClaim(
    5,
    'Security Vulnerability',
    'https://example.com/vuln1',
    'Found reentrancy vulnerability',
  );
  await claim9.wait();
  const claimId8 = initialClaimCounter + 8n;
  claimIds.push(claimId8);
  console.log(`   ✅ Claim #${claimId8} created by Charlie`);

  // 7.2 Submit for vote (must be done by claim issuer - Charlie)
  console.log(`7.2 Submitting claim #${claimIds[8]} for vote...`);
  const submitVote2 = await ENBBounty.connect(charlie).submitClaimForVote(
    5,
    claimIds[8],
  );
  await submitVote2.wait();
  console.log(`   ✅ Claim #${claimIds[8]} submitted for voting`);

  // 7.3 Cast one vote
  console.log(`7.3 Bob voting on claim #${claimIds[8]}...`);
  const vote3 = await ENBBounty.connect(bob).voteClaim(5, true);
  await vote3.wait();
  console.log('   ✅ Bob voted YES');

  // Advance time beyond voting period to allow reset
  const currentVotingPeriod = await ENBBounty.votingPeriod();
  console.log(
    `   ⏩ Advancing time by ${currentVotingPeriod.toString()} seconds to end voting period...`,
  );
  await ethers.provider.send('evm_increaseTime', [
    Number(currentVotingPeriod) + 1,
  ]);
  await ethers.provider.send('evm_mine', []);

  // 7.4 Reset voting period (as issuer)
  console.log('7.4 Issuer resetting voting period on bounty #5...');
  const reset = await ENBBounty.connect(bob).resetVotingPeriod(5);
  await reset.wait();
  console.log('   ✅ Voting period reset - Previous votes cleared');

  // 7.5 Re-submit the claim for voting after reset
  console.log(
    `7.5 Re-submitting claim #${claimIds[8]} for vote after reset...`,
  );
  const resubmitVote2 = await ENBBounty.connect(charlie).submitClaimForVote(
    5,
    claimIds[8],
  );
  await resubmitVote2.wait();
  console.log('   ✅ Claim resubmitted for voting');

  // 7.6 Cast votes after reset and resolve
  console.log('7.6 Casting votes after reset on bounty #5...');
  const voteAfterReset1 = await ENBBounty.connect(alice).voteClaim(5, true);
  await voteAfterReset1.wait();
  console.log('   ✅ Alice voted YES');

  const voteAfterReset2 = await ENBBounty.connect(bob).voteClaim(5, true);
  await voteAfterReset2.wait();
  console.log('   ✅ Bob voted YES');

  console.log('7.7 Advancing time and resolving vote for bounty #5...');
  const votingPeriod5 = await ENBBounty.votingPeriod();
  await ethers.provider.send('evm_increaseTime', [Number(votingPeriod5) + 1]);
  await ethers.provider.send('evm_mine', []);
  const resolve5 = await ENBBounty.connect(bob).resolveVote(5);
  await resolve5.wait();
  console.log('   ✅ Vote resolved for bounty #5, winning claim accepted');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 8: CANCEL OPEN BOUNTY (Testing BountyCancelled on open bounties)
  // ===========================================
  console.log('📌 SECTION 8: CANCEL OPEN BOUNTY (ETH)\n');

  console.log('8.1 Creating open bounty #8 (issuer: Alice)...');
  const tx12b = await ENBBounty.connect(alice)[
    'createOpenBounty(string,string,uint256)'
  ]('Cancel Open Test', 'Open bounty to be cancelled', 2, {
    value: ethers.parseEther('0.08'),
  });
  await tx12b.wait();
  console.log('   ✅ Bounty #8 created');

  console.log('8.2 Bob joining open bounty #8...');
  const tx13b = await ENBBounty.connect(bob).joinOpenBounty(8, {
    value: ethers.parseEther('0.02'),
  });
  await tx13b.wait();
  console.log('   ✅ Bob joined with 0.02 ETH');

  console.log('8.3 Alice cancelling open bounty #8...');
  const cancelOpen = await ENBBounty.connect(alice).cancelOpenBounty(8);
  await cancelOpen.wait();
  console.log('   ✅ Bounty #8 cancelled - Participant refunded');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 9: RESOLVE VOTE (Testing resolve-based acceptance path)
  // ===========================================
  console.log('📌 SECTION 9: RESOLVE VOTE\n');

  console.log('9.1 Creating open bounty #9 (issuer: Alice)...');
  const tx14 = await ENBBounty.connect(alice)[
    'createOpenBounty(string,string,uint256)'
  ]('Resolve Vote Test', 'Acceptance via resolveVote', 2, {
    value: ethers.parseEther('0.06'),
  });
  await tx14.wait();
  console.log('   ✅ Bounty #9 created');

  console.log('9.2 Charlie joining open bounty #9...');
  const tx15 = await ENBBounty.connect(charlie).joinOpenBounty(9, {
    value: ethers.parseEther('0.03'),
  });
  await tx15.wait();
  console.log('   ✅ Charlie joined with 0.03 ETH');

  console.log('9.3 David creates claim on bounty #9...');
  const claim10 = await ENBBounty.connect(david).createClaim(
    9,
    'Resolve Claim',
    'https://example.com/resolve',
    'Claim to be accepted via resolveVote',
  );
  await claim10.wait();
  const claimId9 = initialClaimCounter + 9n;
  claimIds.push(claimId9);
  console.log(`   ✅ Claim #${claimId9} created by David`);

  console.log('9.4 David submits claim for voting on #9...');
  const submitVote3 = await ENBBounty.connect(david).submitClaimForVote(
    9,
    claimIds[9],
  );
  await submitVote3.wait();
  console.log('   ✅ Voting started for claim');

  console.log('9.5 Alice voting YES (has higher stake) ...');
  const vote4 = await ENBBounty.connect(alice).voteClaim(9, true);
  await vote4.wait();
  console.log('   ✅ Alice voted YES');

  console.log('9.6 Charlie voting NO...');
  const vote5 = await ENBBounty.connect(charlie).voteClaim(9, false);
  await vote5.wait();
  console.log('   ✅ Charlie voted NO');

  console.log('9.7 Advancing time to after voting deadline, then resolving...');
  const votingPeriod9 = await ENBBounty.votingPeriod();
  await ethers.provider.send('evm_increaseTime', [Number(votingPeriod9) + 1]);
  await ethers.provider.send('evm_mine', []);
  const resolveTx = await ENBBounty.connect(alice).resolveVote(9);
  await resolveTx.wait();
  console.log('   ✅ Vote resolved, winning claim accepted');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 10: TOKEN WITHDRAWAL ON OPEN BOUNTY (Testing WithdrawFromOpenBounty with tokens)
  // ===========================================
  console.log('📌 SECTION 10: TOKEN WITHDRAWAL (USDC)\n');

  console.log('10.1 Creating open USDC bounty #10 (issuer: Bob)...');
  const openUsdcAmount2 = ethers.parseUnits('40', 6);
  await MockUSDC.connect(bob).approve(ENBBounty.target, openUsdcAmount2);
  const tx16 = await ENBBounty.connect(bob).createOpenTokenBounty(
    'Token Withdraw Test',
    'Open USDC join and withdraw',
    3,
    MockUSDC.target,
    openUsdcAmount2,
  );
  await tx16.wait();
  console.log('   ✅ Bounty #10 created');

  console.log('10.2 Alice joining bounty #10 with 15 USDC...');
  const joinUsdcAmount2 = ethers.parseUnits('15', 6);
  await MockUSDC.connect(alice).approve(ENBBounty.target, joinUsdcAmount2);
  const tx17 = await ENBBounty.connect(alice).joinOpenBountyWithToken(
    10,
    joinUsdcAmount2,
  );
  await tx17.wait();
  console.log('   ✅ Alice joined with 15 USDC');

  console.log('10.3 Alice withdrawing from bounty #10...');
  const withdraw2 = await ENBBounty.connect(alice).withdrawFromOpenBounty(10);
  await withdraw2.wait();
  console.log('   ✅ Alice withdrew 15 USDC from bounty #10');

  console.log('\n' + '='.repeat(60) + '\n');

  // ===========================================
  // SECTION 11: DEFAULT OPEN BOUNTY OVERLOAD (no maxWinners)
  // ===========================================
  console.log('📌 SECTION 11: DEFAULT OPEN BOUNTY OVERLOAD\n');

  console.log(
    '11.1 Creating open bounty #11 without maxWinners (defaults to 1)...',
  );
  const tx18 = await ENBBounty.connect(alice)[
    'createOpenBounty(string,string)'
  ]('Default Overload', 'No explicit max winners', {
    value: ethers.parseEther('0.02'),
  });
  await tx18.wait();
  console.log('   ✅ Bounty #11 created with default 1 winner');

  // ===========================================
  // SUMMARY
  // ===========================================
  console.log('🎉 TEST COMPLETE - EVENT SUMMARY\n');
  console.log('Events Generated (key types):');
  console.log('  ✅ BountyCreatedWithMaxWinners');
  console.log('  ✅ TokenBountyCreated');
  console.log('  ✅ BountyJoined');
  console.log('  ✅ ClaimCreated');
  console.log('  ✅ ClaimAccepted (direct and via resolveVote)');
  console.log('  ✅ ClaimSubmittedForVote');
  console.log('  ✅ VoteClaim');
  console.log('  ✅ BountyCancelled');
  console.log('  ✅ WithdrawFromOpenBounty');
  console.log('  ✅ VotingPeriodReset');

  console.log('\nBounties Created:');
  console.log('  #0: ETH solo (0.1 ETH, 1 winner) - COMPLETED');
  console.log('  #1: ETH multi (0.3 ETH, 3 winners) - COMPLETED');
  console.log('  #2: USDC (100 USDC, 1 winner) - COMPLETED');
  console.log('  #3: ENB (500 ENB, 2 winners) - ACTIVE');
  console.log('  #4: Open ETH (0.085 ETH, 5 winners) - 1/5 claimed');
  console.log('  #5: Open USDC (80 USDC, 10 winners) - VOTING');
  console.log('  #6: ETH solo - CANCELLED');
  console.log('  #7: Open ETH (0.1 ETH, 2 winners) - ACTIVE');

  console.log('\n' + '='.repeat(60));
  console.log('✨ All events have been generated successfully!');
  console.log('\n📋 Contract Addresses Used:');
  console.log('  ENBBounty:', deployment.contracts.ENBBounty);
  console.log('  ENBBountyNft:', deployment.contracts.ENBBountyNft);
  console.log('  MockUSDC:', deployment.contracts.MockUSDC);
  console.log('  MockENB:', deployment.contracts.MockENB);
  console.log('\nRun the query script to verify indexing.');
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

// to run: npx hardhat run scripts/create-test-all-events.ts --network localhost
