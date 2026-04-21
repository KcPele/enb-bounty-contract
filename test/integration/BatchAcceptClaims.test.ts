import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Batch Accept Claims', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;
  let eve: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async function () {
    signers = await ethers.getSigners();
    [owner, alice, bob, charlie, david, eve] = signers;

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy(
      'Mock Token',
      'MTK',
      ethers.parseEther('1000000'),
    );

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], { kind: 'uups' });

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);
    await mockToken.transfer(alice.address, ethers.parseEther('100000'));
  });

  async function createBountyWithClaimers(
    issuer: SignerWithAddress,
    maxWinners: number,
    bountyAmount: bigint,
  ) {
    await enbBounty.connect(issuer).createSoloBounty(
      'Batch Test Bounty',
      'Testing batch accept',
      maxWinners,
      30,
      0,
      { value: bountyAmount },
    );
  }

  describe('Successful Batch Acceptance', function () {
    it('Should batch accept 2 claimers', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      await enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, charlie.address]);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(2);

      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.true;
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.true;
    });

    it('Should batch accept 5 claimers', async function () {
      await createBountyWithClaimers(
        alice,
        10,
        ethers.parseEther('10'),
      );

      const claimerAddresses = signers.slice(2, 7).map((s) => s.address);
      await enbBounty.connect(alice).batchAcceptClaims(0, claimerAddresses);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(5);

      const winners = await enbBounty.bountyWinners(0);
      expect(winners.length).to.equal(5);
    });

    it('Should batch accept 10 claimers (max batch)', async function () {
      const numClaimers = 10;
      await enbBounty.connect(alice).createSoloBounty(
        'Big Bounty',
        'Testing max batch',
        numClaimers,
        30,
        0,
        { value: ethers.parseEther('10') },
      );

      const claimerAddresses = signers.slice(2, 12).map((s) => s.address);
      await enbBounty.connect(alice).batchAcceptClaims(0, claimerAddresses);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(numClaimers);
    });

    it('Should batch accept 1 claimer (degenerate case)', async function () {
      await createBountyWithClaimers(
        alice,
        3,
        ethers.parseEther('3'),
      );

      await enbBounty.connect(alice).batchAcceptClaims(0, [bob.address]);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(1);
    });

    it('Should distribute correct payouts to all claimers', async function () {
      const bountyAmount = ethers.parseEther('3');
      const maxWinners = 3;

      await createBountyWithClaimers(alice, maxWinners, bountyAmount);

      const netBountyAmount = (bountyAmount * 1000n) / 1150n;
      const perWinner = netBountyAmount / BigInt(maxWinners);
      const fee = (perWinner * 100n) / 1000n;
      const expectedPayout = perWinner - fee;

      const balancesBefore = await Promise.all(
        [bob, charlie, david].map((s) =>
          ethers.provider.getBalance(s.address),
        ),
      );

      await enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, charlie.address, david.address]);

      const balancesAfter = await Promise.all(
        [bob, charlie, david].map((s) =>
          ethers.provider.getBalance(s.address),
        ),
      );

      for (let i = 0; i < 3; i++) {
        expect(balancesAfter[i] - balancesBefore[i]).to.equal(
          expectedPayout,
        );
      }
    });

    it('Should work with token bounties', async function () {
      const tokenAmount = ethers.parseEther('3000');
      const maxWinners = 3;

      const approveAmount = (tokenAmount * 1150n) / 1000n;
      await mockToken
        .connect(alice)
        .approve(await enbBounty.getAddress(), approveAmount);

      await enbBounty.connect(alice).createTokenBounty(
        'Token Batch Bounty',
        'Description',
        maxWinners,
        await mockToken.getAddress(),
        tokenAmount,
        30,
        0,
        { value: 0 },
      );

      const balancesBefore = await Promise.all(
        [bob, charlie, david].map((s) =>
          mockToken.balanceOf(s.address),
        ),
      );

      await enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, charlie.address, david.address]);

      const balancesAfter = await Promise.all(
        [bob, charlie, david].map((s) =>
          mockToken.balanceOf(s.address),
        ),
      );

      const perWinner = tokenAmount / BigInt(maxWinners);
      const fee = (perWinner * 100n) / 1000n;
      const expectedPayout = perWinner - fee;

      for (let i = 0; i < 3; i++) {
        expect(balancesAfter[i] - balancesBefore[i]).to.equal(
          expectedPayout,
        );
      }
    });
  });

  describe('Event Emissions', function () {
    it('Should emit individual ClaimAccepted and BatchClaimsAccepted events', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      const tx = await enbBounty
        .connect(alice)
        .batchAcceptClaims(0, [bob.address, charlie.address, david.address]);
      const receipt = await tx.wait();

      const claimAcceptedTopic = ethers.id(
        'ClaimAccepted(uint256,address,address,uint256)',
      );
      const claimAcceptedLogs = receipt.logs.filter(
        (log: { topics: string[] }) => log.topics[0] === claimAcceptedTopic,
      );
      expect(claimAcceptedLogs.length).to.equal(3);

      const batchAcceptedTopic = ethers.id(
        'BatchClaimsAccepted(uint256,address[],uint256)',
      );
      const batchAcceptedLogs = receipt.logs.filter(
        (log: { topics: string[] }) => log.topics[0] === batchAcceptedTopic,
      );
      expect(batchAcceptedLogs.length).to.equal(1);
    });
  });

  describe('Revert Cases', function () {
    it('Should revert with empty claimers array', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, []),
      ).to.be.revertedWithCustomError(enbBounty, 'BatchSizeInvalid');
    });

    it('Should revert with more than 10 claimers', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Big Bounty',
        'Description',
        15,
        30,
        0,
        { value: ethers.parseEther('15') },
      );

      const claimerAddresses = signers.slice(2, 13).map((s) => s.address);
      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, claimerAddresses),
      ).to.be.revertedWithCustomError(enbBounty, 'BatchSizeInvalid');
    });

    it('Should revert when non-issuer calls', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      await expect(
        enbBounty.connect(bob).batchAcceptClaims(0, [bob.address, charlie.address]),
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');
    });

    it('Should revert when claimer already won', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, charlie.address]),
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });

    it('Should revert when same address appears twice in batch', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Batch Bounty',
        'Description',
        5,
        30,
        0,
        { value: ethers.parseEther('5') },
      );

      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, bob.address]),
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });

    it('Should revert when batch exceeds maxWinners', async function () {
      await createBountyWithClaimers(
        alice,
        2,
        ethers.parseEther('2'),
      );

      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, charlie.address, david.address]),
      ).to.be.revertedWithCustomError(
        enbBounty,
        'BatchExceedsMaxWinners',
      );
    });

    it('Should revert for non-existent bounty', async function () {
      await expect(
        enbBounty.connect(alice).batchAcceptClaims(999, [bob.address]),
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotFound');
    });

    it('Should revert when claimer is zero address', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, [bob.address, ethers.ZeroAddress]),
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });

    it('Should revert when claimer is bounty issuer', async function () {
      await createBountyWithClaimers(
        alice,
        5,
        ethers.parseEther('5'),
      );

      await expect(
        enbBounty.connect(alice).batchAcceptClaims(0, [alice.address]),
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });
  });

  describe('Gas Comparison', function () {
    it('Should use less gas than sequential acceptClaim calls', async function () {
      const numClaimers = 5;
      const bountyAmount = ethers.parseEther('10');

      // Sequential approach
      await enbBounty.connect(alice).createSoloBounty(
        'Sequential Bounty',
        'Description',
        numClaimers,
        30,
        0,
        { value: bountyAmount },
      );

      let sequentialGas = 0n;
      for (let i = 0; i < numClaimers; i++) {
        const claimer = signers[i + 2];
        const tx = await enbBounty.connect(alice).acceptClaim(0, claimer.address);
        const receipt = await tx.wait();
        sequentialGas += receipt.gasUsed;
      }

      // Batch approach
      await enbBounty.connect(alice).createSoloBounty(
        'Batch Bounty',
        'Description',
        numClaimers,
        30,
        0,
        { value: bountyAmount },
      );

      const claimerAddresses = signers.slice(2, 2 + numClaimers).map((s) => s.address);
      const batchTx = await enbBounty
        .connect(alice)
        .batchAcceptClaims(1, claimerAddresses);
      const batchReceipt = await batchTx.wait();
      const batchGas = batchReceipt.gasUsed;

      console.log(`Sequential gas (${numClaimers} calls): ${sequentialGas}`);
      console.log(`Batch gas (1 call): ${batchGas}`);
      console.log(
        `Savings: ${sequentialGas - batchGas} (${((sequentialGas - batchGas) * 100n) / sequentialGas}%)`,
      );

      expect(batchGas).to.be.lessThan(sequentialGas);
    });
  });
});
