import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBTaskRewards - Access Control', function () {
  let taskRewards: Contract;
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let signer: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, signer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy(
      'Mock Token',
      'MTK',
      ethers.parseEther('1000000')
    );

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(owner.address);
    await enbBounty.addSupportedToken(await mockToken.getAddress(), 2);

    const ENBTaskRewards = await ethers.getContractFactory('ENBTaskRewards');
    taskRewards = await ENBTaskRewards.deploy(
      owner.address,
      await enbBounty.getAddress()
    );
  });

  describe('Owner-only functions', function () {
    it('should reject non-owner configureDailyReward', async function () {
      await expect(
        taskRewards
          .connect(alice)
          .configureDailyReward(await mockToken.getAddress(), ethers.parseEther('10'))
      ).to.be.revertedWith('Not authorized');
    });

    it('should reject non-owner toggleDailyRewards', async function () {
      await expect(
        taskRewards.connect(alice).toggleDailyRewards(false)
      ).to.be.revertedWith('Not authorized');
    });

    it('should reject non-owner setClaimSigner', async function () {
      await expect(
        taskRewards.connect(alice).setClaimSigner(signer.address)
      ).to.be.revertedWith('Not authorized');
    });

    it('should reject non-owner updatePartnerFeeRate', async function () {
      await expect(
        taskRewards.connect(alice).updatePartnerFeeRate(100)
      ).to.be.revertedWith('Not authorized');
    });
  });

  describe('Claim signer management', function () {
    it('should allow owner to set claim signer', async function () {
      await expect(taskRewards.setClaimSigner(signer.address))
        .to.emit(taskRewards, 'ClaimSignerUpdated')
        .withArgs(ethers.ZeroAddress, signer.address);

      expect(await taskRewards.claimSigner()).to.equal(signer.address);
    });

    it('should reject zero address signer', async function () {
      await expect(
        taskRewards.setClaimSigner(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid signer');
    });

    it('should allow updating signer', async function () {
      await taskRewards.setClaimSigner(signer.address);
      await expect(taskRewards.setClaimSigner(alice.address))
        .to.emit(taskRewards, 'ClaimSignerUpdated')
        .withArgs(signer.address, alice.address);
    });
  });

  describe('Partner fee rate', function () {
    it('should reject fee above 25%', async function () {
      await expect(
        taskRewards.updatePartnerFeeRate(251)
      ).to.be.revertedWith('Fee exceeds 25% cap');
    });

    it('should allow fee at 25%', async function () {
      await expect(taskRewards.updatePartnerFeeRate(250))
        .to.emit(taskRewards, 'PartnerFeeUpdated')
        .withArgs(0, 250);
    });
  });

  describe('Token validation via ENBBounty', function () {
    it('should delegate isTokenSupported to ENBBounty', async function () {
      const tokenAddr = await mockToken.getAddress();
      expect(await taskRewards.isTokenSupported(tokenAddr)).to.equal(true);
      expect(await taskRewards.isTokenSupported(alice.address)).to.equal(false);
    });

    it('should reject partner task with unlisted token', async function () {
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await expect(
        taskRewards
          .connect(alice)
          .createPartnerTask(alice.address, ethers.parseEther('100'), 10, deadline)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerTokenNotSupported');
    });

    it('should reject daily reward config with unlisted token', async function () {
      await expect(
        taskRewards.configureDailyReward(alice.address, ethers.parseEther('10'))
      ).to.be.revertedWithCustomError(taskRewards, 'DailyTokenNotSupported');
    });

    it('should reject pool funding with unlisted token', async function () {
      await expect(
        taskRewards
          .connect(alice)
          .fundDailyPool(alice.address, ethers.parseEther('100'))
      ).to.be.revertedWithCustomError(taskRewards, 'DailyTokenNotSupported');
    });
  });

  describe('Constructor validation', function () {
    it('should reject zero treasury address', async function () {
      const ENBTaskRewards = await ethers.getContractFactory('ENBTaskRewards');
      await expect(
        ENBTaskRewards.deploy(ethers.ZeroAddress, await enbBounty.getAddress())
      ).to.be.revertedWith('Invalid treasury');
    });

    it('should reject zero bounty contract address', async function () {
      const ENBTaskRewards = await ethers.getContractFactory('ENBTaskRewards');
      await expect(
        ENBTaskRewards.deploy(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid bounty contract');
    });

    it('should store immutable values correctly', async function () {
      expect(await taskRewards.treasury()).to.equal(owner.address);
      expect(await taskRewards.bountyContract()).to.equal(
        await enbBounty.getAddress()
      );
    });
  });
});
