// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './BountyStorageLib.sol';
import './TokenManagementLib.sol';
import '../interfaces/IENBBountyNft.sol';

library ClaimManagementLib {
    using BountyStorageLib for BountyStorageLib.BountyStorage;

    uint256 internal constant MAX_BATCH_ACCEPT = 10;

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

    error BountyNotFound();
    error ClaimNotFound();
    error BountyClosed();
    error BountyClaimed();
    error IssuerCannotClaim();
    error AlreadyWon();
    error BountyAmountTooHigh();
    error transferFailed();
    error WrongCaller();
    error NotSoloBounty();
    error NoClaimsProvided();
    error TooManyClaims(uint256 provided, uint256 maxAllowed);
    error DuplicateClaimIds();
    error BountyNotStarted();
    error BountyExpired();

    function batchAcceptLimit() internal pure returns (uint256) {
        return MAX_BATCH_ACCEPT;
    }

    function createClaim(
        BountyStorageLib.BountyStorage storage self,
        IENBBountyNft bountyNft,
        uint256 bountyId,
        string calldata name,
        string calldata uri,
        string calldata description,
        address msgSender
    ) internal {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty memory bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        if (bounty.issuer == msgSender) revert IssuerCannotClaim();
        if (block.timestamp < bounty.startTime) revert BountyNotStarted();
        if (bounty.endTime != 0 && block.timestamp > bounty.endTime)
            revert BountyExpired();

        uint256 claimId = self.claimCounter;

        BountyStorageLib.Claim memory claim = BountyStorageLib.Claim(
            claimId,
            msgSender,
            bountyId,
            bounty.issuer,
            name,
            description,
            block.timestamp,
            false
        );

        self.claims.push(claim);
        self.userClaims[msgSender].push(claimId);
        self.bountyClaims[bountyId].push(claimId);

        bountyNft.mint(address(this), claimId, uri);

        self.claimCounter++;

        emit ClaimCreated(
            claimId,
            msgSender,
            bountyId,
            bounty.issuer,
            name,
            description,
            block.timestamp
        );
    }

    function acceptClaim(
        BountyStorageLib.BountyStorage storage self,
        IENBBountyNft bountyNft,
        address treasury,
        uint256 bountyId,
        uint256 claimId,
        address msgSender
    ) internal {
        if (claimId >= self.claimCounter) revert ClaimNotFound();
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty storage bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();

        // Check if this claim has already been accepted
        BountyStorageLib.Claim memory claim = self.claims[claimId];
        if (claim.accepted) revert AlreadyWon();
        if (claim.bountyId != bountyId) revert ClaimNotFound();

        /**
         * @dev note: if the bounty has more than one participant, it is considered truly open, and the issuer cannot accept the claim without a vote.
         */
        address[] memory p = self.participants[bountyId];
        if (p.length > 1) {
            uint256 i = 1; // Start from index 1 since the first participant is always non-zero
            do {
                if (p[i] != address(0)) {
                    revert NotSoloBounty();
                }
                i++;
            } while (i < p.length);
        } else {
            if (msgSender != bounty.issuer) revert WrongCaller();
        }

        _acceptClaim(self, bountyNft, treasury, bountyId, claimId);
    }

    function acceptClaims(
        BountyStorageLib.BountyStorage storage self,
        IENBBountyNft bountyNft,
        address treasury,
        uint256 bountyId,
        uint256[] calldata claimIds,
        address msgSender
    ) internal {
        uint256 length = claimIds.length;
        if (length == 0) revert NoClaimsProvided();
        if (length > MAX_BATCH_ACCEPT)
            revert TooManyClaims(length, MAX_BATCH_ACCEPT);

        // Ensure no duplicate claimIds are passed to avoid unnecessary reverts
        for (uint256 i = 0; i < length; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (claimIds[i] == claimIds[j]) revert DuplicateClaimIds();
            }
        }

        if (bountyId >= self.bountyCounter) revert BountyNotFound();
        BountyStorageLib.Bounty storage bounty = self.bounties[bountyId];
        if (bounty.claimer == bounty.issuer) revert BountyClosed();

        address[] memory p = self.participants[bountyId];
        if (p.length > 1) {
            uint256 i = 1;
            do {
                if (p[i] != address(0)) {
                    revert NotSoloBounty();
                }
                unchecked {
                    i++;
                }
            } while (i < p.length);
        } else {
            if (msgSender != bounty.issuer) revert WrongCaller();
        }

        for (uint256 i = 0; i < length; i++) {
            uint256 claimId = claimIds[i];
            if (claimId >= self.claimCounter) revert ClaimNotFound();
            if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();

            BountyStorageLib.Claim memory claim = self.claims[claimId];
            if (claim.bountyId != bountyId) revert ClaimNotFound();
            if (claim.accepted) revert AlreadyWon();

            _acceptClaim(self, bountyNft, treasury, bountyId, claimId);
        }
    }

    function _acceptClaim(
        BountyStorageLib.BountyStorage storage self,
        IENBBountyNft bountyNft,
        address treasury,
        uint256 bountyId,
        uint256 claimId
    ) internal {
        if (claimId >= self.claimCounter) revert ClaimNotFound();

        BountyStorageLib.Bounty storage bounty = self.bounties[bountyId];
        BountyStorageLib.Claim memory claim = self.claims[claimId];
        if (claim.bountyId != bountyId) revert ClaimNotFound();

        address claimIssuer = claim.issuer;
        // Allow contract receivers; rely on checks-effects-interactions and SafeERC20/ETH transfer to handle failures

        // Check if this address has already won this bounty
        if (self.hasWon[bountyId][claimIssuer]) revert AlreadyWon();

        // Calculate payout per winner
        uint256 payoutPerWinner = bounty.amount / bounty.maxWinners;

        // Skip external balance check to reduce gas; rely on safe transfers to revert on insufficiency

        // Mark this claim as accepted and track the winner
        self.claims[claimId].accepted = true;
        bounty.winnersCount++;
        self.bountyWinners[bountyId].push(claimIssuer);
        self.bountyWinningClaims[bountyId].push(claimId);
        self.hasWon[bountyId][claimIssuer] = true;

        // For backwards compatibility, set claimer and claimId for the first winner
        if (bounty.winnersCount == 1) {
            bounty.claimer = claimIssuer;
            bounty.claimId = claimId;
        }

        // Calculate the fee (2.5% of payout)
        uint256 fee = (payoutPerWinner * 25) / 1000;
        uint256 payout = payoutPerWinner - fee;

        // Transfer the claim NFT to the bounty issuer
        bountyNft.safeTransfer(address(this), bounty.issuer, claimId, '');

        // Transfer the payout to the claim issuer using TokenManagementLib
        TokenManagementLib.transferTokens(
            bounty.tokenType,
            bounty.tokenAddress,
            claimIssuer,
            payout
        );

        // Transfer the fee to the treasury using TokenManagementLib
        TokenManagementLib.transferTokens(
            bounty.tokenType,
            bounty.tokenAddress,
            treasury,
            fee
        );

        emit ClaimAccepted(bountyId, claimId, claimIssuer, bounty.issuer, fee);
    }
}
