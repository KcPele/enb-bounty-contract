// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import './BountyStorageLib.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

library TokenManagementLib {
    using SafeERC20 for IERC20;
    using BountyStorageLib for BountyStorageLib.BountyStorage;

    error UnsupportedToken();
    error TokenNotSupported();
    error TokenTransferFailed();
    error InvalidTokenAmount();
    error ETHTransferFailed();
    error ZeroValue();

    // Events for indexer visibility when supported tokens change
    event SupportedTokenAdded(address token, BountyStorageLib.TokenType tokenType);
    event SupportedTokenRemoved(address token);

    /**
     * @dev Validates and processes token deposit for bounty creation
     * @param self Storage reference
     * @param tokenAddress Address of token contract (address(0) for ETH)
     * @param amount Amount of tokens
     * @param ethValue msg.value from transaction
     * @param sender Address sending tokens
     * @return tokenType Type of token being used
     */
    function processTokenDeposit(
        BountyStorageLib.BountyStorage storage self,
        address tokenAddress,
        uint256 amount,
        uint256 ethValue,
        address sender
    ) internal returns (BountyStorageLib.TokenType tokenType) {
        if (tokenAddress == address(0)) {
            // ETH deposit
            if (ethValue == 0) revert ZeroValue();
            if (amount != ethValue) revert InvalidTokenAmount();
            tokenType = BountyStorageLib.TokenType.ETH;
        } else {
            // ERC20 deposit
            if (ethValue > 0) revert InvalidTokenAmount(); // No ETH should be sent for ERC20
            if (!self.supportedTokens[tokenAddress]) revert TokenNotSupported();
            if (amount == 0) revert ZeroValue();

            // Transfer ERC20 tokens from sender to contract
            IERC20(tokenAddress).safeTransferFrom(
                sender,
                address(this),
                amount
            );

            // Get token type from storage mapping
            tokenType = self.tokenAddressTypes[tokenAddress];
            if (tokenType == BountyStorageLib.TokenType.ETH) {
                revert UnsupportedToken(); // This should not happen for valid ERC20 tokens
            }
        }
    }

    /**
     * @dev Transfers tokens (ETH or ERC20) to recipient
     * @param tokenType Type of token to transfer
     * @param tokenAddress Token contract address (ignored for ETH)
     * @param recipient Address to receive tokens
     * @param amount Amount to transfer
     */
    function transferTokens(
        BountyStorageLib.TokenType tokenType,
        address tokenAddress,
        address recipient,
        uint256 amount
    ) internal {
        if (amount == 0) return;

        if (tokenType == BountyStorageLib.TokenType.ETH) {
            (bool success, ) = recipient.call{value: amount}('');
            if (!success) revert ETHTransferFailed();
        } else {
            IERC20(tokenAddress).safeTransfer(recipient, amount);
        }
    }

    /**
     * @dev Gets contract balance for specified token
     * @param tokenType Type of token
     * @param tokenAddress Token contract address (ignored for ETH)
     * @return balance Current balance
     */
    function getTokenBalance(
        BountyStorageLib.TokenType tokenType,
        address tokenAddress
    ) internal view returns (uint256 balance) {
        if (tokenType == BountyStorageLib.TokenType.ETH) {
            balance = address(this).balance;
        } else {
            balance = IERC20(tokenAddress).balanceOf(address(this));
        }
    }

    /**
     * @dev Validates token amounts match expected values
     * @param tokenType Type of token
     * @param expectedAmount Expected amount
     * @param actualAmount Actual amount
     * @param ethValue ETH value sent (for validation)
     */
    function validateTokenAmount(
        BountyStorageLib.TokenType tokenType,
        uint256 expectedAmount,
        uint256 actualAmount,
        uint256 ethValue
    ) internal pure {
        if (tokenType == BountyStorageLib.TokenType.ETH) {
            if (actualAmount != ethValue || expectedAmount != ethValue) {
                revert InvalidTokenAmount();
            }
        } else {
            if (ethValue > 0 || expectedAmount != actualAmount) {
                revert InvalidTokenAmount();
            }
        }
    }

    /**
     * @dev Adds a token to the supported tokens whitelist
     * @param self Storage reference
     * @param tokenAddress Address of token to add
     * @param tokenType Type of token (USDC, ENB, etc.)
     */
    function addSupportedToken(
        BountyStorageLib.BountyStorage storage self,
        address tokenAddress,
        BountyStorageLib.TokenType tokenType
    ) internal {
        require(
            tokenType != BountyStorageLib.TokenType.ETH,
            'Cannot add ETH as ERC20'
        );
        if (self.supportedTokens[tokenAddress]) revert UnsupportedToken();
        self.supportedTokens[tokenAddress] = true;
        self.tokenAddressTypes[tokenAddress] = tokenType;
        emit SupportedTokenAdded(tokenAddress, tokenType);
    }

    /**
     * @dev Removes a token from the supported tokens whitelist
     * @param self Storage reference
     * @param tokenAddress Address of token to remove
     */
    function removeSupportedToken(
        BountyStorageLib.BountyStorage storage self,
        address tokenAddress
    ) internal {
        require(self.supportedTokens[tokenAddress], 'Token not found');
        self.supportedTokens[tokenAddress] = false;
        delete self.tokenAddressTypes[tokenAddress];
        emit SupportedTokenRemoved(tokenAddress);
    }

    /**
     * @dev Checks if a token is supported
     * @param self Storage reference
     * @param tokenAddress Address of token to check
     * @return supported Whether the token is supported
     */
    function isTokenSupported(
        BountyStorageLib.BountyStorage storage self,
        address tokenAddress
    ) internal view returns (bool supported) {
        if (tokenAddress == address(0)) {
            return true; // ETH is always supported
        }
        return self.supportedTokens[tokenAddress];
    }

    /**
     * @dev Gets token type from address using storage mapping
     * @param self Storage reference
     * @param tokenAddress Token contract address
     * @return tokenType Corresponding token type
     */
    function getTokenTypeFromAddress(
        BountyStorageLib.BountyStorage storage self,
        address tokenAddress
    ) internal view returns (BountyStorageLib.TokenType tokenType) {
        if (tokenAddress == address(0)) {
            return BountyStorageLib.TokenType.ETH;
        } else {
            return self.tokenAddressTypes[tokenAddress];
        }
    }

    /**
     * @dev Gets the token type name as string for display purposes
     * @param tokenType Token type enum value
     * @return name String representation of token type
     */
    function getTokenTypeName(
        BountyStorageLib.TokenType tokenType
    ) internal pure returns (string memory name) {
        if (tokenType == BountyStorageLib.TokenType.ETH) {
            return 'ETH';
        } else if (tokenType == BountyStorageLib.TokenType.USDC) {
            return 'USDC';
        } else if (tokenType == BountyStorageLib.TokenType.ENB) {
            return 'ENB';
        }
        return 'UNKNOWN';
    }
}
