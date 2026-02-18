// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './BountyStorageLib.sol';
import './TokenManagementLib.sol';

library ClaimManagementLib {
    using BountyStorageLib for BountyStorageLib.BountyStorage;

    event ClaimAccepted(
        uint256 bountyId,
        address claimer,
        address bountyIssuer,
        uint256 fee
    );

    event BatchClaimsAccepted(
        uint256 bountyId,
        address[] claimers,
        uint256 totalFee
    );

    error BountyNotFound();
    error BountyClosed();
    error BountyClaimed();
    error AlreadyWon();
    error InvalidClaimer();
    error transferFailed();
    error WrongCaller();
    error BatchSizeInvalid();
    error ReentrancyGuard();
    error BatchExceedsMaxWinners();
    error DeadlinePassed();

    function acceptClaim(
        BountyStorageLib.BountyStorage storage self,
        address treasury,
        uint256 bountyId,
        address claimer,
        address msgSender
    ) internal {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty storage bounty = self.bounties[bountyId];
        if (bounty.cancelled) revert BountyClosed();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        if (msgSender != bounty.issuer) revert WrongCaller();
        if (claimer == address(0) || claimer == bounty.issuer)
            revert InvalidClaimer();
        if (self.hasWon[bountyId][claimer]) revert AlreadyWon();

        // Calculate payout per winner
        uint256 payoutPerWinner = bounty.amount / bounty.maxWinners;
        uint256 fee = (payoutPerWinner * self.platformFeeRate) /
            BountyStorageLib.FEE_DENOMINATOR;
        uint256 payout = payoutPerWinner - fee;

        // Update state
        bounty.winnersCount++;
        self.bountyWinners[bountyId].push(claimer);
        self.hasWon[bountyId][claimer] = true;

        // Transfer payout to claimer
        TokenManagementLib.transferTokens(
            bounty.tokenType,
            bounty.tokenAddress,
            claimer,
            payout
        );

        // Transfer fee to treasury
        TokenManagementLib.transferTokens(
            bounty.tokenType,
            bounty.tokenAddress,
            treasury,
            fee
        );

        emit ClaimAccepted(bountyId, claimer, bounty.issuer, fee);
    }

    function batchAcceptClaims(
        BountyStorageLib.BountyStorage storage self,
        address treasury,
        uint256 bountyId,
        address[] calldata claimers,
        address msgSender
    ) internal {
        // PRE-VALIDATION
        if (claimers.length == 0 || claimers.length > 10)
            revert BatchSizeInvalid();
        if (self.reentrancyLock) revert ReentrancyGuard();
        self.reentrancyLock = true;

        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty storage bounty = self.bounties[bountyId];
        if (bounty.cancelled) revert BountyClosed();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (bounty.winnersCount >= bounty.maxWinners) revert BountyClaimed();
        if (bounty.winnersCount + claimers.length > bounty.maxWinners)
            revert BatchExceedsMaxWinners();
        if (msgSender != bounty.issuer) revert WrongCaller();

        // Cache payout calculations
        uint256 payoutPerWinner = bounty.amount / bounty.maxWinners;
        uint256 feePerWinner = (payoutPerWinner * self.platformFeeRate) /
            BountyStorageLib.FEE_DENOMINATOR;
        uint256 netPayout = payoutPerWinner - feePerWinner;
        uint256 initialWinnersCount = bounty.winnersCount;

        // STATE UPDATES LOOP (effects before interactions)
        for (uint256 i = 0; i < claimers.length; i++) {
            address claimer = claimers[i];
            if (claimer == address(0) || claimer == bounty.issuer)
                revert InvalidClaimer();
            if (self.hasWon[bountyId][claimer]) revert AlreadyWon();

            self.bountyWinners[bountyId].push(claimer);
            self.hasWon[bountyId][claimer] = true;
        }

        // Single winnersCount write
        bounty.winnersCount = initialWinnersCount + claimers.length;

        // EXTERNAL CALLS LOOP (interactions)
        for (uint256 i = 0; i < claimers.length; i++) {
            TokenManagementLib.transferTokens(
                bounty.tokenType,
                bounty.tokenAddress,
                claimers[i],
                netPayout
            );

            emit ClaimAccepted(
                bountyId,
                claimers[i],
                bounty.issuer,
                feePerWinner
            );
        }

        // Single treasury transfer for accumulated fees
        uint256 totalFee = feePerWinner * claimers.length;
        TokenManagementLib.transferTokens(
            bounty.tokenType,
            bounty.tokenAddress,
            treasury,
            totalFee
        );

        emit BatchClaimsAccepted(bountyId, claimers, totalFee);

        // Release reentrancy lock
        self.reentrancyLock = false;
    }
}
