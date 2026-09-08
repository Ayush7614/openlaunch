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

interface IOFT {
    function endpoint() external view returns (address);
    function peers(uint32 eid) external view returns (bytes32);
}

/// GITLAWB on Robinhood Chain is the LayerZero OFT of the Base token. Against the LIVE Robinhood
/// factory: launch a token priced in that GITLAWB with NO beneficiary, buy, sell some back, collect,
/// and prove the 1% fee was BURNED as GITLAWB. Also pins the bridge wiring: the OFT's LayerZero
/// endpoint and its Base peer (the GitlawbOFTAdapter that locks the Base token).
///   FORK_TESTS=true ROBINHOOD_RPC_URL=... forge test --match-contract LaunchGitlawbRobinhoodQuote -vv
contract LaunchGitlawbRobinhoodQuote is Test {
    address constant FACTORY = 0x815542E8b392389A1389E22E588E4B62A67Ade72;
    address constant LOCKER = 0xcd1680D26922fcd9CabFbb8a56bA40C333fD842a;
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant GITLAWB = 0xd1b0d44E4f6ed940fcC7A9F59Bf30Daf62cCFe3D; // LayerZero OFT (18 dec)
    address constant LZ_ENDPOINT_ROBINHOOD = 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B;
    address constant BASE_OFT_ADAPTER = 0x3308384bc308D09b3Eba9A8F11cC36e993A273A4;
    uint32 constant BASE_EID = 30184;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    bool forked;
    LaunchFactory factory = LaunchFactory(FACTORY);
    PoolSwapTest router;
    address creator = makeAddr("gitlawb-rh-creator");
    address buyer = makeAddr("gitlawb-rh-buyer");

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) return;
        vm.createSelectFork(vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com")));
        forked = true;
        router = new PoolSwapTest(IPoolManager(PM));
        vm.deal(creator, 1 ether);
        vm.deal(buyer, 1 ether);
        // borrow 20M GITLAWB from the PoolManager (it holds tens of millions across GITLAWB pools)
        uint256 pmBal = IERC20Meta(GITLAWB).balanceOf(PM);
        assertGt(pmBal, 20_000_000e18, "PoolManager holds GITLAWB on Robinhood Chain");
        vm.prank(PM);
        IERC20Meta(GITLAWB).transfer(buyer, 20_000_000e18);
    }

    function test_fork_bridgeWiring() public view {
        if (!forked) return;
        assertEq(IERC20Meta(GITLAWB).symbol(), "GITLAWB");
        assertEq(IERC20Meta(GITLAWB).decimals(), 18);
        assertEq(IOFT(GITLAWB).endpoint(), LZ_ENDPOINT_ROBINHOOD, "LayerZero V2 endpoint on Robinhood Chain");
        assertEq(address(uint160(uint256(IOFT(GITLAWB).peers(BASE_EID)))), BASE_OFT_ADAPTER, "peer on Base = GitlawbOFTAdapter");
    }

    function test_fork_launchQuotedInGITLAWB_buySellBurn() public {
        if (!forked) return;
        LaunchFactory.LaunchParams memory p;
        p.name = "Lawb Fan RH";
        p.symbol = "LAWBRH";
        p.quote = GITLAWB;
        p.lpFee = 10_000;
        // 1B supply at an FDV of 600M GITLAWB: tokens per GITLAWB ~ 1.667 -> tick ~ 5,108 -> 5,200
        p.startTick = 5_200;
        // recipients empty = fees burned
        (bytes32 salt,) = factory.findSalt(creator, keccak256("lawbrh"), p.name, p.symbol, 0, "", GITLAWB, 64);
        p.salt = salt;
        vm.prank(creator);
        (address token, uint256 tokenId) = factory.launch(p);
        assertGt(uint160(token), uint160(GITLAWB), "token sorts above the quote");
        PoolKey memory key = factory.poolKeyOf(token);

        uint256 deadBefore = IERC20Meta(GITLAWB).balanceOf(DEAD);

        // buy with 10M GITLAWB
        vm.startPrank(buyer);
        IERC20Meta(GITLAWB).approve(address(router), 10_000_000e18);
        router.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -10_000_000e18, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        uint256 got = LaunchToken(token).balanceOf(buyer);
        assertGt(got, 10_000_000e18, "more than 10M tokens for 10M GITLAWB at about 1.6 tokens per GITLAWB");
        // sell half back
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

        // fees: 1% of the GITLAWB that came in, burned (no beneficiary)
        (uint256 quoteOut,) = LaunchLocker(payable(LOCKER)).collect(tokenId);
        assertApproxEqRel(quoteOut, 100_000e18, 2e16, "about 1% of 10M GITLAWB collected");
        assertEq(IERC20Meta(GITLAWB).balanceOf(DEAD) - deadBefore, quoteOut, "every collected GITLAWB fee was burned");
        assertEq(IERC20Meta(GITLAWB).balanceOf(creator), 0, "creator got nothing: no beneficiary");
    }
}
