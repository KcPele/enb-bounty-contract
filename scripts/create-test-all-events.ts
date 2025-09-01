import { ethers } from 'hardhat';
import fs from 'fs';

// This script seeds the local chain with comprehensive scenarios
// covering all ENBBounty functions and events so the indexer/frontend
// can display a realistic mix of states.
//
// Run: npx hardhat run scripts/create-test-all-events.ts --network localhost

type Addr = string;

async function main() {
  console.log('🚀 Seeding comprehensive ENB scenarios (all events/states)');
  console.log('='.repeat(80));

  // Load deployment info written by deploy-local-with-tokens.ts
  const deployment = JSON.parse(
    fs.readFileSync('./deployments/localhost.json', 'utf8'),
  );

  const [
    deployer,
    treasury,
    authority,
    alice,
    bob,
    charlie,
    david,
    eve,
    frank,
    george,
    hannah,
  ] = await ethers.getSigners();

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
  console.log('  ENBBounty   :', ENBBounty.target);
  console.log('  ENBBountyNft:', ENBBountyNft.target);
  console.log('  MockUSDC    :', MockUSDC.target);
  console.log('  MockENB     :', MockENB.target);
  console.log('-'.repeat(80));

  // Ensure the bounty contract is authorized on the NFT (idempotent)
  try {
    await (
      await ENBBountyNft.connect(authority).setENBBountyContract(
        ENBBounty.target,
        true,
      )
    ).wait();
  } catch {}

  // Helper utils
  const nextClaimId = async (): Promise<bigint> => ENBBounty.claimCounter();
  const mine = async (secs: number) => {
    await ethers.provider.send('evm_increaseTime', [secs]);
    await ethers.provider.send('evm_mine', []);
  };
  const approve = async (
    signer: any,
    token: any,
    spender: Addr,
    amount: bigint,
  ) => {
    await (await token.connect(signer).approve(spender, amount)).wait();
  };

  // Distribute more tokens to participants to ensure approvals succeed
  const topUpUSDC = ethers.parseUnits('20000', 6);
  const topUpENB = ethers.parseEther('20000');
  for (const s of [alice, bob, charlie, david, eve, frank, george, hannah]) {
    await (await MockUSDC.mint(s.address, topUpUSDC)).wait();
    await (await MockENB.mint(s.address, topUpENB)).wait();
  }

  const scenarios: Array<{ id: number; label: string }> = [];

  // 0) Solo ETH bounty (closed: 1/1)
  await (
    await ENBBounty.connect(alice)['createSoloBounty(string,string,uint256)'](
      'Solo ETH Fix',
      'Fix production bug',
      1,
      { value: ethers.parseEther('0.15') },
    )
  ).wait();
  scenarios.push({ id: 0, label: 'SOLO ETH closed (1/1 winners)' });
  const c0 = await nextClaimId();
  await (
    await ENBBounty.connect(charlie).createClaim(
      0,
      'Patch v1',
      'ipfs://QmPatchV1',
      'Implements a fix',
    )
  ).wait();
  await (await ENBBounty.connect(alice).acceptClaim(0, c0)).wait();

  // 1) Solo ETH with pending claims (open + submissions not yet accepted)
  await (
    await ENBBounty.connect(alice)['createSoloBounty(string,string,uint256)'](
      'Solo ETH Draft',
      'Evaluate proposals',
      1,
      { value: ethers.parseEther('0.1') },
    )
  ).wait();
  scenarios.push({ id: 1, label: 'SOLO ETH open (claims pending)' });
  await (
    await ENBBounty.connect(david).createClaim(
      1,
      'Draft submission',
      'ipfs://QmDraft',
      'Pending review',
    )
  ).wait();

  // 2) ETH multi (3 winners), fully claimed (closed)
  await (
    await ENBBounty.connect(bob)['createSoloBounty(string,string,uint256)'](
      'ETH Contest',
      'Best ideas',
      3,
      { value: ethers.parseEther('0.6') },
    )
  ).wait();
  scenarios.push({ id: 2, label: 'ETH multi closed (3/3 winners)' });
  const c2a = await nextClaimId();
  await (await ENBBounty.connect(alice).createClaim(2, 'A', 'ipfs://Qa', 'A')).wait();
  const c2b = c2a + 1n;
  await (await ENBBounty.connect(charlie).createClaim(2, 'B', 'ipfs://Qb', 'B')).wait();
  const c2c = c2a + 2n;
  await (await ENBBounty.connect(david).createClaim(2, 'C', 'ipfs://Qc', 'C')).wait();
  await (await ENBBounty.connect(bob).acceptClaim(2, c2a)).wait();
  await (await ENBBounty.connect(bob).acceptClaim(2, c2b)).wait();
  await (await ENBBounty.connect(bob).acceptClaim(2, c2c)).wait();

  // 3) USDC solo (closed)
  const usdcSoloAmt = ethers.parseUnits('120', 6);
  await approve(alice, MockUSDC, ENBBounty.target as Addr, usdcSoloAmt);
  await (
    await ENBBounty.connect(alice).createTokenBounty(
      'USDC Solo',
      'Docs bounty',
      1,
      MockUSDC.target,
      usdcSoloAmt,
      { value: 0 },
    )
  ).wait();
  scenarios.push({ id: 3, label: 'USDC solo closed (1/1 winners)' });
  const c3 = await nextClaimId();
  await (
    await ENBBounty.connect(bob).createClaim(
      3,
      'Docs v1',
      'ipfs://Qdocs',
      'Complete documentation',
    )
  ).wait();
  await (await ENBBounty.connect(alice).acceptClaim(3, c3)).wait();

  // 4) Open ETH bounty (participants join), voting started (isVoting)
  await (
    await ENBBounty.connect(alice)['createOpenBounty(string,string,uint256)'](
      'Open ETH Art',
      'Community art project',
      5,
      { value: ethers.parseEther('0.05') },
    )
  ).wait();
  scenarios.push({ id: 4, label: 'Open ETH voting in progress' });
  await (
    await ENBBounty.connect(charlie).joinOpenBounty(4, {
      value: ethers.parseEther('0.02'),
    })
  ).wait();
  await (
    await ENBBounty.connect(david).joinOpenBounty(4, {
      value: ethers.parseEther('0.03'),
    })
  ).wait();
  const c4 = await nextClaimId();
  await (await ENBBounty.connect(david).createClaim(4, 'Art', 'ipfs://Qart', 'Art')).wait();
  await (await ENBBounty.connect(david).submitClaimForVote(4, c4)).wait();
  // Only participants can vote on open ETH bounties; use Charlie and David
  await (await ENBBounty.connect(charlie).voteClaim(4, true)).wait();
  await (await ENBBounty.connect(david).voteClaim(4, true)).wait();

  // 5) Open USDC bounty with up to 10 winners, partially accepted
  const openUsdc = ethers.parseUnits('200', 6);
  await approve(bob, MockUSDC, ENBBounty.target as Addr, openUsdc);
  await (
    await ENBBounty.connect(bob).createOpenTokenBounty(
      'USDC Bug Bounty',
      'Find vulns',
      10,
      MockUSDC.target,
      openUsdc,
    )
  ).wait();
  scenarios.push({ id: 5, label: 'Open USDC (10 winners) partial accepted' });
  await approve(alice, MockUSDC, ENBBounty.target as Addr, ethers.parseUnits('50', 6));
  await (
    await ENBBounty.connect(alice).joinOpenBountyWithToken(5, ethers.parseUnits('50', 6))
  ).wait();
  const c5a = await nextClaimId();
  await (await ENBBounty.connect(alice).createClaim(5, 'A', 'ipfs://Qa', 'A')).wait();
  const c5b = c5a + 1n;
  await (await ENBBounty.connect(charlie).createClaim(5, 'B', 'ipfs://Qb', 'B')).wait();
  const c5c = c5a + 2n;
  await (await ENBBounty.connect(david).createClaim(5, 'C', 'ipfs://Qc', 'C')).wait();
  const c5d = c5a + 3n;
  await (await ENBBounty.connect(eve).createClaim(5, 'D', 'ipfs://Qd', 'D')).wait();
  const c5e = c5a + 4n;
  await (await ENBBounty.connect(frank).createClaim(5, 'E', 'ipfs://Qe', 'E')).wait();
  const c5f = c5a + 5n;
  await (await ENBBounty.connect(charlie).createClaim(5, 'F', 'ipfs://Qf', 'F')).wait();
  // For open bounties with >1 participant, claims must be accepted via voting.
  const submitVoteResolve = async (
    submitter: any,
    bountyId: number,
    claimId: bigint,
  ) => {
    await (await ENBBounty.connect(submitter).submitClaimForVote(bountyId, claimId)).wait();
    await (await ENBBounty.connect(alice).voteClaim(bountyId, true)).wait();
    await (await ENBBounty.connect(bob).voteClaim(bountyId, true)).wait();
    const vp = await ENBBounty.votingPeriod();
    await mine(Number(vp) + 1);
    await (await ENBBounty.connect(bob).resolveVote(bountyId)).wait();
  };

  await submitVoteResolve(alice, 5, c5a);
  await submitVoteResolve(charlie, 5, c5b);
  await submitVoteResolve(david, 5, c5c);
  await submitVoteResolve(eve, 5, c5d);
  // Leave some pending (E, F)

  // 6) Open ENB bounty: participants + submissions, no winners yet
  const enbAmt = ethers.parseEther('300');
  await approve(alice, MockENB, ENBBounty.target as Addr, enbAmt);
  await (
    await ENBBounty.connect(alice).createOpenTokenBounty(
      'ENB Open',
      'ENB community work',
      4,
      MockENB.target,
      enbAmt,
    )
  ).wait();
  scenarios.push({ id: 6, label: 'Open ENB (claims, no winners yet)' });
  await approve(charlie, MockENB, ENBBounty.target as Addr, ethers.parseEther('50'));
  await (
    await ENBBounty.connect(charlie).joinOpenBountyWithToken(6, ethers.parseEther('50'))
  ).wait();
  await (
    await ENBBounty.connect(david).createClaim(6, 'Idea', 'ipfs://Qidea', 'Idea')
  ).wait();

  // 7) Cancel open bounty after participants (refunds)
  await (
    await ENBBounty.connect(alice)['createOpenBounty(string,string,uint256)'](
      'Open to cancel',
      'Will be cancelled',
      2,
      { value: ethers.parseEther('0.08') },
    )
  ).wait();
  scenarios.push({ id: 7, label: 'Open ETH cancelled (refunds)' });
  await (
    await ENBBounty.connect(bob).joinOpenBounty(7, { value: ethers.parseEther('0.02') })
  ).wait();
  await (await ENBBounty.connect(alice).cancelOpenBounty(7)).wait();

  // 8) Join then withdraw from open bounty (ETH)
  await (
    await ENBBounty.connect(bob)['createOpenBounty(string,string,uint256)'](
      'Join & Withdraw',
      'Participant will withdraw',
      2,
      { value: ethers.parseEther('0.05') },
    )
  ).wait();
  scenarios.push({ id: 8, label: 'Open ETH: joined then withdrew' });
  await (
    await ENBBounty.connect(charlie).joinOpenBounty(8, { value: ethers.parseEther('0.05') })
  ).wait();
  await (await ENBBounty.connect(charlie).withdrawFromOpenBounty(8)).wait();

  // 9) Voting cycle with reset then resolve
  await (
    await ENBBounty.connect(bob)['createOpenBounty(string,string,uint256)'](
      'Vote Reset',
      'Reset then resolve',
      2,
      { value: ethers.parseEther('0.06') },
    )
  ).wait();
  scenarios.push({ id: 9, label: 'Open ETH: voting reset then resolved' });
  const c9 = await nextClaimId();
  await (
    await ENBBounty.connect(charlie).createClaim(9, 'Reset Claim', 'ipfs://Qreset', 'Reset flow')
  ).wait();
  // Ensure voters are participants on bounty #9 (ETH open) BEFORE submitting for vote
  await (
    await ENBBounty.connect(alice).joinOpenBounty(9, { value: ethers.parseEther('0.02') })
  ).wait();
  // Bob is already a participant as the issuer of an open bounty with initial value.
  await (await ENBBounty.connect(charlie).submitClaimForVote(9, c9)).wait();
  await (await ENBBounty.connect(alice).voteClaim(9, true)).wait();
  const vp9 = await ENBBounty.votingPeriod();
  await mine(Number(vp9) + 1);
  await (await ENBBounty.connect(bob).resetVotingPeriod(9)).wait();
  await (await ENBBounty.connect(charlie).submitClaimForVote(9, c9)).wait();
  await (await ENBBounty.connect(alice).voteClaim(9, true)).wait();
  await (await ENBBounty.connect(bob).voteClaim(9, true)).wait();
  const vp9b = await ENBBounty.votingPeriod();
  await mine(Number(vp9b) + 1);
  await (await ENBBounty.connect(bob).resolveVote(9)).wait();

  // 10) Open USDC bounty with 10 winners (fully closed, 10/10)
  const open10 = ethers.parseUnits('1000', 6);
  await approve(alice, MockUSDC, ENBBounty.target as Addr, open10);
  await (
    await ENBBounty.connect(alice).createOpenTokenBounty(
      'USDC Mega',
      '10 winners bounty',
      10,
      MockUSDC.target,
      open10,
    )
  ).wait();
  scenarios.push({ id: 10, label: 'Open USDC closed (10/10 winners)' });
  // Create 10 claims and accept them all
  const baseId = await nextClaimId();
  // Exclude the issuer (alice) from claimers to avoid IssuerCannotClaim
  const claimers = [
    bob,
    charlie,
    david,
    eve,
    frank,
    deployer,
    treasury,
    authority,
    george,
    hannah,
  ];
  const ids: bigint[] = [];
  for (let i = 0; i < 10; i++) {
    const cid = baseId + BigInt(i);
    await (
      await ENBBounty.connect(claimers[i]!)
        .createClaim(10, `C${i + 1}`, `ipfs://Qx${i + 1}`, `Claim ${i + 1}`)
    ).wait();
    ids.push(cid);
  }
  for (const cid of ids) {
    await (await ENBBounty.connect(alice).acceptClaim(10, cid)).wait();
  }

  console.log('\n🎯 Scenarios seeded:');
  for (const s of scenarios) console.log(`  #${s.id}: ${s.label}`);

  console.log('\n✅ Events exercised:');
  console.log('  - TokenBountyCreated / create(Open)Bounty(WithToken)');
  console.log('  - BountyJoined / joinOpenBounty(WithToken)');
  console.log('  - WithdrawFromOpenBounty');
  console.log('  - BountyCancelled (open)');
  console.log('  - ClaimCreated');
  console.log('  - ClaimSubmittedForVote');
  console.log('  - VoteClaim');
  console.log('  - VotingPeriodReset');
  console.log('  - ClaimAccepted (direct and via resolveVote)');

  console.log('\n📋 Addresses:');
  console.log('  ENBBounty   :', deployment.contracts.ENBBounty);
  console.log('  ENBBountyNft:', deployment.contracts.ENBBountyNft);
  console.log('  MockUSDC    :', deployment.contracts.MockUSDC);
  console.log('  MockENB     :', deployment.contracts.MockENB);

  console.log('\n✨ Done. The indexer/frontend should now show a rich mixture of states.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seeding scenarios:', err);
    process.exit(1);
  });
