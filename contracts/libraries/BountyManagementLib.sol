// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './BountyStorageLib.sol';
import './TokenManagementLib.sol';

library BountyManagementLib {
    using BountyStorageLib for BountyStorageLib.BountyStorage;

    event TokenBountyCreated(
        uint256 id,
        address issuer,
        string name,
        string description,
        uint256 amount,
        uint256 maxWinners,
        BountyStorageLib.TokenType tokenType,
        address tokenAddress,
        uint256 createdAt,
        uint256 deadline
    );

    event CreationFeeCharged(uint256 bountyId, address payer, uint256 fee);
    event BountyCancelled(uint256 bountyId, address issuer);

    error NoEther();
    error BountyNotFound();
    error WrongCaller();
    error BountyClosed();
    error BountyClaimed();
    error transferFailed();
    error InvalidDuration();

    function createBounty(
        BountyStorageLib.BountyStorage storage self,
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        uint256 durationInDays,
        uint256 msgValue,
        address msgSender,
        address treasury
    ) internal returns (uint256 bountyId) {
        return
            createTokenBounty(
                self,
                name,
                description,
                maxWinners,
                durationInDays,
                address(0), // ETH
                msgValue,
                msgValue,
                msgSender,
                treasury
            );
    }

    function createTokenBounty(
        BountyStorageLib.BountyStorage storage self,
        string calldata name,
        string calldata description,
        uint256 maxWinners,
        uint256 durationInDays,
        address tokenAddress,
        uint256 tokenAmount,
        uint256 msgValue,
        address msgSender,
        address treasury
    ) internal returns (uint256 bountyId) {
        require(maxWinners > 0, 'Must have at least one winner');
        if (durationInDays == 0) revert InvalidDuration();

        uint256 bountyAmount;
        uint256 creationFee;

        if (tokenAddress == address(0)) {
            // ETH: extract creation fee from msg.value
            bountyAmount = (msgValue * BountyStorageLib.FEE_DENOMINATOR) /
                (BountyStorageLib.FEE_DENOMINATOR + self.creationFeeRate);
            creationFee = msgValue - bountyAmount;

            // Process deposit with the net bounty amount
            TokenManagementLib.processTokenDeposit(
                self,
                tokenAddress,
                bountyAmount,
                bountyAmount,
                msgSender
            );

            // Send creation fee to treasury
            if (creationFee > 0) {
                TokenManagementLib.transferTokens(
                    BountyStorageLib.TokenType.ETH,
                    address(0),
                    treasury,
                    creationFee
                );
            }
        } else {
            // ERC20: creation fee is extra on top of tokenAmount
            creationFee = (tokenAmount * self.creationFeeRate) /
                BountyStorageLib.FEE_DENOMINATOR;
            bountyAmount = tokenAmount;

            // Process deposit for the bounty amount
            TokenManagementLib.processTokenDeposit(
                self,
                tokenAddress,
                tokenAmount,
                msgValue,
                msgSender
            );

            // Transfer creation fee separately from user to treasury
            if (creationFee > 0) {
                TokenManagementLib.transferERC20FromSender(
                    tokenAddress,
                    msgSender,
                    treasury,
                    creationFee
                );
            }
        }

        bountyId = self.bountyCounter;
        uint256 deadline = block.timestamp + (durationInDays * 1 days);

        BountyStorageLib.Bounty memory bounty = BountyStorageLib.Bounty(
            bountyId,
            msgSender,
            name,
            description,
            bountyAmount,
            block.timestamp,
            deadline,
            maxWinners,
            0,
            false,
            tokenAddress == address(0) ? BountyStorageLib.TokenType.ETH : self.tokenAddressTypes[tokenAddress],
            tokenAddress
        );
        self.bounties.push(bounty);
        self.userBounties[msgSender].push(bountyId);
        ++self.bountyCounter;

        emit TokenBountyCreated(
            bountyId,
            msgSender,
            name,
            description,
            bountyAmount,
            maxWinners,
            bounty.tokenType,
            tokenAddress,
            block.timestamp,
            deadline
        );

        if (creationFee > 0) {
            emit CreationFeeCharged(bountyId, msgSender, creationFee);
        }
    }

    function cancelSoloBounty(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        address msgSender
    ) internal {
        if (bountyId >= self.bountyCounter) revert BountyNotFound();

        BountyStorageLib.Bounty storage bounty = self.bounties[bountyId];
        if (bounty.cancelled) revert BountyClosed();
        if (msgSender != bounty.issuer) revert WrongCaller();

        uint256 paidOut = (bounty.amount / bounty.maxWinners) *
            bounty.winnersCount;
        uint256 refundAmount = bounty.amount - paidOut;
        bounty.cancelled = true;

        if (refundAmount > 0) {
            TokenManagementLib.transferTokens(
                bounty.tokenType,
                bounty.tokenAddress,
                bounty.issuer,
                refundAmount
            );
        }

        emit BountyCancelled(bountyId, bounty.issuer);
    }
}
