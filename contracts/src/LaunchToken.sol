// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title LaunchToken
/// @notice Fixed-supply ERC20 minted in full to the LaunchFactory at construction.
/// The factory immediately deposits the entire supply into a single-sided
/// Uniswap v4 position owned by the LaunchLocker, so no address ever holds a
/// pre-mine: the only way to obtain tokens is to buy them from the pool.
///
/// Trust properties:
///   - no owner, no minter, no pause, no blacklist, no fee-on-transfer
///   - `metadataURI` is set once at construction and has no setter
///   - EIP-2612 permit for gasless approvals (single-tx sells through routers)
contract LaunchToken is ERC20, ERC20Permit {
    /// The LaunchFactory that created this token (and received the full supply).
    address public immutable factory;
    /// The account that called `launch()`. Informational only — no powers.
    address public immutable launcher;
    /// Off-chain metadata (image, description, site). Immutable after construction.
    string public metadataURI;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply,
        address launcher_,
        string memory metadataURI_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        factory = msg.sender;
        launcher = launcher_;
        metadataURI = metadataURI_;
        _mint(msg.sender, supply);
    }
}
