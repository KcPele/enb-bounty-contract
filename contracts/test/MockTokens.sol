// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    uint8 private _decimals;
    
    constructor() ERC20("USD Coin", "USDC") {
        _decimals = 6; // USDC uses 6 decimals
        _mint(msg.sender, 1000000 * 10**_decimals); // Mint 1M USDC to deployer
    }
    
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
    
    // Allow anyone to mint for testing
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

contract MockENB is ERC20 {
    constructor() ERC20("ENB Token", "ENB") {
        _mint(msg.sender, 1000000 * 10**18); // Mint 1M ENB to deployer
    }
    
    // Allow anyone to mint for testing
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}