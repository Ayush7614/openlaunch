// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";

/// Deploys the fee-free LaunchFactory (+ its LaunchLocker) against the canonical
/// Uniswap v4 deployment of the current chain (Base 8453, Robinhood Chain 4663).
/// There is nothing to configure: no fee recipient, no bps, no owner.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY   required
///   POOL_MANAGER / POSITION_MANAGER  optional overrides (required on other chains)
///
/// Run:
///   forge script script/DeployLaunchFactory.s.sol --rpc-url https://mainnet.base.org --broadcast
///   forge script script/DeployLaunchFactory.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast
/// Then verify factory + locker (constructor args: factory = pm, posm, permit2;
/// locker = posm) and point the app at the factory address.
contract DeployLaunchFactory is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function _known(uint256 chainId) internal pure returns (address pm, address posm) {
        if (chainId == 8453) {
            return (0x498581fF718922c3f8e6A244956aF099B2652b2b, 0x7C5f5A4bBd8fD63184577525326123B519429bDc);
        }
        if (chainId == 4663) {
            return (0x8366a39CC670B4001A1121B8F6A443A643e40951, 0x58daec3116aae6D93017bAAea7749052E8a04fA7);
        }
        return (address(0), address(0));
    }

    function run() external returns (LaunchFactory factory) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        (address pmDefault, address posmDefault) = _known(block.chainid);
        address pm = vm.envOr("POOL_MANAGER", pmDefault);
        address posm = vm.envOr("POSITION_MANAGER", posmDefault);
        require(pm != address(0) && posm != address(0), "unknown chain: set POOL_MANAGER + POSITION_MANAGER");
        require(pm.code.length > 0 && posm.code.length > 0 && PERMIT2.code.length > 0, "v4 not deployed here");

        vm.startBroadcast(pk);
        factory = new LaunchFactory(IPoolManager(pm), IPositionManager(posm), IAllowanceTransfer(PERMIT2));
        vm.stopBroadcast();

        console.log("Chain ID:       ", block.chainid);
        console.log("PoolManager:    ", pm);
        console.log("PositionManager:", posm);
        console.log("LaunchFactory:  ", address(factory));
        console.log("LaunchLocker:   ", address(factory.locker()));
        console.log("Platform fee:    none (no fee address exists)");
    }
}
