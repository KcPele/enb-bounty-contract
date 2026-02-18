// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

library BountyStorageLib {
    uint256 internal constant FEE_DENOMINATOR = 1000;
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
        uint256 createdAt;
        uint256 deadline;
        uint256 maxWinners;
        uint256 winnersCount;
        bool cancelled;
        TokenType tokenType;
        address tokenAddress;
    }

    struct BountyStorage {
        Bounty[] bounties;
        uint256 bountyCounter;
        bool reentrancyLock;
        mapping(address => uint256[]) userBounties;
        // Multiple winners mappings
        mapping(uint256 => address[]) bountyWinners;
        mapping(uint256 => mapping(address => bool)) hasWon;
        // Token support
        mapping(address => bool) supportedTokens;
        mapping(address => TokenType) tokenAddressTypes;
        // Fee configuration
        uint256 platformFeeRate;
        uint256 creationFeeRate;
    }

    function initializeStorage(BountyStorage storage self) internal {
        self.platformFeeRate = 100; // 10%
        self.creationFeeRate = 150; // 15%
    }
}
