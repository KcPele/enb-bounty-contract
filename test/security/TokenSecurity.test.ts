import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Token Security Tests', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let mockToken: Contract;
  let maliciousToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, eve] = await ethers.getSigners();

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
    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);

    await mockToken.transfer(alice.address, ethers.parseEther('1000'));
    await mockToken.transfer(bob.address, ethers.parseEther('1000'));
    await mockToken.transfer(eve.address, ethers.parseEther('1000'));
  });

  describe('Token Transfer Security', function () {
    it('Should properly handle token transfers with SafeERC20', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));

      const aliceBalanceBefore = await mockToken.balanceOf(alice.address);
      const contractBalanceBefore = await mockToken.balanceOf(await enbBounty.getAddress());

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      const aliceBalanceAfter = await mockToken.balanceOf(alice.address);
      const contractBalanceAfter = await mockToken.balanceOf(await enbBounty.getAddress());

      expect(aliceBalanceBefore - aliceBalanceAfter).to.equal(ethers.parseEther('100'));
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
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle partial approvals correctly', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('50'));

      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Insufficient Approval',
          'Description',
          1,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle token transfers on claim acceptance', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      
      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      const bobBalanceBefore = await mockToken.balanceOf(bob.address);
      const treasuryBalanceBefore = await mockToken.balanceOf(owner.address);

      await enbBounty.connect(alice).acceptClaim(0, 0);

      const bobBalanceAfter = await mockToken.balanceOf(bob.address);
      const treasuryBalanceAfter = await mockToken.balanceOf(owner.address);

      const totalAmount = ethers.parseEther('100');
      const fee = (totalAmount * 25n) / 1000n; // 2.5% fee
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
          { value: 0 }
        )
      ).to.be.reverted;
    });

    it('Should handle token with return value manipulation', async function () {
      const WeirdToken = await ethers.getContractFactory('WeirdReturnToken');
      const weirdToken = await WeirdToken.deploy();
      
      await enbBounty.addSupportedToken(await weirdToken.getAddress(), 2);
      await weirdToken.mint(alice.address, ethers.parseEther('1000'));
      await weirdToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));

      await expect(
        enbBounty.connect(alice).createTokenBounty(
          'Weird Token Bounty',
          'Description',
          1,
          await weirdToken.getAddress(),
          ethers.parseEther('100'),
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
        { value: ethers.parseEther('1') }
      );

      const tokenInfo = await enbBounty.getBountyTokenInfo(0);
      expect(tokenInfo.tokenType).to.equal(0);
      expect(tokenInfo.tokenAddress).to.equal(ethers.ZeroAddress);
    });

    it('Should properly track token bounties with correct type', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      
      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      const tokenInfo = await enbBounty.getBountyTokenInfo(0);
      expect(tokenInfo.tokenType).to.equal(1);
      expect(tokenInfo.tokenAddress).to.equal(await mockToken.getAddress());
    });

    it('Should prevent mixing ETH and token in open bounties', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      
      await enbBounty.connect(alice).createOpenTokenBounty(
        'Token Open Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      await expect(
        enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') })
      ).to.be.reverted;
    });

    it('Should prevent joining ETH bounty with tokens', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'ETH Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await mockToken.connect(bob).approve(await enbBounty.getAddress(), ethers.parseEther('100'));

      await expect(
        enbBounty.connect(bob).joinOpenBountyWithToken(0, ethers.parseEther('100'), { value: 0 })
      ).to.be.reverted;
    });
  });

  describe('Token Withdrawal Security', function () {
    it('Should correctly refund tokens on solo bounty cancellation', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      
      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      const aliceBalanceBefore = await mockToken.balanceOf(alice.address);
      await enbBounty.connect(alice).cancelSoloBounty(0);
      const aliceBalanceAfter = await mockToken.balanceOf(alice.address);

      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(ethers.parseEther('100'));
    });

    it('Should correctly refund tokens on open bounty withdrawal', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      await mockToken.connect(bob).approve(await enbBounty.getAddress(), ethers.parseEther('50'));
      
      await enbBounty.connect(alice).createOpenTokenBounty(
        'Token Open Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      await enbBounty.connect(bob).joinOpenBountyWithToken(0, ethers.parseEther('50'), { value: 0 });

      const bobBalanceBefore = await mockToken.balanceOf(bob.address);
      await enbBounty.connect(bob).withdrawFromOpenBounty(0);
      const bobBalanceAfter = await mockToken.balanceOf(bob.address);

      expect(bobBalanceAfter - bobBalanceBefore).to.equal(ethers.parseEther('50'));
    });

    it('Should handle multiple participants token withdrawals', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      await mockToken.connect(bob).approve(await enbBounty.getAddress(), ethers.parseEther('50'));
      await mockToken.connect(eve).approve(await enbBounty.getAddress(), ethers.parseEther('25'));
      
      await enbBounty.connect(alice).createOpenTokenBounty(
        'Multi Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      await enbBounty.connect(bob).joinOpenBountyWithToken(0, ethers.parseEther('50'), { value: 0 });
      await enbBounty.connect(eve).joinOpenBountyWithToken(0, ethers.parseEther('25'), { value: 0 });

      await enbBounty.connect(bob).withdrawFromOpenBounty(0);
      await enbBounty.connect(eve).withdrawFromOpenBounty(0);

      const [participants, amounts] = await enbBounty.getParticipants(0);
      expect(participants[1]).to.equal(ethers.ZeroAddress);
      expect(participants[2]).to.equal(ethers.ZeroAddress);
      expect(amounts[1]).to.equal(0);
      expect(amounts[2]).to.equal(0);
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
        enbBounty.addSupportedToken(await mockToken.getAddress(), 2)
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
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('1000'));
      
      await enbBounty.connect(alice).createTokenBounty(
        'Fee Test Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('1000'),
        { value: 0 }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      const treasuryBefore = await mockToken.balanceOf(owner.address);
      const bobBefore = await mockToken.balanceOf(bob.address);

      await enbBounty.connect(alice).acceptClaim(0, 0);

      const treasuryAfter = await mockToken.balanceOf(owner.address);
      const bobAfter = await mockToken.balanceOf(bob.address);

      const expectedFee = ethers.parseEther('25'); // 2.5% of 1000
      const expectedClaimer = ethers.parseEther('975');

      expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
      expect(bobAfter - bobBefore).to.equal(expectedClaimer);
    });

    it('Should handle fee calculation for small amounts', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), '100');
      
      await enbBounty.connect(alice).createTokenBounty(
        'Small Amount Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        '100',
        { value: 0 }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');
      await enbBounty.connect(alice).acceptClaim(0, 0);

      const bobBalance = await mockToken.balanceOf(bob.address);
      // 100 - 2.5% fee (2.5) = 97.5, rounded to 98 in integer math
      expect(bobBalance - ethers.parseEther('1000')).to.equal('98');
    });
  });
});