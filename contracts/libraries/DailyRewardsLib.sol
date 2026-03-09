// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './TaskRewardsStorageLib.sol';
import '../interfaces/IENBBounty.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

/**
 * @title DailyRewardsLib
 * @notice Manages the daily-streak token reward pool.
 *         - Admin configures which token + amount to distribute
 *         - Anyone can fund the pool
 *         - Users claim once per 24 h with a backend-signed EIP-712 approval
 */
library DailyRewardsLib {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ── Errors ──────────────────────────────────────────────────────────
    error DailyRewardsNotActive();
    error DailyAlreadyClaimed();
    error DailyInsufficientPool();
    error DailyTokenNotSupported();
    error DailyInvalidAmount();
    error DailyNotConfigured();
    error DailyInvalidSignature();
    error DailyNonceUsed();

    // ── Events ──────────────────────────────────────────────────────────
    event DailyRewardConfigUpdated(
        address indexed token,
        uint256 amount,
        bool isActive
    );
    event DailyPoolFunded(
        address indexed funder,
        address indexed token,
        uint256 amount
    );
    event DailyRewardClaimed(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    // ── EIP-712 Constants ───────────────────────────────────────────────
    bytes32 internal constant DAILY_CLAIM_TYPEHASH =
        keccak256('DailyClaimApproval(address claimer,bytes32 nonce)');

    // ── Admin ───────────────────────────────────────────────────────────

    /**
     * @notice Set (or change) the daily-reward token and per-claim amount.
     *         Validates that the token is supported by the ENBBounty whitelist.
     */
    function configureDailyReward(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        address token,
        uint256 amount
    ) internal {
        if (!IENBBounty(self.bountyContract).isTokenSupported(token))
            revert DailyTokenNotSupported();
        if (amount == 0) revert DailyInvalidAmount();

        self.dailyConfig.rewardToken = token;
        self.dailyConfig.rewardAmountPerClaim = amount;
        self.dailyConfig.isActive = true;

        emit DailyRewardConfigUpdated(token, amount, true);
    }

    function toggleDailyRewards(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        bool active
    ) internal {
        self.dailyConfig.isActive = active;
        emit DailyRewardConfigUpdated(
            self.dailyConfig.rewardToken,
            self.dailyConfig.rewardAmountPerClaim,
            active
        );
    }

    // ── Public ──────────────────────────────────────────────────────────

    /**
     * @notice Deposit supported tokens into the daily-reward pool.
     *         Anyone may call this.
     */
    function fundDailyPool(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        address token,
        uint256 amount,
        address sender
    ) internal {
        if (!IENBBounty(self.bountyContract).isTokenSupported(token))
            revert DailyTokenNotSupported();
        if (amount == 0) revert DailyInvalidAmount();

        IERC20(token).safeTransferFrom(sender, address(this), amount);

        emit DailyPoolFunded(sender, token, amount);
    }

    /**
     * @notice Claim daily token reward with backend-signed EIP-712 approval.
     *         Enforces a 24-hour cooldown per user at the contract level.
     */
    function claimDailyReward(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        address user,
        bytes32 nonce,
        bytes calldata signature,
        bytes32 domainSeparator
    ) internal {
        if (!self.dailyConfig.isActive) revert DailyRewardsNotActive();
        if (self.dailyConfig.rewardToken == address(0))
            revert DailyNotConfigured();

        // 24-hour cooldown
        if (block.timestamp < self.lastDailyClaim[user] + 1 days)
            revert DailyAlreadyClaimed();

        // Verify backend signature
        _verifyDailyClaimSignature(self, user, nonce, signature, domainSeparator);

        address token = self.dailyConfig.rewardToken;
        uint256 amount = self.dailyConfig.rewardAmountPerClaim;

        // Ensure pool has enough balance
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance < amount) revert DailyInsufficientPool();

        // Update state before transfer (CEI pattern)
        self.lastDailyClaim[user] = block.timestamp;

        // Transfer reward
        IERC20(token).safeTransfer(user, amount);

        emit DailyRewardClaimed(user, token, amount, block.timestamp);
    }

    // ── Internal ────────────────────────────────────────────────────────

    function _verifyDailyClaimSignature(
        TaskRewardsStorageLib.TaskRewardsStorage storage self,
        address claimer,
        bytes32 nonce,
        bytes calldata signature,
        bytes32 domainSeparator
    ) internal {
        if (self.usedNonces[nonce]) revert DailyNonceUsed();

        bytes32 structHash = keccak256(
            abi.encode(DAILY_CLAIM_TYPEHASH, claimer, nonce)
        );
        bytes32 digest = keccak256(
            abi.encodePacked('\x19\x01', domainSeparator, structHash)
        );

        address recovered = digest.recover(signature);
        if (recovered != self.claimSigner) revert DailyInvalidSignature();

        self.usedNonces[nonce] = true;
    }
}
