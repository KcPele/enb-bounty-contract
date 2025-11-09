// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './libraries/BountyStorageLib.sol';
import './libraries/BountyManagementLib.sol';
import './libraries/ClaimManagementLib.sol';
import './libraries/VotingLib.sol';
import './libraries/BountyGettersLib.sol';
import './libraries/TokenManagementLib.sol';
import './interfaces/IENBBountyNft.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';

contract ENBBounty is IERC721Receiver {
    using BountyStorageLib for BountyStorageLib.BountyStorage;
    using BountyManagementLib for BountyStorageLib.BountyStorage;
    using ClaimManagementLib for BountyStorageLib.BountyStorage;
    using VotingLib for BountyStorageLib.BountyStorage;
    using BountyGettersLib for BountyStorageLib.BountyStorage;
    using TokenManagementLib for BountyStorageLib.BountyStorage;

    BountyStorageLib.BountyStorage private bountyStorage;

    address public immutable treasury;
    IENBBountyNft public immutable ENBBountyNft;

    // Re-emit library events for indexer visibility
    event SupportedTokenAdded(address token, BountyStorageLib.TokenType tokenType);
    event SupportedTokenRemoved(address token);
    event TokenBountyCreated(
        uint256 id,
        address issuer,
        string name,
        string description,
        uint256 amount,
        uint256 maxWinners,
        BountyStorageLib.TokenType tokenType,
        address tokenAddress,
        uint256 createdAt
    );

    event BountyJoined(uint256 bountyId, address participant, uint256 amount);
    event BountyCancelled(uint256 bountyId, address issuer);
    event WithdrawFromOpenBounty(
        uint256 bountyId,
        address participant,
        uint256 amount
    );

    event ClaimCreated(
        uint256 id,
        address issuer,
        uint256 bountyId,
        address bountyIssuer,
        string name,
        string description,
        uint256 createdAt
    );

    event ClaimAccepted(
        uint256 bountyId,
        uint256 claimId,
        address claimIssuer,
        address bountyIssuer,
        uint256 fee
    );

    event ClaimSubmittedForVote(uint256 bountyId, uint256 claimId);

    event VoteClaim(address voter, uint256 bountyId, uint256 claimId);

    event VotingPeriodReset(uint256 bountyId);

    event ResetVotingPeriod(uint256 bountyId);

    constructor(
        address _ENBBountyNft,
        address _treasury,
        uint256 _startClaimIndex
    ) {
        ENBBountyNft = IENBBountyNft(_ENBBountyNft);
        treasury = _treasury;
        bountyStorage.initializeStorage(_startClaimIndex);

        if (_usdcAddress != address(0)) {
            TokenManagementLib.addSupportedToken(
                bountyStorage,
                _usdcAddress,
                BountyStorageLib.TokenType.USDC
            );
        }
        if (_enbAddress != address(0)) {
            TokenManagementLib.addSupportedToken(
                bountyStorage,
                _enbAddress,
                BountyStorageLib.TokenType.ENB
            );
        }
    }

    // Bounty Management Functions
    function createSoloBounty(
        string calldata name,
        string calldata description,
        uint256 maxWinners
    ) external payable {
        uint256 adjustedMaxWinners = maxWinners == 0 ? 1 : maxWinners;
        bountyStorage.createBounty(
            name,
            description,
            adjustedMaxWinners,
            msg.value,
            msg.sender
        );
    }

    function createSoloBounty(
        string calldata name,
        string calldata description
    ) external payable {
        bountyStorage.createBounty(name, description, 1, msg.value, msg.sender);
    }

    function createOpenBounty(
        string calldata name,
        string calldata description,
        uint256 maxWinners
    ) external payable {
        uint256 adjustedMaxWinners = maxWinners == 0 ? 1 : maxWinners;
        uint256 bountyId = bountyStorage.createBounty(
            name,
            description,
            adjustedMaxWinners,
            msg.value,
            msg.sender
        );

        bountyStorage.participants[bountyId].push(msg.sender);
        bountyStorage.participantAmounts[bountyId].push(msg.value);
    }

    function createOpenBounty(
        string calldata name,
        string calldata description
    ) external payable {
        uint256 bountyId = bountyStorage.createBounty(
            name,
            description,
            1,
            msg.value,
            msg.sender
        );

        bountyStorage.participants[bountyId].push(msg.sender);
        bountyStorage.participantAmounts[bountyId].push(msg.value);
    }

    function joinOpenBounty(uint256 bountyId) external payable {
        bountyStorage.joinOpenBounty(bountyId, msg.value, msg.sender);
    }

    // Token Bounty Functions
    function createTokenBounty(
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        address tokenAddress,
        uint256 tokenAmount
    ) external payable {
        uint256 adjustedMaxWinners = maxWinners == 0 ? 1 : maxWinners;
        bountyStorage.createTokenBounty(
            name,
            description,
            adjustedMaxWinners,
            tokenAddress,
            tokenAmount,
            msg.value,
            msg.sender
        );
    }

    function createOpenTokenBounty(
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        address tokenAddress,
        uint256 tokenAmount
    ) external payable {
        uint256 adjustedMaxWinners = maxWinners == 0 ? 1 : maxWinners;
        uint256 bountyId = bountyStorage.createTokenBounty(
            name,
            description,
            adjustedMaxWinners,
            tokenAddress,
            tokenAmount,
            msg.value,
            msg.sender
        );

        bountyStorage.participants[bountyId].push(msg.sender);
        bountyStorage.participantAmounts[bountyId].push(tokenAmount);
    }

    function joinOpenBountyWithToken(
        uint256 bountyId,
        uint256 tokenAmount
    ) external payable {
        bountyStorage.joinOpenBountyWithToken(
            bountyId,
            tokenAmount,
            msg.value,
            msg.sender
        );
    }

    function cancelSoloBounty(uint bountyId) external {
        bountyStorage.cancelSoloBounty(bountyId, msg.sender);
    }

    function cancelOpenBounty(uint256 bountyId) external {
        bountyStorage.cancelOpenBounty(bountyId, msg.sender);
    }

    function withdrawFromOpenBounty(uint256 bountyId) external {
        bountyStorage.withdrawFromOpenBounty(bountyId, msg.sender);
    }

    // Claim Management Functions
    function createClaim(
        uint256 bountyId,
        string calldata name,
        string calldata uri,
        string calldata description
    ) external {
        bountyStorage.createClaim(
            ENBBountyNft,
            bountyId,
            name,
            uri,
            description,
            msg.sender
        );
    }

    function acceptClaim(uint256 bountyId, uint256 claimId) external {
        bountyStorage.acceptClaim(
            ENBBountyNft,
            treasury,
            bountyId,
            claimId,
            msg.sender
        );
    }

    function acceptClaims(
        uint256 bountyId,
        uint256[] calldata claimIds
    ) external {
        bountyStorage.acceptClaims(
            ENBBountyNft,
            treasury,
            bountyId,
            claimIds,
            msg.sender
        );
    }

    // Voting Functions
    function submitClaimForVote(uint256 bountyId, uint256 claimId) external {
        bountyStorage.submitClaimForVote(bountyId, claimId, msg.sender);
    }

    function voteClaim(uint256 bountyId, bool vote) external {
        bountyStorage.voteClaim(bountyId, vote, msg.sender);
    }

    function resolveVote(uint256 bountyId) external {
        bountyStorage.resolveVote(ENBBountyNft, treasury, bountyId);
    }

    function resetVotingPeriod(uint256 bountyId) external {
        bountyStorage.resetVotingPeriod(bountyId, msg.sender);
    }

    // Getter Functions
    function getClaimsLength() public view returns (uint256) {
        return bountyStorage.claimCounter;
    }
    function getBountiesLength() public view returns (uint256) {
        return bountyStorage.getBountiesLength();
    }

    function getBounties(
        uint offset
    ) public view returns (BountyStorageLib.Bounty[10] memory) {
        return bountyStorage.getBounties(offset);
    }

    function getClaimsByBountyId(
        uint256 bountyId
    ) public view returns (BountyStorageLib.Claim[] memory) {
        return bountyStorage.getClaimsByBountyId(bountyId);
    }

    function getBountiesByUser(
        address user,
        uint256 offset
    ) public view returns (BountyStorageLib.Bounty[10] memory) {
        return bountyStorage.getBountiesByUser(user, offset);
    }

    function getClaimsByUser(
        address user
    ) public view returns (BountyStorageLib.Claim[] memory) {
        return bountyStorage.getClaimsByUser(user);
    }

    function getParticipants(
        uint256 bountyId
    ) public view returns (address[] memory, uint256[] memory) {
        return bountyStorage.getParticipants(bountyId);
    }

    function getBountyWinners(
        uint256 bountyId
    ) public view returns (address[] memory, uint256[] memory) {
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

    function batchAcceptLimit() external pure returns (uint256) {
        return ClaimManagementLib.batchAcceptLimit();
    }

    // Direct storage access for backwards compatibility
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
            address claimer,
            uint256 createdAt,
            uint256 claimId,
            uint256 maxWinners,
            uint256 winnersCount
        )
    {
        BountyStorageLib.Bounty memory bounty = bountyStorage.bounties[index];
        return (
            bounty.id,
            bounty.issuer,
            bounty.name,
            bounty.description,
            bounty.amount,
            bounty.claimer,
            bounty.createdAt,
            bounty.claimId,
            bounty.maxWinners,
            bounty.winnersCount
        );
    }

    function claims(
        uint256 index
    )
        public
        view
        returns (
            uint256 id,
            address issuer,
            uint256 bountyId,
            address bountyIssuer,
            string memory name,
            string memory description,
            uint256 createdAt,
            bool accepted
        )
    {
        BountyStorageLib.Claim memory claim = bountyStorage.claims[index];
        return (
            claim.id,
            claim.issuer,
            claim.bountyId,
            claim.bountyIssuer,
            claim.name,
            claim.description,
            claim.createdAt,
            claim.accepted
        );
    }

    // Direct mapping access
    function participants(
        uint256 bountyId,
        uint256 index
    ) public view returns (address) {
        return bountyStorage.participants[bountyId][index];
    }

    function participantAmounts(
        uint256 bountyId,
        uint256 index
    ) public view returns (uint256) {
        return bountyStorage.participantAmounts[bountyId][index];
    }

    function bountyWinners(
        uint256 bountyId
    ) public view returns (address[] memory) {
        return bountyStorage.bountyWinners[bountyId];
    }

    function bountyWinningClaims(
        uint256 bountyId
    ) public view returns (uint256[] memory) {
        return bountyStorage.bountyWinningClaims[bountyId];
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

    function claimCounter() public view returns (uint256) {
        return bountyStorage.claimCounter;
    }

    function votingPeriod() public view returns (uint256) {
        return bountyStorage.votingPeriod;
    }

    // Token Management Functions (Owner only)
    modifier onlyOwner() {
        require(msg.sender == treasury, 'Not authorized');
        _;
    }

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

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
