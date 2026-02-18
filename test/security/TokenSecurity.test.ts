import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Token Security Tests', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let maliciousToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, eve] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(owner.address);

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);

    await mockToken.transfer(alice.address, ethers.parseEther('2000'));
    await mockToken.transfer(bob.address, ethers.parseEther('1000'));
    await mockToken.transfer(eve.address, ethers.parseEther('1000'));
  });

  describe('Token Transfer Security', function () {
    it('Should properly handle token transfers with SafeERC20', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      const aliceBalanceBefore = await mockToken.balanceOf(alice.address);
      const contractBalanceBefore = await mockToken.balanceOf(await enbBounty.getAddress());

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        30,
        { value: 0 }
      );

      const aliceBalanceAfter = await mockToken.balanceOf(alice.address);
      const contractBalanceAfter = await mockToken.balanceOf(await enbBounty.getAddress());

      // 100 + 15% creation fee = 115
      expect(aliceBalanceBefore - aliceBalanceAfter).to.equal(ethers.parseEther('115'));
      expect(contractBalanceAfter - contractBalanceBefore).to.equal(ethers.parseEther('100'));
    });

    it('Should prevent creating token bounty without approval', async function () {
      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'No Approval Bounty',
          'Description',
          1,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          30,
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle partial approvals correctly', async function () {
      // Approve only 100 but need 115 (100 + 15% creation fee)
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));

      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Insufficient Approval',
          'Description',
          1,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          30,
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle token transfers on claim acceptance', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        30,
        { value: 0 }
      );

      const bobBalanceBefore = await mockToken.balanceOf(bob.address);
      const treasuryBalanceBefore = await mockToken.balanceOf(owner.address);

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      const bobBalanceAfter = await mockToken.balanceOf(bob.address);
      const treasuryBalanceAfter = await mockToken.balanceOf(owner.address);

      const totalAmount = ethers.parseEther('100');
      const fee = (totalAmount * 100n) / 1000n; // 10% fee
      const claimerAmount = totalAmount - fee;

      expect(bobBalanceAfter - bobBalanceBefore).to.equal(claimerAmount);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(fee);
    });
  });

  describe('Malicious Token Protection', function () {
    beforeEach(async function () {
      const MaliciousToken = await ethers.getContractFactory('MaliciousERC20');
      maliciousToken = await MaliciousToken.deploy();
    });

    it('Should reject unsupported malicious tokens', async function () {
      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Malicious Token Bounty',
          'Description',
          1,
          await maliciousToken.getAddress(),
          ethers.parseEther('100'),
          30,
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle token with return value manipulation', async function () {
      const WeirdToken = await ethers.getContractFactory('WeirdReturnToken');
      const weirdToken = await WeirdToken.deploy();

      await enbBounty.addSupportedToken(await weirdToken.getAddress(), 2);
      await weirdToken.mint(alice.address, ethers.parseEther('1000'));
      await weirdToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Weird Token Bounty',
          'Description',
          1,
          await weirdToken.getAddress(),
          ethers.parseEther('100'),
          30,
          { value: 0 }
        )
      ).to.not.be.reverted;
    });
  });

  describe('Mixed ETH and Token Bounties', function () {
    it('Should properly track ETH bounties (tokenType = 0)', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'ETH Bounty',
        'Description',
        1,
        30,
        { value: ethers.parseEther('1') }
      );

      const tokenInfo = await enbBounty.getBountyTokenInfo(0);
      expect(tokenInfo.tokenType).to.equal(0);
    });

    it('Should properly track token bounties with correct type', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        30,
        { value: 0 }
      );

      const tokenInfo = await enbBounty.getBountyTokenInfo(0);
      expect(tokenInfo.tokenType).to.equal(1);
      expect(tokenInfo.tokenAddress).to.equal(await mockToken.getAddress());
    });
  });

  describe('Token Withdrawal Security', function () {
    it('Should correctly refund tokens on solo bounty cancellation', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        30,
        { value: 0 }
      );

      const aliceBalanceBefore = await mockToken.balanceOf(alice.address);
      await enbBounty.connect(alice).cancelSoloBounty(0);
      const aliceBalanceAfter = await mockToken.balanceOf(alice.address);

      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(ethers.parseEther('100'));
    });
  });

  describe('Token Type Management', function () {
    it('Should correctly map token addresses to types', async function () {
      const tokenType = await enbBounty.getTokenType(await mockToken.getAddress());
      expect(tokenType).to.equal(1);
    });

    it('Should return correct token type names', async function () {
      expect(await enbBounty.getTokenTypeName(0)).to.equal('ETH');
      expect(await enbBounty.getTokenTypeName(1)).to.equal('USDC');
      expect(await enbBounty.getTokenTypeName(2)).to.equal('ENB');
    });

    it('Should handle adding and removing supported tokens', async function () {
      const NewToken = await ethers.getContractFactory('MockERC20');
      const newToken = await NewToken.deploy('New Token', 'NEW', ethers.parseEther('1000000'));

      await enbBounty.addSupportedToken(await newToken.getAddress(), 2);
      expect(await enbBounty.isTokenSupported(await newToken.getAddress())).to.be.true;

      await enbBounty.removeSupportedToken(await newToken.getAddress());
      expect(await enbBounty.isTokenSupported(await newToken.getAddress())).to.be.false;
    });

    it('Should prevent duplicate token additions', async function () {
      await expect(
        enbBounty.addSupportedToken(await mockToken.getAddress(), 1)
      ).to.be.reverted;
    });

    it('Should prevent removing non-existent tokens', async function () {
      const randomAddress = ethers.Wallet.createRandom().address;

      await expect(
        enbBounty.removeSupportedToken(randomAddress)
      ).to.be.reverted;
    });
  });

  describe('Fee Calculation Security', function () {
    it('Should correctly calculate fees for token bounties', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('1150'));

      await enbBounty.connect(alice).createTokenBounty(
        'Fee Test Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('1000'),
        30,
        { value: 0 }
      );

      const treasuryBefore = await mockToken.balanceOf(owner.address);
      const bobBefore = await mockToken.balanceOf(bob.address);

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      const treasuryAfter = await mockToken.balanceOf(owner.address);
      const bobAfter = await mockToken.balanceOf(bob.address);

      const expectedFee = ethers.parseEther('100'); // 10% of 1000
      const expectedClaimer = ethers.parseEther('900');

      expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
      expect(bobAfter - bobBefore).to.equal(expectedClaimer);
    });

    it('Should handle fee calculation for small amounts', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), '115');

      await enbBounty.connect(alice).createTokenBounty(
        'Small Amount Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        '100',
        30,
        { value: 0 }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      const bobBalance = await mockToken.balanceOf(bob.address);
      // 100 - 10% fee (10) = 90 in integer math
      expect(bobBalance - ethers.parseEther('1000')).to.equal('90');
    });
  });
});
