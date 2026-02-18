import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
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
    enbBounty = await ENBBounty.deploy(treasury.address);

    await enbBounty.connect(treasury).addSupportedToken(await mockToken.getAddress(), 1);
  });

  describe('Owner-Only Functions', function () {
    it('Should only allow treasury to add supported tokens', async function () {
      const newToken = await ethers.getContractFactory('MockERC20');
      const token = await newToken.deploy('New Token', 'NTK', ethers.parseEther('1000'));

      await expect(
        enbBounty.connect(alice).addSupportedToken(await token.getAddress(), 2)
      ).to.be.revertedWith('Not authorized');

      await expect(
        enbBounty.connect(treasury).addSupportedToken(await token.getAddress(), 2)
      ).to.not.be.reverted;
    });

    it('Should only allow treasury to remove supported tokens', async function () {
      await expect(
        enbBounty.connect(alice).removeSupportedToken(await mockToken.getAddress())
      ).to.be.revertedWith('Not authorized');

      await expect(
        enbBounty.connect(treasury).removeSupportedToken(await mockToken.getAddress())
      ).to.not.be.reverted;
    });

    it('Should prevent unauthorized treasury modification', async function () {
      const currentTreasury = await enbBounty.treasury();
      expect(currentTreasury).to.equal(treasury.address);

      await expect(
        alice.sendTransaction({
          to: await enbBounty.getAddress(),
          data: ethers.zeroPadValue(alice.address, 32)
        })
      ).to.be.reverted;
    });
  });

  describe('Bounty Issuer Privileges', function () {
    it('Should only allow issuer to cancel solo bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
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
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(alice).acceptClaim(0, alice.address)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });
  });
});
