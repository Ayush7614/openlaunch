// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker} from "src/LaunchLocker.sol";
import {LaunchToken} from "src/LaunchToken.sol";

/// LOCAL DEV ONLY (anvil fork of Base). Deploys the factory, launches a few
/// tokens with different fee/beneficiary setups, and trades them through a
/// PoolSwapTest so the app has real events to index. Never run against mainnet.
contract SeedLaunchpadLocal is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; // Robinhood Chain stablecoin (6 dec)

    function run() external {
        address PM;
        address POSM;
        if (block.chainid == 8453) {
            (PM, POSM) = (0x498581fF718922c3f8e6A244956aF099B2652b2b, 0x7C5f5A4bBd8fD63184577525326123B519429bDc);
        } else if (block.chainid == 4663) {
            (PM, POSM) = (0x8366a39CC670B4001A1121B8F6A443A643e40951, 0x58daec3116aae6D93017bAAea7749052E8a04fA7);
        } else {
            revert("base or robinhood fork only");
        }
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address me = vm.addr(pk);
        vm.startBroadcast(pk);

        LaunchFactory factory = new LaunchFactory(IPoolManager(PM), IPositionManager(POSM), IAllowanceTransfer(PERMIT2));
        PoolSwapTest router = new PoolSwapTest(IPoolManager(PM));

        // 1. fully free: 0% fee, no beneficiary
        LaunchFactory.LaunchParams memory p;
        p.name = "Clear Sky";
        p.symbol = "SKY";
        p.metadataURI = "";
        p.startTick = 184_200;
        p.lpFee = 0;
        p.salt = keccak256("sky");
        (address sky,) = factory.launch(p);

        // 2. 1% fee, all fees burned (no beneficiary)
        p.name = "Burnie";
        p.symbol = "BURN";
        p.lpFee = 10_000;
        p.salt = keccak256("burn");
        p.startTick = 190_000;
        (address burn, uint256 burnId) = factory.launch(p);

        // 3. 1% fee → launcher
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](1);
        r[0] = LaunchLocker.Recipient(me, 10_000);
        p.name = "Builder Coin";
        p.symbol = "BUILD";
        p.recipients = r;
        p.salt = keccak256("build");
        p.startTick = 178_000;
        (address build, uint256 buildId) = factory.launch(p);

        // 4. 3% fee, 50/50 launcher + burn
        LaunchLocker.Recipient[] memory r2 = new LaunchLocker.Recipient[](2);
        r2[0] = LaunchLocker.Recipient(me, 5_000);
        r2[1] = LaunchLocker.Recipient(0x000000000000000000000000000000000000dEaD, 5_000);
        p.name = "Half Burn";
        p.symbol = "HALF";
        p.recipients = r2;
        p.lpFee = 30_000;
        p.salt = keccak256("half");
        p.startTick = 184_200;
        (address half,) = factory.launch(p);

        if (block.chainid == 4663) {
            // 5. USDG-quoted launch (Robinhood default): 1% fee → launcher
            LaunchFactory.LaunchParams memory q;
            q.name = "Dollar Dog";
            q.symbol = "DDOG";
            q.quote = USDG;
            q.startTick = 0; // set below via findSalt-compatible tick: 1 USDG (1e6) = 1.0001^tick token-wei... use ~$10k fdv
            q.lpFee = 10_000;
            LaunchLocker.Recipient[] memory rq = new LaunchLocker.Recipient[](1);
            rq[0] = LaunchLocker.Recipient(me, 10_000);
            q.recipients = rq;
            // 1B supply (1e27 wei) at $10,000 FDV → 1e5 tokens per USDG = 1e23 wei per 1e6 micro → 1e17 per unit → tick ≈ ln(1e17)/ln(1.0001) ≈ 391,400
            q.startTick = 391_400;
            (bytes32 salt,) = factory.findSalt(me, keccak256("ddog"), q.name, q.symbol, 0, "", USDG, 64);
            q.salt = salt;
            (address ddog,) = factory.launch(q);
            console.log("DDOG", ddog);

            // 6. AAPL-quoted launch (Robinhood Stock Token), 1% fee to launcher; 1B supply at ~100 AAPL FDV
            LaunchFactory.LaunchParams memory a;
            a.name = "Apple Fan";
            a.symbol = "AFAN";
            a.quote = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
            a.startTick = 161_200;
            a.lpFee = 10_000;
            a.recipients = rq;
            (bytes32 asalt,) = factory.findSalt(me, keccak256("afan"), a.name, a.symbol, 0, "", a.quote, 64);
            a.salt = asalt;
            (address afan,) = factory.launch(a);
            console.log("AFAN", afan);
        }

        // trades
        _buy(router, factory, sky, 0.05 ether);
        _buy(router, factory, burn, 0.2 ether);
        _buy(router, factory, burn, 0.35 ether);
        _buy(router, factory, build, 1 ether);
        _buy(router, factory, build, 0.4 ether);
        _sell(router, factory, build, LaunchToken(build).balanceOf(me) / 3);
        _buy(router, factory, half, 0.1 ether);
        factory.locker().collect(burnId);
        factory.locker().collect(buildId);
        vm.stopBroadcast();

        console.log("FACTORY", address(factory));
        console.log("LOCKER", address(factory.locker()));
        console.log("ROUTER", address(router));
        console.log("SKY", sky);
        console.log("BURN", burn);
        console.log("BUILD", build);
        console.log("HALF", half);
    }

    function _buy(PoolSwapTest router, LaunchFactory f, address token, uint256 ethIn) internal {
        router.swap{value: ethIn}(
            f.poolKeyOf(token),
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _sell(PoolSwapTest router, LaunchFactory f, address token, uint256 amt) internal {
        LaunchToken(token).approve(address(router), amt);
        router.swap(
            f.poolKeyOf(token),
            SwapParams({
                zeroForOne: false, amountSpecified: -int256(amt), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }
}
