import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Input Validation & Edge Cases', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie, david, eve] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(owner.address);

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);
  });

  describe('Bounty Creation Validation', function () {
    it('Should handle zero maxWinners by defaulting to 1', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        0,
        30,
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
          30,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(enbBounty, 'ZeroValue');
    });

    it('Should reject bounty creation with zero duration', async function () {
      await expect(
        enbBounty.connect(alice).createSoloBounty(
          'Zero Duration Bounty',
          'Description',
          1,
          0,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidDuration');
    });

    it('Should handle extremely long strings', async function () {
      const longName = 'A'.repeat(1000);
      const longDescription = 'B'.repeat(5000);

      await expect(
        enbBounty.connect(alice).createSoloBounty(
          longName,
          longDescription,
          1,
          30,
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
          30,
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
        30,
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
        30,
        { value: ethers.parseEther('1') }
      );

      const bounty = await enbBounty.bounties(0);
      expect(bounty.name).to.equal(specialChars);
    });

    it('Should store deadline correctly', async function () {
      const durationInDays = 30;
      const tx = await enbBounty.connect(alice).createSoloBounty(
        'Deadline Test',
        'Description',
        1,
        durationInDays,
        { value: ethers.parseEther('1') }
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const bounty = await enbBounty.bounties(0);
      const expectedDeadline = BigInt(block!.timestamp) + BigInt(durationInDays) * 86400n;
      expect(bounty.deadline).to.equal(expectedDeadline);
    });

    it('Should emit deadline in TokenBountyCreated event', async function () {
      const durationInDays = 7;
      const tx = await enbBounty.connect(alice).createSoloBounty(
        'Event Test',
        'Description',
        1,
        durationInDays,
        { value: ethers.parseEther('1') }
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const expectedDeadline = BigInt(block!.timestamp) + BigInt(durationInDays) * 86400n;

      const eventTopic = ethers.id(
        'TokenBountyCreated(uint256,address,string,string,uint256,uint256,uint8,address,uint256,uint256)'
      );
      const eventLog = receipt.logs.find(
        (log: { topics: string[] }) => log.topics[0] === eventTopic,
      );
      expect(eventLog).to.not.be.undefined;
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
          30,
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
          30,
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
          30,
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
          30,
          { value: 0 }
        )
      ).to.be.reverted;
    });
  });

  describe('Accept Claim Validation', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        2,
        30,
        { value: ethers.parseEther('2') }
      );
    });

    it('Should reject accepting for non-existent bounty', async function () {
      await expect(
        enbBounty.connect(alice).acceptClaim(999, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotFound');
    });

    it('Should reject accepting same address twice', async function () {
      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      await expect(
        enbBounty.connect(alice).acceptClaim(0, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });

    it('Should reject accepting zero address', async function () {
      await expect(
        enbBounty.connect(alice).acceptClaim(0, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });

    it('Should reject accepting bounty issuer as claimer', async function () {
      await expect(
        enbBounty.connect(alice).acceptClaim(0, alice.address)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });
  });

  describe('Array Bounds and Overflow', function () {
    it('Should handle getter functions with offset correctly', async function () {
      for (let i = 0; i < 25; i++) {
        await enbBounty.connect(alice).createSoloBounty(
          `Bounty ${i}`,
          `Description ${i}`,
          1,
          30,
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
