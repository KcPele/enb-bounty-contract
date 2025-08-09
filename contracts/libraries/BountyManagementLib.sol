// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './BountyStorageLib.sol';
import './TokenManagementLib.sol';

library BountyManagementLib {
    using BountyStorageLib for BountyStorageLib.BountyStorage;

    event BountyCreatedWithMaxWinners(
        uint256 id,
        address issuer,
        string name,
        string description,
        uint256 amount,
        uint256 maxWinners,
        uint256 createdAt
    );

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

    error NoEther();
    error BountyNotFound();
    error NotSoloBounty();
    error NotOpenBounty();
    error WrongCaller();
    error BountyClosed();
    error BountyClaimed();
    error VotingOngoing();
    error transferFailed();
    error IssuerCannotWithdraw();
    error NotAParticipant();

    function createBounty(
        BountyStorageLib.BountyStorage storage self,
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        uint256 msgValue,
        address msgSender
    ) internal returns (uint256 bountyId) {
        return
            createTokenBounty(
                self,
                name,
                description,
                maxWinners,
                address(0), // ETH
                msgValue,
                msgValue,
                msgSender
            );
    }

    function createTokenBounty(
        BountyStorageLib.BountyStorage storage self,
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        address tokenAddress,
        uint256 tokenAmount,
        uint256 msgValue,
        address msgSender
    ) internal returns (uint256 bountyId) {
        require(maxWinners > 0, 'Must have at least one winner');

        // Process token deposit and validation
        BountyStorageLib.TokenType tokenType = TokenManagementLib
            .processTokenDeposit(
                self,
                tokenAddress,
                tokenAmount,
                msgValue,
                msgSender
            );

        bountyId = self.bountyCounter;
        BountyStorageLib.Bounty memory bounty = BountyStorageLib.Bounty(
            bountyId,
            msgSender,
            name,
            description,
            tokenAmount,
            address(0),
            block.timestamp,
            0,
            maxWinners,
            0,
            tokenType,
            tokenAddress
        );
        self.bounties.push(bounty);
        self.userBounties[msgSender].push(bountyId);
        self.bountyTokenTypes[bountyId] = tokenType;
        ++self.bountyCounter;

        emit TokenBountyCreated(
            bountyId,
            msgSender,
            name,
            description,
            tokenAmount,
            maxWinners,
            tokenType,
            tokenAddress,
            block.timestamp
        );
    }

    function joinOpenBounty(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        uint256 msgValue,
        address msgSender
    ) internal {
        _joinOpenBountyWithToken(self, bountyId, msgValue, msgValue, msgSender);
    }

    function joinOpenBountyWithToken(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        uint256 tokenAmount,
        uint256 msgValue,
        address msgSender
    ) internal {
        _joinOpenBountyWithToken(
            self,
            bountyId,
            tokenAmount,
            msgValue,
            msgSender
        );
    }

    function _joinOpenBountyWithToken(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        uint256 tokenAmount,
        uint256 msgValue,
        address msgSender
    ) private {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty memory bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        // Check if there's an active voting period
        if (self.bountyVotingTracker[bountyId].deadline > block.timestamp) revert VotingOngoing();

        address[] memory p = self.participants[bountyId];
        if (p.length == 0) revert NotOpenBounty();

        // Validate token amounts match bounty token type
        TokenManagementLib.validateTokenAmount(
            bounty.tokenType,
            tokenAmount,
            tokenAmount,
            msgValue
        );

        // Check if already participant
        uint256 i;
        do {
            if (msgSender == p[i]) {
                revert WrongCaller();
            }
            ++i;
        } while (p.length > i);

        // Process token deposit if ERC20
        if (bounty.tokenType != BountyStorageLib.TokenType.ETH) {
            TokenManagementLib.processTokenDeposit(
                self,
                bounty.tokenAddress,
                tokenAmount,
                msgValue,
                msgSender
            );
        } else {
            if (tokenAmount == 0) revert NoEther();
        }

        self.participants[bountyId].push(msgSender);
        self.participantAmounts[bountyId].push(tokenAmount);
        self.bounties[bountyId].amount = bounty.amount + tokenAmount;

        emit BountyJoined(bountyId, msgSender, tokenAmount);
    }

    function cancelSoloBounty(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        address msgSender
    ) internal {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty memory bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        if (msgSender != bounty.issuer) revert WrongCaller();

        address[] memory p = self.participants[bountyId];
        if (p.length > 0) revert NotSoloBounty();

        uint refundAmount = bounty.amount;
        self.bounties[bountyId].claimer = msgSender;

        // Use TokenManagementLib for refund
        TokenManagementLib.transferTokens(
            bounty.tokenType,
            bounty.tokenAddress,
            bounty.issuer,
            refundAmount
        );

        emit BountyCancelled(bountyId, bounty.issuer);
    }

    function cancelOpenBounty(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        address msgSender
    ) internal {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty memory bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        if (msgSender != bounty.issuer) revert WrongCaller();
        if (self.bountyCurrentVotingClaim[bountyId] > 0) revert VotingOngoing();

        address[] memory p = self.participants[bountyId];
        if (p.length == 0) revert NotOpenBounty();

        uint256[] memory amounts = self.participantAmounts[bountyId];
        uint256 i;

        do {
            address participant = p[i];
            uint256 amount = amounts[i];

            if (participant == address(0)) {
                ++i;
                continue;
            }

            // Use TokenManagementLib for refunds
            TokenManagementLib.transferTokens(
                bounty.tokenType,
                bounty.tokenAddress,
                participant,
                amount
            );

            ++i;
        } while (i < p.length);

        self.bounties[bountyId].claimer = msgSender;

        emit BountyCancelled(bountyId, bounty.issuer);
    }

    function withdrawFromOpenBounty(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        address msgSender
    ) internal {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty memory bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        // Check if there's an active voting period
        if (self.bountyVotingTracker[bountyId].deadline > block.timestamp) revert VotingOngoing();
        if (bounty.issuer == msgSender) revert IssuerCannotWithdraw();

        address[] memory p = self.participants[bountyId];
        if (p.length == 0) revert NotOpenBounty();

        uint256[] memory amounts = self.participantAmounts[bountyId];
        uint256 i;
        bool found = false;

        do {
            if (msgSender == p[i]) {
                uint256 amount = amounts[i];
                self.participants[bountyId][i] = address(0);
                self.participantAmounts[bountyId][i] = 0;
                self.bounties[bountyId].amount -= amount;

                // Use TokenManagementLib for withdrawal
                TokenManagementLib.transferTokens(
                    bounty.tokenType,
                    bounty.tokenAddress,
                    msgSender,
                    amount
                );

                emit WithdrawFromOpenBounty(bountyId, msgSender, amount);
                found = true;
                break;
            }
            ++i;
        } while (i < p.length);

        // Revert if the sender was not found in participants list
        if (!found) revert NotAParticipant();
    }
}
