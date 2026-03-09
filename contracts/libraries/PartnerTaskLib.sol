// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './TaskRewardsStorageLib.sol';
import '../interfaces/IENBBounty.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

/**
 * @title PartnerTaskLib
 * @notice Manages partner-task reward pools with EIP-712 signature verification.
 *
 *   Any user can create a partner task by depositing supported tokens.
 *   Eligible users receive a backend-signed EIP-712 approval which the
 *   contract verifies before releasing tokens.
 */
library PartnerTaskLib {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ── Errors ──────────────────────────────────────────────────────────
    error PartnerTokenNotSupported();
    error PartnerInvalidAmount();
    error PartnerInvalidWinners();
    error PartnerInvalidDeadline();
    error PartnerTaskNotFound();
    error PartnerTaskExpired();
    error PartnerTaskFull();
    error PartnerTaskAlreadyCancelled();
    error PartnerAlreadyClaimed();
    error PartnerNotCreator();
    error PartnerInvalidSignature();
    error PartnerNonceUsed();
    error PartnerNothingToRefund();

    // ── Events ──────────────────────────────────────────────────────────
    event PartnerTaskCreated(
        uint256 indexed taskId,
        address indexed creator,
        address indexed token,
        uint256 totalAmount,
        uint256 amountPerWinner,
        uint256 maxWinners,
        uint256 deadline,
        uint256 fee
    );
    event PartnerTaskClaimed(
        uint256 indexed taskId,
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event PartnerTaskCancelled(
        uint256 indexed taskId,
        address indexed creator,
        uint256 refundAmount
    );

    // ── EIP-712 Constants ───────────────────────────────────────────────
    bytes32 internal constant CLAIM_TYPEHASH =
        keccak256('ClaimApproval(uint256 taskId,address claimer,bytes32 nonce)');

    // ── Public ──────────────────────────────────────────────────────────

    function createPartnerTask(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        address token,
        uint256 totalAmount,
        uint256 maxWinners,
        uint256 deadline,
        address sender,
        address treasury
    ) internal returns (uint256 taskId) {
        // Validate
        if (!IENBBounty(self.bountyContract).isTokenSupported(token))
            revert PartnerTokenNotSupported();
        if (totalAmount == 0) revert PartnerInvalidAmount();
        if (maxWinners == 0) revert PartnerInvalidWinners();
        if (deadline <= block.timestamp) revert PartnerInvalidDeadline();
        if (totalAmount < maxWinners) revert PartnerInvalidAmount();

        uint256 amountPerWinner = totalAmount / maxWinners;

        // Calculate optional fee
        uint256 fee = 0;
        if (self.partnerFeeRate > 0) {
            fee = (totalAmount * self.partnerFeeRate) /
                TaskRewardsStorageLib.FEE_DENOMINATOR;
        }

        // Transfer tokens: totalAmount + fee
        uint256 transferTotal = totalAmount + fee;
        IERC20(token).safeTransferFrom(sender, address(this), transferTotal);

        // Send fee to treasury (if any)
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
        }

        // Store
        taskId = self.partnerTaskCounter;
        self.partnerTasks.push(
            TaskRewardsStorageLib.PartnerTask({
                id: taskId,
                creator: sender,
                rewardToken: token,
                totalAmount: totalAmount,
                amountPerWinner: amountPerWinner,
                maxWinners: maxWinners,
                claimedCount: 0,
                deadline: deadline,
                cancelled: false,
                createdAt: block.timestamp
            })
        );
        self.partnerTaskCounter = taskId + 1;

        emit PartnerTaskCreated(
            taskId,
            sender,
            token,
            totalAmount,
            amountPerWinner,
            maxWinners,
            deadline,
            fee
        );
    }

    function claimPartnerReward(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        uint256 taskId,
        address user,
        bytes32 nonce,
        bytes calldata signature,
        bytes32 domainSeparator
    ) internal {
        if (taskId >= self.partnerTaskCounter) revert PartnerTaskNotFound();

        TaskRewardsStorageLib.PartnerTask storage task = self.partnerTasks[
            taskId
        ];
        if (task.cancelled) revert PartnerTaskAlreadyCancelled();
        if (block.timestamp > task.deadline) revert PartnerTaskExpired();
        if (task.claimedCount >= task.maxWinners) revert PartnerTaskFull();
        if (self.hasClaimedPartnerTask[taskId][user])
            revert PartnerAlreadyClaimed();

        // Verify EIP-712 signature
        _verifyClaimSignature(self, taskId, user, nonce, signature, domainSeparator);

        // Update state (CEI)
        self.hasClaimedPartnerTask[taskId][user] = true;
        self.partnerTaskWinners[taskId].push(user);
        task.claimedCount += 1;

        // Transfer reward
        IERC20(task.rewardToken).safeTransfer(user, task.amountPerWinner);

        emit PartnerTaskClaimed(
            taskId,
            user,
            task.rewardToken,
            task.amountPerWinner
        );
    }

    function cancelPartnerTask(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        uint256 taskId,
        address sender
    ) internal {
        if (taskId >= self.partnerTaskCounter) revert PartnerTaskNotFound();

        TaskRewardsStorageLib.PartnerTask storage task = self.partnerTasks[
            taskId
        ];
        if (task.creator != sender) revert PartnerNotCreator();
        if (task.cancelled) revert PartnerTaskAlreadyCancelled();

        uint256 unclaimed = task.maxWinners - task.claimedCount;
        if (unclaimed == 0) revert PartnerNothingToRefund();

        uint256 refundAmount = unclaimed * task.amountPerWinner;

        // Update state (CEI)
        task.cancelled = true;

        // Refund unclaimed tokens to creator
        IERC20(task.rewardToken).safeTransfer(sender, refundAmount);

        emit PartnerTaskCancelled(taskId, sender, refundAmount);
    }

    // ── Internal ────────────────────────────────────────────────────────

    function _verifyClaimSignature(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        uint256 taskId,
        address claimer,
        bytes32 nonce,
        bytes calldata signature,
        bytes32 domainSeparator
    ) internal {
        if (self.usedNonces[nonce]) revert PartnerNonceUsed();

        bytes32 structHash = keccak256(
            abi.encode(CLAIM_TYPEHASH, taskId, claimer, nonce)
        );
        bytes32 digest = keccak256(
            abi.encodePacked('\x19\x01', domainSeparator, structHash)
        );

        address recovered = digest.recover(signature);
        if (recovered != self.claimSigner) revert PartnerInvalidSignature();

        self.usedNonces[nonce] = true;
    }
}
