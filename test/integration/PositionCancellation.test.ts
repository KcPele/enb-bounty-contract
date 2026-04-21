import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Position Bounty Cancellation', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;

  const tokenAmount = ethers.parseEther('1000');
  const positions = [
    ethers.parseEther('500'), // 1st
    ethers.parseEther('300'), // 2nd
    ethers.parseEther('200'), // 3rd
  ];

  beforeEach(async function () {
    [owner, alice, bob, charlie, david] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], { kind: 'uups' });

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);
    await mockToken.transfer(alice.address, ethers.parseEther('100000'));

    const approveAmount = tokenAmount * 1150n / 1000n;
    await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);
    await enbBounty.connect(alice).createPositionBounty(
      'Position Bounty',
      'Description',
      await mockToken.getAddress(),
      tokenAmount,
      positions,
      30,
      0
    );
  });

  it('Should refund all positions when cancelling with no winners', async function () {
    const balBefore = await mockToken.balanceOf(alice.address);
    await enbBounty.connect(alice).cancelSoloBounty(0);
    const balAfter = await mockToken.balanceOf(alice.address);

    // Full tokenAmount refunded (no winners paid)
    expect(balAfter - balBefore).to.equal(tokenAmount);
  });

  it('Should refund remaining positions after 1 winner', async function () {
    await enbBounty.connect(alice).acceptClaim(0, bob.address); // 1st paid

    const balBefore = await mockToken.balanceOf(alice.address);
    await enbBounty.connect(alice).cancelSoloBounty(0);
    const balAfter = await mockToken.balanceOf(alice.address);

    // Refund = 2nd + 3rd = 300 + 200 = 500
    const expectedRefund = positions[1] + positions[2];
    expect(balAfter - balBefore).to.equal(expectedRefund);
  });

  it('Should refund only 3rd position after 2 winners', async function () {
    await enbBounty.connect(alice).acceptClaim(0, bob.address);     // 1st
    await enbBounty.connect(alice).acceptClaim(0, charlie.address); // 2nd

    const balBefore = await mockToken.balanceOf(alice.address);
    await enbBounty.connect(alice).cancelSoloBounty(0);
    const balAfter = await mockToken.balanceOf(alice.address);

    // Refund = 3rd only = 200
    expect(balAfter - balBefore).to.equal(positions[2]);
  });

  it('Should refund zero when all positions claimed', async function () {
    await enbBounty.connect(alice).acceptClaim(0, bob.address);
    await enbBounty.connect(alice).acceptClaim(0, charlie.address);
    await enbBounty.connect(alice).acceptClaim(0, david.address);

    const balBefore = await mockToken.balanceOf(alice.address);
    await enbBounty.connect(alice).cancelSoloBounty(0);
    const balAfter = await mockToken.balanceOf(alice.address);

    expect(balAfter - balBefore).to.equal(0n);
  });

  it('Should still refund correctly for equal-split bounties (regression)', async function () {
    // Create a regular ETH bounty with 3 winners
    const ethAmount = ethers.parseEther('3');
    await enbBounty.connect(alice).createSoloBounty('Regular', 'Desc', 3, 30, 0, {
      value: ethAmount,
    });

    const netAmount = ethAmount * 1000n / 1150n;

    // Accept 1 winner
    await enbBounty.connect(alice).acceptClaim(1, bob.address);

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const tx = await enbBounty.connect(alice).cancelSoloBounty(1);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const aliceAfter = await ethers.provider.getBalance(alice.address);

    // Refund = netAmount - (netAmount/3 * 1) = 2/3 of netAmount
    const paidOut = netAmount / 3n;
    const expectedRefund = netAmount - paidOut;

    expect(aliceAfter - aliceBefore + gasCost).to.equal(expectedRefund);
  });
});
