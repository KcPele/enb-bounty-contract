import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Position Bounty Creation', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(owner.address);

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1); // USDC type

    await mockToken.transfer(alice.address, ethers.parseEther('100000'));
  });

  describe('Valid creation', function () {
    it('Should create a position-based bounty with correct amounts', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [
        ethers.parseEther('500'),
        ethers.parseEther('300'),
        ethers.parseEther('200'),
      ];

      const approveAmount = tokenAmount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      await enbBounty.connect(alice).createPositionBounty(
        'Position Bounty',
        'Top 3 get different rewards',
        await mockToken.getAddress(),
        tokenAmount,
        positions,
        30
      );

      expect(await enbBounty.isBountyPositionBased(0)).to.be.true;

      const allAmounts = await enbBounty.getBountyAllPositionAmounts(0);
      expect(allAmounts.length).to.equal(3);
      expect(allAmounts[0]).to.equal(positions[0]);
      expect(allAmounts[1]).to.equal(positions[1]);
      expect(allAmounts[2]).to.equal(positions[2]);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.maxWinners).to.equal(3);
      expect(bountyData.amount).to.equal(tokenAmount);
    });

    it('Should emit PositionBountyCreated event in transaction logs', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [ethers.parseEther('600'), ethers.parseEther('400')];

      const approveAmount = tokenAmount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      const tx = await enbBounty.connect(alice).createPositionBounty(
        'Event Test',
        'Description',
        await mockToken.getAddress(),
        tokenAmount,
        positions,
        30
      );
      const receipt = await tx.wait();

      // Library events appear in logs with the contract address
      const eventTopic = ethers.id(
        'PositionBountyCreated(uint256,address,string,string,uint256,uint256,uint8,address,uint256,uint256)'
      );
      const matchingLog = receipt.logs.find(
        (log: { topics: string[] }) => log.topics[0] === eventTopic
      );
      expect(matchingLog).to.not.be.undefined;
    });

    it('Should charge creation fee to treasury', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [ethers.parseEther('500'), ethers.parseEther('500')];
      const creationFee = tokenAmount * 150n / 1000n; // 15%

      const approveAmount = tokenAmount + creationFee;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      const treasuryBefore = await mockToken.balanceOf(owner.address);
      await enbBounty.connect(alice).createPositionBounty(
        'Fee Test',
        'Description',
        await mockToken.getAddress(),
        tokenAmount,
        positions,
        30
      );
      const treasuryAfter = await mockToken.balanceOf(owner.address);

      expect(treasuryAfter - treasuryBefore).to.equal(creationFee);
    });

    it('Should return false for non-position bounties', async function () {
      await enbBounty.connect(alice).createSoloBounty('Normal', 'Desc', 1, 30, {
        value: ethers.parseEther('1'),
      });

      expect(await enbBounty.isBountyPositionBased(0)).to.be.false;
    });

    it('Should read individual position amounts', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [ethers.parseEther('700'), ethers.parseEther('300')];

      const approveAmount = tokenAmount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      await enbBounty.connect(alice).createPositionBounty(
        'Read Test',
        'Description',
        await mockToken.getAddress(),
        tokenAmount,
        positions,
        30
      );

      expect(await enbBounty.getBountyPositionAmount(0, 0)).to.equal(positions[0]);
      expect(await enbBounty.getBountyPositionAmount(0, 1)).to.equal(positions[1]);
    });
  });

  describe('Validation', function () {
    it('Should revert when position amounts do not sum to tokenAmount', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [ethers.parseEther('500'), ethers.parseEther('200')]; // sum = 700

      const approveAmount = tokenAmount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      await expect(
        enbBounty.connect(alice).createPositionBounty(
          'Bad Sum',
          'Description',
          await mockToken.getAddress(),
          tokenAmount,
          positions,
          30
        )
      ).to.be.revertedWithCustomError(enbBounty, 'PositionAmountsMismatch');
    });

    it('Should revert for ETH bounties', async function () {
      await expect(
        enbBounty.connect(alice).createPositionBounty(
          'ETH Position',
          'Description',
          ethers.ZeroAddress,
          ethers.parseEther('1'),
          [ethers.parseEther('0.6'), ethers.parseEther('0.4')],
          30,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(enbBounty, 'ETHNotAllowedForPositionBounty');
    });

    it('Should revert with empty position amounts', async function () {
      await expect(
        enbBounty.connect(alice).createPositionBounty(
          'Empty',
          'Description',
          await mockToken.getAddress(),
          ethers.parseEther('1000'),
          [],
          30
        )
      ).to.be.revertedWithCustomError(enbBounty, 'PositionAmountsRequired');
    });

    it('Should revert when a position amount is zero', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [ethers.parseEther('1000'), 0n];

      const approveAmount = tokenAmount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      await expect(
        enbBounty.connect(alice).createPositionBounty(
          'Zero Position',
          'Description',
          await mockToken.getAddress(),
          tokenAmount,
          positions,
          30
        )
      ).to.be.revertedWith('Position amount must be > 0');
    });

    it('Should revert with zero duration', async function () {
      const tokenAmount = ethers.parseEther('1000');
      const positions = [ethers.parseEther('1000')];

      const approveAmount = tokenAmount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      await expect(
        enbBounty.connect(alice).createPositionBounty(
          'Zero Duration',
          'Description',
          await mockToken.getAddress(),
          tokenAmount,
          positions,
          0
        )
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidDuration');
    });
  });
});
