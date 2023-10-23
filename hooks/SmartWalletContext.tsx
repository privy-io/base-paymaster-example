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

interface SmartWalletInterface {
  eoa?: ConnectedWallet;
  signer?: SmartAccountSigner;
  provider?: AlchemyProvider;
  address?: string;
  smartWalletReady: boolean;
}

const SmartWalletContext = React.createContext<SmartWalletInterface>({
  eoa: undefined,
  signer: undefined,
  provider: undefined,
  address: undefined,
  smartWalletReady: false,
});

export const useSmartWallet = () => {
  return useContext(SmartWalletContext);
};

export const SmartWalletProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy"
  );
  const [smartWalletReady, setSmartWalletReady] = useState(false);
  const [eoa, setEoa] = useState<ConnectedWallet | undefined>();
  const [signer, setSigner] = useState<SmartAccountSigner | undefined>();
  const [provider, setProvider] = useState<AlchemyProvider | undefined>();
  const [address, setAddress] = useState<string | undefined>();

  useEffect(() => {
    const createSmartWallet = async (eoa: ConnectedWallet) => {
      setEoa(eoa);
      const eip1193provider = await eoa.getEthereumProvider();
      const eoaClient = createWalletClient({
        account: eoa.address as `0x${string}`,
        chain: baseGoerli,
        transport: custom(eip1193provider),
      });

      const signer: SmartAccountSigner = new WalletClientSigner(
        eoaClient,
        "json-rpc"
      );
      setSigner(signer);

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
      setProvider(provider);

      const smartWalletAddress = await provider.getAddress();
      setAddress(smartWalletAddress);
      setSmartWalletReady(true);
    };
    if (embeddedWallet) createSmartWallet(embeddedWallet);
  }, [embeddedWallet]);

  return (
    <SmartWalletContext.Provider
      value={{
        eoa: eoa,
        signer: signer,
        provider: provider,
        address: address,
        smartWalletReady: smartWalletReady,
      }}
    >
      {children}
    </SmartWalletContext.Provider>
  );
};
