import { connect } from "@starknet-io/get-starknet";
import { WalletAccount, RpcProvider } from "starknet";

const u256 = (v) => [(v & ((1n << 128n) - 1n)).toString(), (v >> 128n).toString()];
const norm = (a) => BigInt(a).toString(16);
const log = (...a) => (document.getElementById("log").textContent += a.join(" ") + "\n");
const loadPlan = async () => (await fetch("/plan.json", { cache: "no-store" })).json();

loadPlan()
  .then((p) => {
    document.getElementById("info").textContent =
      `Pool:   ${p.name}\nWallet: ${p.wallet}\nRouter: ${p.router}\n` +
      `Withdraw: ${p.lp} LP\nExpected: ${p.readable}\nPlan created: ${p.createdAt}`;
  })
  .catch(() => (document.getElementById("info").textContent = "No plan.json. Run inspect.mjs first."));

document.getElementById("go").onclick = async () => {
  try {
    const plan = await loadPlan();
    const provider = new RpcProvider({ nodeUrl: plan.rpc });
    const swo = await connect({ modalMode: "alwaysAsk" });
    if (!swo) return log("No wallet selected.");
    const account = await WalletAccount.connect(provider, swo);

    if (norm(account.address) !== norm(plan.wallet)) {
      return log("Wrong wallet connected:", account.address, "- switch account in your wallet and retry.");
    }
    log("Connected:", account.address);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const calls = [
      { contractAddress: plan.pair, entrypoint: "approve",
        calldata: [plan.router, ...u256(BigInt(plan.lp))] },
      { contractAddress: plan.router, entrypoint: plan.removeEntrypoint,
        calldata: [
          plan.token0.address, plan.token1.address,
          ...u256(BigInt(plan.lp)),
          ...u256(BigInt(plan.min0)),
          ...u256(BigInt(plan.min1)),
          plan.wallet,
          deadline.toString(),
        ] },
    ];

    log("Sending... confirm in the wallet popup.");
    const res = await account.execute(calls);
    log("Submitted. Tx hash:", res.transaction_hash);
    await provider.waitForTransaction(res.transaction_hash);
    log("Done. Check the wallet balance.");
  } catch (e) {
    log("Error:", e?.message ?? String(e));
  }
};
