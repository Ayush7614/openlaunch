// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {DeployPermit2} from "permit2/test/utils/DeployPermit2.sol";

import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker} from "src/LaunchLocker.sol";
import {LaunchToken} from "src/LaunchToken.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

/// A recipient with no payable path at all.
contract NoReceive {}

/// A recipient that tries to re-enter the locker when paid.
contract ReentrantRecipient {
    LaunchLocker locker;

    constructor(LaunchLocker l) {
        locker = l;
    }

    receive() external payable {
        locker.claim(address(0));
    }
}

contract LaunchFactoryTest is Test, DeployPermit2 {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager manager;
    IAllowanceTransfer permit2;
    PositionManager posm;
    PoolSwapTest swapRouter;
    LaunchFactory factory;
    LaunchLocker locker;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address buyer = makeAddr("buyer");

    // 1 ETH = 100M tokens (both 18 dec) → tick ≈ 184,200; 1B supply ≈ 10 ETH FDV
    int24 constant START_TICK = 184_200;
    uint24 constant LP_FEE = 10_000; // 1%

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(this))));
        permit2 = IAllowanceTransfer(deployPermit2());
        posm = new PositionManager(manager, permit2, 50_000, IPositionDescriptor(address(0)), IWETH9(address(0)));
        swapRouter = new PoolSwapTest(manager);
        factory = new LaunchFactory(manager, posm, permit2);
        locker = factory.locker();
        vm.deal(buyer, 100 ether);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _recipients() internal view returns (LaunchLocker.Recipient[] memory r) {
        r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, 6_000);
        r[1] = LaunchLocker.Recipient(bob, 4_000);
    }

    function _params(bytes32 salt, LaunchLocker.Recipient[] memory r)
        internal
        pure
        returns (LaunchFactory.LaunchParams memory p)
    {
        p.name = "Trend Coin";
        p.symbol = "TREND";
        p.metadataURI = "ipfs://meta";
        p.supply = 0;
        p.startTick = START_TICK;
        p.lpFee = LP_FEE;
        p.salt = salt;
        p.recipients = r;
    }

    function _launch(bytes32 salt) internal returns (address token, uint256 tokenId) {
        return factory.launch(_params(salt, _recipients()));
    }

    function _key(address token) internal view returns (PoolKey memory) {
        return factory.poolKeyOf(token);
    }

    function _buy(address token, uint256 ethIn) internal returns (BalanceDelta) {
        PoolKey memory key = _key(token);
        vm.prank(buyer);
        return swapRouter.swap{value: ethIn}(
            key,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _sell(address token, uint256 tokenIn) internal returns (BalanceDelta) {
        PoolKey memory key = _key(token);
        vm.startPrank(buyer);
        LaunchToken(token).approve(address(swapRouter), tokenIn);
        BalanceDelta d = swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: false, amountSpecified: -int256(tokenIn), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();
        return d;
    }

    // ── launch ───────────────────────────────────────────────────────────────

    function test_launch_allSupplyLockedInPool() public {
        (address token, uint256 tokenId) = _launch("a");
        LaunchToken t = LaunchToken(token);

        assertEq(t.totalSupply(), factory.DEFAULT_SUPPLY(), "default supply");
        assertEq(t.balanceOf(address(factory)), 0, "factory holds nothing");
        assertEq(t.balanceOf(address(locker)), 0, "locker holds no loose tokens");
        uint256 dust = t.balanceOf(factory.DEAD());
        assertLt(dust, 1e12, "rounding dust only");
        assertEq(t.balanceOf(address(manager)) + dust, t.totalSupply(), "everything is in the pool");

        assertEq(posm.ownerOf(tokenId), address(locker), "locker owns the position");
        assertGt(posm.getPositionLiquidity(tokenId), 0, "position has liquidity");

        (, int24 tick,, uint24 lpFee) = manager.getSlot0(_key(token).toId());
        assertEq(tick, START_TICK, "pool starts at startTick");
        assertEq(lpFee, LP_FEE, "static lp fee");

        assertEq(locker.tokenIdOf(token), tokenId);
        assertEq(locker.tokenOf(tokenId), token);
        LaunchLocker.Recipient[] memory r = locker.recipientsOf(tokenId);
        assertEq(r.length, 2);
        assertEq(r[0].payout, alice);
        assertEq(r[1].bps, 4_000);

        (uint256 id, address launcher, address quote, int24 st, uint24 fee) = factory.infoOf(token);
        assertEq(id, tokenId);
        assertEq(launcher, address(this));
        assertEq(quote, address(0), "native quote by default");
        assertEq(locker.quoteOf(tokenId), address(0));
        assertEq(st, START_TICK);
        assertEq(fee, LP_FEE);
        assertEq(factory.launchCount(), 1);
        assertEq(t.launcher(), address(this));
        assertEq(t.factory(), address(factory));
        assertEq(t.metadataURI(), "ipfs://meta");
    }

    function test_launch_predictTokenMatches() public {
        address predicted = factory.predictToken(address(this), "a", "Trend Coin", "TREND", 0, "ipfs://meta");
        (address token,) = _launch("a");
        assertEq(token, predicted);
    }

    function test_launch_saltScopedToLauncher() public {
        (address t1,) = _launch("same");
        vm.prank(alice);
        (address t2,) = factory.launch(_params("same", _recipients()));
        assertTrue(t1 != t2, "same salt, different launcher => different token");
    }

    function test_launch_revert_saltReuse() public {
        _launch("dup");
        vm.expectRevert(LaunchFactory.SaltUsed.selector);
        _launch("dup");
    }

    function test_launch_revert_badRecipients() public {
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, 6_000);
        r[1] = LaunchLocker.Recipient(bob, 3_000); // sums to 9000
        vm.expectRevert(LaunchLocker.BadRecipients.selector);
        factory.launch(_params("x", r));

        r[1] = LaunchLocker.Recipient(address(0), 4_000);
        vm.expectRevert(LaunchLocker.BadRecipients.selector);
        factory.launch(_params("x", r));

        // (an EMPTY list is valid: it means 100% to the launcher — see
        // test_launch_emptyRecipientsDefaultsToLauncher)

        LaunchLocker.Recipient[] memory many = new LaunchLocker.Recipient[](8);
        for (uint256 i; i < 8; ++i) {
            many[i] = LaunchLocker.Recipient(alice, 1_250);
        }
        vm.expectRevert(LaunchLocker.BadRecipients.selector);
        factory.launch(_params("x", many));
    }

    function test_launch_sevenRecipientsOk() public {
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](7);
        for (uint256 i; i < 7; ++i) {
            r[i] = LaunchLocker.Recipient(address(uint160(0x1000 + i)), i == 6 ? 1_600 : 1_400);
        }
        (, uint256 tokenId) = factory.launch(_params("seven", r));
        assertEq(locker.recipientsOf(tokenId).length, 7);
    }

    function test_launch_revert_badTick() public {
        LaunchFactory.LaunchParams memory p = _params("t", _recipients());
        p.startTick = 184_201; // not a multiple of spacing
        vm.expectRevert(LaunchFactory.BadTick.selector);
        factory.launch(p);
        p.startTick = TickMath.minUsableTick(200); // equals lower bound → empty range
        vm.expectRevert(LaunchFactory.BadTick.selector);
        factory.launch(p);
        p.startTick = TickMath.maxUsableTick(200) + 200;
        vm.expectRevert(LaunchFactory.BadTick.selector);
        factory.launch(p);
    }

    function test_launch_revert_feeTooHigh() public {
        LaunchFactory.LaunchParams memory p = _params("f", _recipients());
        p.lpFee = 30_001;
        vm.expectRevert(LaunchFactory.BadFee.selector);
        factory.launch(p);
    }

    function test_launch_revert_supplyTooLarge() public {
        LaunchFactory.LaunchParams memory p = _params("s", _recipients());
        p.supply = uint256(type(uint128).max) + 1;
        vm.expectRevert(LaunchFactory.BadSupply.selector);
        factory.launch(p);
    }

    function test_launch_customSupplyAndFee() public {
        LaunchFactory.LaunchParams memory p = _params("c", _recipients());
        p.supply = 21_000_000e18;
        p.lpFee = 30_000;
        (address token,) = factory.launch(p);
        assertEq(LaunchToken(token).totalSupply(), 21_000_000e18);
        (,,, uint24 lpFee) = manager.getSlot0(_key(token).toId());
        assertEq(lpFee, 30_000);
    }

    // ── trading ──────────────────────────────────────────────────────────────

    function test_buy_movesPriceDownAndPaysTokens() public {
        (address token,) = _launch("b");
        uint256 before = LaunchToken(token).balanceOf(buyer);
        _buy(token, 1 ether);
        uint256 got = LaunchToken(token).balanceOf(buyer) - before;
        assertGt(got, 0, "buyer received tokens");
        // about 1 ETH buys just under 100M at the start price (1% fee + slippage)
        assertLt(got, 100_000_000e18);
        assertGt(got, 80_000_000e18);
        (, int24 tick,,) = manager.getSlot0(_key(token).toId());
        assertLt(tick, START_TICK, "price moved down in tick space (token got pricier)");
    }

    function test_sell_roundTrip() public {
        (address token,) = _launch("rt");
        _buy(token, 1 ether);
        uint256 bal = LaunchToken(token).balanceOf(buyer);
        uint256 ethBefore = buyer.balance;
        _sell(token, bal);
        assertEq(LaunchToken(token).balanceOf(buyer), 0);
        uint256 back = buyer.balance - ethBefore;
        assertGt(back, 0.9 ether, "gets most ETH back");
        assertLt(back, 1 ether, "minus two 1% fees");
    }

    // ── fees ─────────────────────────────────────────────────────────────────

    function test_collect_splitsEthFees() public {
        (address token, uint256 tokenId) = _launch("fee");
        _buy(token, 1 ether);

        (uint256 ethOut, uint256 tokenOut) = locker.collect(tokenId);
        assertEq(tokenOut, 0, "buy-only => no token-side fees");
        // 1% of 1 ETH input, minus v4 rounding
        assertApproxEqRel(ethOut, 0.01 ether, 1e15, "1% lp fee collected");

        assertEq(alice.balance, (ethOut * 6_000) / 10_000, "alice 60%, pushed directly");
        assertEq(bob.balance, ethOut - (ethOut * 6_000) / 10_000, "bob 40% + rounding dust, pushed directly");
        assertEq(alice.balance + bob.balance, ethOut, "100% to recipients, no cut");
        assertEq(locker.claimable(alice, address(0)), 0, "nothing left to claim");
        assertEq(locker.reserved(address(0)), 0, "nothing reserved when everyone was paid");
        assertEq(address(locker).balance, 0, "locker holds nothing");

        // second collect with no new trades yields nothing
        (uint256 again,) = locker.collect(tokenId);
        assertEq(again, 0);
    }

    function test_collect_tokenSideFeesOnSell() public {
        (address token, uint256 tokenId) = _launch("sell");
        _buy(token, 1 ether);
        uint256 bal = LaunchToken(token).balanceOf(buyer);
        _sell(token, bal / 2);

        (, uint256 tokenOut) = locker.collect(tokenId);
        assertApproxEqRel(tokenOut, (bal / 2) / 100, 1e15, "1% of token input");
        assertGt(LaunchToken(token).balanceOf(alice), 0, "token fees pushed to alice");
        assertEq(
            LaunchToken(token).balanceOf(alice) + LaunchToken(token).balanceOf(bob),
            tokenOut,
            "payouts sum exactly to collected"
        );
        assertEq(locker.claimable(alice, token), 0);
        assertEq(LaunchToken(token).balanceOf(address(locker)), 0);
    }

    function test_collect_pushFails_thenClaimable() public {
        // A recipient that cannot receive ETH gets CREDITED instead; the others are still paid.
        NoReceive stuck = new NoReceive();
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(address(stuck), 5_000);
        r[1] = LaunchLocker.Recipient(bob, 5_000);
        (address token, uint256 tokenId) = factory.launch(_params("stuck", r));
        _buy(token, 2 ether);
        (uint256 ethOut,) = locker.collect(tokenId);
        uint256 half = (ethOut * 5_000) / 10_000;
        assertEq(bob.balance, ethOut - half, "bob paid directly");
        assertEq(locker.claimable(address(stuck), address(0)), half, "stuck recipient credited");
        assertEq(locker.reserved(address(0)), half, "only the credited share is reserved");
        assertEq(address(locker).balance, half);

        // claimFor pushes to the credited account (still fails: it can't receive) — funds stay credited
        vm.expectRevert(LaunchLocker.EthTransferFailed.selector);
        locker.claimFor(address(stuck), address(0));
        assertEq(locker.claimable(address(stuck), address(0)), half, "still credited, never lost");

        vm.prank(bob);
        assertEq(locker.claim(address(0)), 0, "nothing to claim, already paid");
    }

    function test_claim_reentrancyBlocked() public {
        ReentrantRecipient evil = new ReentrantRecipient(locker);
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](1);
        r[0] = LaunchLocker.Recipient(address(evil), 10_000);
        (address token, uint256 tokenId) = factory.launch(_params("evil", r));
        _buy(token, 1 ether);
        (uint256 ethOut,) = locker.collect(tokenId);

        // the push re-entered claim() → guard reverted the receive → the share was credited, not lost
        assertEq(locker.claimable(address(evil), address(0)), ethOut, "credited after failed push");
        assertEq(address(evil).balance, 0);
        vm.prank(address(evil));
        vm.expectRevert(LaunchLocker.EthTransferFailed.selector);
        locker.claim(address(0));
        assertEq(locker.claimable(address(evil), address(0)), ethOut, "still credited");
    }

    function test_collect_strayEthSweptNotStranded() public {
        (address token, uint256 tokenId) = _launch("stray");
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(locker).call{value: 0.5 ether}("");
        assertTrue(ok);
        (uint256 ethOut,) = locker.collect(tokenId);
        assertEq(ethOut, 0.5 ether, "stray ETH distributed on next collect");
        assertEq(alice.balance + bob.balance, 0.5 ether, "paid out to the recipients");
        assertEq(locker.reserved(address(0)), 0);
    }

    function test_collectMany() public {
        (address t1, uint256 id1) = _launch("m1");
        (address t2, uint256 id2) = _launch("m2");
        _buy(t1, 1 ether);
        _buy(t2, 1 ether);
        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;
        locker.collectMany(ids);
        assertApproxEqRel(alice.balance + bob.balance, 0.02 ether, 1e15, "both launches' fees paid out");
    }

    function test_collect_revert_unknown() public {
        vm.expectRevert(LaunchLocker.UnknownPosition.selector);
        locker.collect(999);
    }

    function test_register_onlyFactory() public {
        vm.expectRevert(LaunchLocker.NotFactory.selector);
        locker.register(1, address(0x1234), address(0), _recipients());
    }

    function test_liquidityNeverLeaves() public {
        (address token, uint256 tokenId) = _launch("lock");
        uint128 liq = posm.getPositionLiquidity(tokenId);
        _buy(token, 3 ether);
        _sell(token, LaunchToken(token).balanceOf(buyer));
        locker.collect(tokenId);
        assertEq(posm.getPositionLiquidity(tokenId), liq, "collect removes zero liquidity");
        assertEq(posm.ownerOf(tokenId), address(locker), "still locked");
    }

    // ── free-by-construction ─────────────────────────────────────────────────

    function test_launch_emptyRecipientsBurnsFees() public {
        LaunchLocker.Recipient[] memory none = new LaunchLocker.Recipient[](0);
        vm.prank(alice);
        (address token, uint256 tokenId) = factory.launch(_params("nobody", none));
        LaunchLocker.Recipient[] memory r = locker.recipientsOf(tokenId);
        assertEq(r.length, 1);
        assertEq(r[0].payout, locker.DEAD(), "no beneficiary => burn recipient");
        assertEq(r[0].bps, 10_000);

        address dead = locker.DEAD();
        uint256 deadEthBefore = dead.balance;
        uint256 deadTokBefore = LaunchToken(token).balanceOf(dead); // launch dust
        _buy(token, 1 ether);
        _sell(token, LaunchToken(token).balanceOf(buyer) / 2);

        vm.expectEmit(true, true, false, false, address(locker));
        emit LaunchLocker.Burned(tokenId, address(0), 0);
        (uint256 ethOut, uint256 tokenOut) = locker.collect(tokenId);
        assertGt(ethOut, 0);
        assertGt(tokenOut, 0);
        assertEq(dead.balance - deadEthBefore, ethOut, "ETH fees burned in full");
        assertEq(LaunchToken(token).balanceOf(dead) - deadTokBefore, tokenOut, "token fees burned in full");
        assertEq(address(locker).balance, 0, "nothing stays in the locker");
        assertEq(LaunchToken(token).balanceOf(address(locker)), 0);
        assertEq(locker.reserved(address(0)), 0, "burned shares are not reserved");
        assertEq(locker.reserved(token), 0);
        assertEq(locker.claimable(dead, address(0)), 0, "burn is immediate, not a credit");
        assertEq(locker.claimable(alice, address(0)), 0, "launcher gets nothing");
    }

    function test_launch_mixedBurnAndBeneficiary() public {
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, 5_000);
        r[1] = LaunchLocker.Recipient(locker.DEAD(), 5_000);
        (address token, uint256 tokenId) = factory.launch(_params("half", r));
        _buy(token, 1 ether);
        uint256 deadBefore = locker.DEAD().balance;
        (uint256 ethOut,) = locker.collect(tokenId);
        uint256 aliceShare = (ethOut * 5_000) / 10_000;
        assertEq(alice.balance, aliceShare, "alice half paid directly");
        assertEq(locker.DEAD().balance - deadBefore, ethOut - aliceShare, "other half burned");
        assertEq(locker.reserved(address(0)), 0, "nothing reserved");
        assertEq(address(locker).balance, 0);
    }

    /// Burned launches share the locker with credited launches: burning must
    /// never touch another launch's reserved (credited, unclaimed) balance.
    function test_burn_doesNotEatOtherLaunchesCredits() public {
        NoReceive stuck = new NoReceive();
        LaunchLocker.Recipient[] memory r1 = new LaunchLocker.Recipient[](1);
        r1[0] = LaunchLocker.Recipient(address(stuck), 10_000);
        (address t1, uint256 id1) = factory.launch(_params("credited", r1));
        _buy(t1, 1 ether);
        locker.collect(id1);
        uint256 reservedBefore = locker.reserved(address(0));
        assertGt(reservedBefore, 0, "stuck recipient's share is reserved");

        LaunchLocker.Recipient[] memory none = new LaunchLocker.Recipient[](0);
        (address t2, uint256 id2) = factory.launch(_params("burned", none));
        _buy(t2, 1 ether);
        (uint256 burnedOut,) = locker.collect(id2);
        assertGt(burnedOut, 0);
        assertEq(locker.reserved(address(0)), reservedBefore, "reserved untouched by the burn");
        assertEq(address(locker).balance, reservedBefore, "locker still holds exactly the credited amount");
    }

    function test_launch_zeroLpFee_isFeelessPool() public {
        LaunchFactory.LaunchParams memory p = _params("free", _recipients());
        p.lpFee = 0;
        (address token, uint256 tokenId) = factory.launch(p);
        (,,, uint24 lpFee) = manager.getSlot0(_key(token).toId());
        assertEq(lpFee, 0);

        uint256 before = LaunchToken(token).balanceOf(buyer);
        _buy(token, 1 ether);
        uint256 got = LaunchToken(token).balanceOf(buyer) - before;
        assertGt(got, 0);

        (uint256 ethOut, uint256 tokenOut) = locker.collect(tokenId);
        assertEq(ethOut, 0, "no fee, nothing to collect");
        assertEq(tokenOut, 0);
        assertEq(address(locker).balance, 0);
    }

    function test_noPlatformFee_lockerHasNoFeeSurface() public {
        // The locker exposes no fee recipient / bps; the only accounts ever paid or credited
        // after a collect are the launch's own recipients.
        (address token, uint256 tokenId) = _launch("audit");
        _buy(token, 1 ether);
        vm.recordLogs();
        (uint256 ethOut,) = locker.collect(tokenId);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 paid = keccak256("Paid(uint256,address,address,uint256)");
        bytes32 credited = keccak256("Credited(address,address,uint256)");
        uint256 sum;
        for (uint256 i; i < logs.length; ++i) {
            address account;
            if (logs[i].topics[0] == paid) account = address(uint160(uint256(logs[i].topics[2])));
            else if (logs[i].topics[0] == credited) account = address(uint160(uint256(logs[i].topics[1])));
            else continue;
            assertTrue(account == alice || account == bob, "only named recipients are ever paid");
            sum += abi.decode(logs[i].data, (uint256));
        }
        assertEq(sum, ethOut, "recipients receive 100% of what was collected");
    }

    // ── ERC20 quote (stablecoin / tokenized stock) ───────────────────────────

    function _launchWithQuote(MockERC20 quote, bytes32 base) internal returns (address token, uint256 tokenId) {
        LaunchFactory.LaunchParams memory p = _params(base, _recipients());
        p.quote = address(quote);
        (bytes32 salt,) =
            factory.findSalt(address(this), base, p.name, p.symbol, p.supply, p.metadataURI, address(quote), 64);
        p.salt = salt;
        return factory.launch(p);
    }

    function _buyWithQuote(MockERC20 quote, address token, uint256 quoteIn) internal {
        PoolKey memory key = _key(token);
        quote.mint(buyer, quoteIn);
        vm.startPrank(buyer);
        quote.approve(address(swapRouter), quoteIn);
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(quoteIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();
    }

    function test_quote_launchBuyCollectClaim() public {
        MockERC20 usd = new MockERC20("Stable", "USD", 18);
        (address token, uint256 tokenId) = _launchWithQuote(usd, "q1");

        assertTrue(uint160(token) > uint160(address(usd)), "token sorts above quote");
        PoolKey memory key = _key(token);
        assertEq(Currency.unwrap(key.currency0), address(usd), "quote is currency0");
        assertEq(locker.quoteOf(tokenId), address(usd));
        (,, address q,,) = factory.infoOf(token);
        assertEq(q, address(usd));
        assertEq(
            LaunchToken(token).balanceOf(address(manager)) + LaunchToken(token).balanceOf(factory.DEAD()),
            LaunchToken(token).totalSupply()
        );

        _buyWithQuote(usd, token, 1_000e18);
        assertGt(LaunchToken(token).balanceOf(buyer), 0, "bought with the ERC20 quote");

        (uint256 quoteOut, uint256 tokenOut) = locker.collect(tokenId);
        assertApproxEqRel(quoteOut, 10e18, 1e15, "1% fee in quote");
        assertEq(tokenOut, 0);
        assertEq(address(locker).balance, 0, "no ETH involved");

        assertEq(usd.balanceOf(alice), (quoteOut * 6_000) / 10_000, "paid in the quote token, directly");
        assertEq(usd.balanceOf(address(locker)), 0, "nothing left in the locker");
        assertEq(locker.reserved(address(usd)), 0);
    }

    function test_quote_revert_ordering() public {
        MockERC20 usd = new MockERC20("Stable", "USD", 18);
        LaunchFactory.LaunchParams memory p = _params("bad", _recipients());
        p.quote = address(usd);
        // find a salt whose predicted address sorts BELOW the quote
        for (uint256 i; i < 64; ++i) {
            bytes32 candidate = keccak256(abi.encode("bad", i));
            address predicted = factory.predictToken(address(this), candidate, p.name, p.symbol, 0, p.metadataURI);
            if (uint160(predicted) < uint160(address(usd))) {
                p.salt = candidate;
                break;
            }
        }
        vm.expectRevert(LaunchFactory.QuoteOrdering.selector);
        factory.launch(p);
    }

    function test_findSalt_isUsableAndDeterministic() public {
        MockERC20 usd = new MockERC20("Stable", "USD", 18);
        (bytes32 s1, address t1) =
            factory.findSalt(address(this), "det", "Trend Coin", "TREND", 0, "ipfs://meta", address(usd), 64);
        (bytes32 s2, address t2) =
            factory.findSalt(address(this), "det", "Trend Coin", "TREND", 0, "ipfs://meta", address(usd), 64);
        assertEq(s1, s2);
        assertEq(t1, t2);
        assertTrue(uint160(t1) > uint160(address(usd)));
        LaunchFactory.LaunchParams memory p = _params(s1, _recipients());
        p.quote = address(usd);
        (address token,) = factory.launch(p);
        assertEq(token, t1, "findSalt predicted the deployed address");
    }

    function test_findSalt_revert_noSalt() public {
        // quote = max address → nothing can sort above it
        vm.expectRevert(LaunchFactory.NoSaltFound.selector);
        factory.findSalt(address(this), "x", "A", "A", 0, "", address(type(uint160).max), 8);
    }

    function test_quote_wethStyleErc20() public {
        // any ERC20 works as quote, e.g. WETH on chains where native pools are undesired
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        (address token, uint256 tokenId) = _launchWithQuote(weth, "w");
        _buyWithQuote(weth, token, 1e18);
        (uint256 quoteOut,) = locker.collect(tokenId);
        assertApproxEqRel(quoteOut, 0.01e18, 1e15);
    }

    // ── fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_splitConservesEveryWei(uint16 bpsA, uint96 ethIn) public {
        bpsA = uint16(bound(bpsA, 1, 9_999));
        ethIn = uint96(bound(ethIn, 0.001 ether, 50 ether));
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, bpsA);
        r[1] = LaunchLocker.Recipient(bob, 10_000 - bpsA);
        (address token, uint256 tokenId) = factory.launch(_params(keccak256(abi.encode(bpsA, ethIn)), r));
        _buy(token, ethIn);
        (uint256 ethOut,) = locker.collect(tokenId);
        assertGt(ethOut, 0);
        assertEq(alice.balance + bob.balance, ethOut, "no wei lost or created");
        assertEq(locker.reserved(address(0)), 0);
        assertEq(address(locker).balance, 0);
    }

    /// Any start tick from "1 ETH buys ~1e-15 tokens" up to the max usable tick
    /// launches. Below about -349k a 1B supply exceeds Uniswap's per-tick
    /// liquidity cap (TickLiquidityOverflow) — no real launch lives there.
    function testFuzz_anyValidStartTick(int24 tick) public {
        tick = int24(bound(int256(tick), -340_000, 880_000));
        tick = (tick / 200) * 200;
        LaunchFactory.LaunchParams memory p = _params(keccak256(abi.encode(tick)), _recipients());
        p.startTick = tick;
        (address token, uint256 tokenId) = factory.launch(p);
        assertEq(posm.ownerOf(tokenId), address(locker));
        assertEq(LaunchToken(token).balanceOf(address(factory)), 0);
        assertGt(posm.getPositionLiquidity(tokenId), 0);
    }
}
