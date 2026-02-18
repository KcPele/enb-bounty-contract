// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./BountyStorageLib.sol";

library BountyGettersLib {
    using BountyStorageLib for BountyStorageLib.BountyStorage;

    function getBountiesLength(BountyStorageLib.BountyStorage storage self)
        internal
        view
        returns (uint256)
    {
        return self.bounties.length;
    }

    function getBounties(
        BountyStorageLib.BountyStorage storage self,
        uint offset
    ) internal view returns (BountyStorageLib.Bounty[10] memory result) {
        uint256 length = self.bounties.length;
        uint256 remaining = length - offset;
        uint256 numBounties = remaining < 10 ? remaining : 10;

        for (uint i = 0; i < numBounties; i++) {
            BountyStorageLib.Bounty storage bounty = self.bounties[offset + i];
            result[i] = bounty;
        }
    }

    function getBountiesByUser(
        BountyStorageLib.BountyStorage storage self,
        address user,
        uint256 offset
    ) internal view returns (BountyStorageLib.Bounty[10] memory result) {
        uint256[] memory bountyIds = self.userBounties[user];
        uint256 length = bountyIds.length;
        uint256 remaining = length - offset;
        uint256 numBounties = remaining < 10 ? remaining : 10;

        for (uint i = 0; i < numBounties; i++) {
            result[i] = self.bounties[bountyIds[offset + i]];
        }
    }

    function getBountyWinners(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId
    ) internal view returns (address[] memory) {
        return self.bountyWinners[bountyId];
    }

    function hasAddressWon(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId,
        address winner
    ) internal view returns (bool) {
        return self.hasWon[bountyId][winner];
    }

    function getRemainingWinnerSlots(
        BountyStorageLib.BountyStorage storage self,
        uint256 bountyId
    ) internal view returns (uint256) {
        if (bountyId >= self.bountyCounter) return 0;
        BountyStorageLib.Bounty memory bounty = self.bounties[bountyId];
        if (bounty.winnersCount >= bounty.maxWinners) return 0;
        return bounty.maxWinners - bounty.winnersCount;
    }
}
