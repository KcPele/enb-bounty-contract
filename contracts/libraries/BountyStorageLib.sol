// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

library BountyStorageLib {
    enum TokenType {
        ETH,
        USDC,
        ENB
    }

    struct Bounty {
        uint256 id;
        address issuer;
        string name;
        string description;
        uint256 amount;
        address claimer; // Deprecated: kept for backwards compatibility
        uint256 createdAt;
        uint256 claimId; // Deprecated: kept for backwards compatibility
        uint256 maxWinners; // Maximum number of winners allowed
        uint256 winnersCount; // Current number of winners
        TokenType tokenType; // Type of token used for rewards
        address tokenAddress; // Contract address (0x0 for ETH, token contract for ERC20)
    }

    struct Claim {
        uint256 id;
        address issuer;
        uint256 bountyId;
        address bountyIssuer;
        string name;
        string description;
        uint256 createdAt;
        bool accepted;
    }

    struct Votes {
        uint256 yes;
        uint256 no;
        uint256 deadline;
    }

    struct BountyStorage {
        Bounty[] bounties;
        Claim[] claims;
        uint256 bountyCounter;
        uint256 claimCounter;
        uint256 votingPeriod;
        bool reentrancyLock;
        mapping(address => uint256[]) userBounties;
        mapping(address => uint256[]) userClaims;
        mapping(uint256 => uint256[]) bountyClaims;
        mapping(uint256 => address[]) participants;
        mapping(uint256 => uint256[]) participantAmounts;
        mapping(uint256 => uint256) bountyCurrentVotingClaim;
        mapping(uint256 => Votes) bountyVotingTracker;
        // Legacy flag map retained for backwards compatibility but no longer used for resets
        mapping(uint256 => mapping(address => bool)) hasVoted;
        // New epoch-based voting tracking to avoid clearing loops
        mapping(uint256 => uint256) voteEpoch; // current epoch for each bounty (0 = no active vote)
        mapping(uint256 => mapping(address => uint256)) voterLastEpoch; // last epoch the voter has voted in for bounty
        // Multiple winners mappings
        mapping(uint256 => address[]) bountyWinners;
        mapping(uint256 => uint256[]) bountyWinningClaims;
        mapping(uint256 => mapping(address => bool)) hasWon;
        // Token support
        mapping(address => bool) supportedTokens; // Whitelist of supported ERC20 tokens
        mapping(address => TokenType) tokenAddressTypes; // Map token addresses to their types
        mapping(uint256 => TokenType) bountyTokenTypes; // Track token type per bounty for participants
    }

    function initializeStorage(
        BountyStorage storage self,
        uint256 _startClaimIndex
    ) internal {
        self.claimCounter = _startClaimIndex;
        self.votingPeriod = 1 days;

        for (uint256 i = 0; i < _startClaimIndex; i++) {
            self.claims.push();
        }
    }
}
