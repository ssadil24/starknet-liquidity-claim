# Starknet LP Withdrawal Tool

Use this local tool to inspect and withdraw liquidity-provider (LP) tokens from Uniswap V2-style pools on Starknet mainnet, such as the configured JediSwap V1 and 10KSwap pools.

The tool reads pool data from Starknet, prepares a withdrawal plan, and asks your Starknet wallet extension to sign the withdrawal. Your seed phrase and private key are not entered into this project.

> **Safety:** Verify the wallet, LP token, router, and expected token amounts before signing. This is not financial advice. Never share your seed phrase or private key.

## What you need

- Node.js 20.19+ or 22.13+ and npm installed. Check with `node -v` and `npm -v`.
- A browser with a Starknet wallet extension installed and unlocked (for example, Ready or Braavos).
- The wallet account holding the LP tokens, plus a small amount of ETH or STRK for transaction fees.
- A Starknet mainnet RPC endpoint and API key from a provider such as [BoltRPC](https://dashboard.boltrpc.io/signup) or [Alchemy](https://dashboard.alchemy.com/signup).
- For an unconfigured pool, the hash of an old add-liquidity transaction from your wallet.

## 1. Install the project

Open PowerShell in this project folder and install its dependencies:

```powershell
npm install
```

## 2. Get an RPC endpoint and set `config.json`

The `rpc` value in `config.json` must be a **Starknet mainnet JSON-RPC endpoint**. Replace the placeholder API key in the URL; do not include angle brackets.

### Option A: BoltRPC

1. Sign up at [dashboard.boltrpc.io](https://dashboard.boltrpc.io/signup).
2. Create or copy an API key in the dashboard.
3. Use the Starknet mainnet endpoint format below in `config.json`:

   ```text
   https://endpoints.boltrpc.io/rpc/YOUR_API_KEY/starknet
   ```

BoltRPC currently advertises a 14-day trial with 5 million request units. Check its dashboard and [pricing](https://boltrpc.io/pricing) for current trial and usage terms.

### Option B: Alchemy

1. Sign up at [dashboard.alchemy.com](https://dashboard.alchemy.com/signup).
2. Create an app configured for **Starknet Mainnet**.
3. Copy the app's API key and use this endpoint format:

   ```text
   https://starknet-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   ```

Check Alchemy's dashboard for current network availability, plan limits, and pricing.

### Enter the values

Edit `config.json`. Set `rpc` to the complete endpoint URL from your provider and `wallet` to the Starknet address that owns the LP tokens:

```json
{
  "rpc": "https://endpoints.boltrpc.io/rpc/YOUR_API_KEY/starknet",
  "wallet": "0xYOUR_WALLET_ADDRESS",
  "slippagePercent": 2,
  "pools": [
    {
      "name": "10kswap-eth-usdc",
      "router": "0x07a6f98c03379b9513ca84cca1373ff452a7462a3b61598f0af5bb27ad7f76d1",
      "pair": "0x000023c72abdf49dffc85ae3ede714f2168ad384cc67d08524732acea90df325"
    },
    {
      "name": "jediswap-eth-usdc",
      "router": "0x041fd22b238fa21cfcf5dd45a8548974d8263b3a531a60388411c5e230f97023",
      "pair": "0x04d0390b777b424e43839cd1e744799f3de6c176c7e32c1812a41dbd9c19db6a"
    }
  ]
}
```

The two pool entries are examples already included in the config. For those pools, normally only `rpc` and `wallet` need changing. `slippagePercent` is the maximum tolerated difference from the estimated payout; the default is 2%.

**Protect your API key.** The app serves the RPC URL to the browser as part of `public/plan.json`, so the key is visible to anyone who can access that local app. Use a provider key restricted to Starknet and, where available, to localhost and a usage limit. Keep the app local, do not publish or share a working key, and rotate the key after use if appropriate. Do not commit a real key to a public repository.

## 3. Inspect your LP position

From the project folder, run the inspection script with a pool name from `config.json`:

```powershell
node inspect.mjs 10kswap-eth-usdc
```

If you omit the pool name, the first pool in `config.json` is inspected:

```powershell
node inspect.mjs
```

Before continuing, check the output:

- **LP balance** is greater than zero and matches the position in your wallet.
- **You receive** shows the two expected tokens and amounts.
- **Remove function** has seven parameters. If the script reports an unexpected parameter list or no remove-liquidity function, stop; do not try to force a transaction.

The script writes a fresh `public/plan.json`. Re-run the inspection immediately before each withdrawal so the minimum amounts reflect current pool conditions.

## 4. Review and withdraw

Start the local development server:

```powershell
npm run dev
```

1. Open the local URL printed by Vite in the same browser where your wallet extension is installed.
2. Check the displayed pool, wallet, router, LP amount, and expected payout.
3. Select **Connect wallet & withdraw** and choose the account configured in `config.json`.
4. Carefully review the wallet confirmation. It should contain an LP-token approval to the configured router and a remove-liquidity call. Verify the spender/router and amounts before signing.
5. After signing, note the transaction hash and check it in a Starknet block explorer. Wait until it is accepted on L2.
6. Run the inspection command again to confirm the LP balance changed and verify the received tokens in your wallet.

The page refuses to proceed if the connected account does not match `wallet` in `config.json`. Repeat the inspection and withdrawal separately for each pool.

## Adding another pool

Use this for a different pool or DEX only if it uses the supported V2-style remove-liquidity flow:

1. Find an old add-liquidity transaction from the wallet in a Starknet block explorer and copy its transaction hash.
2. Run:

   ```powershell
   node find-from-tx.mjs 0xYOUR_TRANSACTION_HASH
   ```

3. Add the printed router and pair candidate to the `pools` array in `config.json`, with a unique `name`.
4. Verify the pair address against the LP token address shown in your wallet. If they differ, use the actual LP token contract address as `pair`.
5. Inspect the new pool before withdrawing. Do not proceed unless the router function and expected amounts look correct.

## Troubleshooting

| Problem | What to check |
|---|---|
| RPC or rate-limit errors | Check that `rpc` contains the complete Starknet mainnet URL and valid API key. Check provider status and usage limits, or try another provider. |
| `Pool "..." not found` | The pool name must match a `name` in `config.json` exactly. |
| Could not read the pair contract | Check the pair address and RPC endpoint. The pair should be the LP token contract. |
| LP balance is 0 | Check that the configured wallet owns LP tokens for this pair and that they have not already been withdrawn or moved. |
| No `plan.json` / page says no plan | Run `node inspect.mjs <pool-name>` and reload the page. |
| Wallet is not listed | Unlock/enable the wallet extension for the local page, then reload. |
| Wrong wallet connected | Switch to the account matching `wallet` in `config.json`. |
| Slippage error | Re-run the inspection to refresh the plan. If necessary, increase `slippagePercent` slightly and inspect again. |
| Insufficient fee balance | Add a small amount of ETH or STRK to the wallet for transaction fees. |
| Submitted transaction but page reports an error | Check the transaction hash in a block explorer; the RPC confirmation step may have failed even if submission succeeded. |

If the pool is concentrated liquidity, staked, farmed, or otherwise not a V2-style LP position, this tool may not support its withdrawal method.
