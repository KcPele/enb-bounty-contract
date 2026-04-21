import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Access Control Security Tests', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;
  let treasury: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, eve, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [treasury.address], { kind: 'uups' });

    // owner (deployer) is the OwnableUpgradeable owner, not treasury
    await enbBounty.connect(owner).addSupportedToken(await mockToken.getAddress(), 1);
  });

  describe('Owner-Only Functions', function () {
    it('Should only allow owner to add supported tokens', async function () {
      const newToken = await ethers.getContractFactory('MockERC20');
      const token = await newToken.deploy('New Token', 'NTK', ethers.parseEther('1000'));

      await expect(
        enbBounty.connect(alice).addSupportedToken(await token.getAddress(), 2)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        enbBounty.connect(owner).addSupportedToken(await token.getAddress(), 2)
      ).to.not.be.reverted;
    });

    it('Should only allow owner to remove supported tokens', async function () {
      await expect(
        enbBounty.connect(alice).removeSupportedToken(await mockToken.getAddress())
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        enbBounty.connect(owner).removeSupportedToken(await mockToken.getAddress())
      ).to.not.be.reverted;
    });

    it('Should prevent unauthorized treasury modification', async function () {
      const currentTreasury = await enbBounty.treasury();
      expect(currentTreasury).to.equal(treasury.address);

      // Only owner can update treasury
      await expect(
        enbBounty.connect(alice).updateTreasury(alice.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        enbBounty.connect(owner).updateTreasury(alice.address)
      ).to.not.be.reverted;

      expect(await enbBounty.treasury()).to.equal(alice.address);
    });

    it('Should only allow owner to upgrade', async function () {
      const ENBBountyV2 = await ethers.getContractFactory('ENBBounty');

      await expect(
        upgrades.upgradeProxy(await enbBounty.getAddress(), ENBBountyV2.connect(alice), { kind: 'uups' })
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Bounty Issuer Privileges', function () {
    it('Should only allow issuer to cancel solo bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(bob).cancelSoloBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');

      await expect(
        enbBounty.connect(alice).cancelSoloBounty(0)
      ).to.not.be.reverted;
    });

    it('Should only allow issuer to accept claims on solo bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(bob).acceptClaim(0, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');

      await expect(
        enbBounty.connect(alice).acceptClaim(0, bob.address)
      ).to.not.be.reverted;
    });

    it('Should prevent issuer from accepting claim for themselves', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(alice).acceptClaim(0, alice.address)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });
  });
});
