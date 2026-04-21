// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import './libraries/BountyStorageLib.sol';
import './libraries/BountyManagementLib.sol';
import './libraries/ClaimManagementLib.sol';
import './libraries/BountyGettersLib.sol';
import './libraries/TokenManagementLib.sol';

/**
 * @title ENBBounty
 * @notice UUPS-upgradeable bounty contract for the ENB platform.
 *         Deployed behind an ERC1967 proxy.
 */
contract ENBBounty is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using BountyStorageLib for BountyStorageLib.BountyStorage;
    using BountyManagementLib for BountyStorageLib.BountyStorage;
    using ClaimManagementLib for BountyStorageLib.BountyStorage;
    using BountyGettersLib for BountyStorageLib.BountyStorage;
    using TokenManagementLib for BountyStorageLib.BountyStorage;

    BountyStorageLib.BountyStorage private bountyStorage;

    address public treasury;

    // Fee management events
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event CreationFeeCharged(uint256 bountyId, address payer, uint256 fee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event DeadlineExtended(uint256 indexed bountyId, uint256 oldDeadline, uint256 newDeadline);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _treasury) external initializer {
        require(_treasury != address(0), 'Invalid treasury');
        __Ownable_init();
        __UUPSUpgradeable_init();

        treasury = _treasury;
        bountyStorage.initializeStorage();
    }

    // ──────────────────────────────────────────────
    // UUPS: only owner can upgrade
    // ──────────────────────────────────────────────

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ──────────────────────────────────────────────
    // Treasury management
    // ──────────────────────────────────────────────

    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), 'Invalid treasury');
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    // ──────────────────────────────────────────────
    // Bounty Management Functions
    // ──────────────────────────────────────────────

    function createSoloBounty(
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        uint256 durationInDays,
        uint256 reviewPeriodInDays
    ) external payable {
        uint256 adjustedMaxWinners = maxWinners == 0 ? 1 : maxWinners;
        bountyStorage.createBounty(
            name,
            description,
            adjustedMaxWinners,
            durationInDays,
            reviewPeriodInDays,
            msg.value,
            msg.sender,
            treasury
        );
    }

    function createSoloBounty(
        string calldata name,
        string calldata description,
        uint256 durationInDays,
        uint256 reviewPeriodInDays
    ) external payable {
        bountyStorage.createBounty(
            name,
            description,
            1,
            durationInDays,
            reviewPeriodInDays,
            msg.value,
            msg.sender,
            treasury
        );
    }

    // Token Bounty Functions
    function createTokenBounty(
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        address tokenAddress,
        uint256 tokenAmount,
        uint256 durationInDays,
        uint256 reviewPeriodInDays
    ) external payable {
        uint256 adjustedMaxWinners = maxWinners == 0 ? 1 : maxWinners;
        bountyStorage.createTokenBounty(
            name,
            description,
            adjustedMaxWinners,
            durationInDays,
            reviewPeriodInDays,
            tokenAddress,
            tokenAmount,
            msg.value,
            msg.sender,
            treasury
        );
    }

    function createPositionBounty(
        string calldata name,
        string calldata description,
        address tokenAddress,
        uint256 tokenAmount,
        uint256[] calldata positionAmounts,
        uint256 durationInDays,
        uint256 reviewPeriodInDays
    ) external payable {
        bountyStorage.createPositionBounty(
            name,
            description,
            durationInDays,
            reviewPeriodInDays,
            tokenAddress,
            tokenAmount,
            positionAmounts,
            msg.value,
            msg.sender,
            treasury
        );
    }

    function cancelSoloBounty(uint bountyId) external {
        bountyStorage.cancelSoloBounty(bountyId, msg.sender);
    }

    function extendDeadline(
        uint256 bountyId,
        uint256 additionalDays
    ) external {
        bountyStorage.extendDeadline(bountyId, additionalDays, msg.sender);
    }

    // ──────────────────────────────────────────────
    // Claim Management Functions
    // ──────────────────────────────────────────────

    function acceptClaim(uint256 bountyId, address claimer) external {
        bountyStorage.acceptClaim(treasury, bountyId, claimer, msg.sender);
    }

    function batchAcceptClaims(
        uint256 bountyId,
        address[] calldata claimers
    ) external {
        bountyStorage.batchAcceptClaims(
            treasury,
            bountyId,
            claimers,
            msg.sender
        );
    }

    // ──────────────────────────────────────────────
    // Getter Functions
    // ──────────────────────────────────────────────

    function getBountiesLength() public view returns (uint256) {
        return bountyStorage.getBountiesLength();
    }

    function getBounties(
        uint offset
    ) public view returns (BountyStorageLib.Bounty[10] memory) {
        return bountyStorage.getBounties(offset);
    }

    function getBountiesByUser(
        address user,
        uint256 offset
    ) public view returns (BountyStorageLib.Bounty[10] memory) {
        return bountyStorage.getBountiesByUser(user, offset);
    }

    function getBountyWinners(
        uint256 bountyId
    ) public view returns (address[] memory) {
        return bountyStorage.getBountyWinners(bountyId);
    }

    function hasAddressWon(
        uint256 bountyId,
        address winner
    ) public view returns (bool) {
        return bountyStorage.hasAddressWon(bountyId, winner);
    }

    function getRemainingWinnerSlots(
        uint256 bountyId
    ) public view returns (uint256) {
        return bountyStorage.getRemainingWinnerSlots(bountyId);
    }

    // Direct storage access
    function bounties(
        uint256 index
    )
        public
        view
        returns (
            uint256 id,
            address issuer,
            string memory name,
            string memory description,
            uint256 amount,
            uint256 createdAt,
            uint256 deadline,
            uint256 maxWinners,
            uint256 winnersCount,
            bool cancelled,
            BountyStorageLib.TokenType tokenType,
            address tokenAddress
        )
    {
        BountyStorageLib.Bounty memory bounty = bountyStorage.bounties[index];
        return (
            bounty.id,
            bounty.issuer,
            bounty.name,
            bounty.description,
            bounty.amount,
            bounty.createdAt,
            bounty.deadline,
            bounty.maxWinners,
            bounty.winnersCount,
            bounty.cancelled,
            bounty.tokenType,
            bounty.tokenAddress
        );
    }

    function bountyWinners(
        uint256 bountyId
    ) public view returns (address[] memory) {
        return bountyStorage.bountyWinners[bountyId];
    }

    function hasWon(
        uint256 bountyId,
        address winner
    ) public view returns (bool) {
        return bountyStorage.hasWon[bountyId][winner];
    }

    function bountyCounter() public view returns (uint256) {
        return bountyStorage.bountyCounter;
    }

    // Position-based bounty view functions
    function isBountyPositionBased(
        uint256 bountyId
    ) external view returns (bool) {
        require(bountyId < bountyStorage.bountyCounter, 'Bounty not found');
        return bountyStorage.isPositionBased[bountyId];
    }

    function getBountyPositionAmount(
        uint256 bountyId,
        uint256 positionIndex
    ) external view returns (uint256) {
        return bountyStorage.bountyPositionAmounts[bountyId][positionIndex];
    }

    function getBountyAllPositionAmounts(
        uint256 bountyId
    ) external view returns (uint256[] memory amounts) {
        require(bountyId < bountyStorage.bountyCounter, 'Bounty not found');
        uint256 count = bountyStorage.bounties[bountyId].maxWinners;
        amounts = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            amounts[i] = bountyStorage.bountyPositionAmounts[bountyId][i];
        }
    }

    // ──────────────────────────────────────────────
    // Review period & status views
    // ──────────────────────────────────────────────

    function getBountyReviewPeriod(
        uint256 bountyId
    ) external view returns (uint256) {
        require(bountyId < bountyStorage.bountyCounter, 'Bounty not found');
        return bountyStorage.bountyReviewPeriod[bountyId];
    }

    /// @notice Returns bounty status: 0=active, 1=inReview, 2=ended, 3=cancelled
    function getBountyStatus(
        uint256 bountyId
    ) external view returns (uint8) {
        require(bountyId < bountyStorage.bountyCounter, 'Bounty not found');
        BountyStorageLib.Bounty memory bounty = bountyStorage.bounties[bountyId];
        if (bounty.cancelled) return 3;
        if (bounty.winnersCount >= bounty.maxWinners) return 2;
        if (block.timestamp <= bounty.deadline) return 0;
        uint256 reviewEnd = bounty.deadline +
            bountyStorage.bountyReviewPeriod[bountyId];
        if (block.timestamp <= reviewEnd) return 1;
        return 2;
    }

    // ──────────────────────────────────────────────
    // Token Management Functions (Owner only)
    // ──────────────────────────────────────────────

    function addSupportedToken(
        address tokenAddress,
        BountyStorageLib.TokenType tokenType
    ) external onlyOwner {
        TokenManagementLib.addSupportedToken(
            bountyStorage,
            tokenAddress,
            tokenType
        );
    }

    function removeSupportedToken(address tokenAddress) external onlyOwner {
        TokenManagementLib.removeSupportedToken(bountyStorage, tokenAddress);
    }

    function isTokenSupported(
        address tokenAddress
    ) external view returns (bool) {
        return TokenManagementLib.isTokenSupported(bountyStorage, tokenAddress);
    }

    // Enhanced bounty getters with token info
    function getBountyTokenInfo(
        uint256 bountyId
    )
        external
        view
        returns (BountyStorageLib.TokenType tokenType, address tokenAddress)
    {
        require(bountyId < bountyStorage.bountyCounter, 'Bounty not found');
        BountyStorageLib.Bounty memory bounty = bountyStorage.bounties[
            bountyId
        ];
        return (bounty.tokenType, bounty.tokenAddress);
    }

    function getTokenType(
        address tokenAddress
    ) external view returns (BountyStorageLib.TokenType) {
        return
            TokenManagementLib.getTokenTypeFromAddress(
                bountyStorage,
                tokenAddress
            );
    }

    function getTokenTypeName(
        BountyStorageLib.TokenType tokenType
    ) external pure returns (string memory) {
        return TokenManagementLib.getTokenTypeName(tokenType);
    }

    // ──────────────────────────────────────────────
    // Fee Management Functions (Owner only)
    // ──────────────────────────────────────────────

    function updatePlatformFee(uint256 newFee) external onlyOwner {
        require(newFee <= 250, 'Fee exceeds 25% cap');
        uint256 oldFee = bountyStorage.platformFeeRate;
        bountyStorage.platformFeeRate = newFee;
        emit PlatformFeeUpdated(oldFee, newFee);
    }

    function updateCreationFee(uint256 newFee) external onlyOwner {
        require(newFee <= 250, 'Fee exceeds 25% cap');
        uint256 oldFee = bountyStorage.creationFeeRate;
        bountyStorage.creationFeeRate = newFee;
        emit CreationFeeUpdated(oldFee, newFee);
    }

    function platformFeeRate() public view returns (uint256) {
        return bountyStorage.platformFeeRate;
    }

    function creationFeeRate() public view returns (uint256) {
        return bountyStorage.creationFeeRate;
    }
}
