import React, { useState, useEffect, useContext } from "react";
import { ConnectedWallet, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { baseGoerli } from "viem/chains";
import { WalletClientSigner, type SmartAccountSigner } from "@alchemy/aa-core";
import { AlchemyProvider } from "@alchemy/aa-alchemy";
import {
  LightSmartContractAccount,
  getDefaultLightAccountFactory,
} from "@alchemy/aa-accounts";
import { BASE_GOERLI_ENTRYPOINT_ADDRESS } from "../lib/constants";

interface SmartAccountInterface {
  /** ConnectedWallet representing the user's EOA (embedded wallet) */
  eoa?: ConnectedWallet;
  /** SmartAccountSigner representing the signer for the smart account */
  smartAccountSigner?: SmartAccountSigner;
  /** AlchemyProvider to send RPC requests to/from the smart account */
  smartAccountProvider?: AlchemyProvider;
  /** Smart account address */
  smartAccountAddress?: string;
  /** Boolean to indicate whether the smart account state has initialized */
  smartAccountReady: boolean;
}

const SmartAccountContext = React.createContext<SmartAccountInterface>({
  eoa: undefined,
  smartAccountSigner: undefined,
  smartAccountProvider: undefined,
  smartAccountAddress: undefined,
  smartAccountReady: false,
});

export const useSmartAccount = () => {
  return useContext(SmartAccountContext);
};

export const SmartAccountProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy"
  );
  const [smartAccountReady, setSmartAccountReady] = useState(false);
  const [eoa, setEoa] = useState<ConnectedWallet | undefined>();
  const [smartAccountSigner, setSmartAccountSigner] = useState<
    SmartAccountSigner | undefined
  >();
  const [smartAccountProvider, setSmartAccountProvider] = useState<
    AlchemyProvider | undefined
  >();
  const [smartAccountAddress, setSmartAccountAddress] = useState<
    string | undefined
  >();

  useEffect(() => {
    const createSmartWallet = async (eoa: ConnectedWallet) => {
      setEoa(eoa);
      const eoaProvider = await eoa.getEthereumProvider();
      const eoaClient = createWalletClient({
        account: eoa.address as `0x${string}`,
        chain: baseGoerli,
        transport: custom(eoaProvider),
      });

      const signer: SmartAccountSigner = new WalletClientSigner(
        eoaClient,
        "json-rpc"
      );
      setSmartAccountSigner(signer);

      const provider = new AlchemyProvider({
        apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY as string,
        chain: baseGoerli,
        entryPointAddress: BASE_GOERLI_ENTRYPOINT_ADDRESS,
      }).connect(
        (rpcClient) =>
          new LightSmartContractAccount({
            entryPointAddress: BASE_GOERLI_ENTRYPOINT_ADDRESS,
            chain: rpcClient.chain,
            owner: signer,
            factoryAddress: getDefaultLightAccountFactory(rpcClient.chain),
            rpcClient,
          })
      );
      setSmartAccountProvider(provider);

      const address = await provider.getAddress();
      setSmartAccountAddress(address);
      setSmartAccountReady(true);
    };
    if (embeddedWallet) createSmartWallet(embeddedWallet);
  }, [embeddedWallet]);

  return (
    <SmartAccountContext.Provider
      value={{
        smartAccountReady: smartAccountReady,
        smartAccountProvider: smartAccountProvider,
        smartAccountSigner: smartAccountSigner,
        smartAccountAddress: smartAccountAddress,
        eoa: eoa,
      }}
    >
      {children}
    </SmartAccountContext.Provider>
  );
};
