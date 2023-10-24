import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import { useSmartAccount } from "../hooks/SmartWalletContext";
import {
  BASE_GOERLI_ENTRYPOINT_ADDRESS,
  BASE_GOERLI_PAYMASTER_URL,
  BASE_GOERLI_SCAN_URL,
  NFT_ADDRESS,
} from "../lib/constants";
import { Client, createPublicClient, encodeFunctionData, http } from "viem";
import ABI from "../lib/nftABI.json";
import {
  createPublicErc4337Client,
  PublicErc4337Client,
  type UserOperationStruct,
} from "@alchemy/aa-core";
import { baseGoerli } from "viem/chains";
import {
  addPaymasterAndDataToUserOp,
  bufferUserOpWithVerificationGas,
  formatUserOpAsHex,
  signUserOp,
} from "../lib/userOperations";
import { ToastContainer, toast } from "react-toastify";

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const { smartAccountAddress, smartAccountProvider, eoa } = useSmartAccount();

  // If the user is not authenticated, redirect them back to the landing page
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // RPC client connected to the Base Goerli Paymaster, used to populate
  // `paymasterAndData` field of user operations
  const basePaymasterRpc: Client = useMemo(
    () =>
      createPublicClient({
        chain: baseGoerli,
        transport: http(BASE_GOERLI_PAYMASTER_URL),
      }),
    []
  );

  // RPC client connected to Alchemy's Base Goerli RPC URL, used to submit
  // signed user operations to the network
  const baseBundlerRpc: PublicErc4337Client = useMemo(
    () =>
      createPublicErc4337Client({
        chain: baseGoerli,
        rpcUrl: process.env.NEXT_PUBLIC_ALCHEMY_BASE_RPC_URL as string,
      }),
    []
  );

  const isLoading = !smartAccountAddress || !smartAccountProvider;
  const [isMinting, setIsMinting] = useState(false);

  const onMint = async () => {
    // The mint button is disabled if either of these are undefined
    if (!smartAccountProvider || !smartAccountAddress) return;

    setIsMinting(true);
    const toastId = toast.loading("Minting...");

    // Build the initial user op by encoding function data for the ERC-721
    // `mint` method
    const initialUserOp: UserOperationStruct =
      await smartAccountProvider.buildUserOperationFromTx({
        from: smartAccountAddress as `0x${string}`,
        to: NFT_ADDRESS,
        data: encodeFunctionData({
          abi: ABI,
          functionName: "mint",
          args: [smartAccountAddress],
        }),
      });
    const formattedUserOp = formatUserOpAsHex(initialUserOp);

    // Buffer `preVerificationGas` and `verificationGasLimit` with gas needed to
    // verify the paymaster
    const bufferedUserOp = bufferUserOpWithVerificationGas(formattedUserOp);

    // Query Base Goerli paymaster and populate `paymasterAndData` field of user op
    const userOpWithPaymaster = await addPaymasterAndDataToUserOp(
      bufferedUserOp,
      basePaymasterRpc
    );

    // Hash and sign the user op
    const signedUserOp = await signUserOp(
      userOpWithPaymaster,
      smartAccountProvider
    );

    // Submit the user op to the mempool and get hash
    const userOpHash = await baseBundlerRpc.sendUserOperation(
      signedUserOp,
      BASE_GOERLI_ENTRYPOINT_ADDRESS
    );

    // Watch userOpHash and wait for the transaction to be confirmed
    const transactionHash =
      await smartAccountProvider.waitForUserOperationTransaction(userOpHash);

    toast.update(toastId, {
      render: (
        <a
          href={`${BASE_GOERLI_SCAN_URL}/tx/${transactionHash}`}
          target="_blank"
          color="#FF8271"
        >
          Successfully minted! Click here to see your transaction.
        </a>
      ),
      type: "success",
      isLoading: false,
      autoClose: 5000,
    });
    setIsMinting(false);
  };

  return (
    <>
      <Head>
        <title>Privy x Base Paymaster Demo</title>
      </Head>

      <main className="flex flex-col min-h-screen px-4 sm:px-20 py-6 sm:py-10 bg-privy-light-blue">
        {ready && authenticated && !isLoading ? (
          <>
            <ToastContainer />
            <div className="flex flex-row justify-between">
              <h1 className="text-2xl font-semibold">
                Privy x Base Paymaster Demo
              </h1>
              <button
                onClick={logout}
                className="text-sm bg-violet-200 hover:text-violet-900 py-2 px-4 rounded-md text-violet-700"
              >
                Logout
              </button>
            </div>
            <div className="mt-12 flex gap-4 flex-wrap">
              <button
                onClick={onMint}
                className="text-sm bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 py-2 px-4 rounded-md text-white"
                disabled={isLoading || isMinting}
              >
                Mint NFT
              </button>
            </div>
            <p className="mt-6 font-bold uppercase text-sm text-gray-600">
              Your Smart Wallet Address
            </p>
            <a
              className="mt-2 text-sm text-gray-500 hover:text-violet-600"
              href={`${BASE_GOERLI_SCAN_URL}/address/${smartAccountAddress}#tokentxnsErc721`}
            >
              {smartAccountAddress}
            </a>
            <p className="mt-6 font-bold uppercase text-sm text-gray-600">
              Your Signer Address
            </p>
            <a
              className="mt-2 text-sm text-gray-500 hover:text-violet-600"
              href={`${BASE_GOERLI_SCAN_URL}/address/${eoa?.address}`}
            >
              {eoa?.address}
            </a>
            <p className="mt-6 font-bold uppercase text-sm text-gray-600">
              User object
            </p>
            <textarea
              value={JSON.stringify(user, null, 2)}
              className="max-w-4xl bg-slate-700 text-slate-50 font-mono p-4 text-xs sm:text-sm rounded-md mt-2"
              rows={20}
              disabled
            />
          </>
        ) : null}
      </main>
    </>
  );
}
