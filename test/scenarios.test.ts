// open bounty with x participants
import {
  cancelOpenBounty,
  createClaim,
  createOpenBounty,
  joinOpenBounty,
  submitClaimForVote,
  voteClaim,
  withdrawFromOpenBounty,
} from './utils';
import * as testData from './test-data.json';
import { Contract, ContractFactory } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

import { ethers } from 'hardhat';
import { expect } from 'chai';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Bounty {
  id: bigint;
  issuer: string;
  name: string;
  description: string;
  amount: bigint;
  claimer: string;
  createdAt: bigint;
  claimId: bigint;
}

interface Claim {
  id: number;
  issuer: string;
  bountyId: number;
  bountyIssuer: string;
  name: string;
  description: string;
  createdAt: number;
  accepted: boolean;
}

interface Participants {
  participants: string[];
  participantAmounts: number[];
}

interface Votes {
  yes: bigint;
  no: bigint;
  deadline: bigint;
}

describe('Open Bounty Simulation', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let enbBountyFactory: ContractFactory;
  let enbBountyNftFactory: ContractFactory;
  let owner: SignerWithAddress;

  before(async function () {
    [owner] = await ethers.getSigners();

    // create nft contract
    enbBountyNftFactory = await ethers.getContractFactory('ENBBountyNft');
    enbBountyNft = (await enbBountyNftFactory.deploy(
      owner.address,
      owner.address,
      '500',
    )) as Contract;

    enbBountyFactory = await ethers.getContractFactory('ENBBounty');
    enbBounty = (await enbBountyFactory.deploy(
      await enbBountyNft.getAddress(),
      owner.address,
      0,
      ethers.ZeroAddress, // USDC address
      ethers.ZeroAddress  // ENB address
    )) as Contract;

    await enbBountyNft.setENBBountyContract(await enbBounty.getAddress(), true);
  });

  it('Simulates a Voting Cycle', async function () {
    const bounty = testData.bounties[0];
    const claims = testData.bounties[0].claims;
    if (!claims) throw new Error('No claims found in test data');

    await createOpenBounty(
      enbBounty,
      bounty.name,
      bounty.description,
      bounty.amount,
    );

    const signers = await ethers.getSigners();

    await signers.forEach(async (signer, index) => {
      if (index === 0 || index > 5) return;
      const claim = claims[index - 1];

      await createClaim(
        enbBounty.connect(signer) as Contract,
        '0',
        claim.name,
        claim.description,
        claim.uri,
      );
    });

    await wait(1000);

    const claimCounter = await enbBounty.claimCounter();
    expect(claimCounter).to.equal(3);

    await signers.forEach(async (signer, index) => {
      if (index === 0 || index > 5) return;
      await joinOpenBounty(
        enbBounty.connect(signer) as Contract,
        '0',
        bounty.participants![index - 1].amount,
      );
    });

    await wait(1000);

    const participantsRaw = await enbBounty.getParticipants(0);
    const b: Participants = {
      participants: participantsRaw[0],
      participantAmounts: participantsRaw[1],
    };

    expect(b.participants.length).to.equal(6);
    expect(b.participantAmounts.length).to.equal(6);

    bounty.participants!.forEach((p, i) => {
      expect(b.participants).to.include(p.address);
      expect(b.participantAmounts[i]).to.equal(ethers.parseEther(p.amount));
    });

    await submitClaimForVote(enbBounty.connect(signers[2]) as Contract, '0', '1');

    // Skip voting state verification since bountyVotingTracker is not public
    // Just proceed with voting and resolution after deadline
    const timestamp = await time.latest();
    const twoDaysInSeconds = 172800;
    const votingDeadline = timestamp + twoDaysInSeconds;

    // Vote with majority of participants for the claim to pass
    await voteClaim(enbBounty.connect(signers[0]) as Contract, '0', true); // Creator votes yes
    await voteClaim(enbBounty.connect(signers[1]) as Contract, '0', true); // Participant 1 votes yes
    await voteClaim(enbBounty.connect(signers[2]) as Contract, '0', true); // Participant 2 votes yes
    await voteClaim(enbBounty.connect(signers[3]) as Contract, '0', true); // Participant 3 votes yes
    await voteClaim(enbBounty.connect(signers[4]) as Contract, '0', false); // Participant 4 votes no
    await voteClaim(enbBounty.connect(signers[5]) as Contract, '0', false); // Participant 5 votes no

    await time.increaseTo(votingDeadline);
    await wait(1000);

    await enbBounty.resolveVote(0);

    await wait(2000);

    const bountyAfterVotes = await enbBounty
      .getBounties(0)
      .then((b: Bounty[]) =>
        b.filter((x: Bounty) => x.issuer !== ethers.ZeroAddress),
      )
      .then((x: Bounty[]) => x[0]);

    expect(bountyAfterVotes.claimer).to.equal(signers[2].address);
    expect(bountyAfterVotes.claimId).to.equal(1);

    const c: Claim[] = await enbBounty.getClaimsByBountyId(0);
    expect(c[1].accepted).to.equal(true);

    const balance = await enbBountyNft.balanceOf(signers[0].address);
    expect(balance).to.equal(1);
  });
  it('Can withdraw from a public bounty', async function () {
    const bounty = testData.bounties[1];
    const claims = testData.bounties[1].claims;
    if (!claims) throw new Error('No claims found in test data');

    await createOpenBounty(
      enbBounty,
      bounty.name,
      bounty.description,
      bounty.amount,
    );

    const bountiesLength = await enbBounty.getBountiesLength();
    expect(bountiesLength).to.equal(2);

    const signers = await ethers.getSigners();

    await signers.forEach(async (signer, index) => {
      if (index === 0 || index > 5) return;
      await joinOpenBounty(
        enbBounty.connect(signer) as Contract,
        '1',
        bounty.participants![index - 1].amount,
      );
    });

    await wait(1000);

    const participantsRaw = await enbBounty.getParticipants(0);
    const b: Participants = {
      participants: participantsRaw[0],
      participantAmounts: participantsRaw[1],
    };

    expect(b.participants.length).to.equal(6);
    expect(b.participantAmounts.length).to.equal(6);

    await withdrawFromOpenBounty(enbBounty.connect(signers[2]) as Contract, '1');

    await wait(1000);

    const bAfterWithdraw = await enbBounty.getParticipants(1);

    expect(bAfterWithdraw[0]).to.include(ethers.ZeroAddress);
  });
  it('Can cancel an open bounty and refund participants', async function () {
    const signers = await ethers.getSigners();

    await cancelOpenBounty(enbBounty, '1');

    const bAfterCancel = await enbBounty
      .getBounties(1)
      .then((b: Bounty[]) =>
        b.filter((x: Bounty) => x.issuer !== ethers.ZeroAddress),
      )
      .then((x: Bounty[]) => x[0]);

    expect(bAfterCancel.claimer).to.equal(signers[0].address);
  });
});
