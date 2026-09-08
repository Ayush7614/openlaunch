// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker} from "src/LaunchLocker.sol";
import {LaunchToken} from "src/LaunchToken.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// Can a launch be quoted in GITLAWB (Gitlawb's token on Base)? Against the LIVE Base
/// factory: launch a token priced in GITLAWB with NO beneficiary, buy it with GITLAWB,
/// sell some back, collect — and prove the 1% fee was BURNED as GITLAWB (sent to 0x…dEaD).
/// GITLAWB is borrowed from the Uniswap v4 PoolManager (which provably holds it: the deepest
/// GITLAWB market is a v4 pool) via prank — no mocks anywhere.
///   FORK_TESTS=true BASE_RPC_URL=… forge test --match-contract LaunchGitlawbQuote -vv
contract LaunchGitlawbQuote is Test {
    address constant FACTORY = 0x815542E8b392389A1389E22E588E4B62A67Ade72;
    address constant LOCKER = 0xcd1680D26922fcd9CabFbb8a56bA40C333fD842a;
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant GITLAWB = 0x5F980Dcfc4c0fa3911554cf5ab288ed0eb13DBa3; // Gitlawb (18 dec)
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    bool forked;
    LaunchFactory factory = LaunchFactory(FACTORY);
    PoolSwapTest router;
    address creator = makeAddr("gitlawb-creator");
    address buyer = makeAddr("gitlawb-buyer");

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) return;
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        forked = true;
        router = new PoolSwapTest(IPoolManager(PM));
        vm.deal(creator, 1 ether);
        vm.deal(buyer, 1 ether);
        // borrow 200M GITLAWB (~$3.4K at $1.7e-5) from the PoolManager for the buyer
        uint256 pmBal = IERC20Meta(GITLAWB).balanceOf(PM);
        assertGt(pmBal, 200_000_000e18, "PoolManager holds GITLAWB (the v4 WETH/GITLAWB pool)");
        vm.prank(PM);
        IERC20Meta(GITLAWB).transfer(buyer, 200_000_000e18);
    }

    function test_fork_launchQuotedInGITLAWB_buySellBurn() public {
        if (!forked) return;
        assertEq(IERC20Meta(GITLAWB).decimals(), 18);
        assertEq(IERC20Meta(GITLAWB).symbol(), "GITLAWB");
        LaunchFactory.LaunchParams memory p;
        p.name = "Lawb Fan Token";
        p.symbol = "LAWBFAN";
        p.quote = GITLAWB;
        p.lpFee = 10_000;
        // 1B supply at an FDV of 600M GITLAWB (≈ $10k): tokens per GITLAWB = 1e9/6e8 ≈ 1.667 → tick ≈ ln(1.667)/ln(1.0001) ≈ 5,108 → 5,200
        p.startTick = 5_200;
        // recipients empty = fees burned
        (bytes32 salt,) = factory.findSalt(creator, keccak256("lawbfan"), p.name, p.symbol, 0, "", GITLAWB, 64);
        p.salt = salt;
        vm.prank(creator);
        (address token, uint256 tokenId) = factory.launch(p);
        assertGt(uint160(token), uint160(GITLAWB), "token sorts above the quote");
        PoolKey memory key = factory.poolKeyOf(token);

        uint256 deadBefore = IERC20Meta(GITLAWB).balanceOf(DEAD);

        // buy with 100M GITLAWB
        vm.startPrank(buyer);
        IERC20Meta(GITLAWB).approve(address(router), 100_000_000e18);
        router.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -100_000_000e18, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        uint256 got = LaunchToken(token).balanceOf(buyer);
        assertGt(got, 100_000_000e18, "more than 100M tokens for 100M GITLAWB at about 1.6 tokens per GITLAWB");
        // sell half back for GITLAWB
        LaunchToken(token).approve(address(router), got / 2);
        uint256 glBefore = IERC20Meta(GITLAWB).balanceOf(buyer);
        router.swap(
            key,
            SwapParams({
                zeroForOne: false, amountSpecified: -int256(got / 2), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();
        assertGt(IERC20Meta(GITLAWB).balanceOf(buyer), glBefore, "got GITLAWB back");

        // fees: 1% of the GITLAWB that came in, burned (no beneficiary) → lands at 0x…dEaD
        (uint256 quoteOut,) = LaunchLocker(payable(LOCKER)).collect(tokenId);
        assertApproxEqRel(quoteOut, 1_000_000e18, 2e16, "about 1% of 100M GITLAWB collected");
        assertEq(IERC20Meta(GITLAWB).balanceOf(DEAD) - deadBefore, quoteOut, "every collected GITLAWB fee was burned");
        assertEq(IERC20Meta(GITLAWB).balanceOf(creator), 0, "creator got nothing: no beneficiary");
    }
}
