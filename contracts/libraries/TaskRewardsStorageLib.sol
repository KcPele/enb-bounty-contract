// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title TaskRewardsStorageLib
 * @notice Storage structs for the ENBTaskRewards contract.
 *         Follows the same pattern as BountyStorageLib.
 */
library TaskRewardsStorageLib {
    uint256 internal constant FEE_DENOMINATOR = 1000;

    struct DailyRewardConfig {
        address rewardToken;
        uint256 rewardAmountPerClaim;
        bool isActive;
    }

    struct PartnerTask {
        uint256 id;
        address creator;
        address rewardToken;
        uint256 totalAmount;
        uint256 amountPerWinner;
        uint256 maxWinners;
        uint256 claimedCount;
        uint256 deadline;
        bool cancelled;
        uint256 createdAt;
    }

    struct TaskRewardsStorage {
        // Reference to ENBBounty — single source of truth for supported tokens
        address bountyContract;
        // Daily streak rewards
        DailyRewardConfig dailyConfig;
        mapping(address => uint256) lastDailyClaim;
        // Partner tasks
        PartnerTask[] partnerTasks;
        uint256 partnerTaskCounter;
        mapping(uint256 => mapping(address => bool)) hasClaimedPartnerTask;
        mapping(uint256 => address[]) partnerTaskWinners;
        // Fee config (default 0)
        uint256 partnerFeeRate;
        // EIP-712 claim signer
        address claimSigner;
        mapping(bytes32 => bool) usedNonces;
    }

    function initializeStorage(
        TaskRewardsStorage storage self,
        address _bountyContract
    ) internal {
        self.bountyContract = _bountyContract;
        self.partnerFeeRate = 0;
    }
}
