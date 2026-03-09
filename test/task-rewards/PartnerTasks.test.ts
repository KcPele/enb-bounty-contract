import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBTaskRewards - Partner Tasks', function () {
  let taskRewards: Contract;
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress; // task creator
  let bob: SignerWithAddress; // claimer
  let charlie: SignerWithAddress;
  let signer: SignerWithAddress; // EIP-712 signer

  let contractAddress: string;
  let domainSeparator: string;

  // EIP-712 constants
  const CLAIM_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes('ClaimApproval(uint256 taskId,address claimer,bytes32 nonce)')
  );

  async function signClaim(
    taskId: number,
    claimer: string,
    nonce: string
  ): Promise<string> {
    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256', 'address', 'bytes32'],
        [CLAIM_TYPEHASH, taskId, claimer, nonce]
      )
    );

    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ['string', 'bytes32', 'bytes32'],
        ['\x19\x01', domainSeparator, structHash]
      )
    );

    return signer.signMessage(ethers.getBytes(digest));
  }

  async function signClaimRaw(
    taskId: number,
    claimer: string,
    nonce: string
  ): Promise<string> {
    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256', 'address', 'bytes32'],
        [CLAIM_TYPEHASH, taskId, claimer, nonce]
      )
    );

    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ['string', 'bytes32', 'bytes32'],
        ['\x19\x01', domainSeparator, structHash]
      )
    );

    // Sign the raw digest (not using signMessage which adds prefix)
    const signingKey = new ethers.SigningKey(
      // Get private key — in hardhat default accounts the keys are deterministic
      '0x' + Buffer.from(
        ethers.id(signer.address).slice(2),
        'hex'
      ).toString('hex')
    );

    // Use ethers signing directly on the digest
    return signer.signMessage(ethers.getBytes(digest));
  }

  beforeEach(async function () {
    [owner, alice, bob, charlie, signer] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy(
      'Mock Token',
      'MTK',
      ethers.parseEther('1000000')
    );

    // Deploy ENBBounty
    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(owner.address);
    await enbBounty.addSupportedToken(await mockToken.getAddress(), 2);

    // Deploy ENBTaskRewards
    const ENBTaskRewards = await ethers.getContractFactory('ENBTaskRewards');
    taskRewards = await ENBTaskRewards.deploy(
      owner.address,
      await enbBounty.getAddress()
    );
    await taskRewards.setClaimSigner(signer.address);

    contractAddress = await taskRewards.getAddress();
    domainSeparator = await taskRewards.DOMAIN_SEPARATOR();

    // Fund users
    await mockToken.transfer(alice.address, ethers.parseEther('10000'));
    await mockToken.transfer(bob.address, ethers.parseEther('10000'));
  });

  describe('Creation', function () {
    it('should create a partner task with token deposit', async function () {
      const tokenAddr = await mockToken.getAddress();
      const totalAmount = ethers.parseEther('100');
      const maxWinners = 10;
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400 * 7;

      await mockToken
        .connect(alice)
        .approve(contractAddress, totalAmount);

      await expect(
        taskRewards
          .connect(alice)
          .createPartnerTask(tokenAddr, totalAmount, maxWinners, deadline)
      )
        .to.emit(taskRewards, 'PartnerTaskCreated')
        .withArgs(
          0, // taskId
          alice.address,
          tokenAddr,
          totalAmount,
          totalAmount / BigInt(maxWinners), // amountPerWinner
          maxWinners,
          deadline,
          0 // fee (0 by default)
        );

      const task = await taskRewards.getPartnerTask(0);
      expect(task.creator).to.equal(alice.address);
      expect(task.totalAmount).to.equal(totalAmount);
      expect(task.maxWinners).to.equal(maxWinners);
      expect(task.amountPerWinner).to.equal(ethers.parseEther('10'));
      expect(task.claimedCount).to.equal(0);
    });

    it('should reject unsupported token', async function () {
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await expect(
        taskRewards
          .connect(alice)
          .createPartnerTask(bob.address, ethers.parseEther('100'), 10, deadline)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerTokenNotSupported');
    });

    it('should reject zero amount', async function () {
      const tokenAddr = await mockToken.getAddress();
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await expect(
        taskRewards.connect(alice).createPartnerTask(tokenAddr, 0, 10, deadline)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerInvalidAmount');
    });

    it('should reject zero winners', async function () {
      const tokenAddr = await mockToken.getAddress();
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await expect(
        taskRewards
          .connect(alice)
          .createPartnerTask(tokenAddr, ethers.parseEther('100'), 0, deadline)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerInvalidWinners');
    });

    it('should reject past deadline', async function () {
      const tokenAddr = await mockToken.getAddress();
      const pastDeadline =
        (await ethers.provider.getBlock('latest'))!.timestamp - 100;

      await expect(
        taskRewards
          .connect(alice)
          .createPartnerTask(tokenAddr, ethers.parseEther('100'), 10, pastDeadline)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerInvalidDeadline');
    });

    it('should apply creation fee when set', async function () {
      const tokenAddr = await mockToken.getAddress();
      const totalAmount = ethers.parseEther('1000');
      const maxWinners = 10;
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      // Set 10% fee
      await taskRewards.updatePartnerFeeRate(100);

      // Fee = 1000 * 100 / 1000 = 100 tokens
      const fee = ethers.parseEther('100');
      const approvalAmount = totalAmount + fee;

      await mockToken.connect(alice).approve(contractAddress, approvalAmount);

      const treasuryBefore = await mockToken.balanceOf(owner.address);

      await taskRewards
        .connect(alice)
        .createPartnerTask(tokenAddr, totalAmount, maxWinners, deadline);

      const treasuryAfter = await mockToken.balanceOf(owner.address);
      expect(treasuryAfter - treasuryBefore).to.equal(fee);
    });
  });

  describe('Claiming with EIP-712', function () {
    let taskId: number;
    let deadline: number;

    beforeEach(async function () {
      const tokenAddr = await mockToken.getAddress();
      const totalAmount = ethers.parseEther('100');
      const maxWinners = 2;
      deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400 * 7;

      await mockToken.connect(alice).approve(contractAddress, totalAmount);
      await taskRewards
        .connect(alice)
        .createPartnerTask(tokenAddr, totalAmount, maxWinners, deadline);
      taskId = 0;
    });

    it('should allow valid claim with correct signature', async function () {
      const nonce = ethers.randomBytes(32);
      const nonceHex = ethers.hexlify(nonce);

      // Sign the claim approval using EIP-712
      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };
      const value = {
        taskId: taskId,
        claimer: bob.address,
        nonce: nonceHex,
      };

      const signature = await signer.signTypedData(domain, types, value);

      const tokenAddr = await mockToken.getAddress();
      const amountPerWinner = ethers.parseEther('50');
      const balanceBefore = await mockToken.balanceOf(bob.address);

      await expect(
        taskRewards.connect(bob).claimPartnerReward(taskId, nonceHex, signature)
      )
        .to.emit(taskRewards, 'PartnerTaskClaimed')
        .withArgs(taskId, bob.address, tokenAddr, amountPerWinner);

      const balanceAfter = await mockToken.balanceOf(bob.address);
      expect(balanceAfter - balanceBefore).to.equal(amountPerWinner);

      // Verify state update
      expect(
        await taskRewards.hasClaimedPartnerTask(taskId, bob.address)
      ).to.equal(true);

      const task = await taskRewards.getPartnerTask(taskId);
      expect(task.claimedCount).to.equal(1);
    });

    it('should reject duplicate claim', async function () {
      const nonce1 = ethers.hexlify(ethers.randomBytes(32));
      const nonce2 = ethers.hexlify(ethers.randomBytes(32));

      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      const sig1 = await signer.signTypedData(domain, types, {
        taskId,
        claimer: bob.address,
        nonce: nonce1,
      });

      await taskRewards.connect(bob).claimPartnerReward(taskId, nonce1, sig1);

      const sig2 = await signer.signTypedData(domain, types, {
        taskId,
        claimer: bob.address,
        nonce: nonce2,
      });

      await expect(
        taskRewards.connect(bob).claimPartnerReward(taskId, nonce2, sig2)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerAlreadyClaimed');
    });

    it('should reject reused nonce', async function () {
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      const sig1 = await signer.signTypedData(domain, types, {
        taskId,
        claimer: bob.address,
        nonce,
      });

      await taskRewards.connect(bob).claimPartnerReward(taskId, nonce, sig1);

      // Try to use same nonce with charlie
      const sig2 = await signer.signTypedData(domain, types, {
        taskId,
        claimer: charlie.address,
        nonce,
      });

      await expect(
        taskRewards.connect(charlie).claimPartnerReward(taskId, nonce, sig2)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerNonceUsed');
    });

    it('should reject invalid signature (wrong signer)', async function () {
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      // Sign with alice (not the authorized signer)
      const badSig = await alice.signTypedData(domain, types, {
        taskId,
        claimer: bob.address,
        nonce,
      });

      await expect(
        taskRewards.connect(bob).claimPartnerReward(taskId, nonce, badSig)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerInvalidSignature');
    });

    it('should reject claim when task is full', async function () {
      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      // Fill both slots (maxWinners = 2)
      for (const claimer of [bob, charlie]) {
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const sig = await signer.signTypedData(domain, types, {
          taskId,
          claimer: claimer.address,
          nonce,
        });
        await taskRewards.connect(claimer).claimPartnerReward(taskId, nonce, sig);
      }

      // Try a third claim
      const [, , , , extra] = await ethers.getSigners();
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const sig = await signer.signTypedData(domain, types, {
        taskId,
        claimer: extra.address,
        nonce,
      });

      await expect(
        taskRewards.connect(extra).claimPartnerReward(taskId, nonce, sig)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerTaskFull');
    });

    it('should reject claim after deadline', async function () {
      // Advance past deadline
      await ethers.provider.send('evm_increaseTime', [86400 * 8]);
      await ethers.provider.send('evm_mine', []);

      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };
      const sig = await signer.signTypedData(domain, types, {
        taskId,
        claimer: bob.address,
        nonce,
      });

      await expect(
        taskRewards.connect(bob).claimPartnerReward(taskId, nonce, sig)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerTaskExpired');
    });
  });

  describe('Cancellation', function () {
    it('should allow creator to cancel and refund unclaimed tokens', async function () {
      const tokenAddr = await mockToken.getAddress();
      const totalAmount = ethers.parseEther('100');
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await mockToken.connect(alice).approve(contractAddress, totalAmount);
      await taskRewards
        .connect(alice)
        .createPartnerTask(tokenAddr, totalAmount, 2, deadline);

      const balanceBefore = await mockToken.balanceOf(alice.address);

      await expect(taskRewards.connect(alice).cancelPartnerTask(0))
        .to.emit(taskRewards, 'PartnerTaskCancelled')
        .withArgs(0, alice.address, totalAmount);

      const balanceAfter = await mockToken.balanceOf(alice.address);
      expect(balanceAfter - balanceBefore).to.equal(totalAmount);

      const task = await taskRewards.getPartnerTask(0);
      expect(task.cancelled).to.equal(true);
    });

    it('should refund only unclaimed tokens after partial claims', async function () {
      const tokenAddr = await mockToken.getAddress();
      const totalAmount = ethers.parseEther('100');
      const amountPerWinner = ethers.parseEther('50');
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400 * 7;

      await mockToken.connect(alice).approve(contractAddress, totalAmount);
      await taskRewards
        .connect(alice)
        .createPartnerTask(tokenAddr, totalAmount, 2, deadline);

      // Bob claims one slot
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const domain = {
        name: 'ENBTaskRewards',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
      };
      const types = {
        ClaimApproval: [
          { name: 'taskId', type: 'uint256' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };
      const sig = await signer.signTypedData(domain, types, {
        taskId: 0,
        claimer: bob.address,
        nonce,
      });
      await taskRewards.connect(bob).claimPartnerReward(0, nonce, sig);

      // Alice cancels — should get refund for 1 unclaimed slot
      const balanceBefore = await mockToken.balanceOf(alice.address);
      await taskRewards.connect(alice).cancelPartnerTask(0);
      const balanceAfter = await mockToken.balanceOf(alice.address);

      expect(balanceAfter - balanceBefore).to.equal(amountPerWinner);
    });

    it('should reject non-creator cancellation', async function () {
      const tokenAddr = await mockToken.getAddress();
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await mockToken
        .connect(alice)
        .approve(contractAddress, ethers.parseEther('100'));
      await taskRewards
        .connect(alice)
        .createPartnerTask(tokenAddr, ethers.parseEther('100'), 10, deadline);

      await expect(
        taskRewards.connect(bob).cancelPartnerTask(0)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerNotCreator');
    });

    it('should reject double cancellation', async function () {
      const tokenAddr = await mockToken.getAddress();
      const deadline =
        (await ethers.provider.getBlock('latest'))!.timestamp + 86400;

      await mockToken
        .connect(alice)
        .approve(contractAddress, ethers.parseEther('100'));
      await taskRewards
        .connect(alice)
        .createPartnerTask(tokenAddr, ethers.parseEther('100'), 10, deadline);

      await taskRewards.connect(alice).cancelPartnerTask(0);

      await expect(
        taskRewards.connect(alice).cancelPartnerTask(0)
      ).to.be.revertedWithCustomError(taskRewards, 'PartnerTaskAlreadyCancelled');
    });
  });
});
