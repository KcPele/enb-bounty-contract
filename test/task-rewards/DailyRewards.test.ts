import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBTaskRewards - Daily Rewards', function () {
  let taskRewards: Contract;
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signer: SignerWithAddress;

  let contractAddress: string;

  // EIP-712 helpers
  function getDomain() {
    return {
      name: 'ENBTaskRewards',
      version: '1',
      chainId: 31337, // hardhat chain id
      verifyingContract: contractAddress,
    };
  }

  const DAILY_CLAIM_TYPES = {
    DailyClaimApproval: [
      { name: 'claimer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
  } as const;

  async function signDailyClaim(
    claimer: string,
    nonce: string,
    signerAccount?: SignerWithAddress
  ): Promise<string> {
    const s = signerAccount ?? signer;
    return s.signTypedData(getDomain(), DAILY_CLAIM_TYPES, {
      claimer,
      nonce,
    });
  }

  beforeEach(async function () {
    [owner, alice, bob, signer] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy(
      'Mock Token',
      'MTK',
      ethers.parseEther('1000000')
    );

    // Deploy ENBBounty (for token whitelist)
    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], { kind: 'uups' });

    // Add mock token to ENBBounty whitelist
    await enbBounty.addSupportedToken(await mockToken.getAddress(), 2); // ENB type

    // Deploy ENBTaskRewards
    const ENBTaskRewards = await ethers.getContractFactory('ENBTaskRewards');
    taskRewards = await ENBTaskRewards.deploy(
      owner.address,
      await enbBounty.getAddress()
    );

    // Set claim signer
    await taskRewards.setClaimSigner(signer.address);

    contractAddress = await taskRewards.getAddress();

    // Fund alice and bob
    await mockToken.transfer(alice.address, ethers.parseEther('10000'));
    await mockToken.transfer(bob.address, ethers.parseEther('10000'));
  });

  describe('Configuration', function () {
    it('should allow owner to configure daily reward', async function () {
      const tokenAddr = await mockToken.getAddress();
      const amount = ethers.parseEther('10');

      await expect(taskRewards.configureDailyReward(tokenAddr, amount))
        .to.emit(taskRewards, 'DailyRewardConfigUpdated')
        .withArgs(tokenAddr, amount, true);

      const config = await taskRewards.getDailyRewardConfig();
      expect(config.token).to.equal(tokenAddr);
      expect(config.amount).to.equal(amount);
      expect(config.isActive).to.equal(true);
    });

    it('should reject non-owner configuring daily reward', async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(
        taskRewards.connect(alice).configureDailyReward(tokenAddr, ethers.parseEther('10'))
      ).to.be.revertedWith('Not authorized');
    });

    it('should reject unsupported token', async function () {
      await expect(
        taskRewards.configureDailyReward(alice.address, ethers.parseEther('10'))
      ).to.be.revertedWithCustomError(taskRewards, 'DailyTokenNotSupported');
    });

    it('should reject zero amount', async function () {
      const tokenAddr = await mockToken.getAddress();
      await expect(
        taskRewards.configureDailyReward(tokenAddr, 0)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyInvalidAmount');
    });

    it('should allow owner to toggle daily rewards', async function () {
      const tokenAddr = await mockToken.getAddress();
      await taskRewards.configureDailyReward(tokenAddr, ethers.parseEther('10'));

      await taskRewards.toggleDailyRewards(false);
      const config = await taskRewards.getDailyRewardConfig();
      expect(config.isActive).to.equal(false);
    });
  });

  describe('Funding', function () {
    it('should allow anyone to fund the daily pool', async function () {
      const tokenAddr = await mockToken.getAddress();
      const fundAmount = ethers.parseEther('1000');

      // Configure daily reward first so getDailyPoolBalance knows which token to check
      await taskRewards.configureDailyReward(tokenAddr, ethers.parseEther('10'));

      await mockToken
        .connect(alice)
        .approve(await taskRewards.getAddress(), fundAmount);

      await expect(
        taskRewards.connect(alice).fundDailyPool(tokenAddr, fundAmount)
      )
        .to.emit(taskRewards, 'DailyPoolFunded')
        .withArgs(alice.address, tokenAddr, fundAmount);

      const balance = await taskRewards.getDailyPoolBalance();
      expect(balance).to.equal(fundAmount);
    });

    it('should reject funding with unsupported token', async function () {
      await expect(
        taskRewards.connect(alice).fundDailyPool(alice.address, ethers.parseEther('100'))
      ).to.be.revertedWithCustomError(taskRewards, 'DailyTokenNotSupported');
    });
  });

  describe('Claiming', function () {
    beforeEach(async function () {
      const tokenAddr = await mockToken.getAddress();
      const rewardAmount = ethers.parseEther('10');
      const fundAmount = ethers.parseEther('1000');

      // Configure daily reward
      await taskRewards.configureDailyReward(tokenAddr, rewardAmount);

      // Fund pool
      await mockToken
        .connect(alice)
        .approve(await taskRewards.getAddress(), fundAmount);
      await taskRewards.connect(alice).fundDailyPool(tokenAddr, fundAmount);
    });

    it('should allow user to claim daily reward with valid signature', async function () {
      const tokenAddr = await mockToken.getAddress();
      const rewardAmount = ethers.parseEther('10');
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const signature = await signDailyClaim(bob.address, nonce);

      const balanceBefore = await mockToken.balanceOf(bob.address);

      const tx = await taskRewards.connect(bob).claimDailyReward(nonce, signature);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const claimTimestamp = block!.timestamp;

      await expect(tx)
        .to.emit(taskRewards, 'DailyRewardClaimed')
        .withArgs(bob.address, tokenAddr, rewardAmount, claimTimestamp);

      const balanceAfter = await mockToken.balanceOf(bob.address);
      expect(balanceAfter - balanceBefore).to.equal(rewardAmount);
    });

    it('should enforce 24-hour cooldown', async function () {
      const nonce1 = ethers.hexlify(ethers.randomBytes(32));
      const sig1 = await signDailyClaim(bob.address, nonce1);
      await taskRewards.connect(bob).claimDailyReward(nonce1, sig1);

      const nonce2 = ethers.hexlify(ethers.randomBytes(32));
      const sig2 = await signDailyClaim(bob.address, nonce2);
      await expect(
        taskRewards.connect(bob).claimDailyReward(nonce2, sig2)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyAlreadyClaimed');
    });

    it('should allow claiming after 24 hours', async function () {
      const nonce1 = ethers.hexlify(ethers.randomBytes(32));
      const sig1 = await signDailyClaim(bob.address, nonce1);
      await taskRewards.connect(bob).claimDailyReward(nonce1, sig1);

      // Advance time 24 hours + 1 second
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine', []);

      const nonce2 = ethers.hexlify(ethers.randomBytes(32));
      const sig2 = await signDailyClaim(bob.address, nonce2);
      await expect(taskRewards.connect(bob).claimDailyReward(nonce2, sig2)).to.not.be
        .reverted;
    });

    it('should revert when pool is insufficient', async function () {
      // Configure a very large reward
      const tokenAddr = await mockToken.getAddress();
      await taskRewards.configureDailyReward(tokenAddr, ethers.parseEther('99999'));

      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const signature = await signDailyClaim(bob.address, nonce);
      await expect(
        taskRewards.connect(bob).claimDailyReward(nonce, signature)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyInsufficientPool');
    });

    it('should revert when rewards are paused', async function () {
      await taskRewards.toggleDailyRewards(false);

      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const signature = await signDailyClaim(bob.address, nonce);
      await expect(
        taskRewards.connect(bob).claimDailyReward(nonce, signature)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyRewardsNotActive');
    });

    it('should reject claim with invalid signature (wrong signer)', async function () {
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      // Sign with alice instead of the authorized signer
      const badSig = await signDailyClaim(bob.address, nonce, alice);

      await expect(
        taskRewards.connect(bob).claimDailyReward(nonce, badSig)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyInvalidSignature');
    });

    it('should reject claim with reused nonce', async function () {
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const sig1 = await signDailyClaim(bob.address, nonce);
      await taskRewards.connect(bob).claimDailyReward(nonce, sig1);

      // Advance 24h so cooldown passes — nonce should still fail
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine', []);

      const sig2 = await signDailyClaim(bob.address, nonce);
      await expect(
        taskRewards.connect(bob).claimDailyReward(nonce, sig2)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyNonceUsed');
    });

    it('should reject claim signed for a different user', async function () {
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      // Sign for alice but bob tries to use it
      const signature = await signDailyClaim(alice.address, nonce);

      await expect(
        taskRewards.connect(bob).claimDailyReward(nonce, signature)
      ).to.be.revertedWithCustomError(taskRewards, 'DailyInvalidSignature');
    });

    it('should report canClaimDaily correctly', async function () {
      expect(await taskRewards.canClaimDaily(bob.address)).to.equal(true);

      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const signature = await signDailyClaim(bob.address, nonce);
      await taskRewards.connect(bob).claimDailyReward(nonce, signature);
      expect(await taskRewards.canClaimDaily(bob.address)).to.equal(false);

      // After 24h
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine', []);

      expect(await taskRewards.canClaimDaily(bob.address)).to.equal(true);
    });

    it('should allow admin to change reward token', async function () {
      // Deploy a second token
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const token2 = await MockERC20.deploy('Token Two', 'TK2', ethers.parseEther('1000000'));

      // Add to ENBBounty whitelist
      await enbBounty.addSupportedToken(await token2.getAddress(), 1); // USDC type

      // Transfer token2 to owner (MockERC20 mints to contract, deployer has special transfer)
      await token2.transfer(owner.address, ethers.parseEther('1000'));

      // Fund with new token
      await token2.approve(await taskRewards.getAddress(), ethers.parseEther('1000'));
      await taskRewards.fundDailyPool(await token2.getAddress(), ethers.parseEther('1000'));

      // Switch reward to new token
      await taskRewards.configureDailyReward(
        await token2.getAddress(),
        ethers.parseEther('5')
      );

      const config = await taskRewards.getDailyRewardConfig();
      expect(config.token).to.equal(await token2.getAddress());
      expect(config.amount).to.equal(ethers.parseEther('5'));
    });
  });
});
