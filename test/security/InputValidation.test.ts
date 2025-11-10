import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Input Validation & Edge Cases', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie, david, eve] = await ethers.getSigners();

    const ENBBountyNft = await ethers.getContractFactory('ENBBountyNft');
    enbBountyNft = await ENBBountyNft.deploy(owner.address, owner.address, '500');

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(
      await enbBountyNft.getAddress(),
      owner.address,
      0,
      await mockToken.getAddress(),
      ethers.ZeroAddress
    );

    await enbBountyNft.setENBBountyContract(await enbBounty.getAddress(), true);
  });

  describe('Bounty Creation Validation', function () {
    it('Should handle zero maxWinners by defaulting to 1', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        0,
        { value: ethers.parseEther('1') }
      );

      const bounty = await enbBounty.bounties(0);
      expect(bounty.maxWinners).to.equal(1);
    });

    it('Should reject bounty creation with zero value', async function () {
      await expect(
        enbBounty.connect(alice).createSoloBounty(
          'Zero Value Bounty',
          'Description',
          1,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(enbBounty, 'ZeroValue');
    });

    it('Should handle extremely long strings', async function () {
      const longName = 'A'.repeat(1000);
      const longDescription = 'B'.repeat(5000);

      await expect(
        enbBounty.connect(alice).createSoloBounty(
          longName,
          longDescription,
          1,
          { value: ethers.parseEther('1') }
        )
      ).to.not.be.reverted;

      const bounty = await enbBounty.bounties(0);
      expect(bounty.name).to.equal(longName);
      expect(bounty.description).to.equal(longDescription);
    });

    it('Should handle empty strings', async function () {
      await expect(
        enbBounty.connect(alice).createSoloBounty(
          '',
          '',
          1,
          { value: ethers.parseEther('1') }
        )
      ).to.not.be.reverted;

      const bounty = await enbBounty.bounties(0);
      expect(bounty.name).to.equal('');
      expect(bounty.description).to.equal('');
    });

    it('Should handle maximum uint256 for maxWinners', async function () {
      const maxUint256 = ethers.MaxUint256;
      
      await enbBounty.connect(alice).createSoloBounty(
        'Max Winners Bounty',
        'Description',
        maxUint256,
        { value: ethers.parseEther('1') }
      );

      const bounty = await enbBounty.bounties(0);
      expect(bounty.maxWinners).to.equal(maxUint256);
    });

    it('Should handle special characters in strings', async function () {
      const specialChars = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~\n\t\r';
      
      await enbBounty.connect(alice).createSoloBounty(
        specialChars,
        specialChars,
        1,
        { value: ethers.parseEther('1') }
      );

      const bounty = await enbBounty.bounties(0);
      expect(bounty.name).to.equal(specialChars);
    });
  });

  describe('Token Bounty Validation', function () {
    it('Should reject unsupported token addresses', async function () {
      const unsupportedToken = ethers.Wallet.createRandom().address;
      
      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Token Bounty',
          'Description',
          1,
          unsupportedToken,
          ethers.parseEther('10'),
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(enbBounty, 'TokenNotSupported');
    });

    it('Should reject zero token amount', async function () {
      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Zero Token Bounty',
          'Description',
          1,
          await mockToken.getAddress(),
          0,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(enbBounty, 'ZeroValue');
    });

    it('Should handle insufficient token balance', async function () {
      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Insufficient Balance',
          'Description',
          1,
          await mockToken.getAddress(),
          ethers.parseEther('1000'),
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle insufficient token allowance', async function () {
      await mockToken.transfer(alice.address, ethers.parseEther('100'));
      
      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'No Allowance',
          'Description',
          1,
          await mockToken.getAddress(),
          ethers.parseEther('10'),
          { value: 0 }
        )
      ).to.be.reverted;
    });
  });

  describe('Claim Creation Validation', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        3,
        { value: ethers.parseEther('3') }
      );
    });

    it('Should reject claims on non-existent bounties', async function () {
      await expect(
        enbBounty.connect(bob).createClaim(999, 'Claim', 'uri', 'Desc')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotFound');
    });

    it('Should reject claims on closed bounties', async function () {
      await enbBounty.connect(alice).cancelSoloBounty(0);
      
      await expect(
        enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClosed');
    });

    it('Should reject claims when max winners reached', async function () {
      const claimers = [bob, charlie, david];
      for (let i = 0; i < 3; i++) {
        await enbBounty.connect(claimers[i]).createClaim(0, `Claim ${i}`, `uri${i}`, `Desc ${i}`);
        await enbBounty.connect(alice).acceptClaim(0, i);
      }

      await expect(
        enbBounty.connect(eve).createClaim(0, 'Late Claim', 'uri', 'Desc')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });

    it('Should handle extremely long URIs', async function () {
      const longUri = 'https://example.com/' + 'a'.repeat(10000);
      
      await expect(
        enbBounty.connect(bob).createClaim(0, 'Claim', longUri, 'Desc')
      ).to.not.be.reverted;
    });
  });

  describe('Accept Claim Validation', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        2,
        { value: ethers.parseEther('2') }
      );
      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');
    });

    it('Should reject accepting non-existent claims', async function () {
      await expect(
        enbBounty.connect(alice).acceptClaim(0, 999)
      ).to.be.revertedWithCustomError(enbBounty, 'ClaimNotFound');
    });

    it('Should reject accepting already accepted claims', async function () {
      await enbBounty.connect(alice).acceptClaim(0, 0);
      
      await expect(
        enbBounty.connect(alice).acceptClaim(0, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });

    it('Should reject mismatched bounty and claim IDs', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Another Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(alice).acceptClaim(1, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'ClaimNotFound');
    });
  });

  describe('Voting System Validation', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );
      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Desc');
    });

    it('Should reject double voting', async function () {
      await enbBounty.connect(eve).submitClaimForVote(0, 0);
      await enbBounty.connect(alice).voteClaim(0, true);
      
      await expect(
        enbBounty.connect(alice).voteClaim(0, false)
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyVoted');
    });

    it('Should reject voting without active voting period', async function () {
      await expect(
        enbBounty.connect(alice).voteClaim(0, true)
      ).to.be.revertedWithCustomError(enbBounty, 'NoActiveVoting');
    });

    it('Should reject submitting non-existent claim for vote', async function () {
      await expect(
        enbBounty.connect(eve).submitClaimForVote(0, 999)
      ).to.be.revertedWithCustomError(enbBounty, 'ClaimNotFound');
    });

    it('Should reject resolving vote before deadline', async function () {
      await enbBounty.connect(eve).submitClaimForVote(0, 0);
      
      await expect(
        enbBounty.connect(alice).resolveVote(0)
      ).to.be.revertedWithCustomError(enbBounty, 'VotingNotEnded');
    });
  });

  describe('Bounty Schedule Enforcement', function () {
    it('Should reject claims before the bounty start time', async function () {
      const currentBlock = await ethers.provider.getBlock('latest');
      const startTime = Number(currentBlock?.timestamp ?? 0) + 3600;
      const endTime = startTime + 3600;

      await enbBounty.connect(alice).createSoloBountyWithSchedule(
        'Scheduled Bounty',
        'Description',
        1,
        startTime,
        endTime,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Description')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotStarted');

      await ethers.provider.send('evm_setNextBlockTimestamp', [startTime + 1]);
      await ethers.provider.send('evm_mine', []);

      await expect(
        enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Description')
      ).to.not.be.reverted;
    });

    it('Should reject claims after the end time until admin extends it', async function () {
      const currentBlock = await ethers.provider.getBlock('latest');
      const startTime = Number(currentBlock?.timestamp ?? 0);
      const endTime = startTime + 100;

      await enbBounty.connect(alice).createSoloBountyWithSchedule(
        'Expiring Bounty',
        'Description',
        1,
        startTime,
        endTime,
        { value: ethers.parseEther('1') }
      );

      await ethers.provider.send('evm_setNextBlockTimestamp', [endTime + 1]);
      await ethers.provider.send('evm_mine', []);

      await expect(
        enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Description')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyExpired');

      const extendedEnd = endTime + 1000;
      await enbBounty.updateBountyEndTime(0, extendedEnd);

      await expect(
        enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Description')
      ).to.not.be.reverted;
    });
  });

  describe('Withdrawal Validation', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );
      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
    });

    it('Should reject withdrawal from non-participant', async function () {
      await expect(
        enbBounty.connect(eve).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'NotAParticipant');
    });

    it('Should reject withdrawal after bounty is closed', async function () {
      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Desc');
      await enbBounty.connect(eve).submitClaimForVote(0, 0);
      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);
      
      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      
      await enbBounty.resolveVote(0);

      await expect(
        enbBounty.connect(bob).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });

    it('Should handle double withdrawal attempts', async function () {
      await enbBounty.connect(bob).withdrawFromOpenBounty(0);
      
      await expect(
        enbBounty.connect(bob).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'NotAParticipant');
    });
  });

  describe('Array Bounds and Overflow', function () {
    it('Should handle participant array manipulation correctly', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('0.01') }
      );

      for (let i = 0; i < 10; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        await alice.sendTransaction({ to: wallet.address, value: ethers.parseEther('0.1') });
        await enbBounty.connect(wallet).joinOpenBounty(0, { value: ethers.parseEther('0.001') });
      }

      const [participants, amounts] = await enbBounty.getParticipants(0);
      expect(participants.length).to.equal(11);
      expect(amounts.length).to.equal(11);
    });

    it('Should handle getter functions with offset correctly', async function () {
      for (let i = 0; i < 25; i++) {
        await enbBounty.connect(alice).createSoloBounty(
          `Bounty ${i}`,
          `Description ${i}`,
          1,
          { value: ethers.parseEther('0.01') }
        );
      }

      const bounties1 = await enbBounty.getBounties(0);
      const bounties2 = await enbBounty.getBounties(10);
      const bounties3 = await enbBounty.getBounties(20);

      expect(bounties1[0].id).to.equal(0);
      expect(bounties2[0].id).to.equal(10);
      expect(bounties3[0].id).to.equal(20);
    });
  });
});
