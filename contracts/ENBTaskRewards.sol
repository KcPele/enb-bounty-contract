// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './libraries/TaskRewardsStorageLib.sol';
import './libraries/DailyRewardsLib.sol';
import './libraries/PartnerTaskLib.sol';
import './interfaces/IENBBounty.sol';

/**
 * @title ENBTaskRewards
 * @notice Manages two on-chain reward mechanisms for the ENB task system:
 *
 *   1. **Daily Streak Rewards** — admin-configured token paid from a funded
 *      pool when users complete their daily streak (once per 24 h).
 *   2. **Partner Task Pools** — any user deposits tokens; eligible
 *      participants claim an equal share after passing off-chain eligibility
 *      checks verified via EIP-712 signatures.
 *
 *   Token whitelist is delegated to the deployed ENBBounty contract
 *   (single source of truth) via `IENBBounty.isTokenSupported()`.
 */
contract ENBTaskRewards {
    using TaskRewardsStorageLib for TaskRewardsStorageLib.TaskRewardsStorage;
    using DailyRewardsLib for TaskRewardsStorageLib.TaskRewardsStorage;
    using PartnerTaskLib for TaskRewardsStorageLib.TaskRewardsStorage;

    TaskRewardsStorageLib.TaskRewardsStorage private rewardsStorage;

    address public immutable treasury;
    address public immutable bountyContract;

    // ── EIP-712 Domain ──────────────────────────────────────────────────
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        );

    // ── Events ──────────────────────────────────────────────────────────
    // Re-declare library events so they appear in the contract ABI
    event DailyRewardConfigUpdated(address indexed token, uint256 amount, bool isActive);
    event DailyPoolFunded(address indexed funder, address indexed token, uint256 amount);
    event DailyRewardClaimed(address indexed user, address indexed token, uint256 amount, uint256 timestamp);
    event PartnerTaskCreated(uint256 indexed taskId, address indexed creator, address indexed token, uint256 totalAmount, uint256 amountPerWinner, uint256 maxWinners, uint256 deadline, uint256 fee);
    event PartnerTaskClaimed(uint256 indexed taskId, address indexed user, address indexed token, uint256 amount);
    event PartnerTaskCancelled(uint256 indexed taskId, address indexed creator, uint256 refundAmount);
    event ClaimSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PartnerFeeUpdated(uint256 oldFee, uint256 newFee);

    // ── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == treasury, 'Not authorized');
        _;
    }

    // ── Constructor ─────────────────────────────────────────────────────
    constructor(address _treasury, address _bountyContract) {
        require(_treasury != address(0), 'Invalid treasury');
        require(_bountyContract != address(0), 'Invalid bounty contract');

        treasury = _treasury;
        bountyContract = _bountyContract;

        rewardsStorage.initializeStorage(_bountyContract);

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256('ENBTaskRewards'),
                keccak256('1'),
                block.chainid,
                address(this)
            )
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    //                        ADMIN FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Set or change the daily-reward token and per-claim amount.
    function configureDailyReward(
        address token,
        uint256 amount
    ) external onlyOwner {
        rewardsStorage.configureDailyReward(token, amount);
    }

    /// @notice Pause or resume daily rewards.
    function toggleDailyRewards(bool active) external onlyOwner {
        rewardsStorage.toggleDailyRewards(active);
    }

    /// @notice Set the backend signer address for EIP-712 claim approvals.
    function setClaimSigner(address signer) external onlyOwner {
        require(signer != address(0), 'Invalid signer');
        address old = rewardsStorage.claimSigner;
        rewardsStorage.claimSigner = signer;
        emit ClaimSignerUpdated(old, signer);
    }

    /// @notice Update the partner-task creation fee rate (default 0).
    function updatePartnerFeeRate(uint256 newRate) external onlyOwner {
        require(newRate <= 250, 'Fee exceeds 25% cap');
        uint256 oldRate = rewardsStorage.partnerFeeRate;
        rewardsStorage.partnerFeeRate = newRate;
        emit PartnerFeeUpdated(oldRate, newRate);
    }

    // ══════════════════════════════════════════════════════════════════════
    //                     DAILY REWARD FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Deposit supported tokens into the daily-reward pool.
    function fundDailyPool(address token, uint256 amount) external {
        rewardsStorage.fundDailyPool(token, amount, msg.sender);
    }

    /// @notice Claim the daily token reward with a backend-signed approval.
    function claimDailyReward(
        bytes32 nonce,
        bytes calldata signature
    ) external {
        rewardsStorage.claimDailyReward(
            msg.sender,
            nonce,
            signature,
            DOMAIN_SEPARATOR
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    //                     PARTNER TASK FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Create a partner task by depositing tokens.
    function createPartnerTask(
        address token,
        uint256 totalAmount,
        uint256 maxWinners,
        uint256 deadline
    ) external returns (uint256 taskId) {
        return
            rewardsStorage.createPartnerTask(
                token,
                totalAmount,
                maxWinners,
                deadline,
                msg.sender,
                treasury
            );
    }

    /// @notice Claim a partner-task reward with a backend-signed approval.
    function claimPartnerReward(
        uint256 taskId,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        rewardsStorage.claimPartnerReward(
            taskId,
            msg.sender,
            nonce,
            signature,
            DOMAIN_SEPARATOR
        );
    }

    /// @notice Cancel a partner task and refund unclaimed tokens.
    function cancelPartnerTask(uint256 taskId) external {
        rewardsStorage.cancelPartnerTask(taskId, msg.sender);
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    function getDailyRewardConfig()
        external
        view
        returns (address token, uint256 amount, bool isActive)
    {
        TaskRewardsStorageLib.DailyRewardConfig storage c = rewardsStorage
            .dailyConfig;
        return (c.rewardToken, c.rewardAmountPerClaim, c.isActive);
    }

    function canClaimDaily(address user) external view returns (bool) {
        if (!rewardsStorage.dailyConfig.isActive) return false;
        if (rewardsStorage.dailyConfig.rewardToken == address(0))
            return false;
        if (
            block.timestamp <
            rewardsStorage.lastDailyClaim[user] + 1 days
        ) return false;
        uint256 balance = IERC20(rewardsStorage.dailyConfig.rewardToken)
            .balanceOf(address(this));
        return balance >= rewardsStorage.dailyConfig.rewardAmountPerClaim;
    }

    function getLastDailyClaim(
        address user
    ) external view returns (uint256) {
        return rewardsStorage.lastDailyClaim[user];
    }

    function getDailyPoolBalance() external view returns (uint256) {
        address token = rewardsStorage.dailyConfig.rewardToken;
        if (token == address(0)) return 0;
        return IERC20(token).balanceOf(address(this));
    }

    function getPartnerTask(
        uint256 taskId
    ) external view returns (TaskRewardsStorageLib.PartnerTask memory) {
        require(
            taskId < rewardsStorage.partnerTaskCounter,
            'Task not found'
        );
        return rewardsStorage.partnerTasks[taskId];
    }

    function getPartnerTaskCount() external view returns (uint256) {
        return rewardsStorage.partnerTaskCounter;
    }

    function hasClaimedPartnerTask(
        uint256 taskId,
        address user
    ) external view returns (bool) {
        return rewardsStorage.hasClaimedPartnerTask[taskId][user];
    }

    function getPartnerTaskWinners(
        uint256 taskId
    ) external view returns (address[] memory) {
        return rewardsStorage.partnerTaskWinners[taskId];
    }

    function isTokenSupported(
        address token
    ) external view returns (bool) {
        return IENBBounty(bountyContract).isTokenSupported(token);
    }

    function claimSigner() external view returns (address) {
        return rewardsStorage.claimSigner;
    }

    function partnerFeeRate() external view returns (uint256) {
        return rewardsStorage.partnerFeeRate;
    }

    /// @notice Accept ERC-20 deposits.
    receive() external payable {}
}
